create or replace function public.maintenance_dashboard_stats(p_account_id uuid)
returns table (
  open_requests bigint,
  active_work_orders bigint,
  awaiting_action bigint,
  resolved_pending_closure bigint,
  open_high_priority bigint
)
language sql
security definer
set search_path = public
as $$
  with req as (
    select status, priority
    from maintenance_requests
    where account_id = p_account_id
  ),
  wo as (
    select status
    from work_orders
    where account_id = p_account_id
  )
  select
    (select count(*) from req where lower(coalesce(status, '')) <> 'closed') as open_requests,
    (select count(*) from wo where lower(coalesce(status, '')) = 'in_progress') as active_work_orders,
    (select count(*) from req where lower(coalesce(status, '')) = 'waiting') as awaiting_action,
    (select count(*) from req where lower(coalesce(status, '')) = 'resolved') as resolved_pending_closure,
    (
      select count(*)
      from req
      where lower(coalesce(status, '')) <> 'closed'
        and lower(coalesce(priority, '')) in ('high', 'urgent')
    ) as open_high_priority;
$$;

grant execute on function public.maintenance_dashboard_stats(uuid) to authenticated;
