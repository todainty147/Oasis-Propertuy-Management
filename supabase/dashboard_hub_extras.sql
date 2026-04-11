create or replace function public.dashboard_hub_extras(
  p_account_id uuid,
  p_tenant_id uuid default null,
  p_horizon_days integer default 1
)
returns table (
  item_key text,
  item_type text,
  count_value bigint,
  property_label text,
  city text,
  days_vacant integer,
  link_path text,
  sort_order integer
)
language sql
security definer
set search_path = public
as $$
  with cfg as (
    select greatest(1, least(coalesce(p_horizon_days, 1), 30)) as horizon_days
  ),
  authz as (
    select
      p_account_id as account_id,
      public.assert_tenant_scope_access(p_account_id, p_tenant_id) as tenant_id
  ),
  tenant_scope as (
    select t.property_id
    from tenants t
    cross join authz a
    where t.id = a.tenant_id
      and t.account_id = a.account_id
    limit 1
  ),
  due_soon as (
    select count(*)::bigint as due_soon_count
    from payments p
    cross join authz a
    where p.account_id = p_account_id
      and (
        a.tenant_id is null
        or p.tenant_id = a.tenant_id
      )
      and lower(coalesce(p.status, '')) not in ('paid', 'oplacone', 'opłacone')
      and p.due_date is not null
      and p.due_date >= current_date
      and p.due_date <= current_date + ((select horizon_days from cfg) || ' days')::interval
  ),
  preventive_due_soon as (
    select count(*)::bigint as task_count
    from public.preventive_maintenance_tasks t
    cross join authz a
    where t.account_id = p_account_id
      and (
        a.tenant_id is null
        or t.property_id = (select property_id from tenant_scope)
      )
      and lower(coalesce(t.status, 'active')) = 'active'
      and t.next_due_date is not null
      and t.next_due_date >= current_date
      and t.next_due_date <= current_date + interval '14 days'
  ),
  preventive_overdue as (
    select count(*)::bigint as task_count
    from public.preventive_maintenance_tasks t
    cross join authz a
    where t.account_id = p_account_id
      and (
        a.tenant_id is null
        or t.property_id = (select property_id from tenant_scope)
      )
      and lower(coalesce(t.status, 'active')) = 'active'
      and t.next_due_date is not null
      and t.next_due_date < current_date
  ),
  blocked_work_orders as (
    select count(*)::bigint as blocked_count
    from public.work_orders_with_flags w
    cross join authz a
    where w.account_id = p_account_id
      and (
        a.tenant_id is null
        or w.property_id = (select property_id from tenant_scope)
      )
      and lower(coalesce(w.status, '')) in ('blocked', 'zablokowane')
  ),
  contractor_ack_overdue as (
    select count(*)::bigint as overdue_count
    from public.work_orders w
    cross join authz a
    where w.account_id = p_account_id
      and (
        a.tenant_id is null
        or w.property_id = (select property_id from tenant_scope)
      )
      and (w.contractor_user_id is not null or nullif(coalesce(w.contractor_name, ''), '') is not null)
      and lower(coalesce(w.status, '')) not in ('completed', 'cancelled', 'zakończone', 'anulowane')
      and coalesce(lower(w.acknowledgement_status), 'pending') <> 'acknowledged'
      and w.acknowledgement_due_at is not null
      and w.acknowledgement_due_at < now()
  ),
  compliance_overdue as (
    select count(*)::bigint as item_count
    from public.compliance_items c
    cross join authz a
    where c.account_id = p_account_id
      and (
        a.tenant_id is null
        or c.property_id = (select property_id from tenant_scope)
      )
      and lower(coalesce(c.status, 'active')) = 'active'
      and c.due_date < current_date
  ),
  compliance_due_soon as (
    select count(*)::bigint as item_count
    from public.compliance_items c
    cross join authz a
    where c.account_id = p_account_id
      and (
        a.tenant_id is null
        or c.property_id = (select property_id from tenant_scope)
      )
      and lower(coalesce(c.status, 'active')) = 'active'
      and c.due_date >= current_date
      and c.due_date <= current_date + interval '30 days'
  ),
  compliance_missing_setup as (
    select count(*)::bigint as property_count
    from public.properties p
    cross join authz a
    where p.account_id = p_account_id
      and (
        a.tenant_id is null
        or p.id = (select property_id from tenant_scope)
      )
      and not exists (
        select 1
        from public.compliance_items c
        where c.account_id = p.account_id
          and c.property_id = p.id
      )
  ),
  vacant_long as (
    select
      p.id,
      p.address,
      p.city,
      floor(
        extract(
          epoch from (
            now() - coalesce(
              (
                select max(t.created_at)
                from tenants t
                where t.property_id = p.id
              ),
              p.created_at
            )
          )
        ) / 86400
      )::int as days_vacant
    from properties p
    cross join authz a
    where p.account_id = p_account_id
      and (
        a.tenant_id is null
        or p.id = (select property_id from tenant_scope)
      )
      and not exists (
        select 1
        from tenants t
        where t.property_id = p.id
      )
    order by days_vacant desc, p.address
    limit 1
  )
  select
    'vacant-long'::text as item_key,
    'vacant_long_summary'::text as item_type,
    null::bigint as count_value,
    vl.address as property_label,
    vl.city,
    vl.days_vacant,
    '/properties?status=vacant&aging=14d'::text as link_path,
    10 as sort_order
  from vacant_long vl
  where vl.days_vacant > 30

  union all

  select
    'due-soon'::text as item_key,
    'due_soon_summary'::text as item_type,
    ds.due_soon_count as count_value,
    null::text as property_label,
    null::text as city,
    null::int as days_vacant,
    ('/finance?status=due&range=' || case when (select horizon_days from cfg) <= 1 then '1d' else '7d' end)::text as link_path,
    20 as sort_order
  from due_soon ds
  where ds.due_soon_count > 0

  union all

  select
    'contractor-ack-overdue'::text,
    'contractor_ack_overdue_summary'::text,
    cao.overdue_count,
    null::text,
    null::text,
    null::int,
    '/attention-center'::text,
    16 as sort_order
  from contractor_ack_overdue cao
  where cao.overdue_count > 0

  union all

  select
    'compliance-overdue'::text,
    'compliance_overdue_summary'::text,
    co.item_count,
    null::text,
    null::text,
    null::int,
    '/attention-center'::text,
    17 as sort_order
  from compliance_overdue co
  where co.item_count > 0

  union all

  select
    'preventive-overdue'::text,
    'preventive_overdue_summary'::text,
    po.task_count,
    null::text,
    null::text,
    null::int,
    '/maintenance-kpi'::text,
    18 as sort_order
  from preventive_overdue po
  where po.task_count > 0

  union all

  select
    'compliance-due-soon'::text,
    'compliance_due_summary'::text,
    cds.item_count,
    null::text,
    null::text,
    null::int,
    '/attention-center'::text,
    19 as sort_order
  from compliance_due_soon cds
  where cds.item_count > 0

  union all

  select
    'compliance-missing-setup'::text,
    'compliance_missing_setup_summary'::text,
    cms.property_count,
    null::text,
    null::text,
    null::int,
    '/attention-center'::text,
    21 as sort_order
  from compliance_missing_setup cms
  where cms.property_count > 0

  union all

  select
    'preventive-due-soon'::text,
    'preventive_due_summary'::text,
    pd.task_count,
    null::text,
    null::text,
    null::int,
    '/maintenance-kpi'::text,
    22 as sort_order
  from preventive_due_soon pd
  where pd.task_count > 0

  union all

  select
    'blocked-work-orders'::text,
    'blocked_work_order_summary'::text,
    bwo.blocked_count,
    null::text,
    null::text,
    null::int,
    '/maintenance-inbox?woStatus=blocked'::text,
    24 as sort_order
  from blocked_work_orders bwo
  where bwo.blocked_count > 0

  order by sort_order;
$$;

grant execute on function public.dashboard_hub_extras(uuid, uuid, integer) to authenticated;
