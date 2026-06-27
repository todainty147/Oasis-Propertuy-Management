-- supabase/regulatory_proof_engine_vs2d_basis_review.sql
--
-- Regulatory Proof Engine VS-2D: Discharged-Basis-Changed two-axis model.
--
-- Scope:
--   * First-class obligation_basis_review table (two-axis: posture × latest assessment).
--   * Idempotent basis-review upsert during reconciliation (one current row per obligation).
--   * Provenance event for every basis-change recording.
--   * Deferred edge: re-affected after basis change → record only, nothing destructive.
--   * Read model updates (list + summary) to surface basis-review data.
--   * New read RPC for basis-review records (cross-account compliant).
--   * Demo-only until Gate-B approval.
--
-- Deliberately out of scope:
--   * Proof Pack rendering, Command Centre cards, deadline/expiry logic.
--   * Re-affected-after-change recovery model (deferred edge — record-only).
--   * New discharge-evidence rules (VS-2C's bar unchanged).

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. obligation_basis_review table
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.obligation_basis_review (
  id uuid primary key default gen_random_uuid(),
  obligation_instance_id uuid not null references public.obligation_instance(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  latest_evaluation_id uuid not null references public.rule_evaluation(id) on delete restrict,
  latest_evaluation_result text not null,
  basis_change_status text not null default 'changed_after_discharge',
  basis_change_kind text not null,
  review_required boolean not null default true,
  review_flagged_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  provenance_event_id uuid references public.provenance_events(id) on delete restrict,
  demo_mode boolean not null default true,
  created_at timestamptz not null default now(),
  constraint obligation_basis_review_demo_only check (demo_mode is true),
  constraint obligation_basis_review_result_check check (
    latest_evaluation_result in ('not_affected', 'needs_data', 'affected')
  ),
  constraint obligation_basis_review_kind_check check (
    basis_change_kind in ('not_affected_after_discharge', 'unprovable_after_discharge')
  ),
  constraint obligation_basis_review_status_check check (
    basis_change_status in ('changed_after_discharge')
  )
);

create unique index if not exists obligation_basis_review_one_active_per_obligation_idx
  on public.obligation_basis_review(obligation_instance_id)
  where review_required is true;

create index if not exists obligation_basis_review_account_idx
  on public.obligation_basis_review(account_id, review_flagged_at desc);

comment on table public.obligation_basis_review is
  'Two-axis basis-review record: posture (immutable discharged) × latest evaluation assessment. One current active row per obligation. VS-2D demo-only.';

alter table public.obligation_basis_review enable row level security;

revoke all on table public.obligation_basis_review from public;
grant all on table public.obligation_basis_review to service_role;

drop policy if exists obligation_basis_review_no_direct_access
  on public.obligation_basis_review;
create policy obligation_basis_review_no_direct_access
on public.obligation_basis_review
for all
to authenticated
using (false)
with check (false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Constraint trigger: every basis-review row must have a provenance event
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.obligation_basis_review_require_provenance_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.provenance_event_id is null then
    raise exception 'obligation_basis_review % has no provenance event', new.id;
  end if;

  if not exists (
    select 1
    from public.provenance_events pe
    where pe.id = new.provenance_event_id
      and pe.entity_type = 'obligation_basis_review'
      and pe.entity_id = new.id
      and pe.event_type = 'rpe.obligation.basis_change_recorded'
      and pe.metadata ->> 'demo_mode' = 'true'
  ) then
    raise exception 'obligation_basis_review % provenance event is missing or mismatched', new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_obligation_basis_review_require_provenance_event
  on public.obligation_basis_review;
create constraint trigger trg_obligation_basis_review_require_provenance_event
  after insert or update of provenance_event_id on public.obligation_basis_review
  deferrable initially deferred
  for each row
  execute function public.obligation_basis_review_require_provenance_event();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Provenance event helper for basis-change recording
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.record_rpe_basis_change_recorded_event(
  p_account_id uuid,
  p_basis_review_id uuid,
  p_obligation_instance_id uuid,
  p_evaluation_id uuid,
  p_regulatory_change_id uuid,
  p_impact_rule_id uuid,
  p_lease_id uuid,
  p_property_id uuid,
  p_obligation_kind text,
  p_latest_evaluation_result text,
  p_basis_change_kind text,
  p_is_update boolean,
  p_demo_mode boolean
)
returns public.provenance_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.provenance_events%rowtype;
begin
  if p_demo_mode is not true then
    raise exception 'RPE VS-2D basis-change recording is demo_mode only until Gate-B approval';
  end if;

  v_event := public.record_provenance_event(
    p_account_id,
    'obligation_basis_review',
    p_basis_review_id,
    'rpe.obligation.basis_change_recorded',
    'human',
    now(),
    'RPE basis change recorded: discharged obligation ' || p_basis_change_kind ||
      case when p_is_update then ' (updated)' else ' (new)' end,
    p_property_id,
    p_lease_id,
    public.account_member_effective_role(p_account_id, auth.uid()),
    'discharged obligation basis changed; latest evaluation returned ' || p_latest_evaluation_result,
    jsonb_build_object(
      'basis_review_id', p_basis_review_id,
      'obligation_instance_id', p_obligation_instance_id,
      'evaluation_id', p_evaluation_id,
      'regulatory_change_id', p_regulatory_change_id,
      'impact_rule_id', p_impact_rule_id,
      'lease_id', p_lease_id,
      'property_id', p_property_id,
      'obligation_kind', p_obligation_kind,
      'latest_evaluation_result', p_latest_evaluation_result,
      'basis_change_kind', p_basis_change_kind,
      'basis_change_status', 'changed_after_discharge',
      'is_update', p_is_update,
      'posture_preserved', 'discharged',
      'demo_mode', true
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
    'rra_info_sheet:obligation:basis_change_recorded:' || p_obligation_instance_id::text || ':' || p_evaluation_id::text,
    1
  );

  return v_event;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Override reconcile_rra_info_sheet_obligation with two-axis logic
-- ═══════════════════════════════════════════════════════════════════════════
-- VS-2D elevates VS-2C's side-column flag into a first-class basis-review
-- record. The freeze rule still holds: discharged obligations stay discharged.
-- The reconciliation now writes to obligation_basis_review (idempotent upsert)
-- AND keeps the side-columns on obligation_instance for backward compat.

drop function if exists public.reconcile_rra_info_sheet_obligation(uuid, uuid, boolean);
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
  -- VS-2D two-axis variables
  v_basis_kind text;
  v_existing_review public.obligation_basis_review%rowtype;
  v_basis_review public.obligation_basis_review%rowtype;
  v_basis_review_id uuid;
  v_basis_event public.provenance_events%rowtype;
  v_is_update boolean;
begin
  if p_demo_mode is not true then
    raise exception 'RPE obligation reconciliation is demo_mode only until Gate-B approval';
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
    raise exception 'RPE only reconciles demo_mode evaluations until Gate-B approval';
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
     and oi.posture in ('open','requires_review','discharged')
   order by oi.last_transition_at desc
   limit 1
   for update;

  v_had_active := found;

  -- ───── VS-2D: Two-axis basis-review model for discharged obligations ─────
  if v_had_active and v_active.posture = 'discharged' then

    if v_evaluation.result in ('not_affected','needs_data') then
      v_basis_kind := case v_evaluation.result
        when 'not_affected' then 'not_affected_after_discharge'
        when 'needs_data' then 'unprovable_after_discharge'
      end;

      -- Idempotent: check for existing active basis-review
      select *
        into v_existing_review
        from public.obligation_basis_review obr
       where obr.obligation_instance_id = v_active.id
         and obr.review_required is true
       for update;

      v_is_update := found;
      v_basis_review_id := case when v_is_update then v_existing_review.id else gen_random_uuid() end;

      -- Record provenance event FIRST (atomic)
      v_basis_event := public.record_rpe_basis_change_recorded_event(
        p_account_id, v_basis_review_id, v_active.id, v_evaluation.id,
        v_change.id, v_rule.id, v_evaluation.tenancy_id, v_lease.property_id,
        v_active.obligation_kind, v_evaluation.result, v_basis_kind,
        v_is_update, true
      );

      if v_is_update then
        update public.obligation_basis_review
           set latest_evaluation_id = v_evaluation.id,
               latest_evaluation_result = v_evaluation.result,
               basis_change_kind = v_basis_kind,
               last_seen_at = now(),
               provenance_event_id = v_basis_event.id
         where id = v_existing_review.id
         returning * into v_basis_review;
      else
        insert into public.obligation_basis_review (
          id, obligation_instance_id, account_id, latest_evaluation_id,
          latest_evaluation_result, basis_change_status, basis_change_kind,
          review_required, review_flagged_at, last_seen_at,
          provenance_event_id, demo_mode
        ) values (
          v_basis_review_id, v_active.id, p_account_id, v_evaluation.id,
          v_evaluation.result, 'changed_after_discharge', v_basis_kind,
          true, now(), now(), v_basis_event.id, true
        ) returning * into v_basis_review;
      end if;

      -- Backward-compat: keep VS-2C side-columns on obligation_instance
      update public.obligation_instance
         set review_flag = 'discharged_basis_changed',
             review_flagged_at = now(),
             review_flag_source_evaluation_id = v_evaluation.id,
             last_transition_at = last_transition_at
       where id = v_active.id;

      return jsonb_build_object(
        'action', 'basis_change_recorded',
        'obligation_instance_id', v_active.id,
        'posture', 'discharged',
        'basis_review_id', v_basis_review.id,
        'basis_change_kind', v_basis_kind,
        'latest_evaluation_result', v_evaluation.result,
        'review_required', true,
        'demo_mode', true
      );
    end if;

    if v_evaluation.result = 'affected' then
      -- Deferred edge (§5): check for existing basis-review
      select *
        into v_existing_review
        from public.obligation_basis_review obr
       where obr.obligation_instance_id = v_active.id
         and obr.review_required is true
       for update;

      if found then
        -- Re-affected after basis change: update latest result, keep kind/history
        v_basis_event := public.record_rpe_basis_change_recorded_event(
          p_account_id, v_existing_review.id, v_active.id, v_evaluation.id,
          v_change.id, v_rule.id, v_evaluation.tenancy_id, v_lease.property_id,
          v_active.obligation_kind, 'affected', v_existing_review.basis_change_kind,
          true, true
        );

        update public.obligation_basis_review
           set latest_evaluation_id = v_evaluation.id,
               latest_evaluation_result = 'affected',
               last_seen_at = now(),
               provenance_event_id = v_basis_event.id
         where id = v_existing_review.id
         returning * into v_basis_review;

        return jsonb_build_object(
          'action', 'basis_change_recorded',
          'obligation_instance_id', v_active.id,
          'posture', 'discharged',
          'basis_review_id', v_basis_review.id,
          'basis_change_kind', v_existing_review.basis_change_kind,
          'latest_evaluation_result', 'affected',
          'review_required', v_basis_review.review_required,
          'demo_mode', true
        );
      end if;

      -- No prior basis change — already discharged (idempotent)
      return jsonb_build_object(
        'action', 'already_discharged',
        'obligation_instance_id', v_active.id,
        'posture', v_active.posture,
        'obligation_kind', v_active.obligation_kind,
        'demo_mode', true
      );
    end if;
  end if;

  -- ───── Non-discharged paths (unchanged from VS-2C) ─────

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
             review_flag = null,
             review_flagged_at = null,
             review_flag_source_evaluation_id = null,
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Override list_rra_obligation_instances — add basis-review columns
-- ═══════════════════════════════════════════════════════════════════════════

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
  latest_service_evidence_id uuid,
  latest_service_evidence_timestamp timestamptz,
  latest_official_info_sheet_identity text,
  review_flag text,
  review_flagged_at timestamptz,
  review_flag_source_evaluation_id uuid,
  basis_review_id uuid,
  basis_change_kind text,
  basis_change_status text,
  basis_review_required boolean,
  basis_latest_evaluation_result text,
  basis_review_flagged_at timestamptz,
  basis_review_last_seen_at timestamptz,
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
    ev.id as latest_service_evidence_id,
    ev.service_evidence_timestamp as latest_service_evidence_timestamp,
    ev.official_info_sheet_identity as latest_official_info_sheet_identity,
    oi.review_flag,
    oi.review_flagged_at,
    oi.review_flag_source_evaluation_id,
    br.id as basis_review_id,
    br.basis_change_kind,
    br.basis_change_status,
    br.review_required as basis_review_required,
    br.latest_evaluation_result as basis_latest_evaluation_result,
    br.review_flagged_at as basis_review_flagged_at,
    br.last_seen_at as basis_review_last_seen_at,
    oi.demo_mode,
    oi.created_at,
    oi.last_transition_at
  from public.obligation_instance oi
  left join public.renters_rights_tasks t on t.id = oi.related_task_id
  left join lateral (
    select e.id, e.service_evidence_timestamp, e.official_info_sheet_identity
    from public.rra_info_sheet_service_evidence e
    where e.obligation_instance_id = oi.id
    order by e.created_at desc
    limit 1
  ) ev on true
  left join lateral (
    select obr.id, obr.basis_change_kind, obr.basis_change_status,
           obr.review_required, obr.latest_evaluation_result,
           obr.review_flagged_at, obr.last_seen_at
    from public.obligation_basis_review obr
    where obr.obligation_instance_id = oi.id
      and obr.review_required is true
    limit 1
  ) br on true
  where oi.account_id = p_account_id
  order by oi.last_transition_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Override rra_obligation_posture_summary — add basis_review_required_count
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.rra_obligation_posture_summary(uuid);
create or replace function public.rra_obligation_posture_summary(
  p_account_id uuid
)
returns table (
  posture text,
  obligation_count bigint,
  review_flag_count bigint,
  basis_review_required_count bigint,
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
    count(distinct oi.id)::bigint as obligation_count,
    count(distinct oi.id) filter (where oi.review_flag is not null)::bigint as review_flag_count,
    count(distinct obr.id)::bigint as basis_review_required_count,
    max(oi.last_transition_at) as latest_transition_at
  from public.obligation_instance oi
  left join public.obligation_basis_review obr
    on obr.obligation_instance_id = oi.id
    and obr.review_required is true
  where oi.account_id = p_account_id
  group by oi.posture
  order by oi.posture;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. New read RPC: list_obligation_basis_reviews (cross-account compliant)
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.list_obligation_basis_reviews(uuid, integer, integer);
create or replace function public.list_obligation_basis_reviews(
  p_account_id uuid,
  p_obligation_instance_id uuid default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  obligation_instance_id uuid,
  account_id uuid,
  latest_evaluation_id uuid,
  latest_evaluation_result text,
  basis_change_status text,
  basis_change_kind text,
  review_required boolean,
  review_flagged_at timestamptz,
  last_seen_at timestamptz,
  provenance_event_id uuid,
  obligation_posture text,
  obligation_kind text,
  lease_id uuid,
  property_id uuid,
  demo_mode boolean,
  created_at timestamptz
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

  if p_obligation_instance_id is not null then
    if not exists (
      select 1 from public.obligation_instance oi
      where oi.id = p_obligation_instance_id
        and oi.account_id = p_account_id
    ) then
      raise exception 'Obligation not found for account';
    end if;
  end if;

  return query
  select
    obr.id,
    obr.obligation_instance_id,
    obr.account_id,
    obr.latest_evaluation_id,
    obr.latest_evaluation_result,
    obr.basis_change_status,
    obr.basis_change_kind,
    obr.review_required,
    obr.review_flagged_at,
    obr.last_seen_at,
    obr.provenance_event_id,
    oi.posture as obligation_posture,
    oi.obligation_kind,
    oi.lease_id,
    oi.property_id,
    obr.demo_mode,
    obr.created_at
  from public.obligation_basis_review obr
  join public.obligation_instance oi on oi.id = obr.obligation_instance_id
  where obr.account_id = p_account_id
    and (p_obligation_instance_id is null or obr.obligation_instance_id = p_obligation_instance_id)
  order by obr.review_flagged_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Revoke / grant block
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.obligation_basis_review_require_provenance_event() from public;
revoke all on function public.record_rpe_basis_change_recorded_event(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, boolean, boolean
) from public;
revoke all on function public.reconcile_rra_info_sheet_obligation(uuid, uuid, boolean) from public;
revoke all on function public.list_rra_obligation_instances(uuid, integer, integer) from public;
revoke all on function public.rra_obligation_posture_summary(uuid) from public;
revoke all on function public.list_obligation_basis_reviews(uuid, uuid, integer, integer) from public;

grant execute on function public.reconcile_rra_info_sheet_obligation(uuid, uuid, boolean) to authenticated;
grant execute on function public.list_rra_obligation_instances(uuid, integer, integer) to authenticated;
grant execute on function public.rra_obligation_posture_summary(uuid) to authenticated;
grant execute on function public.list_obligation_basis_reviews(uuid, uuid, integer, integer) to authenticated;

commit;
