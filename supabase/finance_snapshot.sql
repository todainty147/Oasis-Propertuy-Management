drop function if exists public.finance_snapshot(uuid, uuid);

create or replace function public.finance_snapshot(
  p_account_id uuid,
  p_tenant_id  uuid default null
)
returns table (
  total_income       numeric,   -- cash received in the current calendar month (MTD)
  overdue_income     numeric,   -- accumulated unpaid balance from months BEFORE current month
  due_soon_income    numeric,   -- total unpaid balance due within 7 days (from payment records)
  outstanding_income numeric,   -- ALL accumulated unpaid balances across occupied properties
  property_finance   jsonb,
  account_currency   text       -- ISO 4217 code for the account (e.g. 'GBP', 'PLN', 'EUR')
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id        uuid;
  v_account_currency text;
begin
  v_tenant_id := public.assert_tenant_scope_access(p_account_id, p_tenant_id);

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
      greatest(
        coalesce(max(pr.rent), 0),
        coalesce(max(prx.amount), 0)
      ) as billed_amount,
      coalesce(
        sum(case when prx.is_paid then prx.amount else 0 end),
        0
      ) as paid_amount,
      min(case when not prx.is_paid then prx.due_date else null end) as open_due_date,
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
    left join scoped_properties pr on pr.id = prx.property_id
    group by prx.property_id, prx.tenant_id, prx.cycle_month
  ),

  -- ── Accumulated tenure: find when rent obligations started for each property ──
  --
  -- Priority order:
  --   1. Earliest active/non-ended lease start date
  --   2. Earliest payment due_date on record
  --   3. Null (no data — property treated as current-month-only)
  --
  property_tenure as (
    select
      sp.id as property_id,
      sp.rent,
      date_trunc('month',
        coalesce(
          (
            select min(l.lease_start_date)
            from public.leases l
            where l.account_id = p_account_id
              and l.property_id = sp.id
              and lower(coalesce(l.renewal_status, 'active')) not in ('ended')
          ),
          (
            select min(pr2.due_date)
            from payment_rows pr2
            where pr2.property_id = sp.id
              and pr2.due_date is not null
          )
        )
      )::date as rent_start_month
    from scoped_properties sp
  ),

  -- ── Accumulated payment stats per property ────────────────────────────────
  --
  -- months_elapsed: inclusive count from rent_start_month to current month.
  --   Dec 2025 → May 2026 = 6 months.
  --
  -- total_paid_alltime: sum of every payment ever marked paid, all months.
  --
  -- accumulated_expected: months_elapsed × monthly rent.
  --   This is what the tenant should have paid in total since they moved in.
  --
  property_accumulated as (
    select
      pt.property_id,
      pt.rent,
      pt.rent_start_month,
      coalesce((
        select sum(pr2.amount)
        from payment_rows pr2
        where pr2.property_id = pt.property_id
          and pr2.is_paid
      ), 0) as total_paid_alltime,
      coalesce((
        select sum(pr2.amount)
        from payment_rows pr2
        where pr2.property_id = pt.property_id
          and pr2.is_paid
          and pr2.cycle_month < date_trunc('month', current_date)
      ), 0) as total_paid_before_current_month,
      case
        when pt.rent_start_month is not null and pt.rent > 0 then
          greatest(
            (
              extract(year  from age(date_trunc('month', current_date)::date, pt.rent_start_month)) * 12
              + extract(month from age(date_trunc('month', current_date)::date, pt.rent_start_month))
              + 1   -- +1: include the start month itself
            )::integer,
            1       -- minimum 1 month
          )
        else 1
      end as months_elapsed
    from property_tenure pt
  ),

  -- ── Finance-level totals ──────────────────────────────────────────────────
  --
  -- total_income:   cash received THIS calendar month (MTD) — unchanged behaviour.
  -- overdue_income: accumulated arrears from months BEFORE the current month.
  --   = max(0, (months_elapsed - 1) × rent - total_paid_alltime)
  --   Only counts occupied properties with known rent obligations.
  -- due_soon_income: payments with explicit due_date in the next 7 days
  --   (kept from payment records for properties that do have entries).
  -- outstanding_income: total accumulated gap = months_elapsed × rent - total_paid_alltime
  --   across all occupied properties. This is the "Total Owed" card.
  --
  finance_totals as (
    select
      -- MTD cash received: unchanged
      coalesce((
        select sum(pr2.amount)
        from payment_rows pr2
        where pr2.is_paid
          and pr2.paid_at is not null
          and pr2.paid_at >= date_trunc('month', current_date)::date
          and pr2.paid_at <= current_date
      ), 0) as total_income,

      -- Overdue: historical arrears plus current-cycle balances whose due date has passed.
      --
      -- D-07: payments are attributed to their due/rent cycle by default.
      -- Current-cycle payments must not silently reduce historical arrears.
      coalesce((
        select sum(
          greatest(
            (pa.months_elapsed - 1) * pa.rent - pa.total_paid_before_current_month,
            0
          )
        )
        from property_accumulated pa
        join property_occupancy po on po.property_id = pa.property_id
        where po.has_assigned_tenant
          and pa.rent > 0
          and pa.months_elapsed > 1
          and pa.total_paid_before_current_month < (pa.months_elapsed - 1) * pa.rent
      ), 0)
      +
      coalesce((
        select sum(greatest(pc.billed_amount - pc.paid_amount, 0))
        from payment_cycles pc
        join property_occupancy po on po.property_id = pc.property_id
        where po.has_assigned_tenant
          and greatest(pc.billed_amount - pc.paid_amount, 0) > 0
          and pc.has_overdue
          and pc.cycle_month >= date_trunc('month', current_date)
      ), 0) as overdue_income,

      -- Due within 7 days: explicit payment records with upcoming due dates
      coalesce((
        select sum(greatest(pc.billed_amount - pc.paid_amount, 0))
        from payment_cycles pc
        where greatest(pc.billed_amount - pc.paid_amount, 0) > 0
          and pc.open_due_date is not null
          and pc.open_due_date >= current_date
          and pc.open_due_date <= current_date + interval '7 days'
      ), 0) as due_soon_income,

      -- Total Owed: full accumulated gap across all occupied properties
      coalesce((
        select sum(
          greatest(
            pa.months_elapsed * pa.rent - pa.total_paid_alltime,
            0
          )
        )
        from property_accumulated pa
        join property_occupancy po on po.property_id = pa.property_id
        where po.has_assigned_tenant
          and pa.rent > 0
          and pa.months_elapsed >= 1
      ), 0) as outstanding_income
  ),

  -- ── Per-property rows ─────────────────────────────────────────────────────
  --
  -- paid:      ALL-TIME total received for this property (not current-month-only).
  -- remaining: accumulated months × rent - all_time_paid.
  --            Shows the true running arrears gap since the tenant moved in.
  --
  property_rows as (
    select
      sp.id as property_id,
      sp.address,
      sp.city,
      sp.rent,
      po.has_assigned_tenant,
      coalesce(bool_or(pc.property_id is not null), false) as has_payment_cycle,

      -- All-time received (replaces current-month-only)
      coalesce(pa.total_paid_alltime, 0) as paid,

      -- Accumulated remaining: what the tenant still owes across all months
      case
        when (po.has_assigned_tenant or coalesce(bool_or(pc.property_id is not null), false))
          and sp.rent > 0
          and pa.months_elapsed is not null
        then
          greatest(pa.months_elapsed * sp.rent - coalesce(pa.total_paid_alltime, 0), 0)
        when (po.has_assigned_tenant or coalesce(bool_or(pc.property_id is not null), false))
        then
          greatest(sp.rent - coalesce(pa.total_paid_alltime, 0), 0)
        else 0
      end as remaining,

      -- Overdue flag: true if there are historical months with unpaid balance
      case
        when (po.has_assigned_tenant or coalesce(bool_or(pc.property_id is not null), false))
          and sp.rent > 0
          and pa.months_elapsed > 1
          and coalesce(pa.total_paid_before_current_month, 0) < (pa.months_elapsed - 1) * sp.rent
        then true
        else coalesce(
          bool_or(greatest(pc.billed_amount - pc.paid_amount, 0) > 0 and pc.has_overdue),
          false
        )
      end as has_overdue_balance

    from scoped_properties sp
    join property_occupancy po on po.property_id = sp.id
    left join payment_cycles pc on pc.property_id = sp.id
    left join property_accumulated pa on pa.property_id = sp.id
    group by
      sp.id, sp.address, sp.city, sp.rent, po.has_assigned_tenant,
      pa.total_paid_alltime, pa.total_paid_before_current_month, pa.months_elapsed
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
        when has_overdue_balance      then 'overdue'
        when paid > 0                 then 'partial'
        else 'pending'
      end as payment_status
    from property_rows
  ),

  property_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'propertyId',    property_id,
          'address',       address,
          'city',          city,
          'rent',          rent,
          'paid',          paid,
          'remaining',     remaining,
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
