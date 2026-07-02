-- supabase/regulatory_monitoring_vs2_5_scheduled.sql
--
-- Monitoring VS-2.5: scheduled trigger over the proven VS-2 check path.
--
-- Scheduling changes who triggers a source check, not what the check does.
-- The scheduled Edge Function reuses the same shared Edge helper as the
-- operator-triggered check and calls only boxed service-role RPCs below.
--
-- Depends on regulatory_monitoring_vs2_sources.sql.

begin;

alter table public.regulatory_change_candidate
  alter column created_by drop not null;

comment on column public.regulatory_change_candidate.created_by is
  'Human creator for manual/operator candidates. Null is allowed only for system-created automated_source_detection candidates from the scheduled monitor.';

create table if not exists public.regulatory_source_scheduled_run (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  trigger_type text not null default 'scheduled' check (trigger_type = 'scheduled'),
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'skipped')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  sources_checked integer not null default 0 check (sources_checked >= 0),
  changes_detected integer not null default 0 check (changes_detected >= 0),
  candidates_created integer not null default 0 check (candidates_created >= 0),
  checks_failed integer not null default 0 check (checks_failed >= 0),
  error_summary text,
  skipped_reason text,
  stale_previous_run_id uuid references public.regulatory_source_scheduled_run(id) on delete set null,
  demo_mode boolean not null default true check (demo_mode is true),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regulatory_source_scheduled_run_terminal_completed_at check (
    (status = 'running' and completed_at is null)
    or
    (status <> 'running' and completed_at is not null)
  )
);

comment on table public.regulatory_source_scheduled_run is
  'Account-homed audit record for unattended regulatory source scheduled checks. It records that automation ran; detection still stops at candidate(status=new).';

create unique index if not exists regulatory_source_scheduled_run_one_running
  on public.regulatory_source_scheduled_run(account_id)
  where status = 'running';

create index if not exists regulatory_source_scheduled_run_account_time_idx
  on public.regulatory_source_scheduled_run(account_id, started_at desc);

alter table public.regulatory_source_scheduled_run enable row level security;

revoke all on table public.regulatory_source_scheduled_run from public, anon, authenticated;
grant all on table public.regulatory_source_scheduled_run to service_role;

drop policy if exists regulatory_source_scheduled_run_no_authenticated_access
  on public.regulatory_source_scheduled_run;
create policy regulatory_source_scheduled_run_no_authenticated_access
on public.regulatory_source_scheduled_run
for all
to authenticated
using (false)
with check (false);

create or replace function public.regulatory_source_scheduled_run_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_regulatory_source_scheduled_run_touch_updated_at
  on public.regulatory_source_scheduled_run;
create trigger trg_regulatory_source_scheduled_run_touch_updated_at
before update on public.regulatory_source_scheduled_run
for each row execute function public.regulatory_source_scheduled_run_touch_updated_at();

create or replace function public.regulatory_source_scheduler_require_service_role()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('role', true), '') <> 'service_role' then
    raise exception 'service_role required for scheduled regulatory source monitor';
  end if;
end;
$$;

-- DROP BEFORE REPLACE: return type changed from provenance_events to void (all callers
-- use PERFORM, so no return value is ever consumed). Idempotent on a fresh DB.
drop function if exists public.regulatory_source_scheduler_record_event(uuid, text, uuid, text, text, jsonb);
create or replace function public.regulatory_source_scheduler_record_event(
  p_account_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_event_type text,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.regulatory_source_scheduler_require_service_role();

  perform public.record_provenance_event(
    p_account_id,
    p_entity_type,
    p_entity_id,
    p_event_type,
    'system',
    now(),
    p_summary,
    null,
    null,
    'regulatory_monitor_scheduler',
    null,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'demo_mode', true,
        'source', 'regulatory_source_scheduler',
        'scheduled_detection_stops_at', 'regulatory_change_candidate.status=new'
      ),
    null,
    null,
    'regulatory_source_scheduler',
    null,
    null,
    null,
    null,
    null,
    'internal',
    'regulatory_source_scheduler:' || p_event_type || ':' || p_entity_id::text || ':' || gen_random_uuid()::text,
    1
  );
end;
$$;

create or replace function public.list_regulatory_sources_for_scheduled_check()
returns setof public.regulatory_source
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.regulatory_source_scheduler_require_service_role();

  return query
  select rs.*
    from public.regulatory_source rs
   where rs.status = 'active'
   order by rs.account_id, rs.source_title asc, rs.id;
end;
$$;

create or replace function public.begin_regulatory_source_scheduled_run(
  p_account_id uuid,
  p_stale_after_minutes integer default 120,
  p_demo_mode boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.regulatory_source_scheduled_run%rowtype;
  v_stale public.regulatory_source_scheduled_run%rowtype;
  v_stale_after interval := make_interval(mins => greatest(1, least(coalesce(p_stale_after_minutes, 120), 1440)));
begin
  perform public.regulatory_source_scheduler_require_service_role();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-2.5 is demo-only; p_demo_mode must be true';
  end if;

  if not exists (select 1 from public.accounts a where a.id = p_account_id) then
    raise exception 'account not found for scheduled regulatory source run';
  end if;

  for v_stale in
    select *
      from public.regulatory_source_scheduled_run
     where account_id = p_account_id
       and status = 'running'
       and started_at < now() - v_stale_after
     for update
  loop
    update public.regulatory_source_scheduled_run
       set status = 'failed',
           completed_at = now(),
           error_summary = 'stale running job marked failed before new scheduled run'
     where id = v_stale.id
    returning * into v_stale;

    perform public.regulatory_source_scheduler_record_event(
      v_stale.account_id,
      'regulatory_source_scheduled_run',
      v_stale.id,
      'regulatory_source.scheduled_run_failed',
      'Stale regulatory source scheduled run marked failed',
      jsonb_build_object(
        'status', v_stale.status,
        'stale_before_new_run', true
      )
    );
  end loop;

  if exists (
    select 1
      from public.regulatory_source_scheduled_run
     where account_id = p_account_id
       and status = 'running'
  ) then
    insert into public.regulatory_source_scheduled_run (
      account_id,
      status,
      completed_at,
      skipped_reason,
      demo_mode
    )
    values (
      p_account_id,
      'skipped',
      now(),
      'scheduled run already active',
      true
    )
    returning * into v_run;

    perform public.regulatory_source_scheduler_record_event(
      v_run.account_id,
      'regulatory_source_scheduled_run',
      v_run.id,
      'regulatory_source.scheduled_run_skipped',
      'Regulatory source scheduled run skipped because another run is active',
      jsonb_build_object(
        'status', v_run.status,
        'skipped_reason', v_run.skipped_reason
      )
    );

    return jsonb_build_object(
      'run_id', v_run.id,
      'account_id', v_run.account_id,
      'status', v_run.status,
      'skipped', true,
      'demo_mode', true
    );
  end if;

  begin
    insert into public.regulatory_source_scheduled_run (
      account_id,
      status,
      demo_mode
    )
    values (
      p_account_id,
      'running',
      true
    )
    returning * into v_run;
  exception when unique_violation then
    insert into public.regulatory_source_scheduled_run (
      account_id,
      status,
      completed_at,
      skipped_reason,
      demo_mode
    )
    values (
      p_account_id,
      'skipped',
      now(),
      'scheduled run already active',
      true
    )
    returning * into v_run;

    perform public.regulatory_source_scheduler_record_event(
      v_run.account_id,
      'regulatory_source_scheduled_run',
      v_run.id,
      'regulatory_source.scheduled_run_skipped',
      'Regulatory source scheduled run skipped due to concurrent start',
      jsonb_build_object(
        'status', v_run.status,
        'skipped_reason', v_run.skipped_reason
      )
    );

    return jsonb_build_object(
      'run_id', v_run.id,
      'account_id', v_run.account_id,
      'status', v_run.status,
      'skipped', true,
      'demo_mode', true
    );
  end;

  perform public.regulatory_source_scheduler_record_event(
    v_run.account_id,
    'regulatory_source_scheduled_run',
    v_run.id,
    'regulatory_source.scheduled_run_started',
    'Regulatory source scheduled run started',
    jsonb_build_object(
      'status', v_run.status,
      'trigger_type', v_run.trigger_type
    )
  );

  return jsonb_build_object(
    'run_id', v_run.id,
    'account_id', v_run.account_id,
    'status', v_run.status,
    'skipped', false,
    'demo_mode', true
  );
end;
$$;

create or replace function public.complete_regulatory_source_scheduled_run(
  p_run_id uuid,
  p_sources_checked integer default 0,
  p_changes_detected integer default 0,
  p_candidates_created integer default 0,
  p_checks_failed integer default 0,
  p_demo_mode boolean default true
)
returns public.regulatory_source_scheduled_run
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.regulatory_source_scheduled_run%rowtype;
begin
  perform public.regulatory_source_scheduler_require_service_role();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-2.5 is demo-only; p_demo_mode must be true';
  end if;

  update public.regulatory_source_scheduled_run
     set status = 'completed',
         completed_at = now(),
         sources_checked = greatest(0, coalesce(p_sources_checked, 0)),
         changes_detected = greatest(0, coalesce(p_changes_detected, 0)),
         candidates_created = greatest(0, coalesce(p_candidates_created, 0)),
         checks_failed = greatest(0, coalesce(p_checks_failed, 0))
   where id = p_run_id
     and status = 'running'
  returning * into v_run;

  if not found then
    raise exception 'running scheduled regulatory source run not found';
  end if;

  perform public.regulatory_source_scheduler_record_event(
    v_run.account_id,
    'regulatory_source_scheduled_run',
    v_run.id,
    'regulatory_source.scheduled_run_completed',
    'Regulatory source scheduled run completed',
    jsonb_build_object(
      'status', v_run.status,
      'sources_checked', v_run.sources_checked,
      'changes_detected', v_run.changes_detected,
      'candidates_created', v_run.candidates_created,
      'checks_failed', v_run.checks_failed
    )
  );

  return v_run;
end;
$$;

create or replace function public.fail_regulatory_source_scheduled_run(
  p_run_id uuid,
  p_error_summary text,
  p_demo_mode boolean default true
)
returns public.regulatory_source_scheduled_run
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.regulatory_source_scheduled_run%rowtype;
begin
  perform public.regulatory_source_scheduler_require_service_role();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-2.5 is demo-only; p_demo_mode must be true';
  end if;

  update public.regulatory_source_scheduled_run
     set status = 'failed',
         completed_at = now(),
         error_summary = left(coalesce(p_error_summary, 'scheduled run failed'), 1000)
   where id = p_run_id
     and status = 'running'
  returning * into v_run;

  if not found then
    raise exception 'running scheduled regulatory source run not found';
  end if;

  perform public.regulatory_source_scheduler_record_event(
    v_run.account_id,
    'regulatory_source_scheduled_run',
    v_run.id,
    'regulatory_source.scheduled_run_failed',
    'Regulatory source scheduled run failed',
    jsonb_build_object(
      'status', v_run.status,
      'error_summary', v_run.error_summary
    )
  );

  return v_run;
end;
$$;

create or replace function public.record_regulatory_source_scheduled_check_failed(
  p_source_id uuid,
  p_error_code text,
  p_error_message text default null,
  p_scheduled_run_id uuid default null,
  p_trigger_type text default 'scheduled',
  p_demo_mode boolean default true
)
returns public.regulatory_source
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.regulatory_source%rowtype;
  v_run public.regulatory_source_scheduled_run%rowtype;
  v_error text;
begin
  perform public.regulatory_source_scheduler_require_service_role();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-2.5 is demo-only; p_demo_mode must be true';
  end if;

  if coalesce(p_trigger_type, 'scheduled') <> 'scheduled' then
    raise exception 'scheduled RPC requires trigger_type scheduled';
  end if;

  if p_scheduled_run_id is null then
    raise exception 'scheduled_run_id is required for scheduled source checks';
  end if;

  select *
    into v_run
    from public.regulatory_source_scheduled_run
   where id = p_scheduled_run_id
     and status = 'running';

  if not found then
    raise exception 'running scheduled regulatory source run not found';
  end if;

  select *
    into v_source
    from public.regulatory_source
   where id = p_source_id
   for update;

  if not found then
    raise exception 'regulatory source not found';
  end if;

  if v_source.account_id <> v_run.account_id then
    raise exception 'regulatory source does not belong to scheduled run account';
  end if;

  if v_source.status <> 'active' then
    raise exception 'regulatory source is not active';
  end if;

  v_source := public.regulatory_source_apply_check_failed_core(
    p_source_id,
    p_error_code,
    p_error_message,
    p_demo_mode
  );

  perform public.regulatory_source_scheduler_record_event(
    v_source.account_id,
    'regulatory_source',
    v_source.id,
    'regulatory_source.check_failed',
    'Regulatory source scheduled check failed',
    jsonb_build_object(
      'scheduled_run_id', v_run.id,
      'trigger_type', 'scheduled',
      'error_code', left(coalesce(p_error_code, 'check_failed'), 120),
      'last_check_status', v_source.last_check_status,
      'last_successful_check_at_unchanged', true,
      'candidate_created', false,
      'hash_updated', false
    )
  );

  return v_source;
end;
$$;

create or replace function public.record_regulatory_source_scheduled_check_result(
  p_source_id uuid,
  p_normalized_content text,
  p_snapshot_excerpt text default null,
  p_snapshot_ref text default null,
  p_retrieved_at timestamptz default now(),
  p_scheduled_run_id uuid default null,
  p_trigger_type text default 'scheduled',
  p_demo_mode boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.regulatory_source%rowtype;
  v_run public.regulatory_source_scheduled_run%rowtype;
  v_candidate public.regulatory_change_candidate%rowtype;
  v_result jsonb;
begin
  perform public.regulatory_source_scheduler_require_service_role();

  if p_demo_mode is not true then
    raise exception 'Monitoring VS-2.5 is demo-only; p_demo_mode must be true';
  end if;

  if coalesce(p_trigger_type, 'scheduled') <> 'scheduled' then
    raise exception 'scheduled RPC requires trigger_type scheduled';
  end if;

  if p_scheduled_run_id is null then
    raise exception 'scheduled_run_id is required for scheduled source checks';
  end if;

  select *
    into v_run
    from public.regulatory_source_scheduled_run
   where id = p_scheduled_run_id
     and status = 'running';

  if not found then
    raise exception 'running scheduled regulatory source run not found';
  end if;

  select *
    into v_source
    from public.regulatory_source
   where id = p_source_id
   for update;

  if not found then
    raise exception 'regulatory source not found';
  end if;

  if v_source.account_id <> v_run.account_id then
    raise exception 'regulatory source does not belong to scheduled run account';
  end if;

  if v_source.status <> 'active' then
    raise exception 'regulatory source is not active';
  end if;

  v_result := public.regulatory_source_apply_check_result_core(
    p_source_id,
    p_normalized_content,
    p_snapshot_excerpt,
    p_snapshot_ref,
    p_retrieved_at,
    null,
    p_demo_mode
  );

  select *
    into v_source
    from public.regulatory_source
   where id = (v_result->>'source_id')::uuid;

  perform public.regulatory_source_scheduler_record_event(
    v_source.account_id,
    'regulatory_source',
    v_source.id,
    'regulatory_source.checked',
      'Regulatory source scheduled check succeeded',
      jsonb_build_object(
      'scheduled_run_id', v_run.id,
      'trigger_type', 'scheduled',
      'baseline', (v_result->>'baseline')::boolean,
      'changed', (v_result->>'changed')::boolean,
      'hash', v_result->>'new_hash'
    )
  );

  if (v_result->>'changed')::boolean then
    if v_result->>'candidate_id' is not null then
      select *
        into v_candidate
        from public.regulatory_change_candidate
       where id = (v_result->>'candidate_id')::uuid
       limit 1;
    end if;

    if (v_result->>'candidate_created')::boolean then
      perform public.regulatory_source_scheduler_record_event(
        v_candidate.account_id,
        'regulatory_change_candidate',
        v_candidate.id,
        'regulatory_change.candidate_created',
        'Regulatory change candidate created from scheduled source hash detection',
        jsonb_build_object(
          'scheduled_run_id', v_run.id,
          'trigger_type', 'scheduled',
          'source_id', v_source.id,
          'status', v_candidate.status,
          'intake_origin', v_candidate.intake_origin,
          'old_hash', v_result->>'old_hash',
          'new_hash', v_result->>'new_hash',
          'source_title', v_source.source_title,
          'source_url_present', true,
          'source_hash_present', true
        )
      );
    end if;

    perform public.regulatory_source_scheduler_record_event(
      v_source.account_id,
      'regulatory_source',
      v_source.id,
      'regulatory_source.change_detected',
      'Regulatory source scheduled hash changed',
      jsonb_build_object(
        'scheduled_run_id', v_run.id,
        'trigger_type', 'scheduled',
        'old_hash', v_result->>'old_hash',
        'new_hash', v_result->>'new_hash',
        'candidate_id', v_candidate.id,
        'candidate_created', (v_result->>'candidate_created')::boolean,
        'detection_authority_stopped_at', 'regulatory_change_candidate.status=new'
      )
    );
  end if;

  return v_result || jsonb_build_object(
    'scheduled_run_id', v_run.id,
    'demo_mode', true
  );
end;
$$;

revoke all on table public.regulatory_source_scheduled_run from public, anon, authenticated;

revoke all on function public.regulatory_source_scheduled_run_touch_updated_at() from public, anon, authenticated;
revoke all on function public.regulatory_source_scheduler_require_service_role() from public, anon, authenticated;
revoke all on function public.regulatory_source_scheduler_record_event(uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.list_regulatory_sources_for_scheduled_check() from public, anon, authenticated;
revoke all on function public.begin_regulatory_source_scheduled_run(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.complete_regulatory_source_scheduled_run(uuid, integer, integer, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.fail_regulatory_source_scheduled_run(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.record_regulatory_source_scheduled_check_failed(uuid, text, text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.record_regulatory_source_scheduled_check_result(uuid, text, text, text, timestamptz, uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.regulatory_source_scheduled_run_touch_updated_at() to service_role;
grant execute on function public.regulatory_source_scheduler_require_service_role() to service_role;
grant execute on function public.regulatory_source_scheduler_record_event(uuid, text, uuid, text, text, jsonb) to service_role;
grant execute on function public.list_regulatory_sources_for_scheduled_check() to service_role;
grant execute on function public.begin_regulatory_source_scheduled_run(uuid, integer, boolean) to service_role;
grant execute on function public.complete_regulatory_source_scheduled_run(uuid, integer, integer, integer, integer, boolean) to service_role;
grant execute on function public.fail_regulatory_source_scheduled_run(uuid, text, boolean) to service_role;
grant execute on function public.record_regulatory_source_scheduled_check_failed(uuid, text, text, uuid, text, boolean) to service_role;
grant execute on function public.record_regulatory_source_scheduled_check_result(uuid, text, text, text, timestamptz, uuid, text, boolean) to service_role;

commit;
