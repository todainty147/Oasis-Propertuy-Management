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
  tenant_scope as (
    select t.property_id
    from tenants t
    where t.id = p_tenant_id
      and t.account_id = p_account_id
    limit 1
  ),
  due_soon as (
    select count(*)::bigint as due_soon_count
    from payments p
    where p.account_id = p_account_id
      and (
        p_tenant_id is null
        or p.tenant_id = p_tenant_id
      )
      and lower(coalesce(p.status, '')) not in ('paid', 'oplacone', 'opłacone')
      and p.due_date is not null
      and p.due_date >= current_date
      and p.due_date <= current_date + ((select horizon_days from cfg) || ' days')::interval
  ),
  preventive_due_soon as (
    select count(*)::bigint as task_count
    from public.preventive_maintenance_tasks t
    where t.account_id = p_account_id
      and lower(coalesce(t.status, 'active')) = 'active'
      and t.next_due_date is not null
      and t.next_due_date >= current_date
      and t.next_due_date <= current_date + interval '14 days'
  ),
  preventive_overdue as (
    select count(*)::bigint as task_count
    from public.preventive_maintenance_tasks t
    where t.account_id = p_account_id
      and lower(coalesce(t.status, 'active')) = 'active'
      and t.next_due_date is not null
      and t.next_due_date < current_date
  ),
  blocked_work_orders as (
    select count(*)::bigint as blocked_count
    from public.work_orders_with_flags w
    where w.account_id = p_account_id
      and lower(coalesce(w.status, '')) in ('blocked', 'zablokowane')
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
    where p.account_id = p_account_id
      and (
        p_tenant_id is null
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
