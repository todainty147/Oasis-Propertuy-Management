drop function if exists public.portfolio_health_snapshot(uuid, uuid);

create function public.portfolio_health_snapshot(
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
  contractor_ack_overdue bigint,
  stalled_repairs bigint,
  long_running_repairs bigint,
  repeat_repair_properties bigint,
  recent_open_created bigint,
  prev_open_created bigint,
  outstanding_current_month numeric,
  outstanding_previous_month numeric
)
language sql
security definer
set search_path = public
as $$
  with authz as (
    select
      p_account_id as account_id,
      public.assert_account_feature_access(p_account_id, 'portfolio_health') as feature_account_id,
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
    select p.id
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
    left join properties pr
      on pr.id = prx.property_id
    group by prx.property_id, prx.tenant_id, prx.cycle_month
  ),
  scoped_requests as (
    select
      r.id,
      r.property_id,
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
      w.property_id,
      lower(coalesce(w.status, '')) as status_norm,
      w.contractor_user_id,
      w.contractor_name,
      w.acknowledgement_due_at,
      w.acknowledged_at,
      lower(coalesce(w.acknowledgement_status, '')) as acknowledgement_status_norm,
      w.created_at,
      w.updated_at
    from work_orders w
    where w.account_id = p_account_id
      and (
        (select tenant_id from authz) is null
        or w.property_id = (select property_id from tenant_scope)
      )
  ),
  repeat_repair_properties as (
    select sr.property_id
    from scoped_requests sr
    where sr.property_id is not null
      and sr.created_at >= now() - interval '90 days'
    group by sr.property_id
    having count(*) >= 3
  ),
  finance as (
    select
      coalesce(sum(pc.paid_amount), 0) as paid_amount,
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
      ) as due_amount,
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
             and pc.open_due_date <= current_date + interval '7 days'
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as due_soon_amount,
      coalesce(sum(greatest(pc.billed_amount - pc.paid_amount, 0)), 0) as outstanding_amount,
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
      ) as overdue_0_7_amount,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and pc.has_overdue
             and pc.open_due_date is not null
             and pc.open_due_date <= current_date
             and current_date - pc.open_due_date between 8 and 30
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as overdue_8_30_amount,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and pc.has_overdue
             and pc.open_due_date is not null
             and pc.open_due_date <= current_date
             and current_date - pc.open_due_date >= 31
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as overdue_30_plus_amount,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and pc.cycle_month = date_trunc('month', current_date::timestamp)
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as outstanding_current_month,
      coalesce(
        sum(
          case
            when greatest(pc.billed_amount - pc.paid_amount, 0) > 0
             and pc.cycle_month = date_trunc('month', current_date::timestamp - interval '1 month')
            then greatest(pc.billed_amount - pc.paid_amount, 0)
            else 0
          end
        ),
        0
      ) as outstanding_previous_month
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
        from scoped_work_orders
        where status_norm not in ('completed', 'cancelled', 'zakończone', 'anulowane')
          and (contractor_user_id is not null or nullif(coalesce(contractor_name, ''), '') is not null)
          and acknowledgement_due_at is not null
          and acknowledgement_due_at < now()
          and acknowledgement_status_norm <> 'acknowledged'
          and acknowledged_at is null
      ) as contractor_ack_overdue,
      (
        select count(*)
        from scoped_work_orders
        where status_norm in ('in_progress', 'w trakcie', 'blocked', 'zablokowane')
          and coalesce(updated_at, created_at) <= now() - interval '72 hours'
      ) as stalled_repairs,
      (
        select count(*)
        from scoped_work_orders
        where status_norm not in ('completed', 'cancelled', 'zakończone', 'anulowane')
          and created_at <= now() - interval '14 days'
      ) as long_running_repairs,
      (select count(*) from repeat_repair_properties) as repeat_repair_properties,
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
    maintenance.contractor_ack_overdue,
    maintenance.stalled_repairs,
    maintenance.long_running_repairs,
    maintenance.repeat_repair_properties,
    maintenance.recent_open_created,
    maintenance.prev_open_created,
    finance.outstanding_current_month,
    finance.outstanding_previous_month
  from finance, maintenance;
$$;

grant execute on function public.portfolio_health_snapshot(uuid, uuid) to authenticated;
