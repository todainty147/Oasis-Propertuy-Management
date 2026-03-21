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
  due_soon_amount numeric,
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
  scoped_properties as (
    select
      p.id,
      coalesce(p.rent, 0) as rent
    from properties p
    where p.account_id = p_account_id
      and (
        (select tenant_id from authz) is null
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
      p.property_id,
      p.tenant_id,
      coalesce(p.amount, 0) as amount,
      lower(coalesce(p.status, '')) as status_norm,
      p.paid_at,
      p.due_date
    from payments p
    where p.account_id = p_account_id
      and (
        (select tenant_id from authz) is null
        or p.tenant_id = (select tenant_id from authz)
      )
  ),
  payment_rows as (
    select
      sp.property_id,
      sp.tenant_id,
      sp.amount,
      sp.status_norm,
      sp.paid_at,
      sp.due_date,
      (
        sp.paid_at is not null
        or sp.status_norm in ('paid', 'oplacone', 'opłacone')
      ) as is_paid,
      date_trunc(
        'month',
        coalesce(sp.due_date::timestamp, sp.paid_at::timestamp, current_date::timestamp)
      ) as cycle_month
    from scoped_payments sp
  ),
  payment_cycles as (
    select
      prx.property_id,
      prx.tenant_id,
      prx.cycle_month,
      greatest(
        coalesce(max(pr.rent), 0),
        coalesce(max(prx.amount), 0)
      ) as billed_amount,
      coalesce(
        sum(
          case
            when prx.is_paid then prx.amount else 0
          end
        ),
        0
      ) as paid_amount,
      min(
        case
          when not prx.is_paid then prx.due_date
          else null
        end
      ) as open_due_date,
      coalesce(
        bool_or(
          not prx.is_paid
          and (
            prx.status_norm in ('overdue', 'zalegle', 'zaległe')
            or (prx.due_date is not null and prx.due_date < current_date)
          )
        ),
        false
      ) as has_overdue
    from payment_rows prx
    left join scoped_properties pr
      on pr.id = prx.property_id
    group by prx.property_id, prx.tenant_id, prx.cycle_month
  ),
  scoped_requests as (
    select
      lower(coalesce(r.status, '')) as status_norm,
      lower(coalesce(r.priority, '')) as priority_norm,
      r.created_at
    from maintenance_requests r
    where r.account_id = p_account_id
      and (
        (select tenant_id from authz) is null
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
        (select tenant_id from authz) is null
        or w.property_id = (select property_id from tenant_scope)
      )
  ),
  finance as (
    select
      coalesce(sum(pc.paid_amount), 0) as tenant_paid_total,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and not pc.has_overdue
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as tenant_due_total,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and pc.has_overdue
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as tenant_overdue_total,
      coalesce(sum(case when greatest(pc.billed_amount - pc.paid_amount, 0) > 0 then 1 else 0 end), 0) as tenant_due_overdue_count,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and pc.has_overdue
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as overdue_amount,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and pc.open_due_date is not null
             and pc.open_due_date >= current_date
             and pc.open_due_date <= current_date + ((select horizon_days from cfg) || ' days')::interval
            then 1
            else 0
          end
        ),
        0
      ) as due_soon_count,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and pc.open_due_date is not null
             and pc.open_due_date >= current_date
             and pc.open_due_date <= current_date + ((select horizon_days from cfg) || ' days')::interval
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as due_soon_amount,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and pc.has_overdue
             and pc.open_due_date is not null
             and pc.open_due_date <= current_date
             and current_date - pc.open_due_date <= 7
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as overdue_current_window_amount,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and pc.has_overdue
             and pc.open_due_date is not null
             and current_date - pc.open_due_date > 7
             and current_date - pc.open_due_date <= 14
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as overdue_previous_window_amount
    from payment_cycles pc
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
    finance.due_soon_amount,
    finance.overdue_current_window_amount,
    finance.overdue_previous_window_amount,
    maintenance.open_requests,
    maintenance.open_high_priority,
    maintenance.waiting_over_48h,
    maintenance.unassigned_work_orders
  from finance, maintenance;
$$;

grant execute on function public.dashboard_snapshot(uuid, uuid, integer) to authenticated;
