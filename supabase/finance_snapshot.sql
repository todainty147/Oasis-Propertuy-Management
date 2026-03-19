create or replace function public.finance_snapshot(
  p_account_id uuid,
  p_tenant_id uuid default null
)
returns table (
  total_income numeric,
  overdue_income numeric,
  expected_income numeric,
  property_finance jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  v_tenant_id := public.assert_tenant_scope_access(p_account_id, p_tenant_id);

  return query
  with tenant_scope as (
    select t.property_id
    from public.tenants t
    where t.id = v_tenant_id
      and t.account_id = p_account_id
    limit 1
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
  scoped_properties as (
    select
      pr.id,
      pr.address,
      pr.city,
      coalesce(pr.rent, 0) as rent
    from properties pr
    where pr.account_id = p_account_id
      and (
        v_tenant_id is null
        or pr.id = (select property_id from tenant_scope)
      )
  ),
  finance_totals as (
    select
      coalesce(
        sum(
          case
            when paid_at is not null or status_norm in ('paid', 'oplacone', 'opłacone')
            then amount
            else 0
          end
        ),
        0
      ) as total_income,
      coalesce(
        sum(
          case
            when not (paid_at is not null or status_norm in ('paid', 'oplacone', 'opłacone'))
             and (
               status_norm in ('overdue', 'zalegle', 'zaległe')
               or (due_date is not null and due_date < current_date)
             )
            then amount
            else 0
          end
        ),
        0
      ) as overdue_income,
      coalesce(
        sum(
          case
            when not (paid_at is not null or status_norm in ('paid', 'oplacone', 'opłacone'))
            then amount
            else 0
          end
        ),
        0
      ) as expected_income
    from scoped_payments
  ),
  property_rows as (
    select
      pr.id as property_id,
      pr.address,
      pr.city,
      pr.rent,
      coalesce(
        sum(
          case
            when sp.paid_at is not null
             and date_trunc('month', sp.paid_at::timestamp) = date_trunc('month', current_date::timestamp)
            then sp.amount
            else 0
          end
        ),
        0
      ) as paid,
      greatest(
        pr.rent - coalesce(
          sum(
            case
              when sp.paid_at is not null
               and date_trunc('month', sp.paid_at::timestamp) = date_trunc('month', current_date::timestamp)
              then sp.amount
              else 0
            end
          ),
          0
        ),
        0
      ) as remaining
    from scoped_properties pr
    left join scoped_payments sp
      on sp.property_id = pr.id
    group by pr.id, pr.address, pr.city, pr.rent
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
          'paymentStatus',
            case
              when paid = 0 then 'Zaległe'
              when paid < rent then 'Częściowo'
              else 'Opłacone'
            end
        )
        order by address
      ),
      '[]'::jsonb
    ) as property_finance
    from property_rows
  )
  select
    finance_totals.total_income,
    finance_totals.overdue_income,
    finance_totals.expected_income,
    property_json.property_finance
  from finance_totals, property_json;
end;
$$;

grant execute on function public.finance_snapshot(uuid, uuid) to authenticated;
