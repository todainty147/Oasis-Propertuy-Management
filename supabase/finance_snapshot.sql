drop function if exists public.finance_snapshot(uuid, uuid);

create or replace function public.finance_snapshot(
  p_account_id uuid,
  p_tenant_id  uuid default null
)
returns table (
  total_income       numeric,   -- cash received in the current calendar month (MTD)
  overdue_income     numeric,   -- total unpaid balance on past-due cycles
  due_soon_income    numeric,   -- total unpaid balance due within 7 days
  outstanding_income numeric,   -- ALL unpaid balances (superset; includes the above two)
  property_finance   jsonb,
  account_currency   text       -- ISO 4217 code for the account (e.g. 'GBP', 'PLN', 'EUR')
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id      uuid;
  v_account_currency text;
begin
  v_tenant_id := public.assert_tenant_scope_access(p_account_id, p_tenant_id);

  -- Resolve the account's configured currency (falls back to 'PLN' for legacy rows)
  select coalesce(a.currency, 'PLN') into v_account_currency
  from public.accounts a
  where a.id = p_account_id;

  return query
  with tenant_scope as (
    select t.property_id
    from public.tenants t
    where t.id = v_tenant_id
      and t.account_id = p_account_id
    limit 1
  ),
  scoped_properties as (
    select
      pr.id,
      pr.address,
      pr.city,
      pr.tenant_id,
      coalesce(pr.rent, 0) as rent
    from properties pr
    where pr.account_id = p_account_id
      and (
        v_tenant_id is null
        or pr.id = (select property_id from tenant_scope)
      )
  ),
  property_occupancy as (
    select
      sp.id as property_id,
      (
        sp.tenant_id is not null
        or exists (
          select 1
          from public.tenants t
          where t.account_id = p_account_id
            and t.property_id = sp.id
            and t.archived_at is null
        )
      ) as has_assigned_tenant
    from scoped_properties sp
  ),
  scoped_payments as (
    select
      p.id,
      p.property_id,
      p.tenant_id,
      coalesce(p.amount, 0) as amount,
      lower(coalesce(p.status, '')) as status_norm,
      p.paid_at,
      p.due_date
    from payments p
    where p.account_id = p_account_id
      and (
        v_tenant_id is null
        or p.tenant_id = v_tenant_id
      )
  ),
  payment_rows as (
    select
      sp.id,
      sp.property_id,
      sp.tenant_id,
      sp.amount,
      sp.status_norm,
      sp.paid_at,
      sp.due_date,
      (
        sp.paid_at is not null
        or sp.status_norm in ('paid', 'oplacone', 'opłacone')
      ) as is_paid,
      date_trunc(
        'month',
        coalesce(sp.due_date::timestamp, sp.paid_at::timestamp, current_date::timestamp)
      ) as cycle_month
    from scoped_payments sp
  ),
  payment_cycles as (
    select
      prx.property_id,
      prx.tenant_id,
      prx.cycle_month,
      -- A-2: billed_amount = contractual rent only, never inflated by payment amounts
      coalesce(max(pr.rent), 0) as billed_amount,
      coalesce(
        sum(
          case
            when prx.is_paid then prx.amount else 0
          end
        ),
        0
      ) as paid_amount,
      min(
        case
          when not prx.is_paid then prx.due_date
          else null
        end
      ) as open_due_date,
      coalesce(
        bool_or(
          not prx.is_paid
          and (
            prx.status_norm in ('overdue', 'zalegle', 'zaległe')
            or (prx.due_date is not null and prx.due_date < current_date)
          )
        ),
        false
      ) as has_overdue
    from payment_rows prx
    left join scoped_properties pr
      on pr.id = prx.property_id
    group by prx.property_id, prx.tenant_id, prx.cycle_month
  ),
  finance_totals as (
    select
      -- A-4: total_income = cash received in the current calendar month (MTD),
      -- computed from paid_at dates rather than cycle_month so late payments
      -- are attributed to when money was actually received.
      coalesce((
        select sum(pr2.amount)
        from payment_rows pr2
        where pr2.is_paid
          and pr2.paid_at is not null
          and pr2.paid_at >= date_trunc('month', current_date)::date
          and pr2.paid_at <= current_date
      ), 0) as total_income,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and pc.has_overdue
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as overdue_income,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and pc.open_due_date is not null
             and pc.open_due_date >= current_date
             and pc.open_due_date <= current_date + interval '7 days'
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as due_soon_income,
      coalesce(
        sum(greatest(pc.billed_amount - pc.paid_amount, 0)),
        0
      ) as outstanding_income
    from payment_cycles pc
  ),
  property_rows as (
    select
      pr.id as property_id,
      pr.address,
      pr.city,
      pr.rent,
      po.has_assigned_tenant,
      coalesce(bool_or(pc.property_id is not null), false) as has_payment_cycle,
      coalesce(
        sum(
          case
            when pc.cycle_month = date_trunc('month', current_date::timestamp)
            then pc.paid_amount
            else 0
          end
        ),
        0
      ) as paid,
      case
        when po.has_assigned_tenant or coalesce(bool_or(pc.property_id is not null), false) then
          greatest(
            pr.rent - coalesce(
              sum(
                case
                  when pc.cycle_month = date_trunc('month', current_date::timestamp)
                  then pc.paid_amount
                  else 0
                end
              ),
              0
            ),
            0
          )
        else 0
      end as remaining,
      case
        when po.has_assigned_tenant or coalesce(bool_or(pc.property_id is not null), false) then
          coalesce(
            bool_or(
              greatest(pc.billed_amount - pc.paid_amount, 0) > 0
              and pc.has_overdue
            ),
            false
          )
        else false
      end as has_overdue_balance
    from scoped_properties pr
    join property_occupancy po
      on po.property_id = pr.id
    left join payment_cycles pc
      on pc.property_id = pr.id
    group by pr.id, pr.address, pr.city, pr.rent, po.has_assigned_tenant
  ),
  property_status_rows as (
    select
      property_id,
      address,
      city,
      rent,
      paid,
      remaining,
      case
        when not has_assigned_tenant and not has_payment_cycle then 'vacant'
        when remaining <= 0 then 'paid'
        when has_overdue_balance then 'overdue'
        when paid > 0 then 'partial'
        else 'pending'
      end as payment_status
    from property_rows
  ),
  property_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'propertyId', property_id,
          'address', address,
          'city', city,
          'rent', rent,
          'paid', paid,
          'remaining', remaining,
          'paymentStatus', payment_status
        )
        order by address
      ),
      '[]'::jsonb
    ) as property_finance
    from property_status_rows
  )
  select
    finance_totals.total_income,
    finance_totals.overdue_income,
    finance_totals.due_soon_income,
    finance_totals.outstanding_income,
    property_json.property_finance,
    v_account_currency
  from finance_totals, property_json;
end;
$$;

grant execute on function public.finance_snapshot(uuid, uuid) to authenticated;
