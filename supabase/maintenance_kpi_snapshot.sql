drop function if exists public.maintenance_kpi_snapshot(uuid);

create function public.maintenance_kpi_snapshot(p_account_id uuid)
returns table (
  open_requests bigint,
  active_work_orders bigint,
  awaiting_action bigint,
  resolved_pending_closure bigint,
  open_high_priority bigint,
  triage_over_24h bigint,
  contractor_ack_overdue bigint,
  stalled_repairs bigint,
  long_running_repairs bigint,
  repeat_repair_properties bigint,
  req_by_status jsonb,
  wo_by_status jsonb,
  aging jsonb
)
language sql
security definer
set search_path = public
as $$
  with authz as (
    select public.assert_manage_account_access(p_account_id) as account_id
  ),
  req as (
    select
      id,
      property_id,
      lower(coalesce(status, '')) as status_norm,
      lower(coalesce(priority, '')) as priority_norm,
      created_at,
      updated_at
    from maintenance_requests
    cross join authz a
    where account_id = a.account_id
  ),
  wo as (
    select
      id,
      property_id,
      maintenance_request_id,
      contractor_user_id,
      contractor_name,
      acknowledgement_due_at,
      acknowledged_at,
      lower(coalesce(acknowledgement_status, '')) as acknowledgement_status_norm,
      lower(coalesce(status, '')) as status_norm,
      created_at,
      updated_at
    from work_orders
    where account_id = p_account_id
  ),
  recent_repair_properties as (
    select property_id
    from req
    where property_id is not null
      and created_at >= now() - interval '90 days'
    group by property_id
    having count(*) >= 3
  ),
  status_counts as (
    select
      jsonb_build_object(
        'open', (select count(*) from req where status_norm = 'open'),
        'in_progress', (select count(*) from req where status_norm = 'in_progress'),
        'waiting', (select count(*) from req where status_norm = 'waiting'),
        'resolved', (select count(*) from req where status_norm = 'resolved'),
        'closed', (select count(*) from req where status_norm = 'closed')
      ) as req_by_status,
      jsonb_build_object(
        'assigned', (select count(*) from wo where status_norm = 'assigned'),
        'in_progress', (select count(*) from wo where status_norm = 'in_progress'),
        'completed', (select count(*) from wo where status_norm = 'completed'),
        'cancelled', (select count(*) from wo where status_norm = 'cancelled')
      ) as wo_by_status
  ),
  aging_counts as (
    select jsonb_build_object(
      'b0_24',
        (select count(*) from req where status_norm <> 'closed' and created_at > now() - interval '24 hours'),
      'b24_48',
        (select count(*) from req where status_norm <> 'closed' and created_at <= now() - interval '24 hours' and created_at > now() - interval '48 hours'),
      'b48_72',
        (select count(*) from req where status_norm <> 'closed' and created_at <= now() - interval '48 hours' and created_at > now() - interval '72 hours'),
      'b72_plus',
        (select count(*) from req where status_norm <> 'closed' and created_at <= now() - interval '72 hours')
    ) as aging
  )
  select
    (select count(*) from req where status_norm <> 'closed') as open_requests,
    (select count(*) from wo where status_norm = 'in_progress') as active_work_orders,
    (select count(*) from req where status_norm = 'waiting') as awaiting_action,
    (select count(*) from req where status_norm = 'resolved') as resolved_pending_closure,
    (
      select count(*)
      from req
      where status_norm <> 'closed'
        and priority_norm in ('high', 'urgent')
    ) as open_high_priority,
    (
      select count(*)
      from req r
      where r.status_norm = 'open'
        and r.created_at <= now() - interval '24 hours'
        and not exists (
          select 1
          from wo
          where wo.maintenance_request_id = r.id
        )
    ) as triage_over_24h,
    (
      select count(*)
      from wo
      where status_norm not in ('completed', 'cancelled', 'zakończone', 'anulowane')
        and (contractor_user_id is not null or nullif(coalesce(contractor_name, ''), '') is not null)
        and acknowledgement_due_at is not null
        and acknowledgement_due_at < now()
        and acknowledgement_status_norm <> 'acknowledged'
        and acknowledged_at is null
    ) as contractor_ack_overdue,
    (
      select count(*)
      from wo
      where status_norm in ('in_progress', 'w trakcie', 'blocked', 'zablokowane')
        and coalesce(updated_at, created_at) <= now() - interval '72 hours'
    ) as stalled_repairs,
    (
      select count(*)
      from wo
      where status_norm not in ('completed', 'cancelled', 'zakończone', 'anulowane')
        and created_at <= now() - interval '14 days'
    ) as long_running_repairs,
    (select count(*) from recent_repair_properties) as repeat_repair_properties,
    status_counts.req_by_status,
    status_counts.wo_by_status,
    aging_counts.aging
  from status_counts, aging_counts;
$$;

grant execute on function public.maintenance_kpi_snapshot(uuid) to authenticated;
