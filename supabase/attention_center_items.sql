create or replace function public.attention_center_items(
  p_account_id uuid,
  p_limit integer default 60
)
returns table (
  item_key text,
  item_type text,
  bucket text,
  property_label text,
  tenant_label text,
  entity_label text,
  amount numeric,
  age_hours integer,
  due_days integer,
  link_path text,
  source_table text,
  sort_order integer
)
language sql
security definer
set search_path = public
as $$
  with cfg as (
    select greatest(1, least(coalesce(p_limit, 60), 200)) as max_items
  ),
  scoped_payments as (
    select
      p.id,
      p.amount,
      lower(coalesce(p.status, '')) as status,
      p.due_date,
      p.paid_at,
      p.tenant_id,
      p.property_id,
      coalesce(pr.address, '—') as property_label,
      coalesce(t.name, '—') as tenant_label
    from public.payments p
    left join public.properties pr on pr.id = p.property_id
    left join public.tenants t on t.id = p.tenant_id
    where p.account_id = p_account_id
  ),
  payment_items as (
    select
      'payment-overdue-' || sp.id::text as item_key,
      'overdue_rent'::text as item_type,
      'urgent'::text as bucket,
      sp.property_label,
      sp.tenant_label,
      ''::text as entity_label,
      coalesce(sp.amount, 0)::numeric as amount,
      greatest(0, ((current_date - sp.due_date) * 24))::int as age_hours,
      (sp.due_date - current_date)::int as due_days,
      case when sp.tenant_id is not null then '/tenants/' || sp.tenant_id::text else '/finance' end as link_path,
      'payments'::text as source_table,
      10 as sort_order
    from scoped_payments sp
    where sp.paid_at is null
      and (
        sp.status in ('overdue', 'zaległe', 'zalegle')
        or (sp.due_date is not null and sp.due_date < current_date)
      )

    union all

    select
      'payment-due-soon-' || sp.id::text,
      'due_soon_rent'::text,
      'upcoming'::text,
      sp.property_label,
      sp.tenant_label,
      ''::text,
      coalesce(sp.amount, 0)::numeric,
      null::int as age_hours,
      (sp.due_date - current_date)::int as due_days,
      case when sp.tenant_id is not null then '/tenants/' || sp.tenant_id::text else '/finance' end,
      'payments'::text,
      30 as sort_order
    from scoped_payments sp
    where sp.paid_at is null
      and sp.due_date is not null
      and sp.due_date >= current_date
      and sp.due_date <= current_date + interval '7 days'
      and sp.status not in ('paid', 'opłacone', 'oplacone')
  ),
  scoped_requests as (
    select
      mr.id,
      mr.property_id,
      mr.reported_by_tenant_id,
      mr.title,
      lower(coalesce(mr.status, '')) as status,
      lower(coalesce(mr.priority, '')) as priority,
      mr.created_at,
      mr.updated_at,
      coalesce(pr.address, '—') as property_label,
      coalesce(t.name, '—') as tenant_label
    from public.maintenance_requests mr
    left join public.properties pr on pr.id = mr.property_id
    left join public.tenants t on t.id = mr.reported_by_tenant_id
    where mr.account_id = p_account_id
  ),
  scoped_work_orders as (
    select
      w.id,
      w.property_id,
      w.maintenance_request_id,
      w.contractor_user_id,
      w.contractor_name,
      lower(coalesce(w.status, '')) as status,
      w.scheduled_at,
      w.created_at,
      w.updated_at,
      coalesce(pr.address, '—') as property_label,
      coalesce(mr.title, '—') as request_title
    from public.work_orders_with_flags w
    left join public.properties pr on pr.id = w.property_id
    left join public.maintenance_requests mr on mr.id = w.maintenance_request_id
    where w.account_id = p_account_id
  ),
  request_without_work_order as (
    select
      'maint-no-wo-' || sr.id::text as item_key,
      'request_without_work_order'::text as item_type,
      'action'::text as bucket,
      sr.property_label,
      sr.tenant_label,
      sr.title as entity_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - sr.created_at)) / 3600)::int as age_hours,
      null::int as due_days,
      '/maintenance-inbox'::text as link_path,
      'maintenance_requests'::text as source_table,
      40 as sort_order
    from scoped_requests sr
    where sr.status not in ('closed', 'zamknięte', 'zamkniete', 'resolved', 'rozwiązane', 'rozwiazane')
      and not exists (
        select 1
        from scoped_work_orders swo
        where swo.maintenance_request_id = sr.id
      )
  ),
  high_priority_unresolved as (
    select
      'maint-high-' || sr.id::text as item_key,
      'high_priority_unresolved'::text as item_type,
      'urgent'::text as bucket,
      sr.property_label,
      sr.tenant_label,
      sr.title as entity_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - sr.created_at)) / 3600)::int as age_hours,
      null::int as due_days,
      '/maintenance-inbox?priority=high,critical'::text as link_path,
      'maintenance_requests'::text as source_table,
      20 as sort_order
    from scoped_requests sr
    where sr.status not in ('closed', 'zamknięte', 'zamkniete', 'resolved', 'rozwiązane', 'rozwiazane')
      and sr.priority in ('high', 'urgent', 'critical', 'wysoki', 'krytyczny')
  ),
  stuck_waiting as (
    select
      'maint-waiting-' || sr.id::text as item_key,
      'stuck_waiting_over_48h'::text as item_type,
      'urgent'::text as bucket,
      sr.property_label,
      sr.tenant_label,
      sr.title as entity_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - sr.updated_at)) / 3600)::int as age_hours,
      null::int as due_days,
      '/maintenance-inbox?status=waiting'::text as link_path,
      'maintenance_requests'::text as source_table,
      15 as sort_order
    from scoped_requests sr
    where sr.status in ('waiting')
      and sr.updated_at <= now() - interval '48 hours'
  ),
  work_order_without_contractor as (
    select
      'wo-no-contractor-' || swo.id::text as item_key,
      'work_order_without_contractor'::text as item_type,
      'action'::text as bucket,
      swo.property_label,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      null::int as due_days,
      '/work-orders/' || swo.id::text as link_path,
      'work_orders'::text as source_table,
      50 as sort_order
    from scoped_work_orders swo
    where swo.status not in ('completed', 'cancelled', 'zakończone', 'anulowane')
      and swo.contractor_user_id is null
      and nullif(coalesce(swo.contractor_name, ''), '') is null
  ),
  contractor_no_response as (
    select
      'wo-no-response-' || swo.id::text as item_key,
      'contractor_no_response'::text as item_type,
      'urgent'::text as bucket,
      swo.property_label,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      case when swo.scheduled_at is not null then (swo.scheduled_at::date - current_date)::int else null::int end as due_days,
      '/work-orders/' || swo.id::text as link_path,
      'work_orders'::text as source_table,
      25 as sort_order
    from scoped_work_orders swo
    where swo.status in ('assigned', 'przypisane')
      and (swo.contractor_user_id is not null or nullif(coalesce(swo.contractor_name, ''), '') is not null)
      and coalesce(swo.updated_at, swo.created_at) <= now() - interval '48 hours'
  ),
  work_order_overdue as (
    select
      'wo-overdue-' || swo.id::text as item_key,
      'work_order_overdue'::text as item_type,
      'urgent'::text as bucket,
      swo.property_label,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      (swo.scheduled_at::date - current_date)::int as due_days,
      '/work-orders/' || swo.id::text as link_path,
      'work_orders'::text as source_table,
      18 as sort_order
    from scoped_work_orders swo
    where swo.status not in ('completed', 'cancelled', 'zakończone', 'anulowane')
      and swo.scheduled_at is not null
      and swo.scheduled_at::date < current_date
  ),
  recently_updated_open as (
    select
      'wo-recent-' || swo.id::text as item_key,
      'recently_updated_open'::text as item_type,
      'recent'::text as bucket,
      swo.property_label,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      case when swo.scheduled_at is not null then (swo.scheduled_at::date - current_date)::int else null::int end as due_days,
      '/work-orders/' || swo.id::text as link_path,
      'work_orders'::text as source_table,
      70 as sort_order
    from scoped_work_orders swo
    where swo.status in ('assigned', 'przypisane', 'in_progress', 'w trakcie')
      and coalesce(swo.updated_at, swo.created_at) >= now() - interval '72 hours'
  ),
  lease_items as (
    select
      'lease-expired-' || l.id::text as item_key,
      'lease_expired'::text as item_type,
      'urgent'::text as bucket,
      coalesce(p.address, '—') as property_label,
      coalesce(t.name, '—') as tenant_label,
      ''::text as entity_label,
      null::numeric as amount,
      null::int as age_hours,
      (l.lease_end_date - current_date)::int as due_days,
      '/tenants/' || l.tenant_id::text as link_path,
      'leases'::text as source_table,
      12 as sort_order
    from public.leases l
    left join public.properties p on p.id = l.property_id
    left join public.tenants t on t.id = l.tenant_id
    where l.account_id = p_account_id
      and l.lease_end_date < current_date
      and lower(coalesce(l.renewal_status, 'active')) not in ('renewed', 'ended')

    union all

    select
      'lease-expiring-' || l.id::text,
      'lease_expiring_soon'::text,
      'upcoming'::text,
      coalesce(p.address, '—'),
      coalesce(t.name, '—'),
      ''::text,
      null::numeric,
      null::int,
      (l.lease_end_date - current_date)::int,
      '/tenants/' || l.tenant_id::text,
      'leases'::text,
      60 as sort_order
    from public.leases l
    left join public.properties p on p.id = l.property_id
    left join public.tenants t on t.id = l.tenant_id
    where l.account_id = p_account_id
      and l.lease_end_date >= current_date
      and l.lease_end_date <= current_date + interval '60 days'
      and lower(coalesce(l.renewal_status, 'active')) not in ('renewed', 'ended')

    union all

    select
      'lease-renewal-' || l.id::text,
      'lease_renewal_in_progress'::text,
      'action'::text,
      coalesce(p.address, '—'),
      coalesce(t.name, '—'),
      ''::text,
      null::numeric,
      null::int,
      (l.lease_end_date - current_date)::int,
      '/tenants/' || l.tenant_id::text,
      'leases'::text,
      45 as sort_order
    from public.leases l
    left join public.properties p on p.id = l.property_id
    left join public.tenants t on t.id = l.tenant_id
    where l.account_id = p_account_id
      and lower(coalesce(l.renewal_status, 'active')) = 'renewal_in_progress'
  ),
  notification_items as (
    select
      'notification-' || n.id::text as item_key,
      'notification_alert'::text as item_type,
      'recent'::text as bucket,
      ''::text as property_label,
      ''::text as tenant_label,
      coalesce(n.title, 'Alert') as entity_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - n.created_at)) / 3600)::int as age_hours,
      null::int as due_days,
      coalesce(n.link_path, '') as link_path,
      'notifications'::text as source_table,
      80 as sort_order
    from public.notifications n
    where n.account_id = p_account_id
      and coalesce(n.is_read, false) = false
  ),
  unioned as (
    select * from payment_items
    union all select * from request_without_work_order
    union all select * from high_priority_unresolved
    union all select * from stuck_waiting
    union all select * from work_order_without_contractor
    union all select * from contractor_no_response
    union all select * from work_order_overdue
    union all select * from recently_updated_open
    union all select * from lease_items
    union all select * from notification_items
  )
  select
    u.item_key,
    u.item_type,
    u.bucket,
    u.property_label,
    u.tenant_label,
    u.entity_label,
    u.amount,
    u.age_hours,
    u.due_days,
    u.link_path,
    u.source_table,
    u.sort_order
  from unioned u
  order by
    case u.bucket
      when 'urgent' then 1
      when 'action' then 2
      when 'upcoming' then 3
      else 4
    end,
    u.sort_order,
    coalesce(u.age_hours, 999999),
    coalesce(u.due_days, 999999),
    u.item_key
  limit (select max_items from cfg);
$$;

grant execute on function public.attention_center_items(uuid, integer) to authenticated;
