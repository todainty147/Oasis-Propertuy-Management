create or replace function public.dashboard_snapshot(
  p_account_id uuid,
  p_tenant_id uuid default null,
  p_horizon_days integer default 1
)
returns table (
  property_count bigint,
  occupied_count bigint,
  vacant_count bigint,
  occupancy_rate integer,
  tenant_paid_total numeric,
  tenant_due_total numeric,
  tenant_overdue_total numeric,
  tenant_due_overdue_count bigint,
  overdue_amount numeric,
  due_soon_count bigint,
  overdue_current_window_amount numeric,
  overdue_previous_window_amount numeric,
  open_requests bigint,
  open_high_priority bigint,
  waiting_over_48h bigint,
  unassigned_work_orders bigint
)
language sql
security definer
set search_path = public
as $$
  with cfg as (
    select greatest(1, least(coalesce(p_horizon_days, 1), 30)) as horizon_days
  ),
  tenant_scope as (
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
      coalesce(p.amount, 0) as amount,
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
      coalesce(sum(case when status_norm in ('paid', 'oplacone', 'opłacone') then amount else 0 end), 0) as tenant_paid_total,
      coalesce(sum(case when status_norm in ('due', 'oczekujace', 'oczekujące', 'pending') then amount else 0 end), 0) as tenant_due_total,
      coalesce(sum(case when status_norm in ('overdue', 'zalegle', 'zaległe') then amount else 0 end), 0) as tenant_overdue_total,
      coalesce(sum(case when status_norm in ('due', 'oczekujace', 'oczekujące', 'pending', 'overdue', 'zalegle', 'zaległe') then 1 else 0 end), 0) as tenant_due_overdue_count,
      coalesce(sum(case when status_norm in ('overdue', 'zalegle', 'zaległe') then amount else 0 end), 0) as overdue_amount,
      coalesce(
        sum(
          case
            when status_norm not in ('paid', 'oplacone', 'opłacone')
             and due_date is not null
             and due_date >= current_date
             and due_date <= current_date + ((select horizon_days from cfg) || ' days')::interval
            then 1
            else 0
          end
        ),
        0
      ) as due_soon_count,
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
      ) as overdue_current_window_amount,
      coalesce(
        sum(
          case
            when status_norm not in ('paid', 'oplacone', 'opłacone')
             and due_date is not null
             and current_date - due_date > 7
             and current_date - due_date <= 14
            then amount
            else 0
          end
        ),
        0
      ) as overdue_previous_window_amount
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
      ) as open_high_priority,
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
          and contractor_user_id is null
      ) as unassigned_work_orders
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
    finance.tenant_paid_total,
    finance.tenant_due_total,
    finance.tenant_overdue_total,
    finance.tenant_due_overdue_count,
    finance.overdue_amount,
    finance.due_soon_count,
    finance.overdue_current_window_amount,
    finance.overdue_previous_window_amount,
    maintenance.open_requests,
    maintenance.open_high_priority,
    maintenance.waiting_over_48h,
    maintenance.unassigned_work_orders
  from finance, maintenance;
$$;

grant execute on function public.dashboard_snapshot(uuid, uuid, integer) to authenticated;
