create or replace function public.tenant_activity_feed(
  p_account_id uuid,
  p_tenant_id uuid,
  p_limit integer default 40
)
returns table (
  event_key text,
  event_type text,
  occurred_at timestamptz,
  title text,
  detail text,
  status text,
  link_path text,
  source_table text,
  source_id uuid
)
language sql
security definer
set search_path = public
as $$
  with cfg as (
    select greatest(1, least(coalesce(p_limit, 40), 100)) as max_items
  ),
  authz as (
    select
      p_account_id as account_id,
      public.assert_tenant_scope_access(p_account_id, p_tenant_id) as tenant_id
  ),
  tenant_scope as (
    select
      t.id,
      t.account_id,
      t.property_id,
      t.name,
      t.created_at
    from public.tenants t
    cross join authz a
    where t.account_id = a.account_id
      and t.id = a.tenant_id
  ),
  lease_rows as (
    select
      l.id,
      l.lease_start_date,
      l.lease_end_date,
      l.renewal_status,
      p.address as property_label
    from public.leases l
    join tenant_scope ts on ts.id = l.tenant_id
    left join public.properties p on p.id = l.property_id
  ),
  payment_rows as (
    select
      p.id,
      p.amount,
      p.status,
      p.due_date,
      p.paid_at,
      p.created_at
    from public.payments p
    join tenant_scope ts on ts.id = p.tenant_id
    where p.account_id = p_account_id
  ),
  request_rows as (
    select
      mr.id,
      mr.title,
      mr.status,
      mr.priority,
      mr.created_at,
      mr.updated_at
    from public.maintenance_requests mr
    join tenant_scope ts on ts.id = mr.reported_by_tenant_id
    where mr.account_id = p_account_id
  ),
  work_order_rows as (
    select
      wo.id,
      wo.maintenance_request_id,
      wo.status,
      wo.contractor_name,
      wo.created_at,
      wo.updated_at
    from public.work_orders wo
    join request_rows rr on rr.id = wo.maintenance_request_id
    where wo.account_id = p_account_id
  ),
  work_order_audit_rows as (
    select
      wal.id,
      wal.work_order_id,
      wal.action,
      wal.old_value,
      wal.new_value,
      wal.created_at
    from public.work_order_audit_log wal
    join work_order_rows wor on wor.id = wal.work_order_id
  ),
  document_rows as (
    select
      d.id,
      d.name,
      d.created_at
    from public.documents d
    join tenant_scope ts on ts.id = d.tenant_id
    where d.account_id = p_account_id
      and coalesce(d.upload_status, 'uploaded') = 'uploaded'
  ),
  notification_rows as (
    select
      n.id,
      n.title,
      n.body,
      n.type,
      n.entity_type,
      n.entity_id,
      n.link_path,
      n.created_at
    from public.notifications n
    where n.account_id = p_account_id
      and (
        (lower(coalesce(n.entity_type, '')) in ('tenant', 'tenants') and n.entity_id = p_tenant_id)
        or (lower(coalesce(n.entity_type, '')) in ('payment', 'payments') and n.entity_id in (select id from payment_rows))
        or (lower(coalesce(n.entity_type, '')) in ('maintenance_request', 'maintenance_requests') and n.entity_id in (select id from request_rows))
        or (lower(coalesce(n.entity_type, '')) in ('work_order', 'work_orders') and n.entity_id in (select id from work_order_rows))
        or (n.metadata->>'tenant_id' = p_tenant_id::text)
      )
  ),
  document_audit_rows as (
    select
      dal.id,
      dal.action,
      dal.document_id,
      dal.performed_at,
      d.name
    from public.document_audit_log dal
    join document_rows d on d.id = dal.document_id
    where dal.account_id = p_account_id
  ),
  activity_rows as (
    select
      al.id,
      al.entity_type,
      al.entity_id,
      al.action,
      al.field,
      al.old_value,
      al.new_value,
      al.actor_role,
      al.created_at
    from public.activity_log al
    left join tenant_scope ts on ts.id = al.entity_id and lower(coalesce(al.entity_type, '')) in ('tenant', 'tenants')
    where al.account_id = p_account_id
      and (
        ts.id is not null
        or (al.meta->>'property_id') = (select property_id::text from tenant_scope limit 1)
      )
  ),
  unioned as (
    select
      'tenant-created-' || ts.id::text as event_key,
      'tenant_created'::text as event_type,
      ts.created_at as occurred_at,
      'Tenant record created'::text as title,
      coalesce(p.address, '') as detail,
      ''::text as status,
      ('/tenants/' || ts.id::text) as link_path,
      'tenants'::text as source_table,
      ts.id as source_id
    from tenant_scope ts
    left join public.properties p on p.id = ts.property_id

    union all

    select
      'lease-start-' || lr.id::text,
      'lease_start',
      lr.lease_start_date::timestamp at time zone 'UTC',
      'Lease started',
      coalesce(lr.property_label, ''),
      coalesce(lr.renewal_status, ''),
      ('/tenants/' || p_tenant_id::text),
      'leases',
      lr.id
    from lease_rows lr
    where lr.lease_start_date is not null

    union all

    select
      'lease-end-' || lr.id::text,
      'lease_end',
      lr.lease_end_date::timestamp at time zone 'UTC',
      'Lease end recorded',
      coalesce(lr.property_label, ''),
      coalesce(lr.renewal_status, ''),
      ('/tenants/' || p_tenant_id::text),
      'leases',
      lr.id
    from lease_rows lr
    where lr.lease_end_date is not null

    union all

    select
      'payment-paid-' || pr.id::text,
      'payment_paid',
      pr.paid_at,
      'Rent payment recorded',
      coalesce(pr.amount::text, ''),
      coalesce(pr.status, ''),
      '/tenant/payments',
      'payments',
      pr.id
    from payment_rows pr
    where pr.paid_at is not null

    union all

    select
      'payment-overdue-' || pr.id::text,
      'payment_overdue',
      coalesce(pr.due_date::timestamp at time zone 'UTC', pr.created_at),
      'Rent became overdue',
      coalesce(pr.amount::text, ''),
      coalesce(pr.status, ''),
      '/tenant/payments',
      'payments',
      pr.id
    from payment_rows pr
    where lower(coalesce(pr.status, '')) in ('overdue', 'zaległe')

    union all

    select
      'payment-scheduled-' || pr.id::text,
      'payment_scheduled',
      coalesce(pr.due_date::timestamp at time zone 'UTC', pr.created_at),
      'Rent charge scheduled',
      coalesce(pr.amount::text, ''),
      coalesce(pr.status, ''),
      '/tenant/payments',
      'payments',
      pr.id
    from payment_rows pr
    where pr.paid_at is null

    union all

    select
      'request-' || rr.id::text,
      'maintenance_request',
      rr.created_at,
      'Maintenance request submitted',
      coalesce(rr.title, ''),
      coalesce(rr.status, rr.priority, ''),
      '/maintenance-inbox',
      'maintenance_requests',
      rr.id
    from request_rows rr

    union all

    select
      'request-status-' || ar.id::text,
      'request_status_changed',
      ar.created_at,
      'Request status changed',
      coalesce(nullif(ar.new_value::text, ''), nullif(ar.field, ''), ''),
      coalesce(ar.actor_role, ''),
      '/maintenance-inbox',
      'activity_log',
      ar.id
    from activity_rows ar
    where lower(coalesce(ar.entity_type, '')) in ('maintenance_request', 'maintenance_requests')
      and (
        lower(coalesce(ar.field, '')) = 'status'
        or lower(coalesce(ar.action, '')) = 'status_change'
      )

    union all

    select
      'work-order-opened-' || wor.id::text,
      'work_order_opened',
      coalesce(wor.created_at, wor.updated_at),
      'Work order opened',
      coalesce(wor.contractor_name, ''),
      coalesce(wor.status, ''),
      ('/work-orders/' || wor.id::text),
      'work_orders',
      wor.id
    from work_order_rows wor
    where lower(coalesce(wor.status, '')) not in ('completed', 'zakończone')

    union all

    select
      'work-order-completed-' || wor.id::text,
      'work_order_completed',
      coalesce(wor.updated_at, wor.created_at),
      'Work order completed',
      coalesce(wor.contractor_name, ''),
      coalesce(wor.status, ''),
      ('/work-orders/' || wor.id::text),
      'work_orders',
      wor.id
    from work_order_rows wor
    where lower(coalesce(wor.status, '')) in ('completed', 'zakończone')

    union all

    select
      'work-order-assigned-' || woar.id::text,
      'contractor_assigned',
      woar.created_at,
      'Contractor assigned',
      coalesce(wor.contractor_name, ''),
      coalesce(wor.status, ''),
      ('/work-orders/' || wor.id::text),
      'work_order_audit_log',
      wor.id
    from work_order_audit_rows woar
    join work_order_rows wor on wor.id = woar.work_order_id
    where lower(coalesce(woar.action, '')) like '%assign%'
       or lower(coalesce(woar.action, '')) like '%contractor%'

    union all

    select
      'work-order-action-' || woar.id::text,
      case
        when lower(coalesce(woar.action, '')) like '%complete%' then 'work_order_completed'
        else 'work_order_action'
      end,
      woar.created_at,
      case
        when lower(coalesce(woar.action, '')) like '%complete%' then 'Work completed'
        else 'Work order updated'
      end,
      coalesce(woar.action, ''),
      coalesce(wor.status, ''),
      ('/work-orders/' || wor.id::text),
      'work_order_audit_log',
      wor.id
    from work_order_audit_rows woar
    join work_order_rows wor on wor.id = woar.work_order_id
    where not (
      lower(coalesce(woar.action, '')) like '%assign%'
      or lower(coalesce(woar.action, '')) like '%contractor%'
      or lower(coalesce(woar.action, '')) in ('create', 'insert')
    )

    union all

    select
      'document-uploaded-' || dr.id::text,
      'document_uploaded',
      dr.created_at,
      'Document uploaded',
      coalesce(dr.name, ''),
      ''::text,
      ('/documents?tenant=' || p_tenant_id::text),
      'documents',
      dr.id
    from document_rows dr

    union all

    select
      'document-audit-' || dar.id::text,
      'document_audit',
      dar.performed_at,
      case
        when upper(coalesce(dar.action, '')) = 'DELETE' then 'Document deleted'
        else 'Document updated'
      end,
      coalesce(dar.name, ''),
      coalesce(dar.action, ''),
      ('/documents?tenant=' || p_tenant_id::text),
      'document_audit_log',
      dar.document_id
    from document_audit_rows dar

    union all

    select
      'notification-' || nr.id::text,
      'notification_sent',
      nr.created_at,
      coalesce(nullif(nr.title, ''), 'Notification sent'),
      coalesce(nr.body, ''),
      coalesce(nr.type, ''),
      coalesce(nr.link_path, '/tenants/' || p_tenant_id::text),
      'notifications',
      nr.id
    from notification_rows nr

    union all

    select
      'activity-' || ar.id::text,
      'activity_log',
      ar.created_at,
      case
        when lower(coalesce(ar.entity_type, '')) in ('tenant', 'tenants') then 'Tenant activity'
        when lower(coalesce(ar.entity_type, '')) in ('property', 'properties') then 'Property activity'
        when lower(coalesce(ar.entity_type, '')) in ('work_order', 'work_orders') then 'Work order activity'
        when lower(coalesce(ar.entity_type, '')) in ('maintenance_request', 'maintenance_requests') then 'Maintenance activity'
        when lower(coalesce(ar.entity_type, '')) in ('payment', 'payments') then 'Payment activity'
        else 'Operational activity'
      end,
      coalesce(ar.field, ''),
      coalesce(ar.actor_role, ''),
      case
        when lower(coalesce(ar.entity_type, '')) in ('work_order', 'work_orders') and ar.entity_id is not null then '/work-orders/' || ar.entity_id::text
        else '/tenants/' || p_tenant_id::text
      end,
      'activity_log',
      ar.id
    from activity_rows ar
  )
  select
    u.event_key,
    u.event_type,
    u.occurred_at,
    u.title,
    u.detail,
    u.status,
    u.link_path,
    u.source_table,
    u.source_id
  from unioned u
  where u.occurred_at is not null
  order by u.occurred_at desc, u.event_key
  limit (select max_items from cfg);
$$;

grant execute on function public.tenant_activity_feed(uuid, uuid, integer) to authenticated;
