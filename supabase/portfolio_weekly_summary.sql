create or replace function public.portfolio_weekly_summary(p_account_id uuid)
returns table (
  occupancy_rate integer,
  open_requests bigint,
  waiting_over_48h bigint,
  overdue_balance numeric
)
language sql
security definer
set search_path = public
as $$
  with authz as (
    select public.assert_manage_account_access(p_account_id) as account_id
  ),
  props as (
    select p.id
    from properties p
    cross join authz a
    where p.account_id = a.account_id
  ),
  occupied as (
    select p.id
    from props p
    where exists (
      select 1 from tenants t where t.property_id = p.id
    )
  ),
  req as (
    select status, created_at
    from maintenance_requests
    where account_id = p_account_id
  ),
  -- ── Accumulated arrears — same lease-aware logic as finance/dashboard/portfolio snapshots ──
  payment_rows as (
    select
      p.property_id,
      coalesce(p.amount, 0) as amount,
      (
        p.paid_at is not null
        or lower(coalesce(p.status, '')) in ('paid', 'oplacone', 'opłacone')
      ) as is_paid,
      p.due_date
    from payments p
    where p.account_id = p_account_id
  ),
  property_tenure_acc as (
    select
      pr.id as property_id,
      coalesce(pr.rent, 0) as rent,
      date_trunc('month', coalesce(
        (select min(l.lease_start_date)
         from public.leases l
         where l.account_id = p_account_id
           and l.property_id = pr.id
           and lower(coalesce(l.renewal_status, 'active')) not in ('ended')),
        (select min(px.due_date)
         from payment_rows px
         where px.property_id = pr.id and px.due_date is not null)
      ))::date as rent_start_month
    from properties pr
    where pr.account_id = p_account_id
  ),
  property_accumulated_acc as (
    select
      pt.property_id,
      pt.rent,
      coalesce((
        select sum(px.amount)
        from payment_rows px
        where px.property_id = pt.property_id and px.is_paid
      ), 0) as total_paid_alltime,
      case
        when pt.rent_start_month is not null and pt.rent > 0 then
          greatest((
            extract(year  from age(date_trunc('month', current_date)::date, pt.rent_start_month)) * 12
            + extract(month from age(date_trunc('month', current_date)::date, pt.rent_start_month))
            + 1
          )::integer, 1)
        else 1
      end as months_elapsed
    from property_tenure_acc pt
  ),
  accumulated_overdue as (
    select coalesce(sum(
      case when oc.id is not null and pa.rent > 0 then
        greatest(pa.months_elapsed * pa.rent - pa.total_paid_alltime, 0)
      else 0 end
    ), 0) as acc_overdue_total
    from property_accumulated_acc pa
    left join occupied oc on oc.id = pa.property_id
  )
  -- ── End accumulated arrears ──────────────────────────────────────────────────
  select
    case
      when (select count(*) from props) = 0 then 0
      else round(((select count(*) from occupied)::numeric / (select count(*) from props)::numeric) * 100)::int
    end as occupancy_rate,
    (select count(*) from req where lower(coalesce(status, '')) <> 'closed') as open_requests,
    (
      select count(*)
      from req
      where lower(coalesce(status, '')) = 'waiting'
        and created_at <= now() - interval '48 hours'
    ) as waiting_over_48h,
    (select acc_overdue_total from accumulated_overdue) as overdue_balance;
$$;

grant execute on function public.portfolio_weekly_summary(uuid) to authenticated;
