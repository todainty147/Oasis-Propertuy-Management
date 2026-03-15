create or replace function public.maintenance_kpi_snapshot(p_account_id uuid)
returns table (
  open_requests bigint,
  active_work_orders bigint,
  awaiting_action bigint,
  resolved_pending_closure bigint,
  open_high_priority bigint,
  req_by_status jsonb,
  wo_by_status jsonb,
  aging jsonb
)
language sql
security definer
set search_path = public
as $$
  with req as (
    select
      lower(coalesce(status, '')) as status_norm,
      lower(coalesce(priority, '')) as priority_norm,
      created_at
    from maintenance_requests
    where account_id = p_account_id
  ),
  wo as (
    select
      lower(coalesce(status, '')) as status_norm
    from work_orders_with_flags
    where account_id = p_account_id
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
    status_counts.req_by_status,
    status_counts.wo_by_status,
    aging_counts.aging
  from status_counts, aging_counts;
$$;

grant execute on function public.maintenance_kpi_snapshot(uuid) to authenticated;
