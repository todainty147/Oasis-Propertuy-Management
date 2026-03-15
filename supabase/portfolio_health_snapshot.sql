create or replace function public.portfolio_health_snapshot(
  p_account_id uuid,
  p_tenant_id uuid default null
)
returns table (
  property_count bigint,
  occupied_count bigint,
  vacant_count bigint,
  occupancy_rate integer,
  paid_amount numeric,
  due_amount numeric,
  overdue_amount numeric,
  due_soon_amount numeric,
  outstanding_amount numeric,
  overdue_0_7_amount numeric,
  overdue_8_30_amount numeric,
  overdue_30_plus_amount numeric,
  open_requests bigint,
  high_priority_open_requests bigint,
  waiting_over_48h bigint,
  active_work_orders bigint,
  work_orders_without_contractor bigint,
  recent_open_created bigint,
  prev_open_created bigint,
  outstanding_current_month numeric,
  outstanding_previous_month numeric
)
language sql
security definer
set search_path = public
as $$
  with tenant_scope as (
    select t.property_id
    from tenants t
    where t.id = p_tenant_id
      and t.account_id = p_account_id
    limit 1
  ),
  scoped_properties as (
    select p.id
    from properties p
    where p.account_id = p_account_id
      and (
        p_tenant_id is null
        or p.id = (select property_id from tenant_scope)
      )
  ),
  occupied_properties as (
    select sp.id
    from scoped_properties sp
    where exists (
      select 1
      from tenants t
      where t.property_id = sp.id
    )
  ),
  scoped_payments as (
    select
      p.amount,
      lower(coalesce(p.status, '')) as status_norm,
      p.due_date
    from payments p
    where p.account_id = p_account_id
      and (
        p_tenant_id is null
        or p.tenant_id = p_tenant_id
      )
  ),
  scoped_requests as (
    select
      lower(coalesce(r.status, '')) as status_norm,
      lower(coalesce(r.priority, '')) as priority_norm,
      r.created_at
    from maintenance_requests r
    where r.account_id = p_account_id
      and (
        p_tenant_id is null
        or r.property_id = (select property_id from tenant_scope)
      )
  ),
  scoped_work_orders as (
    select
      lower(coalesce(w.status, '')) as status_norm,
      w.contractor_user_id
    from work_orders_with_flags w
    where w.account_id = p_account_id
      and (
        p_tenant_id is null
        or w.property_id = (select property_id from tenant_scope)
      )
  ),
  finance as (
    select
      coalesce(sum(case when status_norm in ('paid', 'oplacone', 'opłacone') then amount else 0 end), 0) as paid_amount,
      coalesce(sum(case when status_norm in ('due', 'oczekujace', 'oczekujące', 'pending') then amount else 0 end), 0) as due_amount,
      coalesce(sum(case when status_norm in ('overdue', 'zalegle', 'zaległe') then amount else 0 end), 0) as overdue_amount,
      coalesce(
        sum(
          case
            when status_norm not in ('paid', 'oplacone', 'opłacone')
             and due_date is not null
             and due_date >= current_date
             and due_date <= current_date + interval '7 days'
            then amount
            else 0
          end
        ),
        0
      ) as due_soon_amount,
      coalesce(sum(case when status_norm not in ('paid', 'oplacone', 'opłacone') then amount else 0 end), 0) as outstanding_amount,
      coalesce(
        sum(
          case
            when status_norm not in ('paid', 'oplacone', 'opłacone')
             and due_date is not null
             and due_date <= current_date
             and current_date - due_date <= 7
            then amount
            else 0
          end
        ),
        0
      ) as overdue_0_7_amount,
      coalesce(
        sum(
          case
            when status_norm not in ('paid', 'oplacone', 'opłacone')
             and due_date is not null
             and due_date <= current_date
             and current_date - due_date between 8 and 30
            then amount
            else 0
          end
        ),
        0
      ) as overdue_8_30_amount,
      coalesce(
        sum(
          case
            when status_norm not in ('paid', 'oplacone', 'opłacone')
             and due_date is not null
             and due_date <= current_date
             and current_date - due_date >= 31
            then amount
            else 0
          end
        ),
        0
      ) as overdue_30_plus_amount,
      coalesce(
        sum(
          case
            when status_norm not in ('paid', 'oplacone', 'opłacone')
             and due_date is not null
             and date_trunc('month', due_date::timestamp) = date_trunc('month', current_date::timestamp)
            then amount
            else 0
          end
        ),
        0
      ) as outstanding_current_month,
      coalesce(
        sum(
          case
            when status_norm not in ('paid', 'oplacone', 'opłacone')
             and due_date is not null
             and date_trunc('month', due_date::timestamp) = date_trunc('month', current_date::timestamp - interval '1 month')
            then amount
            else 0
          end
        ),
        0
      ) as outstanding_previous_month
    from scoped_payments
  ),
  maintenance as (
    select
      (select count(*) from scoped_requests where status_norm not in ('closed', 'zamkniete', 'zamknięte')) as open_requests,
      (
        select count(*)
        from scoped_requests
        where status_norm not in ('closed', 'zamkniete', 'zamknięte')
          and priority_norm in ('high', 'critical', 'wysoki', 'krytyczny')
      ) as high_priority_open_requests,
      (
        select count(*)
        from scoped_requests
        where status_norm = 'waiting'
          and created_at <= now() - interval '48 hours'
      ) as waiting_over_48h,
      (
        select count(*)
        from scoped_work_orders
        where status_norm in ('assigned', 'in_progress', 'blocked')
      ) as active_work_orders,
      (
        select count(*)
        from scoped_work_orders
        where status_norm in ('assigned', 'in_progress', 'blocked')
          and contractor_user_id is null
      ) as work_orders_without_contractor,
      (
        select count(*)
        from scoped_requests
        where created_at >= now() - interval '7 days'
      ) as recent_open_created,
      (
        select count(*)
        from scoped_requests
        where created_at < now() - interval '7 days'
          and created_at >= now() - interval '14 days'
      ) as prev_open_created
  )
  select
    (select count(*) from scoped_properties) as property_count,
    (select count(*) from occupied_properties) as occupied_count,
    greatest((select count(*) from scoped_properties) - (select count(*) from occupied_properties), 0) as vacant_count,
    case
      when (select count(*) from scoped_properties) = 0 then 0
      else round(
        ((select count(*) from occupied_properties)::numeric / (select count(*) from scoped_properties)::numeric) * 100
      )::int
    end as occupancy_rate,
    finance.paid_amount,
    finance.due_amount,
    finance.overdue_amount,
    finance.due_soon_amount,
    finance.outstanding_amount,
    finance.overdue_0_7_amount,
    finance.overdue_8_30_amount,
    finance.overdue_30_plus_amount,
    maintenance.open_requests,
    maintenance.high_priority_open_requests,
    maintenance.waiting_over_48h,
    maintenance.active_work_orders,
    maintenance.work_orders_without_contractor,
    maintenance.recent_open_created,
    maintenance.prev_open_created,
    finance.outstanding_current_month,
    finance.outstanding_previous_month
  from finance, maintenance;
$$;

grant execute on function public.portfolio_health_snapshot(uuid, uuid) to authenticated;
