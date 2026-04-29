drop function if exists public.command_center_items(uuid, integer);

create function public.command_center_items(
  p_account_id uuid,
  p_limit integer default 80
)
returns table (
  item_key text,
  item_type text,
  category text,
  severity text,
  bucket text,
  entity_type text,
  entity_id text,
  title text,
  body text,
  link_path text,
  property_id uuid,
  property_label text,
  tenant_id uuid,
  tenant_label text,
  entity_label text,
  contractor_label text,
  amount numeric,
  age_hours integer,
  due_days integer,
  created_at timestamptz,
  resolved_state boolean,
  source_table text,
  sort_order integer
)
language sql
security definer
set search_path = public
as $$
  with cfg as (
    select greatest(1, least(coalesce(p_limit, 80), 200)) as max_items
  ),
  authz as materialized (
    select
      public.assert_manage_account_access(p_account_id) as account_id,
      public.assert_account_feature_access(p_account_id, 'command_center') as feature_account_id
  ),
  security_cfg as (
    select
      coalesce((
        select s.surface_security_alerts_in_command_center
        from public.account_security_settings s
        where s.account_id = p_account_id
      ), true) as enabled,
      coalesce((
        select lower(s.security_command_center_min_severity)
        from public.account_security_settings s
        where s.account_id = p_account_id
      ), 'urgent') as min_severity,
      coalesce((
        select s.security_command_center_include_suspicious
        from public.account_security_settings s
        where s.account_id = p_account_id
      ), true) as include_suspicious
  ),
  scoped_payments as (
    select
      p.id,
      p.amount,
      lower(coalesce(p.status, '')) as status,
      p.due_date,
      p.paid_at,
      p.created_at,
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
      'finance'::text as category,
      'urgent'::text as severity,
      'urgent'::text as bucket,
      'tenant'::text as entity_type,
      sp.tenant_id::text as entity_id,
      'Overdue rent'::text as title,
      ''::text as body,
      case when sp.tenant_id is not null then '/tenants/' || sp.tenant_id::text else '/finance' end as link_path,
      sp.property_id,
      sp.property_label,
      sp.tenant_id,
      sp.tenant_label,
      ''::text as entity_label,
      ''::text as contractor_label,
      coalesce(sp.amount, 0)::numeric as amount,
      greatest(0, ((current_date - sp.due_date) * 24))::int as age_hours,
      (sp.due_date - current_date)::int as due_days,
      coalesce(sp.created_at, sp.due_date::timestamptz) as created_at,
      false as resolved_state,
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
      'finance'::text,
      'action'::text,
      'upcoming'::text,
      'tenant'::text,
      sp.tenant_id::text,
      'Rent due soon'::text,
      ''::text,
      case when sp.tenant_id is not null then '/tenants/' || sp.tenant_id::text else '/finance' end,
      sp.property_id,
      sp.property_label,
      sp.tenant_id,
      sp.tenant_label,
      ''::text,
      ''::text,
      coalesce(sp.amount, 0)::numeric,
      null::int as age_hours,
      (sp.due_date - current_date)::int as due_days,
      coalesce(sp.created_at, sp.due_date::timestamptz),
      false,
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
      lower(coalesce(w.acknowledgement_status, '')) as acknowledgement_status,
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
      'maintenance'::text as category,
      'action'::text as severity,
      'action'::text as bucket,
      'maintenance_request'::text as entity_type,
      sr.id::text as entity_id,
      'Request without work order'::text as title,
      ''::text as body,
      '/maintenance-inbox'::text as link_path,
      sr.property_id,
      sr.property_label,
      sr.reported_by_tenant_id as tenant_id,
      sr.tenant_label,
      sr.title as entity_label,
      ''::text as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - sr.created_at)) / 3600)::int as age_hours,
      null::int as due_days,
      sr.created_at,
      false as resolved_state,
      'maintenance_requests'::text as source_table,
      40 as sort_order
    from scoped_requests sr
    where sr.status not in ('closed', 'zamknięte', 'zamkniete', 'resolved', 'rozwiązane', 'rozwiazane')
      and not exists (
        select 1 from scoped_work_orders swo where swo.maintenance_request_id = sr.id
      )
  ),
  triage_overdue as (
    select
      'maint-triage-' || sr.id::text as item_key,
      'triage_over_24h'::text as item_type,
      'maintenance'::text as category,
      'urgent'::text as severity,
      'urgent'::text as bucket,
      'maintenance_request'::text as entity_type,
      sr.id::text as entity_id,
      'Triage waiting more than 24h'::text as title,
      ''::text as body,
      '/maintenance-inbox?status=open'::text as link_path,
      sr.property_id,
      sr.property_label,
      sr.reported_by_tenant_id as tenant_id,
      sr.tenant_label,
      sr.title as entity_label,
      ''::text as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - sr.created_at)) / 3600)::int as age_hours,
      null::int as due_days,
      sr.created_at,
      false as resolved_state,
      'maintenance_requests'::text as source_table,
      14 as sort_order
    from scoped_requests sr
    where sr.status in ('open')
      and sr.created_at <= now() - interval '24 hours'
      and not exists (
        select 1 from scoped_work_orders swo where swo.maintenance_request_id = sr.id
      )
  ),
  high_priority_unresolved as (
    select
      'maint-high-' || sr.id::text as item_key,
      'high_priority_unresolved'::text as item_type,
      'maintenance'::text as category,
      'urgent'::text as severity,
      'urgent'::text as bucket,
      'maintenance_request'::text as entity_type,
      sr.id::text as entity_id,
      'High-priority unresolved request'::text as title,
      ''::text as body,
      '/maintenance-inbox?priority=high,critical'::text as link_path,
      sr.property_id,
      sr.property_label,
      sr.reported_by_tenant_id as tenant_id,
      sr.tenant_label,
      sr.title as entity_label,
      ''::text as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - sr.created_at)) / 3600)::int as age_hours,
      null::int as due_days,
      sr.created_at,
      false as resolved_state,
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
      'maintenance'::text as category,
      'urgent'::text as severity,
      'urgent'::text as bucket,
      'maintenance_request'::text as entity_type,
      sr.id::text as entity_id,
      'Request waiting more than 48h'::text as title,
      ''::text as body,
      '/maintenance-inbox?status=waiting'::text as link_path,
      sr.property_id,
      sr.property_label,
      sr.reported_by_tenant_id as tenant_id,
      sr.tenant_label,
      sr.title as entity_label,
      ''::text as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - sr.updated_at)) / 3600)::int as age_hours,
      null::int as due_days,
      coalesce(sr.updated_at, sr.created_at),
      false as resolved_state,
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
      ranked.category,
      ranked.severity,
      ranked.bucket,
      ranked.entity_type,
      ranked.entity_id,
      ranked.title,
      ranked.body,
      ranked.link_path,
      ranked.property_id,
      ranked.property_label,
      ranked.tenant_id,
      ranked.tenant_label,
      ranked.entity_label,
      ranked.contractor_label,
      ranked.amount,
      ranked.age_hours,
      ranked.due_days,
      ranked.created_at,
      ranked.resolved_state,
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
      'contractor'::text as category,
      'action'::text as severity,
      'action'::text as bucket,
      'work_order'::text as entity_type,
      swo.id::text as entity_id,
      'Work order without contractor'::text as title,
      ''::text as body,
      '/work-orders/' || swo.id::text as link_path,
      swo.property_id,
      swo.property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      ''::text as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      null::int as due_days,
      swo.created_at,
      false as resolved_state,
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
      'contractor'::text as category,
      'urgent'::text as severity,
      'urgent'::text as bucket,
      'work_order'::text as entity_type,
      swo.id::text as entity_id,
      'Contractor acknowledgement overdue'::text as title,
      ''::text as body,
      '/work-orders/' || swo.id::text as link_path,
      swo.property_id,
      swo.property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      coalesce(swo.contractor_name, '') as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      case when swo.scheduled_at is not null then (swo.scheduled_at::date - current_date)::int else null::int end as due_days,
      coalesce(swo.updated_at, swo.created_at),
      false as resolved_state,
      'work_orders'::text as source_table,
      25 as sort_order
    from scoped_work_orders swo
    where swo.status in ('assigned', 'przypisane')
      and (swo.contractor_user_id is not null or nullif(coalesce(swo.contractor_name, ''), '') is not null)
      and coalesce(swo.acknowledgement_status, 'pending') <> 'acknowledged'
      and swo.acknowledgement_due_at is not null
      and swo.acknowledgement_due_at < now()
  ),
  work_order_overdue as (
    select
      'wo-overdue-' || swo.id::text as item_key,
      'work_order_overdue'::text as item_type,
      'maintenance'::text as category,
      'urgent'::text as severity,
      'urgent'::text as bucket,
      'work_order'::text as entity_type,
      swo.id::text as entity_id,
      'Work order overdue'::text as title,
      ''::text as body,
      '/work-orders/' || swo.id::text as link_path,
      swo.property_id,
      swo.property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      coalesce(swo.contractor_name, '') as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      (swo.scheduled_at::date - current_date)::int as due_days,
      coalesce(swo.updated_at, swo.created_at),
      false as resolved_state,
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
      'contractor'::text as category,
      'action'::text as severity,
      'action'::text as bucket,
      'work_order'::text as entity_type,
      swo.id::text as entity_id,
      'Blocked work order needs follow-up'::text as title,
      ''::text as body,
      '/work-orders/' || swo.id::text as link_path,
      swo.property_id,
      swo.property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      coalesce(swo.contractor_name, '') as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      case when swo.scheduled_at is not null then (swo.scheduled_at::date - current_date)::int else null::int end as due_days,
      coalesce(swo.updated_at, swo.created_at),
      false as resolved_state,
      'work_orders'::text as source_table,
      32 as sort_order
    from scoped_work_orders swo
    where swo.status in ('blocked', 'zablokowane')
  ),
  stalled_work_orders as (
    select
      'wo-stalled-' || swo.id::text as item_key,
      'stalled_in_progress_repair'::text as item_type,
      'maintenance'::text as category,
      'urgent'::text as severity,
      'urgent'::text as bucket,
      'work_order'::text as entity_type,
      swo.id::text as entity_id,
      'Repair stalled without updates'::text as title,
      ''::text as body,
      '/work-orders/' || swo.id::text as link_path,
      swo.property_id,
      swo.property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      coalesce(swo.contractor_name, '') as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      case when swo.scheduled_at is not null then (swo.scheduled_at::date - current_date)::int else null::int end as due_days,
      coalesce(swo.updated_at, swo.created_at),
      false as resolved_state,
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
      'maintenance'::text as category,
      'action'::text as severity,
      'action'::text as bucket,
      'work_order'::text as entity_type,
      swo.id::text as entity_id,
      'Long-running repair'::text as title,
      ''::text as body,
      '/work-orders/' || swo.id::text as link_path,
      swo.property_id,
      swo.property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      coalesce(swo.contractor_name, '') as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - swo.created_at)) / 3600)::int as age_hours,
      case when swo.scheduled_at is not null then (swo.scheduled_at::date - current_date)::int else null::int end as due_days,
      swo.created_at,
      false as resolved_state,
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
      'maintenance'::text as category,
      'action'::text as severity,
      'action'::text as bucket,
      'property'::text as entity_type,
      sr.property_id::text as entity_id,
      'Repeated repairs at a property'::text as title,
      ''::text as body,
      '/properties/' || sr.property_id::text as link_path,
      sr.property_id,
      max(sr.property_label) as property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      ''::text as entity_label,
      ''::text as contractor_label,
      count(*)::numeric as amount,
      null::int as age_hours,
      null::int as due_days,
      max(sr.created_at) as created_at,
      false as resolved_state,
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
      'maintenance'::text as category,
      'info'::text as severity,
      'recent'::text as bucket,
      'work_order'::text as entity_type,
      swo.id::text as entity_id,
      'Recently updated open item'::text as title,
      ''::text as body,
      '/work-orders/' || swo.id::text as link_path,
      swo.property_id,
      swo.property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      coalesce(swo.contractor_name, '') as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      case when swo.scheduled_at is not null then (swo.scheduled_at::date - current_date)::int else null::int end as due_days,
      coalesce(swo.updated_at, swo.created_at),
      false as resolved_state,
      'work_orders'::text as source_table,
      70 as sort_order
    from scoped_work_orders swo
    where swo.status in ('assigned', 'przypisane', 'in_progress', 'w trakcie')
      and coalesce(swo.updated_at, swo.created_at) >= now() - interval '72 hours'
  ),
  pending_quote_approval as (
    select
      'wo-quote-approval-' || swo.id::text as item_key,
      'pending_quote_approval'::text as item_type,
      'finance'::text as category,
      'action'::text as severity,
      'action'::text as bucket,
      'work_order'::text as entity_type,
      swo.id::text as entity_id,
      'Pending quote approval'::text as title,
      coalesce(fin.quote_notes, '')::text as body,
      '/work-orders/' || swo.id::text as link_path,
      swo.property_id,
      swo.property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      coalesce(swo.contractor_name, '') as contractor_label,
      coalesce(fin.quote_amount, 0)::numeric as amount,
      floor(extract(epoch from (now() - coalesce(fin.quote_submitted_at, fin.updated_at, swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      case when swo.scheduled_at is not null then (swo.scheduled_at::date - current_date)::int else null::int end as due_days,
      coalesce(fin.quote_submitted_at, fin.updated_at, swo.updated_at, swo.created_at),
      false as resolved_state,
      'work_order_financials'::text as source_table,
      28 as sort_order
    from scoped_work_orders swo
    join public.work_order_financials fin
      on fin.work_order_id = swo.id
     and fin.account_id = p_account_id
    where swo.status not in ('completed', 'cancelled', 'zakończone', 'anulowane')
      and lower(coalesce(fin.quote_status, '')) = 'submitted'
  ),
  invoice_awaiting_approval as (
    select
      'wo-invoice-approval-' || swo.id::text as item_key,
      'invoice_awaiting_approval'::text as item_type,
      'finance'::text as category,
      'action'::text as severity,
      'action'::text as bucket,
      'work_order'::text as entity_type,
      swo.id::text as entity_id,
      'Invoice awaiting approval'::text as title,
      ''::text as body,
      '/work-orders/' || swo.id::text as link_path,
      swo.property_id,
      swo.property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      swo.request_title as entity_label,
      coalesce(swo.contractor_name, '') as contractor_label,
      coalesce(fin.invoice_amount, 0)::numeric as amount,
      floor(extract(epoch from (now() - coalesce(fin.invoice_issued_at, fin.updated_at, swo.updated_at, swo.created_at))) / 3600)::int as age_hours,
      case when fin.invoice_due_at is not null then (fin.invoice_due_at::date - current_date)::int else null::int end as due_days,
      coalesce(fin.invoice_issued_at, fin.updated_at, swo.updated_at, swo.created_at),
      false as resolved_state,
      'work_order_financials'::text as source_table,
      29 as sort_order
    from scoped_work_orders swo
    join public.work_order_financials fin
      on fin.work_order_id = swo.id
     and fin.account_id = p_account_id
    where swo.status not in ('completed', 'cancelled', 'zakończone', 'anulowane')
      and fin.invoice_amount is not null
      and fin.approved_at is null
      and fin.rejected_at is null
  ),
  limited_work_order_items as (
    select
      ranked.item_key,
      ranked.item_type,
      ranked.category,
      ranked.severity,
      ranked.bucket,
      ranked.entity_type,
      ranked.entity_id,
      ranked.title,
      ranked.body,
      ranked.link_path,
      ranked.property_id,
      ranked.property_label,
      ranked.tenant_id,
      ranked.tenant_label,
      ranked.entity_label,
      ranked.contractor_label,
      ranked.amount,
      ranked.age_hours,
      ranked.due_days,
      ranked.created_at,
      ranked.resolved_state,
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
        union all select * from pending_quote_approval
        union all select * from invoice_awaiting_approval
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
      'lease'::text as category,
      'urgent'::text as severity,
      'urgent'::text as bucket,
      'tenant'::text as entity_type,
      l.tenant_id::text as entity_id,
      'Lease expired'::text as title,
      ''::text as body,
      '/tenants/' || l.tenant_id::text as link_path,
      l.property_id,
      coalesce(p.address, '—') as property_label,
      l.tenant_id,
      coalesce(t.name, '—') as tenant_label,
      ''::text as entity_label,
      ''::text as contractor_label,
      null::numeric as amount,
      null::int as age_hours,
      (l.lease_end_date - current_date)::int as due_days,
      l.updated_at,
      false as resolved_state,
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
      'lease'::text,
      'action'::text,
      'upcoming'::text,
      'tenant'::text,
      l.tenant_id::text,
      'Lease expiring soon'::text,
      ''::text,
      '/tenants/' || l.tenant_id::text,
      l.property_id,
      coalesce(p.address, '—'),
      l.tenant_id,
      coalesce(t.name, '—'),
      ''::text,
      ''::text,
      null::numeric,
      null::int,
      (l.lease_end_date - current_date)::int,
      l.updated_at,
      false,
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
      'lease'::text,
      'action'::text,
      'action'::text,
      'tenant'::text,
      l.tenant_id::text,
      'Lease renewal in progress'::text,
      ''::text,
      '/tenants/' || l.tenant_id::text,
      l.property_id,
      coalesce(p.address, '—'),
      l.tenant_id,
      coalesce(t.name, '—'),
      ''::text,
      ''::text,
      null::numeric,
      null::int,
      (l.lease_end_date - current_date)::int,
      l.updated_at,
      false,
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
      'preventive'::text as category,
      'urgent'::text as severity,
      'urgent'::text as bucket,
      'preventive_task'::text as entity_type,
      pmt.id::text as entity_id,
      'Overdue preventive task'::text as title,
      ''::text as body,
      '/properties/' || pmt.property_id::text as link_path,
      pmt.property_id,
      coalesce(p.address, '—') as property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      pmt.title as entity_label,
      coalesce(c.name, '') as contractor_label,
      null::numeric as amount,
      null::int as age_hours,
      (pmt.next_due_date - current_date)::int as due_days,
      pmt.updated_at,
      false as resolved_state,
      'preventive_maintenance_tasks'::text as source_table,
      22 as sort_order
    from public.preventive_maintenance_tasks pmt
    left join public.properties p on p.id = pmt.property_id
    left join public.contractors c on c.id = pmt.assigned_to_contractor_id
    where pmt.account_id = p_account_id
      and lower(coalesce(pmt.status, 'active')) = 'active'
      and pmt.next_due_date < current_date

    union all

    select
      'preventive-due-soon-' || pmt.id::text,
      'preventive_task_due_soon'::text,
      'preventive'::text,
      'action'::text,
      'upcoming'::text,
      'preventive_task'::text,
      pmt.id::text,
      'Preventive task due soon'::text,
      ''::text,
      '/properties/' || pmt.property_id::text,
      pmt.property_id,
      coalesce(p.address, '—'),
      null::uuid,
      ''::text,
      pmt.title,
      coalesce(c.name, ''),
      null::numeric,
      null::int,
      (pmt.next_due_date - current_date)::int,
      pmt.updated_at,
      false,
      'preventive_maintenance_tasks'::text,
      58 as sort_order
    from public.preventive_maintenance_tasks pmt
    left join public.properties p on p.id = pmt.property_id
    left join public.contractors c on c.id = pmt.assigned_to_contractor_id
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
  compliance_due_items as (
    select
      'compliance-overdue-' || c.id::text as item_key,
      'compliance_overdue'::text as item_type,
      'compliance'::text as category,
      'urgent'::text as severity,
      'urgent'::text as bucket,
      case when c.tenant_id is not null then 'tenant' else 'property' end::text as entity_type,
      coalesce(c.tenant_id::text, c.property_id::text) as entity_id,
      'Compliance overdue'::text as title,
      coalesce(c.notes, '') as body,
      coalesce(
        case when c.property_id is not null then '/properties/' || c.property_id::text else null end,
        case when c.tenant_id is not null then '/tenants/' || c.tenant_id::text else null end,
        '/command-center'
      ) as link_path,
      c.property_id,
      coalesce(p.address, '—') as property_label,
      c.tenant_id,
      coalesce(t.name, '—') as tenant_label,
      c.title as entity_label,
      ''::text as contractor_label,
      null::numeric as amount,
      null::int as age_hours,
      (c.due_date - current_date)::int as due_days,
      c.updated_at as created_at,
      false as resolved_state,
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
      'compliance'::text,
      'action'::text,
      'upcoming'::text,
      case when c.tenant_id is not null then 'tenant' else 'property' end::text,
      coalesce(c.tenant_id::text, c.property_id::text),
      'Compliance due soon'::text,
      coalesce(c.notes, '') as body,
      coalesce(
        case when c.property_id is not null then '/properties/' || c.property_id::text else null end,
        case when c.tenant_id is not null then '/tenants/' || c.tenant_id::text else null end,
        '/command-center'
      ),
      c.property_id,
      coalesce(p.address, '—'),
      c.tenant_id,
      coalesce(t.name, '—'),
      c.title,
      ''::text,
      null::numeric,
      null::int,
      (c.due_date - current_date)::int,
      c.updated_at as created_at,
      false,
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
      'compliance'::text as category,
      'action'::text as severity,
      'action'::text as bucket,
      'property'::text as entity_type,
      p.id::text as entity_id,
      'Compliance calendar not set up'::text as title,
      ''::text as body,
      '/properties/' || p.id::text as link_path,
      p.id as property_id,
      coalesce(p.address, '—') as property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      'Compliance calendar not set up'::text as entity_label,
      ''::text as contractor_label,
      null::numeric as amount,
      null::int as age_hours,
      null::int as due_days,
      p.created_at,
      false as resolved_state,
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
      ranked.category,
      ranked.severity,
      ranked.bucket,
      ranked.entity_type,
      ranked.entity_id,
      ranked.title,
      ranked.body,
      ranked.link_path,
      ranked.property_id,
      ranked.property_label,
      ranked.tenant_id,
      ranked.tenant_label,
      ranked.entity_label,
      ranked.contractor_label,
      ranked.amount,
      ranked.age_hours,
      ranked.due_days,
      ranked.created_at,
      ranked.resolved_state,
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
        select * from compliance_due_items
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
      coalesce(nullif(lower(coalesce(n.metadata->>'alert_category', '')), ''), 'general')::text as category,
      coalesce(nullif(lower(coalesce(n.metadata->>'alert_severity', '')), ''), 'info')::text as severity,
      'recent'::text as bucket,
      coalesce(nullif(n.entity_type, ''), 'notification')::text as entity_type,
      nullif(n.entity_id::text, '') as entity_id,
      coalesce(n.title, 'Alert') as title,
      coalesce(n.body, '') as body,
      coalesce(n.link_path, '') as link_path,
      null::uuid as property_id,
      ''::text as property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      coalesce(n.title, 'Alert') as entity_label,
      ''::text as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - n.created_at)) / 3600)::int as age_hours,
      null::int as due_days,
      n.created_at,
      coalesce(n.is_read, false) as resolved_state,
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
  marketplace_job_items as (
    select
      'marketplace-ready-' || j.id::text as item_key,
      'marketplace_ready_to_submit'::text as item_type,
      'marketplace'::text as category,
      'action'::text as severity,
      'action'::text as bucket,
      'work_order'::text as entity_type,
      j.work_order_id::text as entity_id,
      'Marketplace handoff ready to submit'::text as title,
      trim(both ' ' from coalesce(mp.label, j.provider_key) || case when nullif(j.trade_category, '') is not null then ' • ' || j.trade_category else '' end) as body,
      '/work-orders/' || j.work_order_id::text as link_path,
      wo.property_id,
      coalesce(pr.address, '—') as property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      coalesce(nullif(j.title, ''), coalesce(mr.title, 'Marketplace handoff')) as entity_label,
      ''::text as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(j.updated_at, j.created_at))) / 3600)::int as age_hours,
      null::int as due_days,
      coalesce(j.updated_at, j.created_at) as created_at,
      false as resolved_state,
      'external_marketplace_jobs'::text as source_table,
      33 as sort_order
    from public.external_marketplace_jobs j
    left join public.work_orders wo on wo.id = j.work_order_id
    left join public.properties pr on pr.id = wo.property_id
    left join public.maintenance_requests mr on mr.id = wo.maintenance_request_id
    left join public.marketplace_providers mp on mp.provider_key = j.provider_key
    where j.account_id = p_account_id
      and lower(coalesce(j.status, 'draft')) = 'ready_to_submit'

    union all

    select
      'marketplace-failed-' || j.id::text,
      'marketplace_failed_submission'::text,
      'marketplace'::text,
      'urgent'::text,
      'urgent'::text,
      'work_order'::text,
      j.work_order_id::text,
      'Marketplace submission failed'::text,
      trim(both ' ' from coalesce(mp.label, j.provider_key) || case when nullif(j.last_error, '') is not null then ' • ' || j.last_error else '' end),
      '/work-orders/' || j.work_order_id::text,
      wo.property_id,
      coalesce(pr.address, '—'),
      null::uuid,
      ''::text,
      coalesce(nullif(j.title, ''), coalesce(mr.title, 'Marketplace handoff')),
      ''::text,
      null::numeric,
      floor(extract(epoch from (now() - coalesce(j.updated_at, j.created_at))) / 3600)::int,
      null::int,
      coalesce(j.updated_at, j.created_at),
      false,
      'external_marketplace_jobs'::text,
      13 as sort_order
    from public.external_marketplace_jobs j
    left join public.work_orders wo on wo.id = j.work_order_id
    left join public.properties pr on pr.id = wo.property_id
    left join public.maintenance_requests mr on mr.id = wo.maintenance_request_id
    left join public.marketplace_providers mp on mp.provider_key = j.provider_key
    where j.account_id = p_account_id
      and lower(coalesce(j.status, 'draft')) = 'failed'

    union all

    select
      'marketplace-follow-up-' || j.id::text,
      'marketplace_manual_follow_up'::text,
      'marketplace'::text,
      'action'::text,
      'action'::text,
      'work_order'::text,
      j.work_order_id::text,
      'Marketplace handoff needs follow-up'::text,
      trim(both ' ' from coalesce(mp.label, j.provider_key) || case when nullif(j.external_reference, '') is not null then ' • ' || j.external_reference else '' end),
      '/work-orders/' || j.work_order_id::text,
      wo.property_id,
      coalesce(pr.address, '—'),
      null::uuid,
      ''::text,
      coalesce(nullif(j.title, ''), coalesce(mr.title, 'Marketplace handoff')),
      ''::text,
      null::numeric,
      floor(extract(epoch from (now() - coalesce(j.updated_at, j.created_at))) / 3600)::int,
      null::int,
      coalesce(j.updated_at, j.created_at),
      false,
      'external_marketplace_jobs'::text,
      34 as sort_order
    from public.external_marketplace_jobs j
    left join public.work_orders wo on wo.id = j.work_order_id
    left join public.properties pr on pr.id = wo.property_id
    left join public.maintenance_requests mr on mr.id = wo.maintenance_request_id
    left join public.marketplace_providers mp on mp.provider_key = j.provider_key
    where j.account_id = p_account_id
      and lower(coalesce(j.status, 'draft')) = 'manual_follow_up'

    union all

    select
      'marketplace-quote-' || j.id::text,
      'marketplace_quote_received'::text,
      'marketplace'::text,
      'action'::text,
      'action'::text,
      'work_order'::text,
      j.work_order_id::text,
      'Marketplace quote received'::text,
      trim(both ' ' from coalesce(mp.label, j.provider_key) || case when nullif(j.external_reference, '') is not null then ' • ' || j.external_reference else '' end),
      '/work-orders/' || j.work_order_id::text,
      wo.property_id,
      coalesce(pr.address, '—'),
      null::uuid,
      ''::text,
      coalesce(nullif(j.title, ''), coalesce(mr.title, 'Marketplace handoff')),
      ''::text,
      null::numeric,
      floor(extract(epoch from (now() - coalesce(j.updated_at, j.created_at))) / 3600)::int,
      null::int,
      coalesce(j.updated_at, j.created_at),
      false,
      'external_marketplace_jobs'::text,
      35 as sort_order
    from public.external_marketplace_jobs j
    left join public.work_orders wo on wo.id = j.work_order_id
    left join public.properties pr on pr.id = wo.property_id
    left join public.maintenance_requests mr on mr.id = wo.maintenance_request_id
    left join public.marketplace_providers mp on mp.provider_key = j.provider_key
    where j.account_id = p_account_id
      and lower(coalesce(j.status, 'draft')) = 'quote_received'
  ),
  limited_marketplace_job_items as (
    select *
    from marketplace_job_items
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
  automation_items as (
    select
      'automation-' || ar.id::text as item_key,
      coalesce(ar.rule_id, 'automation_signal')::text as item_type,
      case
        when ar.rule_id = 'rent_overdue_watch' then 'finance'
        when ar.rule_id = 'maintenance_triage' then 'maintenance'
        when ar.rule_id in ('contractor_blocked_followup', 'contractor_ack_overdue_watch') then 'contractor'
        when ar.rule_id = 'lease_renewal_watch' then 'lease'
        when ar.rule_id = 'compliance_due_watch' then 'compliance'
        when ar.rule_id = 'preventive_due_watch' then 'preventive'
        when ar.rule_id = 'property_health_watch' then 'portfolio'
        else 'general'
      end::text as category,
      coalesce(lower(ar.severity), 'action')::text as severity,
      case
        when lower(coalesce(ar.severity, '')) = 'urgent' then 'urgent'
        when lower(coalesce(ar.severity, '')) = 'action' then 'action'
        else 'recent'
      end::text as bucket,
      coalesce(nullif(ar.entity_type, ''), 'automation')::text as entity_type,
      nullif(ar.entity_id, '')::text as entity_id,
      coalesce(ar.title, 'Automation signal') as title,
      coalesce(ar.body, '') as body,
      coalesce(ar.link_path, '') as link_path,
      nullif(ar.details->>'property_id', '')::uuid as property_id,
      coalesce(ar.details->>'property_label', '') as property_label,
      nullif(ar.details->>'tenant_id', '')::uuid as tenant_id,
      coalesce(ar.details->>'tenant_label', '') as tenant_label,
      coalesce(ar.details->>'request_title', ar.title, '') as entity_label,
      coalesce(ar.details->>'contractor_label', '') as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(ar.last_triggered_at, ar.created_at))) / 3600)::int as age_hours,
      null::int as due_days,
      coalesce(ar.first_triggered_at, ar.last_triggered_at, ar.created_at) as created_at,
      lower(coalesce(ar.state, 'open')) = 'resolved' as resolved_state,
      'automation_runs'::text as source_table,
      65 as sort_order
    from public.automation_runs ar
    where ar.account_id = p_account_id
      and lower(coalesce(ar.state, 'open')) = 'open'
      and (
        ar.rule_id = 'property_health_watch'
        or ar.rule_id not in (
          'rent_overdue_watch',
          'lease_renewal_watch',
          'maintenance_triage',
          'contractor_blocked_followup',
          'contractor_ack_overdue_watch',
          'compliance_due_watch',
          'preventive_due_watch'
        )
      )
  ),
  limited_automation_items as (
    select *
    from automation_items
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
  security_alert_items as (
    select
      'security-alert-' || sa.id::text as item_key,
      'security_alert'::text as item_type,
      'security'::text as category,
      lower(coalesce(sa.severity, 'action'))::text as severity,
      case
        when lower(coalesce(sa.severity, '')) = 'urgent' then 'urgent'
        when lower(coalesce(sa.classification, '')) = 'suspicious' then 'action'
        else 'recent'
      end::text as bucket,
      'security_alert'::text as entity_type,
      sa.id::text as entity_id,
      coalesce(sa.title, 'Security alert') as title,
      coalesce(sa.summary, '') as body,
      '/settings/security-audit'::text as link_path,
      null::uuid as property_id,
      ''::text as property_label,
      null::uuid as tenant_id,
      ''::text as tenant_label,
      coalesce(sa.alert_type, 'security_alert')::text as entity_label,
      ''::text as contractor_label,
      null::numeric as amount,
      floor(extract(epoch from (now() - coalesce(sa.last_seen_at, sa.created_at))) / 3600)::int as age_hours,
      null::int as due_days,
      coalesce(sa.last_seen_at, sa.created_at) as created_at,
      lower(coalesce(sa.status, 'open')) = 'resolved' as resolved_state,
      'security_anomaly_alerts'::text as source_table,
      18 as sort_order
    from public.security_anomaly_alerts sa
    cross join security_cfg sc
    where sa.account_id = p_account_id
      and sc.enabled
      and lower(coalesce(sa.status, 'open')) in ('open', 'acknowledged')
      and (
        lower(coalesce(sa.alert_type, '')) = 'cross_role_admin_activity'
        or (
          sc.min_severity = 'action'
          and lower(coalesce(sa.severity, '')) in ('urgent', 'action')
        )
        or (
          sc.min_severity = 'urgent'
          and lower(coalesce(sa.severity, '')) = 'urgent'
        )
        or (
          sc.include_suspicious
          and lower(coalesce(sa.classification, '')) = 'suspicious'
        )
      )
  ),
  limited_security_alert_items as (
    select *
    from security_alert_items
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
    union all select * from limited_marketplace_job_items
    union all select * from limited_automation_items
    union all select * from limited_security_alert_items
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
    o.category,
    o.severity,
    o.bucket,
    o.entity_type,
    o.entity_id,
    o.title,
    o.body,
    o.link_path,
    o.property_id,
    o.property_label,
    o.tenant_id,
    o.tenant_label,
    o.entity_label,
    o.contractor_label,
    o.amount,
    o.age_hours,
    o.due_days,
    o.created_at,
    o.resolved_state,
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

grant execute on function public.command_center_items(uuid, integer) to authenticated;
