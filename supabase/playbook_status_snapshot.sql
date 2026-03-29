drop function if exists public.playbook_status_snapshot(uuid, integer);

create function public.playbook_status_snapshot(
  p_account_id uuid,
  p_recent_limit integer default 12
)
returns table (
  settings jsonb,
  open_run_counts jsonb,
  recent_runs jsonb,
  recent_resolved_runs jsonb,
  recent_executions jsonb,
  open_runs integer,
  last_run_at timestamptz,
  last_run_status text
)
language sql
security definer
set search_path = public
as $$
  with cfg as (
    select greatest(1, least(coalesce(p_recent_limit, 12), 50)) as recent_limit
  ),
  authz as (
    select
      public.assert_manage_account_access(p_account_id) as account_id,
      public.assert_account_feature_access(p_account_id, 'playbooks') as feature_account_id
  ),
  settings_rows as (
    select
      ars.rule_id,
      ars.enabled,
      ars.config,
      ars.updated_at
    from public.automation_rule_settings ars
    cross join authz a
    where ars.account_id = a.account_id
  ),
  open_run_count_rows as (
    select
      ar.rule_id,
      count(*)::int as run_count
    from public.automation_runs ar
    where ar.account_id = p_account_id
      and lower(coalesce(ar.state, 'open')) = 'open'
    group by ar.rule_id
  ),
  recent_run_rows as (
    select
      ar.id,
      ar.rule_id,
      ar.source_key,
      ar.state,
      ar.severity,
      ar.title,
      ar.body,
      ar.entity_type,
      ar.entity_id,
      ar.link_path,
      ar.details,
      ar.first_triggered_at,
      ar.last_triggered_at,
      ar.resolved_at,
      ar.created_at,
      ar.updated_at
    from public.automation_runs ar
    where ar.account_id = p_account_id
    order by ar.last_triggered_at desc nulls last, ar.created_at desc
    limit (select recent_limit from cfg)
  ),
  recent_resolved_rows as (
    select
      ar.id,
      ar.rule_id,
      ar.source_key,
      ar.state,
      ar.severity,
      ar.title,
      ar.body,
      ar.entity_type,
      ar.entity_id,
      ar.link_path,
      ar.details,
      ar.first_triggered_at,
      ar.last_triggered_at,
      ar.resolved_at,
      ar.created_at,
      ar.updated_at
    from public.automation_runs ar
    where ar.account_id = p_account_id
      and lower(coalesce(ar.state, 'open')) = 'resolved'
    order by ar.resolved_at desc nulls last, ar.last_triggered_at desc nulls last
    limit (select recent_limit from cfg)
  ),
  recent_execution_rows as (
    select
      ael.id,
      ael.rule_id,
      ael.event_key,
      ael.execution_type,
      ael.status,
      ael.entity_type,
      ael.entity_id,
      ael.title,
      ael.details,
      ael.executed_at,
      ael.created_at
    from public.automation_execution_log ael
    where ael.account_id = p_account_id
    order by ael.executed_at desc nulls last, ael.created_at desc
    limit (select recent_limit from cfg)
  ),
  latest_sync as (
    select
      ael.executed_at,
      ael.status
    from public.automation_execution_log ael
    where ael.account_id = p_account_id
      and ael.execution_type in ('rule_evaluated', 'rule_evaluated_dry_run', 'account_sync_failed')
    order by ael.executed_at desc nulls last, ael.created_at desc
    limit 1
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'rule_id', sr.rule_id,
            'enabled', sr.enabled,
            'config', sr.config,
            'updated_at', sr.updated_at
          )
          order by sr.rule_id
        )
        from settings_rows sr
      ),
      '[]'::jsonb
    ) as settings,
    coalesce(
      (
        select jsonb_object_agg(orc.rule_id, orc.run_count)
        from open_run_count_rows orc
      ),
      '{}'::jsonb
    ) as open_run_counts,
    coalesce(
      (
        select jsonb_agg(to_jsonb(rr) order by rr.last_triggered_at desc nulls last, rr.created_at desc)
        from recent_run_rows rr
      ),
      '[]'::jsonb
    ) as recent_runs,
    coalesce(
      (
        select jsonb_agg(to_jsonb(rrr) order by rrr.resolved_at desc nulls last, rrr.last_triggered_at desc nulls last)
        from recent_resolved_rows rrr
      ),
      '[]'::jsonb
    ) as recent_resolved_runs,
    coalesce(
      (
        select jsonb_agg(to_jsonb(rex) order by rex.executed_at desc nulls last, rex.created_at desc)
        from recent_execution_rows rex
      ),
      '[]'::jsonb
    ) as recent_executions,
    coalesce(
      (
        select sum(orc.run_count)::int
        from open_run_count_rows orc
      ),
      0
    ) as open_runs,
    (select ls.executed_at from latest_sync ls) as last_run_at,
    coalesce((select ls.status from latest_sync ls), 'recorded') as last_run_status;
$$;

grant execute on function public.playbook_status_snapshot(uuid, integer) to authenticated;
