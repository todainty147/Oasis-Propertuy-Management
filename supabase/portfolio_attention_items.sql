create or replace function public.portfolio_attention_items(
  p_account_id uuid,
  p_tenant_id uuid default null,
  p_limit integer default 10
)
returns table (
  item_key text,
  item_type text,
  property_label text,
  city text,
  amount numeric,
  days_vacant integer,
  request_title text,
  link_path text,
  sort_order integer
)
language sql
security definer
set search_path = public
as $$
  with cfg as (
    select greatest(1, least(coalesce(p_limit, 10), 50)) as max_items
  ),
  authz as (
    select
      case
        when p_tenant_id is null then public.assert_manage_account_access(p_account_id)
        else p_account_id
      end as account_id,
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
  scoped_properties as (
    select
      p.id,
      p.address,
      p.city,
      p.created_at,
      not exists (
        select 1
        from tenants t
        where t.property_id = p.id
      ) as is_vacant
    from properties p
    cross join authz a
    where p.account_id = p_account_id
      and (
        a.tenant_id is null
        or p.id = (select property_id from tenant_scope)
      )
  ),
  vacant_properties as (
    select
      sp.id,
      sp.address,
      sp.city,
      floor(
        extract(
          epoch from (
            now() - coalesce(
              (
                select max(t.created_at)
                from tenants t
                where t.property_id = sp.id
              ),
              sp.created_at
            )
          )
        ) / 86400
      )::int as days_vacant
    from scoped_properties sp
    where sp.is_vacant
  ),
  overdue_payments as (
    select
      p.id,
      coalesce(pr.address, '—') as property_label,
      coalesce(pr.city, '') as city,
      coalesce(p.amount, 0) as amount
    from payments p
    cross join authz a
    left join properties pr on pr.id = p.property_id
    where p.account_id = a.account_id
      and (
        a.tenant_id is null
        or p.tenant_id = a.tenant_id
      )
      and (
        lower(coalesce(p.status, '')) in ('overdue', 'zalegle', 'zaległe')
        or (
          lower(coalesce(p.status, '')) not in ('paid', 'oplacone', 'opłacone')
          and p.due_date is not null
          and p.due_date < current_date
        )
      )
    order by p.due_date asc nulls last, p.created_at desc nulls last
    limit 4
  ),
  due_soon_payments as (
    select
      p.id,
      coalesce(pr.address, '—') as property_label,
      coalesce(pr.city, '') as city,
      coalesce(p.amount, 0) as amount
    from payments p
    cross join authz a
    left join properties pr on pr.id = p.property_id
    where p.account_id = a.account_id
      and (
        a.tenant_id is null
        or p.tenant_id = a.tenant_id
      )
      and lower(coalesce(p.status, '')) not in ('paid', 'oplacone', 'opłacone')
      and p.due_date is not null
      and p.due_date >= current_date
      and p.due_date <= current_date + interval '7 days'
    order by p.due_date asc, p.created_at desc nulls last
    limit 4
  ),
  high_priority_requests as (
    select
      r.id,
      r.title
    from maintenance_requests r
    cross join authz a
    where r.account_id = a.account_id
      and (
        a.tenant_id is null
        or r.property_id = (select property_id from tenant_scope)
      )
      and lower(coalesce(r.status, '')) not in ('closed', 'zamkniete', 'zamknięte')
      and lower(coalesce(r.priority, '')) in ('high', 'urgent', 'critical', 'wysoki', 'krytyczny')
    order by r.created_at desc
    limit 4
  ),
  items as (
    select *
    from (
      select
        'vacant-' || vp.id::text as item_key,
        'vacant'::text as item_type,
        vp.address as property_label,
        vp.city,
        null::numeric as amount,
        vp.days_vacant,
        null::text as request_title,
        '/properties?status=vacant'::text as link_path,
        10 as sort_order
      from vacant_properties vp
      order by vp.days_vacant desc, vp.address
      limit 4
    ) vacant_items

    union all

    select *
    from (
      select
        'vacant-long-' || vp.id::text as item_key,
        'vacant_long'::text as item_type,
        vp.address as property_label,
        vp.city,
        null::numeric as amount,
        vp.days_vacant,
        null::text as request_title,
        '/properties?status=vacant&aging=14d'::text as link_path,
        20 as sort_order
      from vacant_properties vp
      where vp.days_vacant > 30
      order by vp.days_vacant desc, vp.address
      limit 4
    ) vacant_long_items

    union all

    select
      'overdue-' || op.id::text as item_key,
      'overdue_payment'::text as item_type,
      op.property_label,
      op.city,
      op.amount,
      null::int as days_vacant,
      null::text as request_title,
      '/finance?status=overdue'::text as link_path,
      30 as sort_order
    from overdue_payments op

    union all

    select
      'due-soon-' || dp.id::text as item_key,
      'due_soon_payment'::text as item_type,
      dp.property_label,
      dp.city,
      dp.amount,
      null::int as days_vacant,
      null::text as request_title,
      '/finance?status=due&range=7d'::text as link_path,
      40 as sort_order
    from due_soon_payments dp

    union all

    select
      'high-priority-' || r.id::text as item_key,
      'high_priority_request'::text as item_type,
      null::text as property_label,
      null::text as city,
      null::numeric as amount,
      null::int as days_vacant,
      coalesce(r.title, r.id::text) as request_title,
      '/maintenance-inbox?priority=high,critical'::text as link_path,
      50 as sort_order
    from high_priority_requests r
  )
  select
    i.item_key,
    i.item_type,
    i.property_label,
    i.city,
    i.amount,
    i.days_vacant,
    i.request_title,
    i.link_path,
    i.sort_order
  from items i
  order by i.sort_order, i.item_key
  limit (select max_items from cfg);
$$;

grant execute on function public.portfolio_attention_items(uuid, uuid, integer) to authenticated;
