-- supabase/regulatory_proof_engine_vs2b_obligations.sql
--
-- Regulatory Proof Engine VS-2B: obligation_instance creation and
-- posture-vs-fulfilment boundary for the RRA information-sheet slice.
--
-- Scope:
--   * Create/update obligation_instance from persisted rule_evaluation rows.
--   * Preserve legal posture separately from operational fulfilment tasks.
--   * Emit narrow RPE provenance events for creation/supersession/review.
--   * Demo-only until Gate-B approval.
--
-- Deliberately out of scope:
--   * Discharge / compliant posture movement.
--   * Service-evidence capture and official information-sheet proof.
--   * Any trigger or code path from renters_rights_tasks to obligation posture.

begin;

-- Defer PL/pgSQL body compilation so %rowtype references to provenance_events
-- (created later in the OVERLAY_SEQUENCE) do not fail at CREATE FUNCTION time.
set local check_function_bodies = off;

create table if not exists public.obligation_instance (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  lease_id uuid not null references public.leases(id) on delete cascade,
  regulatory_change_id uuid not null references public.regulatory_change(id),
  impact_rule_id uuid not null references public.impact_rule(id),
  obligation_kind text not null check (obligation_kind in ('information_sheet','written_statement')),
  exposure_gbp_ceiling numeric not null default 7000,
  posture text not null default 'open' check (posture in ('open','superseded','requires_review','discharged')),
  source_evaluation_id uuid not null references public.rule_evaluation(id),
  related_task_id uuid references public.renters_rights_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  last_transition_at timestamptz not null default now(),
  demo_mode boolean not null default true,
  constraint obligation_instance_demo_only check (demo_mode is true),
  constraint obligation_instance_no_discharged_vs2b check (posture <> 'discharged')
);

alter table public.obligation_instance
  add column if not exists property_id uuid references public.properties(id) on delete set null,
  add column if not exists related_task_id uuid references public.renters_rights_tasks(id) on delete set null,
  add column if not exists demo_mode boolean not null default true;

do $$ begin
  alter table public.obligation_instance
    add constraint obligation_instance_demo_only check (demo_mode is true);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.obligation_instance
    add constraint obligation_instance_no_discharged_vs2b check (posture <> 'discharged');
exception when duplicate_object then null;
end $$;

create index if not exists obligation_instance_account_posture_idx
  on public.obligation_instance(account_id, posture, last_transition_at desc);

create index if not exists obligation_instance_lease_rule_idx
  on public.obligation_instance(lease_id, regulatory_change_id, impact_rule_id, last_transition_at desc);

create unique index if not exists obligation_instance_one_active_per_rule_idx
  on public.obligation_instance(lease_id, regulatory_change_id, impact_rule_id)
  where posture in ('open','requires_review');

comment on table public.obligation_instance is
  'Authoritative RPE legal-posture record. Operational renters_rights_tasks may be linked for context but never control posture.';

comment on column public.obligation_instance.related_task_id is
  'Operational context only. Task writes must not update obligation posture; only RPE evaluation/evidence RPCs may move posture.';

alter table public.obligation_instance enable row level security;

revoke all on table public.obligation_instance from public;
grant select on table public.obligation_instance to authenticated;
grant all on table public.obligation_instance to service_role;

drop policy if exists obligation_instance_select_account_managers on public.obligation_instance;
create policy obligation_instance_select_account_managers
on public.obligation_instance
for select
to authenticated
using (public.user_can_manage_account(account_id));

drop policy if exists obligation_instance_no_direct_write on public.obligation_instance;
create policy obligation_instance_no_direct_write
on public.obligation_instance
for all
to authenticated
using (false)
with check (false);

create or replace function public.obligation_instance_require_transition_event()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_expected_event_type text;
begin
  if tg_op = 'INSERT' then
    v_expected_event_type := 'rpe.obligation.created';
  elsif tg_op = 'UPDATE' and old.posture is distinct from new.posture then
    v_expected_event_type := case new.posture
      when 'superseded' then 'rpe.obligation.superseded'
      when 'requires_review' then 'rpe.obligation.requires_review'
      when 'open' then 'rpe.obligation.reopened'
      else null
    end;
  else
    return new;
  end if;

  if v_expected_event_type is null then
    raise exception 'unsupported obligation_instance posture transition % -> %', old.posture, new.posture;
  end if;

  if not exists (
    select 1
    from public.provenance_events pe
    where pe.entity_type = 'obligation_instance'
      and pe.entity_id = new.id
      and pe.event_type = v_expected_event_type
      and pe.metadata ->> 'new_posture' = new.posture
      and (pe.metadata ->> 'evaluation_id')::uuid = new.source_evaluation_id
  ) then
    raise exception 'obligation_instance % transition to % has no corresponding % provenance event; persist via the RPE RPC only',
      new.id, new.posture, v_expected_event_type;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_obligation_instance_require_transition on public.obligation_instance;
create constraint trigger trg_obligation_instance_require_transition
  after insert or update of posture on public.obligation_instance
  deferrable initially deferred
  for each row
  execute function public.obligation_instance_require_transition_event();

-- DROP BEFORE REPLACE: return type changed from provenance_events to void (all callers
-- use PERFORM so the return value is never consumed). Idempotent on a fresh DB.
drop function if exists public.record_rpe_obligation_transition_event(
  uuid, uuid, text, uuid, uuid, uuid, uuid, uuid, text, text, text, text, boolean
);
create or replace function public.record_rpe_obligation_transition_event(
  p_account_id uuid,
  p_obligation_instance_id uuid,
  p_event_type text,
  p_evaluation_id uuid,
  p_regulatory_change_id uuid,
  p_impact_rule_id uuid,
  p_lease_id uuid,
  p_property_id uuid,
  p_obligation_kind text,
  p_previous_posture text,
  p_new_posture text,
  p_reason text,
  p_demo_mode boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_demo_mode is not true then
    raise exception 'RPE VS-2B obligation transitions are demo_mode only until Gate-B approval';
  end if;

  perform public.record_provenance_event(
    p_account_id,
    'obligation_instance',
    p_obligation_instance_id,
    p_event_type,
    'human',
    now(),
    'RPE obligation posture transition',
    p_property_id,
    p_lease_id,
    public.account_member_effective_role(p_account_id, auth.uid()),
    p_reason,
    jsonb_build_object(
      'obligation_instance_id', p_obligation_instance_id,
      'evaluation_id', p_evaluation_id,
      'regulatory_change_id', p_regulatory_change_id,
      'impact_rule_id', p_impact_rule_id,
      'lease_id', p_lease_id,
      'property_id', p_property_id,
      'obligation_kind', p_obligation_kind,
      'previous_posture', p_previous_posture,
      'new_posture', p_new_posture,
      'reason', p_reason,
      'demo_mode', true,
      'boundary_notice', 'operational renters_rights_tasks fulfilment does not move legal posture'
    ),
    null,
    null,
    'regulatory_proof_engine',
    p_evaluation_id,
    null,
    null,
    p_evaluation_id,
    null,
    'internal',
    'rra_info_sheet:obligation:' || p_event_type || ':' || p_obligation_instance_id::text || ':' || p_evaluation_id::text,
    1
  );
end;
$$;

create or replace function public.reconcile_rra_info_sheet_obligation(
  p_account_id uuid,
  p_evaluation_id uuid,
  p_demo_mode boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evaluation public.rule_evaluation%rowtype;
  v_rule public.impact_rule%rowtype;
  v_change public.regulatory_change%rowtype;
  v_lease public.leases%rowtype;
  v_active public.obligation_instance%rowtype;
  v_created public.obligation_instance%rowtype;
  v_task_id uuid;
  v_had_active boolean := false;
  v_action text := 'none';
  v_event_type text;
  v_previous_posture text;
  v_new_posture text;
  v_reason text;
begin
  if p_demo_mode is not true then
    raise exception 'RPE VS-2B obligation reconciliation is demo_mode only until Gate-B approval';
  end if;

  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  select *
    into v_evaluation
    from public.rule_evaluation re
   where re.id = p_evaluation_id
   for update;

  if not found then
    raise exception 'rule_evaluation not found';
  end if;

  if v_evaluation.demo_mode is not true then
    raise exception 'RPE VS-2B only reconciles demo_mode evaluations until Gate-B approval';
  end if;

  select *
    into v_rule
    from public.impact_rule ir
   where ir.id = v_evaluation.impact_rule_id
     and ir.rule_key = 'rra_info_sheet_v1'
     and ir.version = 1;

  if not found then
    raise exception 'RRA information-sheet rule v1 not found for evaluation';
  end if;

  select *
    into v_change
    from public.regulatory_change rc
   where rc.id = v_rule.regulatory_change_id;

  if not found then
    raise exception 'regulatory_change not found for RRA information-sheet rule';
  end if;

  select *
    into v_lease
    from public.leases l
   where l.id = v_evaluation.tenancy_id
     and l.account_id = p_account_id
   for update;

  if not found then
    raise exception 'Tenancy not found for account';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('rpe-obligation:' || p_account_id::text),
    hashtext(v_evaluation.tenancy_id::text || ':' || v_change.id::text || ':' || v_rule.id::text)
  );

  select id
    into v_task_id
    from public.renters_rights_tasks t
   where t.account_id = p_account_id
     and t.lease_id = v_evaluation.tenancy_id
     and t.requirement_type = 'renters_rights_information_sheet'
   order by t.created_at desc
   limit 1;

  select *
    into v_active
    from public.obligation_instance oi
   where oi.lease_id = v_evaluation.tenancy_id
     and oi.regulatory_change_id = v_change.id
     and oi.impact_rule_id = v_rule.id
     and oi.posture in ('open','requires_review')
   order by oi.last_transition_at desc
   limit 1
   for update;

  v_had_active := found;

  if v_evaluation.result = 'affected' then
    if v_evaluation.obligation_kind is null then
      raise exception 'affected evaluation requires obligation_kind';
    end if;

    if v_had_active and v_active.obligation_kind = v_evaluation.obligation_kind then
      v_previous_posture := v_active.posture;
      update public.obligation_instance
         set source_evaluation_id = v_evaluation.id,
             exposure_gbp_ceiling = coalesce(v_evaluation.exposure_gbp_ceiling, exposure_gbp_ceiling, 7000),
             related_task_id = coalesce(v_task_id, related_task_id),
             posture = 'open',
             last_transition_at = now()
       where id = v_active.id
       returning * into v_created;

      if v_previous_posture = 'requires_review' then
        perform public.record_rpe_obligation_transition_event(
          p_account_id,
          v_created.id,
          'rpe.obligation.reopened',
          v_evaluation.id,
          v_change.id,
          v_rule.id,
          v_evaluation.tenancy_id,
          v_lease.property_id,
          v_evaluation.obligation_kind,
          v_previous_posture,
          'open',
          'fresh affected evaluation restored provable obligation posture',
          true
        );
        v_action := 'reopened';
      else
        v_action := 'idempotent_update';
      end if;

      return jsonb_build_object(
        'action', v_action,
        'obligation_instance_id', v_created.id,
        'posture', v_created.posture,
        'obligation_kind', v_created.obligation_kind,
        'demo_mode', true
      );
    end if;

    if v_had_active and v_active.obligation_kind <> v_evaluation.obligation_kind then
      update public.obligation_instance
         set posture = 'superseded',
             source_evaluation_id = v_evaluation.id,
             last_transition_at = now()
       where id = v_active.id;

      perform public.record_rpe_obligation_transition_event(
        p_account_id,
        v_active.id,
        'rpe.obligation.superseded',
        v_evaluation.id,
        v_change.id,
        v_rule.id,
        v_evaluation.tenancy_id,
        v_lease.property_id,
        v_active.obligation_kind,
        v_active.posture,
        'superseded',
        'fresh affected evaluation changed obligation_kind; old obligation superseded',
        true
      );
    end if;

    insert into public.obligation_instance (
      account_id,
      property_id,
      lease_id,
      regulatory_change_id,
      impact_rule_id,
      obligation_kind,
      exposure_gbp_ceiling,
      posture,
      source_evaluation_id,
      related_task_id,
      demo_mode
    )
    values (
      p_account_id,
      v_lease.property_id,
      v_evaluation.tenancy_id,
      v_change.id,
      v_rule.id,
      v_evaluation.obligation_kind,
      coalesce(v_evaluation.exposure_gbp_ceiling, 7000),
      'open',
      v_evaluation.id,
      v_task_id,
      true
    )
    returning * into v_created;

    perform public.record_rpe_obligation_transition_event(
      p_account_id,
      v_created.id,
      'rpe.obligation.created',
      v_evaluation.id,
      v_change.id,
      v_rule.id,
      v_evaluation.tenancy_id,
      v_lease.property_id,
      v_evaluation.obligation_kind,
      null,
      'open',
      case when v_had_active then 'obligation_kind changed; new obligation opened' else 'fresh affected evaluation created obligation' end,
      true
    );

    return jsonb_build_object(
      'action', case when v_had_active then 'kind_changed_new_open' else 'created' end,
      'obligation_instance_id', v_created.id,
      'posture', v_created.posture,
      'obligation_kind', v_created.obligation_kind,
      'related_task_id', v_created.related_task_id,
      'demo_mode', true
    );
  end if;

  if v_had_active and v_evaluation.result in ('not_affected','needs_data') then
    v_previous_posture := v_active.posture;
    v_new_posture := case v_evaluation.result
      when 'not_affected' then 'superseded'
      when 'needs_data' then 'requires_review'
    end;
    v_event_type := case v_new_posture
      when 'superseded' then 'rpe.obligation.superseded'
      when 'requires_review' then 'rpe.obligation.requires_review'
    end;
    v_reason := case v_new_posture
      when 'superseded' then 'fresh evaluation returned not_affected'
      when 'requires_review' then 'fresh evaluation returned needs_data; current posture no longer provable'
    end;

    if v_active.posture = v_new_posture then
      update public.obligation_instance
         set source_evaluation_id = v_evaluation.id,
             related_task_id = coalesce(v_task_id, related_task_id),
             last_transition_at = now()
       where id = v_active.id
       returning * into v_created;

      return jsonb_build_object(
        'action', 'idempotent_update',
        'obligation_instance_id', v_created.id,
        'posture', v_created.posture,
        'obligation_kind', v_created.obligation_kind,
        'demo_mode', true
      );
    end if;

    update public.obligation_instance
       set posture = v_new_posture,
           source_evaluation_id = v_evaluation.id,
           related_task_id = coalesce(v_task_id, related_task_id),
           last_transition_at = now()
     where id = v_active.id
     returning * into v_created;

    perform public.record_rpe_obligation_transition_event(
      p_account_id,
      v_created.id,
      v_event_type,
      v_evaluation.id,
      v_change.id,
      v_rule.id,
      v_evaluation.tenancy_id,
      v_lease.property_id,
      v_created.obligation_kind,
      v_previous_posture,
      v_new_posture,
      v_reason,
      true
    );

    return jsonb_build_object(
      'action', v_new_posture,
      'obligation_instance_id', v_created.id,
      'posture', v_created.posture,
      'obligation_kind', v_created.obligation_kind,
      'demo_mode', true
    );
  end if;

  return jsonb_build_object(
    'action', 'none',
    'obligation_instance_id', null,
    'posture', null,
    'obligation_kind', null,
    'demo_mode', true
  );
end;
$$;

-- DROP BEFORE REPLACE: return-type changed across schema versions; CREATE OR REPLACE cannot
-- change OUT-parameter row type. Idempotent — safe on a fresh DB where the function is absent.
drop function if exists public.list_rra_obligation_instances(uuid, integer, integer);
create or replace function public.list_rra_obligation_instances(
  p_account_id uuid,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  lease_id uuid,
  property_id uuid,
  regulatory_change_id uuid,
  impact_rule_id uuid,
  obligation_kind text,
  exposure_gbp_ceiling numeric,
  posture text,
  source_evaluation_id uuid,
  related_task_id uuid,
  related_task_status text,
  demo_mode boolean,
  created_at timestamptz,
  last_transition_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  return query
  select
    oi.id,
    oi.lease_id,
    oi.property_id,
    oi.regulatory_change_id,
    oi.impact_rule_id,
    oi.obligation_kind,
    oi.exposure_gbp_ceiling,
    oi.posture,
    oi.source_evaluation_id,
    oi.related_task_id,
    t.status as related_task_status,
    oi.demo_mode,
    oi.created_at,
    oi.last_transition_at
  from public.obligation_instance oi
  left join public.renters_rights_tasks t on t.id = oi.related_task_id
  where oi.account_id = p_account_id
  order by oi.last_transition_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- DROP BEFORE REPLACE: return-type changed across schema versions; CREATE OR REPLACE cannot
-- change OUT-parameter row type. Idempotent — safe on a fresh DB where the function is absent.
drop function if exists public.rra_obligation_posture_summary(uuid);
create or replace function public.rra_obligation_posture_summary(
  p_account_id uuid
)
returns table (
  posture text,
  obligation_count bigint,
  latest_transition_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  return query
  select
    oi.posture,
    count(*)::bigint as obligation_count,
    max(oi.last_transition_at) as latest_transition_at
  from public.obligation_instance oi
  where oi.account_id = p_account_id
  group by oi.posture
  order by oi.posture;
end;
$$;

revoke all on function public.obligation_instance_require_transition_event() from public;
revoke all on function public.record_rpe_obligation_transition_event(
  uuid, uuid, text, uuid, uuid, uuid, uuid, uuid, text, text, text, text, boolean
) from public;
revoke all on function public.reconcile_rra_info_sheet_obligation(uuid, uuid, boolean) from public;
revoke all on function public.list_rra_obligation_instances(uuid, integer, integer) from public;
revoke all on function public.rra_obligation_posture_summary(uuid) from public;

grant execute on function public.reconcile_rra_info_sheet_obligation(uuid, uuid, boolean) to authenticated;
grant execute on function public.list_rra_obligation_instances(uuid, integer, integer) to authenticated;
grant execute on function public.rra_obligation_posture_summary(uuid) to authenticated;

commit;
