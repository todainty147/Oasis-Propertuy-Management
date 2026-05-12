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
  authz as materialized (
    select public.assert_manage_account_access(p_account_id) as account_id
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
    cross join authz a
    left join public.properties pr on pr.id = p.property_id
    left join public.tenants t on t.id = p.tenant_id
    where p.account_id = a.account_id
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
  limited_payment_items as (
    select *
    from payment_items
    order by
      case bucket
        when 'urgent' then 1
        when 'action' then 2
        when 'upcoming' then 3
        else 4
      end,
      sort_order,
      coalesce(age_hours, 999999),
      coalesce(due_days, 999999),
      item_key
    limit (select max_items from cfg)
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
      w.acknowledgement_due_at,
      w.acknowledgement_status,
      lower(coalesce(w.status, '')) as status,
      w.scheduled_at,
      w.created_at,
      w.updated_at,
      coalesce(pr.address, '—') as property_label,
      coalesce(mr.title, '—') as request_title
    from public.work_orders w
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
  triage_overdue as (
    select
      'maint-triage-' || sr.id::text as item_key,
      'triage_over_24h'::text as item_type,
      'urgent'::text as bucket,
      sr.property_label,
      sr.tenant_label,
      sr.title as entity_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - sr.created_at)) / 3600)::int as age_hours,
      null::int as due_days,
      '/maintenance-inbox?status=open'::text as link_path,
      'maintenance_requests'::text as source_table,
      14 as sort_order
    from scoped_requests sr
    where sr.status in ('open')
      and sr.created_at <= now() - interval '24 hours'
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
  limited_request_items as (
    select
      ranked.item_key,
      ranked.item_type,
      ranked.bucket,
      ranked.property_label,
      ranked.tenant_label,
      ranked.entity_label,
      ranked.amount,
      ranked.age_hours,
      ranked.due_days,
      ranked.link_path,
      ranked.source_table,
      ranked.sort_order
    from (
      select
        x.*,
        case x.bucket
          when 'urgent' then 1
          when 'action' then 2
          when 'upcoming' then 3
          else 4
        end as bucket_rank,
        coalesce(x.age_hours, 999999) as age_rank,
        coalesce(x.due_days, 999999) as due_rank
      from (
        select * from request_without_work_order
        union all select * from triage_overdue
        union all select * from high_priority_unresolved
        union all select * from stuck_waiting
      ) x
    ) ranked
    order by
      ranked.bucket_rank,
      ranked.sort_order,
      ranked.age_rank,
      ranked.due_rank,
      ranked.item_key
    limit (select max_items from cfg)
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
      and coalesce(lower(swo.acknowledgement_status), 'pending') <> 'acknowledged'
      and swo.acknowledgement_due_at is not null
      and swo.acknowledgement_due_at < now()
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
  blocked_work_orders as (
    select
      'wo-blocked-' || swo.id::text as item_key,
      'work_order_blocked_follow_up'::text as item_type,
      'action'::text as bucket,
      swo.property_label,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      case when swo.scheduled_at is not null then (swo.scheduled_at::date - current_date)::int else null::int end as due_days,
      '/work-orders/' || swo.id::text as link_path,
      'work_orders'::text as source_table,
      32 as sort_order
    from scoped_work_orders swo
    where swo.status in ('blocked', 'zablokowane')
  ),
  stalled_work_orders as (
    select
      'wo-stalled-' || swo.id::text as item_key,
      'stalled_in_progress_repair'::text as item_type,
      'urgent'::text as bucket,
      swo.property_label,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      case when swo.scheduled_at is not null then (swo.scheduled_at::date - current_date)::int else null::int end as due_days,
      '/work-orders/' || swo.id::text as link_path,
      'work_orders'::text as source_table,
      17 as sort_order
    from scoped_work_orders swo
    where swo.status in ('in_progress', 'w trakcie', 'blocked', 'zablokowane')
      and coalesce(swo.updated_at, swo.created_at) <= now() - interval '72 hours'
  ),
  long_running_repairs as (
    select
      'wo-long-running-' || swo.id::text as item_key,
      'long_running_repair'::text as item_type,
      'action'::text as bucket,
      swo.property_label,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - swo.created_at)) / 3600)::int as age_hours,
      case when swo.scheduled_at is not null then (swo.scheduled_at::date - current_date)::int else null::int end as due_days,
      '/work-orders/' || swo.id::text as link_path,
      'work_orders'::text as source_table,
      44 as sort_order
    from scoped_work_orders swo
    where swo.status not in ('completed', 'cancelled', 'zakończone', 'anulowane')
      and swo.created_at <= now() - interval '14 days'
  ),
  repeated_repairs as (
    select
      'repeat-repairs-' || sr.property_id::text as item_key,
      'repeated_repairs_property'::text as item_type,
      'action'::text as bucket,
      max(sr.property_label) as property_label,
      ''::text as tenant_label,
      ''::text as entity_label,
      count(*)::numeric as amount,
      null::int as age_hours,
      null::int as due_days,
      '/properties/' || sr.property_id::text as link_path,
      'maintenance_requests'::text as source_table,
      46 as sort_order
    from scoped_requests sr
    where sr.property_id is not null
      and sr.created_at >= now() - interval '90 days'
    group by sr.property_id
    having count(*) >= 3
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
  limited_work_order_items as (
    select
      ranked.item_key,
      ranked.item_type,
      ranked.bucket,
      ranked.property_label,
      ranked.tenant_label,
      ranked.entity_label,
      ranked.amount,
      ranked.age_hours,
      ranked.due_days,
      ranked.link_path,
      ranked.source_table,
      ranked.sort_order
    from (
      select
        x.*,
        case x.bucket
          when 'urgent' then 1
          when 'action' then 2
          when 'upcoming' then 3
          else 4
        end as bucket_rank,
        coalesce(x.age_hours, 999999) as age_rank,
        coalesce(x.due_days, 999999) as due_rank
      from (
        select * from work_order_without_contractor
        union all select * from contractor_no_response
        union all select * from work_order_overdue
        union all select * from blocked_work_orders
        union all select * from stalled_work_orders
        union all select * from long_running_repairs
        union all select * from repeated_repairs
        union all select * from recently_updated_open
      ) x
    ) ranked
    order by
      ranked.bucket_rank,
      ranked.sort_order,
      ranked.age_rank,
      ranked.due_rank,
      ranked.item_key
    limit (select max_items from cfg)
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
  limited_lease_items as (
    select *
    from lease_items
    order by
      case bucket
        when 'urgent' then 1
        when 'action' then 2
        when 'upcoming' then 3
        else 4
      end,
      sort_order,
      coalesce(age_hours, 999999),
      coalesce(due_days, 999999),
      item_key
    limit (select max_items from cfg)
  ),
  preventive_items as (
    select
      'preventive-overdue-' || pmt.id::text as item_key,
      'preventive_task_overdue'::text as item_type,
      'urgent'::text as bucket,
      coalesce(p.address, '—') as property_label,
      ''::text as tenant_label,
      pmt.title as entity_label,
      null::numeric as amount,
      null::int as age_hours,
      (pmt.next_due_date - current_date)::int as due_days,
      '/properties/' || pmt.property_id::text as link_path,
      'preventive_maintenance_tasks'::text as source_table,
      22 as sort_order
    from public.preventive_maintenance_tasks pmt
    left join public.properties p on p.id = pmt.property_id
    where pmt.account_id = p_account_id
      and lower(coalesce(pmt.status, 'active')) = 'active'
      and pmt.next_due_date < current_date

    union all

    select
      'preventive-due-soon-' || pmt.id::text,
      'preventive_task_due_soon'::text,
      'upcoming'::text,
      coalesce(p.address, '—'),
      ''::text,
      pmt.title,
      null::numeric,
      null::int,
      (pmt.next_due_date - current_date)::int,
      '/properties/' || pmt.property_id::text,
      'preventive_maintenance_tasks'::text,
      58 as sort_order
    from public.preventive_maintenance_tasks pmt
    left join public.properties p on p.id = pmt.property_id
    where pmt.account_id = p_account_id
      and lower(coalesce(pmt.status, 'active')) = 'active'
      and pmt.next_due_date >= current_date
      and pmt.next_due_date <= current_date + interval '14 days'
  ),
  limited_preventive_items as (
    select *
    from preventive_items
    order by
      case bucket
        when 'urgent' then 1
        when 'action' then 2
        when 'upcoming' then 3
        else 4
      end,
      sort_order,
      coalesce(age_hours, 999999),
      coalesce(due_days, 999999),
      item_key
    limit (select max_items from cfg)
  ),
  compliance_items as (
    select
      'compliance-overdue-' || c.id::text as item_key,
      'compliance_overdue'::text as item_type,
      'urgent'::text as bucket,
      coalesce(p.address, '—') as property_label,
      coalesce(t.name, '—') as tenant_label,
      c.title as entity_label,
      null::numeric as amount,
      null::int as age_hours,
      (c.due_date - current_date)::int as due_days,
      coalesce(
        case when c.property_id is not null then '/properties/' || c.property_id::text else null end,
        case when c.tenant_id is not null then '/tenants/' || c.tenant_id::text else null end,
        '/attention-center'
      ) as link_path,
      'compliance_items'::text as source_table,
      19 as sort_order
    from public.compliance_items c
    left join public.properties p on p.id = c.property_id
    left join public.tenants t on t.id = c.tenant_id
    where c.account_id = p_account_id
      and lower(coalesce(c.status, 'active')) = 'active'
      and c.due_date < current_date

    union all

    select
      'compliance-due-' || c.id::text,
      'compliance_due_soon'::text,
      'upcoming'::text,
      coalesce(p.address, '—'),
      coalesce(t.name, '—'),
      c.title,
      null::numeric,
      null::int,
      (c.due_date - current_date)::int,
      coalesce(
        case when c.property_id is not null then '/properties/' || c.property_id::text else null end,
        case when c.tenant_id is not null then '/tenants/' || c.tenant_id::text else null end,
        '/attention-center'
      ),
      'compliance_items'::text,
      57 as sort_order
    from public.compliance_items c
    left join public.properties p on p.id = c.property_id
    left join public.tenants t on t.id = c.tenant_id
    where c.account_id = p_account_id
      and lower(coalesce(c.status, 'active')) = 'active'
      and c.due_date >= current_date
      and c.due_date <= current_date + interval '30 days'
  ),
  compliance_missing_setup as (
    select
      'compliance-missing-calendar-' || p.id::text as item_key,
      'compliance_missing_setup'::text as item_type,
      'action'::text as bucket,
      coalesce(p.address, '—') as property_label,
      ''::text as tenant_label,
      'Compliance calendar not set up'::text as entity_label,
      null::numeric as amount,
      null::int as age_hours,
      null::int as due_days,
      '/properties/' || p.id::text as link_path,
      'compliance_items'::text as source_table,
      59 as sort_order
    from public.properties p
    where p.account_id = p_account_id
      and not exists (
        select 1
        from public.compliance_items c
        where c.account_id = p.account_id
          and c.property_id = p.id
      )
  ),
  limited_compliance_items as (
    select
      ranked.item_key,
      ranked.item_type,
      ranked.bucket,
      ranked.property_label,
      ranked.tenant_label,
      ranked.entity_label,
      ranked.amount,
      ranked.age_hours,
      ranked.due_days,
      ranked.link_path,
      ranked.source_table,
      ranked.sort_order
    from (
      select
        x.*,
        case x.bucket
          when 'urgent' then 1
          when 'action' then 2
          when 'upcoming' then 3
          else 4
        end as bucket_rank,
        coalesce(x.age_hours, 999999) as age_rank,
        coalesce(x.due_days, 999999) as due_rank
      from (
        select * from compliance_items
        union all select * from compliance_missing_setup
      ) x
    ) ranked
    order by
      ranked.bucket_rank,
      ranked.sort_order,
      ranked.age_rank,
      ranked.due_rank,
      ranked.item_key
    limit (select max_items from cfg)
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
  limited_notification_items as (
    select *
    from notification_items
    order by
      case bucket
        when 'urgent' then 1
        when 'action' then 2
        when 'upcoming' then 3
        else 4
      end,
      sort_order,
      coalesce(age_hours, 999999),
      coalesce(due_days, 999999),
      item_key
    limit (select max_items from cfg)
  ),
  -- ── Rent plan attention items (Phase G) ─────────────────────────────────────
  rent_plan_items as (
    -- Occupied properties with no active rent plan
    select
      'rent-plan-missing-' || pr.id::text as item_key,
      'rent_plan_missing'::text as item_type,
      'action'::text as bucket,
      coalesce(pr.address, '—') as property_label,
      coalesce(t.name, '—') as tenant_label,
      ''::text as entity_label,
      coalesce(pr.rent, 0)::numeric as amount,
      null::int as age_hours,
      null::int as due_days,
      '/finance/rent-plans'::text as link_path,
      'properties'::text as source_table,
      35 as sort_order
    from public.properties pr
    cross join authz a
    left join public.tenants t
      on t.property_id = pr.id and t.account_id = a.account_id and t.archived_at is null
    where pr.account_id = a.account_id
      and t.id is not null   -- occupied
      and not exists (
        select 1
        from public.rent_plans rp
        where rp.account_id = a.account_id
          and rp.property_id = pr.id
          and rp.status = 'active'
      )

    union all

    -- Rent plans in draft that have not been activated
    select
      'rent-plan-draft-' || rp.id::text,
      'rent_plan_draft'::text,
      'action'::text,
      coalesce(pr.address, '—'),
      coalesce(t.name, '—'),
      'Draft rent plan'::text,
      rp.base_rent_amount,
      floor(extract(epoch from (now() - rp.created_at)) / 3600)::int,
      null::int,
      '/finance/rent-plans'::text,
      'rent_plans'::text,
      36 as sort_order
    from public.rent_plans rp
    cross join authz a
    left join public.properties pr on pr.id = rp.property_id
    left join public.tenants t on t.id = rp.tenant_id
    where rp.account_id = a.account_id
      and rp.status = 'draft'

    union all

    -- Expected charges that are scheduled (past due date, not yet posted)
    select
      'expected-charge-overdue-' || ec.id::text,
      'expected_charge_overdue'::text,
      'urgent'::text,
      coalesce(pr.address, '—'),
      coalesce(t.name, '—'),
      'Expected charge overdue'::text,
      ec.amount,
      floor(extract(epoch from (now() - ec.due_date::timestamptz)) / 3600)::int,
      (ec.due_date - current_date)::int,
      '/finance/rent-plans'::text,
      'expected_charges'::text,
      12 as sort_order
    from public.expected_charges ec
    cross join authz a
    left join public.properties pr on pr.id = ec.property_id
    left join public.tenants t on t.id = ec.tenant_id
    where ec.account_id = a.account_id
      and ec.status = 'scheduled'
      and ec.due_date < current_date

    union all

    -- Proposed rent increase awaiting approval
    select
      'rent-increase-pending-' || rp.id::text,
      'rent_increase_pending'::text,
      'action'::text,
      coalesce(pr.address, '—'),
      coalesce(t.name, '—'),
      'Proposed rent increase awaiting approval'::text,
      rp.base_rent_amount,
      floor(extract(epoch from (now() - rp.created_at)) / 3600)::int,
      null::int,
      '/finance/rent-plans'::text,
      'rent_plans'::text,
      37 as sort_order
    from public.rent_plans rp
    cross join authz a
    left join public.properties pr on pr.id = rp.property_id
    left join public.tenants t on t.id = rp.tenant_id
    where rp.account_id = a.account_id
      and rp.status in ('proposed', 'notice_pending', 'approved')

    union all

    -- Active discount expiring within 7 days
    select
      'discount-expiring-' || ra.id::text,
      'discount_expiring'::text,
      'upcoming'::text,
      coalesce(pr.address, '—'),
      coalesce(t.name, '—'),
      coalesce(ra.reason, 'Discount expiring soon'),
      ra.amount,
      null::int,
      (ra.end_date - current_date)::int,
      '/finance/rent-plans'::text,
      'rent_adjustments'::text,
      38 as sort_order
    from public.rent_adjustments ra
    cross join authz a
    left join public.properties pr on pr.id = ra.property_id
    left join public.tenants t on t.id = ra.tenant_id
    where ra.account_id = a.account_id
      and ra.status = 'active'
      and ra.end_date is not null
      and ra.end_date between current_date and current_date + interval '7 days'

    union all

    -- STR booking charges in draft (not yet confirmed or posted)
    select
      'str-draft-' || sb.id::text,
      'str_draft_not_posted'::text,
      'action'::text,
      coalesce(pr.address, '—'),
      '—'::text,
      coalesce('STR booking: ' || coalesce(sb.booking_reference, 'no ref'), 'STR booking draft'),
      sb.total_amount,
      floor(extract(epoch from (now() - sb.created_at)) / 3600)::int,
      null::int,
      '/finance/rent-plans'::text,
      'str_booking_charges'::text,
      39 as sort_order
    from public.str_booking_charges sb
    cross join authz a
    left join public.properties pr on pr.id = sb.property_id
    where sb.account_id = a.account_id
      and sb.status = 'draft'

    union all

    -- Utility charges in draft awaiting review
    select
      'utility-draft-' || uc.id::text,
      'utility_awaiting_review'::text,
      'action'::text,
      coalesce(pr.address, '—'),
      coalesce(t.name, '—'),
      coalesce(uc.utility_type, 'Utility') || ' charge awaiting review',
      coalesce(uc.amount_calculated, 0),
      floor(extract(epoch from (now() - uc.created_at)) / 3600)::int,
      null::int,
      '/finance/rent-plans'::text,
      'utility_charges'::text,
      40 as sort_order
    from public.utility_charges uc
    cross join authz a
    left join public.properties pr on pr.id = uc.property_id
    left join public.tenants t on t.id = uc.tenant_id
    where uc.account_id = a.account_id
      and uc.status = 'draft'

    union all

    -- UK deposit cap breach (Tenant Fees Act 2019): 5-week cap below £50k/yr, 6-week cap above
    select
      'deposit-breach-' || rp.id::text,
      'deposit_cap_breach'::text,
      'action'::text,
      coalesce(pr.address, '—'),
      coalesce(t.name, '—'),
      'Deposit may exceed UK TFA cap — review required'::text,
      rp.deposit_amount,
      null::int,
      null::int,
      '/finance/rent-plans'::text,
      'rent_plans'::text,
      33 as sort_order
    from public.rent_plans rp
    cross join authz a
    left join public.properties pr on pr.id = rp.property_id
    left join public.tenants t on t.id = rp.tenant_id
    where rp.account_id = a.account_id
      and rp.status = 'active'
      and rp.market = 'uk'
      and rp.deposit_amount is not null
      and rp.deposit_amount > 0
      and (
        (rp.base_rent_amount * 12 < 50000 and rp.deposit_amount > rp.base_rent_amount * 12.0 / 52 * 5)
        or
        (rp.base_rent_amount * 12 >= 50000 and rp.deposit_amount > rp.base_rent_amount * 12.0 / 52 * 6)
      )

    union all

    -- New tenant move-in within 14 days — no expected charge posted yet (proration needs review)
    select
      'proration-review-' || t2.id::text,
      'move_in_proration_needs_review'::text,
      'action'::text,
      coalesce(pr2.address, '—'),
      coalesce(t2.name, '—'),
      'New move-in — proration charge not yet posted'::text,
      rp2.base_rent_amount,
      null::int,
      null::int,
      '/finance/rent-plans'::text,
      'tenants'::text,
      34 as sort_order
    from public.tenants t2
    cross join authz a
    left join public.properties pr2 on pr2.id = t2.property_id
    inner join public.rent_plans rp2
      on rp2.account_id = a.account_id
      and rp2.property_id = t2.property_id
      and rp2.status = 'active'
    where t2.account_id = a.account_id
      and t2.archived_at is null
      and t2.created_at >= now() - interval '14 days'
      and not exists (
        select 1
        from public.expected_charges ec2
        where ec2.account_id = a.account_id
          and ec2.tenant_id = t2.id
          and ec2.status in ('posted', 'scheduled')
      )

    union all

    -- Active rent plan with no posted expected charges (rent collection not started)
    select
      'first-charge-pending-' || rp3.id::text,
      'first_rent_charge_not_posted'::text,
      'action'::text,
      coalesce(pr3.address, '—'),
      coalesce(t3.name, '—'),
      'Active rent plan — first charge not yet posted to Finance'::text,
      rp3.base_rent_amount,
      floor(extract(epoch from (now() - rp3.created_at)) / 3600)::int,
      null::int,
      '/finance/rent-plans'::text,
      'rent_plans'::text,
      41 as sort_order
    from public.rent_plans rp3
    cross join authz a
    left join public.properties pr3 on pr3.id = rp3.property_id
    left join public.tenants t3 on t3.id = rp3.tenant_id
    where rp3.account_id = a.account_id
      and rp3.status = 'active'
      and not exists (
        select 1
        from public.expected_charges ec3
        where ec3.account_id = a.account_id
          and ec3.rent_plan_id = rp3.id
          and ec3.status = 'posted'
      )

    union all

    -- Posted expected charge where linked payment is still unpaid after 14 days
    select
      'unmatched-charge-' || ec4.id::text,
      'expected_rent_not_matched'::text,
      'action'::text,
      coalesce(pr4.address, '—'),
      coalesce(t4.name, '—'),
      'Posted charge — payment not yet received'::text,
      ec4.amount,
      floor(extract(epoch from (now() - ec4.created_at)) / 3600)::int,
      (ec4.due_date - current_date)::int,
      '/finance/rent-plans'::text,
      'expected_charges'::text,
      42 as sort_order
    from public.expected_charges ec4
    cross join authz a
    left join public.properties pr4 on pr4.id = ec4.property_id
    left join public.tenants t4 on t4.id = ec4.tenant_id
    left join public.payments p4 on p4.id = ec4.posted_payment_id
    where ec4.account_id = a.account_id
      and ec4.status = 'posted'
      and ec4.posted_payment_id is not null
      and (p4.paid_at is null or lower(coalesce(p4.status, '')) not in ('paid', 'opłacone', 'oplacone'))
      and ec4.created_at <= now() - interval '14 days'
  ),
  limited_rent_plan_items as (
    select *
    from rent_plan_items
    order by
      case bucket
        when 'urgent' then 1
        when 'action' then 2
        when 'upcoming' then 3
        else 4
      end,
      sort_order,
      coalesce(age_hours, 999999),
      coalesce(due_days, 999999),
      item_key
    limit (select max_items from cfg)
  ),
  unioned as (
    select * from limited_payment_items
    union all select * from limited_request_items
    union all select * from limited_work_order_items
    union all select * from limited_lease_items
    union all select * from limited_preventive_items
    union all select * from limited_compliance_items
    union all select * from limited_notification_items
    union all select * from limited_rent_plan_items
  ),
  ordered as (
    select
      u.*,
      case u.bucket
        when 'urgent' then 1
        when 'action' then 2
        when 'upcoming' then 3
        else 4
      end as bucket_rank,
      coalesce(u.age_hours, 999999) as age_rank,
      coalesce(u.due_days, 999999) as due_rank
    from unioned u
  )
  select
    o.item_key,
    o.item_type,
    o.bucket,
    o.property_label,
    o.tenant_label,
    o.entity_label,
    o.amount,
    o.age_hours,
    o.due_days,
    o.link_path,
    o.source_table,
    o.sort_order
  from ordered o
  cross join authz a
  order by
    o.bucket_rank,
    o.sort_order,
    o.age_rank,
    o.due_rank,
    o.item_key
  limit (select max_items from cfg);
$$;

grant execute on function public.attention_center_items(uuid, integer) to authenticated;
