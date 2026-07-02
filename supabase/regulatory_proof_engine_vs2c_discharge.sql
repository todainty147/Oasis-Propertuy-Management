-- supabase/regulatory_proof_engine_vs2c_discharge.sql
--
-- Regulatory Proof Engine VS-2C: RRA information-sheet discharge path.
--
-- Scope:
--   * First-class service evidence for the official information-sheet artefact.
--   * Engine-only open -> discharged posture transition.
--   * Freeze rule for discharged obligations on later not_affected/needs_data.
--   * Demo-only until Gate-B approval.
--
-- Deliberately out of scope:
--   * Final discharged-basis-changed model (VS-2D).
--   * Proof Pack export, Command Centre cards, deadline/expiry logic.
--   * Generic evidence registry.

begin;

-- Defer PL/pgSQL body compilation so %rowtype references to provenance_events
-- (created later in the OVERLAY_SEQUENCE) do not fail at CREATE FUNCTION time.
set local check_function_bodies = off;

alter table public.obligation_instance
  drop constraint if exists obligation_instance_no_discharged_vs2b;

alter table public.obligation_instance
  add column if not exists review_flag text,
  add column if not exists review_flagged_at timestamptz,
  add column if not exists review_flag_source_evaluation_id uuid references public.rule_evaluation(id);

do $$ begin
  alter table public.obligation_instance
    add constraint obligation_instance_review_flag_check
    check (review_flag is null or review_flag in ('discharged_basis_changed'));
exception when duplicate_object then null;
end $$;

create table if not exists public.rra_info_sheet_service_evidence (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  lease_id uuid not null references public.leases(id) on delete cascade,
  obligation_instance_id uuid not null references public.obligation_instance(id) on delete cascade,
  official_info_sheet_identity text not null,
  official_info_sheet_source text not null,
  service_evidence_timestamp timestamptz not null,
  evidence_type text not null,
  evidence_basis text not null,
  captured_by uuid references auth.users(id) on delete set null,
  capture_source text not null default 'manual_rpe_service_evidence_capture',
  capture_event_id uuid, -- FK to provenance_events added below (conditionally, in case provenance_events is not yet created)
  demo_mode boolean not null default true,
  created_at timestamptz not null default now(),
  constraint rra_info_sheet_service_evidence_demo_only check (demo_mode is true),
  constraint rra_info_sheet_service_evidence_source_check check (
    official_info_sheet_source in ('govuk_official_identity','official_document_catalogue','controlled_template_registry')
  ),
  constraint rra_info_sheet_service_evidence_type_check check (
    evidence_type in ('document_service_event','delivery_confirmation','email_delivery_receipt','signed_acknowledgement','manual_attestation','other')
  ),
  constraint rra_info_sheet_service_evidence_identity_not_blank check (length(btrim(official_info_sheet_identity)) > 0),
  constraint rra_info_sheet_service_evidence_basis_not_blank check (length(btrim(evidence_basis)) > 0)
);

-- Add FK to provenance_events conditionally: on a fresh DB replay, provenance_events is created
-- later in the OVERLAY_SEQUENCE (position 183). The exception handlers are intentional —
-- undefined_table means provenance_events not yet created; duplicate_object means already added.
do $$ begin
  alter table public.rra_info_sheet_service_evidence
    add constraint rra_info_sheet_service_evidence_capture_event_fk
    foreign key (capture_event_id) references public.provenance_events(id) on delete restrict;
exception
  when undefined_table then null;
  when duplicate_object then null;
end $$;

create index if not exists rra_info_sheet_service_evidence_obligation_idx
  on public.rra_info_sheet_service_evidence(obligation_instance_id, created_at desc);

create index if not exists rra_info_sheet_service_evidence_account_idx
  on public.rra_info_sheet_service_evidence(account_id, created_at desc);

comment on table public.rra_info_sheet_service_evidence is
  'First-class demo-mode evidence that the official RRA information sheet artefact was served. This is queryable Proof Pack material; it must not be replaced by loose JSON on obligation_instance.';

alter table public.rra_info_sheet_service_evidence enable row level security;

revoke all on table public.rra_info_sheet_service_evidence from public;
grant all on table public.rra_info_sheet_service_evidence to service_role;

drop policy if exists rra_info_sheet_service_evidence_select_account_managers
  on public.rra_info_sheet_service_evidence;
create policy rra_info_sheet_service_evidence_select_account_managers
on public.rra_info_sheet_service_evidence
for select
to authenticated
using (public.user_can_manage_account(account_id));

drop policy if exists rra_info_sheet_service_evidence_no_direct_write
  on public.rra_info_sheet_service_evidence;
create policy rra_info_sheet_service_evidence_no_direct_write
on public.rra_info_sheet_service_evidence
for all
to authenticated
using (false)
with check (false);

create or replace function public.rra_service_evidence_require_capture_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.capture_event_id is null then
    raise exception 'RRA service evidence % has no capture provenance event', new.id;
  end if;

  if not exists (
    select 1
    from public.provenance_events pe
    where pe.id = new.capture_event_id
      and pe.entity_type = 'rra_info_sheet_service_evidence'
      and pe.entity_id = new.id
      and pe.event_type = 'rpe.service_evidence.captured'
      and pe.metadata ->> 'obligation_instance_id' = new.obligation_instance_id::text
      and pe.metadata ->> 'official_info_sheet_identity' = new.official_info_sheet_identity
      and pe.metadata ->> 'demo_mode' = 'true'
  ) then
    raise exception 'RRA service evidence % capture event is missing or mismatched', new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_rra_service_evidence_require_capture_event
  on public.rra_info_sheet_service_evidence;
create constraint trigger trg_rra_service_evidence_require_capture_event
  after insert or update of capture_event_id on public.rra_info_sheet_service_evidence
  deferrable initially deferred
  for each row
  execute function public.rra_service_evidence_require_capture_event();

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
      when 'discharged' then 'rpe.obligation.discharged'
      else null
    end;
  else
    return new;
  end if;

  if v_expected_event_type is null then
    raise exception 'unsupported obligation_instance posture transition % -> %', old.posture, new.posture;
  end if;

  if new.posture = 'discharged' and coalesce(old.posture, '') <> 'open' then
    raise exception 'obligation_instance can only discharge from open posture';
  end if;

  if not exists (
    select 1
    from public.provenance_events pe
    where pe.entity_type = 'obligation_instance'
      and pe.entity_id = new.id
      and pe.event_type = v_expected_event_type
      and pe.metadata ->> 'new_posture' = new.posture
      and (pe.metadata ->> 'evaluation_id')::uuid = new.source_evaluation_id
      and (
        new.posture <> 'discharged'
        or pe.metadata ? 'evidence_id'
      )
  ) then
    raise exception 'obligation_instance % transition to % has no corresponding % provenance event; persist via the RPE RPC only',
      new.id, new.posture, v_expected_event_type;
  end if;

  return new;
end;
$$;

-- DROP BEFORE REPLACE: return type changed from provenance_events to uuid (callers only
-- need the event ID; provenance_events is not yet created at this sequence position).
drop function if exists public.record_rpe_obligation_discharged_event(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, boolean
);
create or replace function public.record_rpe_obligation_discharged_event(
  p_account_id uuid,
  p_obligation_instance_id uuid,
  p_evaluation_id uuid,
  p_evidence_id uuid,
  p_regulatory_change_id uuid,
  p_impact_rule_id uuid,
  p_lease_id uuid,
  p_property_id uuid,
  p_obligation_kind text,
  p_official_info_sheet_identity text,
  p_service_evidence_timestamp timestamptz,
  p_demo_mode boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.provenance_events%rowtype;
begin
  if p_demo_mode is not true then
    raise exception 'RPE VS-2C obligation discharge is demo_mode only until Gate-B approval';
  end if;

  v_event := public.record_provenance_event(
    p_account_id,
    'obligation_instance',
    p_obligation_instance_id,
    'rpe.obligation.discharged',
    'human',
    now(),
    'RPE obligation discharged by admissible RRA information-sheet service evidence',
    p_property_id,
    p_lease_id,
    public.account_member_effective_role(p_account_id, auth.uid()),
    'admissible service evidence proved the official RRA information sheet was served',
    jsonb_build_object(
      'obligation_instance_id', p_obligation_instance_id,
      'evaluation_id', p_evaluation_id,
      'evidence_id', p_evidence_id,
      'regulatory_change_id', p_regulatory_change_id,
      'impact_rule_id', p_impact_rule_id,
      'lease_id', p_lease_id,
      'property_id', p_property_id,
      'obligation_kind', p_obligation_kind,
      'official_info_sheet_identity', p_official_info_sheet_identity,
      'service_evidence_timestamp', p_service_evidence_timestamp,
      'previous_posture', 'open',
      'new_posture', 'discharged',
      'reason', 'admissible service evidence proved fulfilment',
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
    'rra_info_sheet:obligation:discharged:' || p_obligation_instance_id::text || ':' || p_evidence_id::text,
    1
  );

  return v_event.id;
end;
$$;

-- DROP BEFORE REPLACE: return type changed from provenance_events to void (all callers use PERFORM).
drop function if exists public.record_rpe_discharged_basis_changed_flag_event(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, boolean
);
create or replace function public.record_rpe_discharged_basis_changed_flag_event(
  p_account_id uuid,
  p_obligation_instance_id uuid,
  p_evaluation_id uuid,
  p_regulatory_change_id uuid,
  p_impact_rule_id uuid,
  p_lease_id uuid,
  p_property_id uuid,
  p_obligation_kind text,
  p_later_result text,
  p_demo_mode boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.provenance_events%rowtype;
begin
  if p_demo_mode is not true then
    raise exception 'RPE VS-2C discharged-basis-changed flags are demo_mode only until Gate-B approval';
  end if;

  v_event := public.record_provenance_event(
    p_account_id,
    'obligation_instance',
    p_obligation_instance_id,
    'rpe.obligation.discharged_basis_changed_flag',
    'human',
    now(),
    'RPE discharged obligation basis changed; posture frozen pending VS-2D review',
    p_property_id,
    p_lease_id,
    public.account_member_effective_role(p_account_id, auth.uid()),
    'later evaluation returned ' || p_later_result || '; discharged posture preserved for review',
    jsonb_build_object(
      'obligation_instance_id', p_obligation_instance_id,
      'evaluation_id', p_evaluation_id,
      'regulatory_change_id', p_regulatory_change_id,
      'impact_rule_id', p_impact_rule_id,
      'lease_id', p_lease_id,
      'property_id', p_property_id,
      'obligation_kind', p_obligation_kind,
      'later_result', p_later_result,
      'review_flag', 'discharged_basis_changed',
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
    'rra_info_sheet:obligation:discharged_basis_changed:' || p_obligation_instance_id::text || ':' || p_evaluation_id::text,
    1
  );
end;
$$;

create or replace function public.capture_rra_info_sheet_service_evidence(
  p_account_id uuid,
  p_obligation_instance_id uuid,
  p_official_info_sheet_identity text,
  p_service_evidence_timestamp timestamptz,
  p_evidence_type text,
  p_evidence_basis text,
  p_official_info_sheet_source text default 'official_document_catalogue',
  p_capture_source text default 'manual_rpe_service_evidence_capture',
  p_demo_mode boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obligation public.obligation_instance%rowtype;
  v_evidence_id uuid := gen_random_uuid();
  v_evidence public.rra_info_sheet_service_evidence%rowtype;
  v_event public.provenance_events%rowtype;
  v_captured_at timestamptz := now();
begin
  if p_demo_mode is not true then
    raise exception 'RPE VS-2C service evidence capture is demo_mode only until Gate-B approval';
  end if;

  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  if nullif(btrim(coalesce(p_official_info_sheet_identity, '')), '') is null then
    raise exception 'official_info_sheet_identity is required';
  end if;

  if p_service_evidence_timestamp is null then
    raise exception 'service_evidence_timestamp is required';
  end if;

  if p_official_info_sheet_source not in ('govuk_official_identity','official_document_catalogue','controlled_template_registry') then
    raise exception 'official_info_sheet_source is inadmissible for discharge';
  end if;

  if p_evidence_type not in ('document_service_event','delivery_confirmation','email_delivery_receipt','signed_acknowledgement','manual_attestation','other') then
    raise exception 'evidence_type is required and must be an admissible service proof type';
  end if;

  if nullif(btrim(coalesce(p_evidence_basis, '')), '') is null then
    raise exception 'evidence_basis is required';
  end if;

  select *
    into v_obligation
    from public.obligation_instance oi
   where oi.id = p_obligation_instance_id
     and oi.account_id = p_account_id
   for update;

  if not found then
    raise exception 'obligation_instance not found for account';
  end if;

  if v_obligation.demo_mode is not true then
    raise exception 'RPE VS-2C only captures evidence for demo_mode obligations until Gate-B approval';
  end if;

  if v_obligation.posture <> 'open' then
    raise exception 'service evidence discharge capture requires an open obligation';
  end if;

  v_event := public.record_provenance_event(
    p_account_id,
    'rra_info_sheet_service_evidence',
    v_evidence_id,
    'rpe.service_evidence.captured',
    'human',
    v_captured_at,
    'RPE RRA information-sheet service evidence captured',
    v_obligation.property_id,
    v_obligation.lease_id,
    public.account_member_effective_role(p_account_id, auth.uid()),
    null,
    jsonb_build_object(
      'account_id', p_account_id,
      'property_id', v_obligation.property_id,
      'lease_id', v_obligation.lease_id,
      'obligation_instance_id', p_obligation_instance_id,
      'official_info_sheet_identity', btrim(p_official_info_sheet_identity),
      'official_info_sheet_source', p_official_info_sheet_source,
      'service_evidence_timestamp', p_service_evidence_timestamp,
      'evidence_type', p_evidence_type,
      'evidence_basis', p_evidence_basis,
      'captured_by', auth.uid(),
      'capture_source', coalesce(nullif(btrim(p_capture_source), ''), 'manual_rpe_service_evidence_capture'),
      'demo_mode', true
    ),
    null,
    null,
    'regulatory_proof_engine',
    v_evidence_id,
    null,
    null,
    v_obligation.source_evaluation_id,
    null,
    'internal',
    'rra_info_sheet:service_evidence:captured:' || v_evidence_id::text,
    1
  );

  insert into public.rra_info_sheet_service_evidence (
    id,
    account_id,
    property_id,
    lease_id,
    obligation_instance_id,
    official_info_sheet_identity,
    official_info_sheet_source,
    service_evidence_timestamp,
    evidence_type,
    evidence_basis,
    captured_by,
    capture_source,
    capture_event_id,
    demo_mode,
    created_at
  )
  values (
    v_evidence_id,
    p_account_id,
    v_obligation.property_id,
    v_obligation.lease_id,
    p_obligation_instance_id,
    btrim(p_official_info_sheet_identity),
    p_official_info_sheet_source,
    p_service_evidence_timestamp,
    p_evidence_type,
    p_evidence_basis,
    auth.uid(),
    coalesce(nullif(btrim(p_capture_source), ''), 'manual_rpe_service_evidence_capture'),
    v_event.id,
    true,
    v_captured_at
  )
  returning * into v_evidence;

  return jsonb_build_object(
    'evidence_id', v_evidence.id,
    'capture_event_id', v_event.id,
    'obligation_instance_id', v_evidence.obligation_instance_id,
    'official_info_sheet_identity', v_evidence.official_info_sheet_identity,
    'service_evidence_timestamp', v_evidence.service_evidence_timestamp,
    'evidence_type', v_evidence.evidence_type,
    'demo_mode', true
  );
end;
$$;

create or replace function public.reconcile_rra_info_sheet_obligation_discharge(
  p_account_id uuid,
  p_obligation_instance_id uuid,
  p_service_evidence_id uuid,
  p_demo_mode boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obligation public.obligation_instance%rowtype;
  v_evidence public.rra_info_sheet_service_evidence%rowtype;
  v_rule public.impact_rule%rowtype;
  v_discharge_event_id uuid;
begin
  if p_demo_mode is not true then
    raise exception 'RPE VS-2C obligation discharge is demo_mode only until Gate-B approval';
  end if;

  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  select *
    into v_obligation
    from public.obligation_instance oi
   where oi.id = p_obligation_instance_id
     and oi.account_id = p_account_id
   for update;

  if not found then
    raise exception 'obligation_instance not found for account';
  end if;

  if v_obligation.demo_mode is not true then
    raise exception 'RPE VS-2C only discharges demo_mode obligations until Gate-B approval';
  end if;

  if v_obligation.posture <> 'open' then
    raise exception 'only open obligations can be discharged';
  end if;

  select *
    into v_evidence
    from public.rra_info_sheet_service_evidence e
   where e.id = p_service_evidence_id
     and e.account_id = p_account_id
     and e.obligation_instance_id = p_obligation_instance_id
     and e.demo_mode is true
   for update;

  if not found then
    raise exception 'admissible service evidence not found for obligation';
  end if;

  if nullif(btrim(v_evidence.official_info_sheet_identity), '') is null
     or v_evidence.service_evidence_timestamp is null
     or nullif(btrim(v_evidence.evidence_basis), '') is null then
    raise exception 'service evidence is incomplete and cannot discharge obligation';
  end if;

  select *
    into v_rule
    from public.impact_rule ir
   where ir.id = v_obligation.impact_rule_id
     and ir.rule_key = 'rra_info_sheet_v1'
     and ir.version = 1;

  if not found then
    raise exception 'RRA information-sheet rule v1 not found for obligation';
  end if;

  update public.obligation_instance
     set posture = 'discharged',
         review_flag = null,
         review_flagged_at = null,
         review_flag_source_evaluation_id = null,
         last_transition_at = now()
   where id = p_obligation_instance_id
   returning * into v_obligation;

  v_discharge_event_id := public.record_rpe_obligation_discharged_event(
    p_account_id,
    v_obligation.id,
    v_obligation.source_evaluation_id,
    v_evidence.id,
    v_obligation.regulatory_change_id,
    v_obligation.impact_rule_id,
    v_obligation.lease_id,
    v_obligation.property_id,
    v_obligation.obligation_kind,
    v_evidence.official_info_sheet_identity,
    v_evidence.service_evidence_timestamp,
    true
  );

  return jsonb_build_object(
    'action', 'discharged',
    'obligation_instance_id', v_obligation.id,
    'posture', v_obligation.posture,
    'evidence_id', v_evidence.id,
    'discharge_event_id', v_discharge_event_id,
    'official_info_sheet_identity', v_evidence.official_info_sheet_identity,
    'service_evidence_timestamp', v_evidence.service_evidence_timestamp,
    'demo_mode', true
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

  if v_had_active and v_active.posture = 'discharged' then
    if v_evaluation.result in ('not_affected','needs_data') then
      update public.obligation_instance
         set review_flag = 'discharged_basis_changed',
             review_flagged_at = now(),
             review_flag_source_evaluation_id = v_evaluation.id,
             last_transition_at = last_transition_at
       where id = v_active.id
       returning * into v_created;

      perform public.record_rpe_discharged_basis_changed_flag_event(
        p_account_id,
        v_created.id,
        v_evaluation.id,
        v_change.id,
        v_rule.id,
        v_evaluation.tenancy_id,
        v_lease.property_id,
        v_created.obligation_kind,
        v_evaluation.result,
        true
      );

      return jsonb_build_object(
        'action', 'discharged_basis_changed_flag',
        'obligation_instance_id', v_created.id,
        'posture', v_created.posture,
        'review_flag', v_created.review_flag,
        'demo_mode', true
      );
    end if;

    if v_evaluation.result = 'affected' then
      return jsonb_build_object(
        'action', 'already_discharged',
        'obligation_instance_id', v_active.id,
        'posture', v_active.posture,
        'obligation_kind', v_active.obligation_kind,
        'demo_mode', true
      );
    end if;
  end if;

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
  where oi.account_id = p_account_id
  order by oi.last_transition_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

drop function if exists public.rra_obligation_posture_summary(uuid);
create or replace function public.rra_obligation_posture_summary(
  p_account_id uuid
)
returns table (
  posture text,
  obligation_count bigint,
  review_flag_count bigint,
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
    count(*) filter (where oi.review_flag is not null)::bigint as review_flag_count,
    max(oi.last_transition_at) as latest_transition_at
  from public.obligation_instance oi
  where oi.account_id = p_account_id
  group by oi.posture
  order by oi.posture;
end;
$$;

drop function if exists public.list_rra_info_sheet_service_evidence(uuid, uuid);
create or replace function public.list_rra_info_sheet_service_evidence(
  p_account_id uuid,
  p_obligation_instance_id uuid
)
returns table (
  id uuid,
  account_id uuid,
  property_id uuid,
  lease_id uuid,
  obligation_instance_id uuid,
  official_info_sheet_identity text,
  official_info_sheet_source text,
  service_evidence_timestamp timestamptz,
  evidence_type text,
  evidence_basis text,
  captured_by uuid,
  capture_source text,
  capture_event_id uuid,
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

  if not exists (
    select 1 from public.obligation_instance oi
    where oi.id = p_obligation_instance_id
      and oi.account_id = p_account_id
  ) then
    raise exception 'Obligation not found for account';
  end if;

  return query
  select
    e.id,
    e.account_id,
    e.property_id,
    e.lease_id,
    e.obligation_instance_id,
    e.official_info_sheet_identity,
    e.official_info_sheet_source,
    e.service_evidence_timestamp,
    e.evidence_type,
    e.evidence_basis,
    e.captured_by,
    e.capture_source,
    e.capture_event_id,
    e.demo_mode,
    e.created_at
  from public.rra_info_sheet_service_evidence e
  where e.obligation_instance_id = p_obligation_instance_id
    and e.account_id = p_account_id
  order by e.created_at desc;
end;
$$;

revoke all on function public.rra_service_evidence_require_capture_event() from public;
revoke all on function public.record_rpe_obligation_discharged_event(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, boolean
) from public;
revoke all on function public.record_rpe_discharged_basis_changed_flag_event(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, boolean
) from public;
revoke all on function public.capture_rra_info_sheet_service_evidence(
  uuid, uuid, text, timestamptz, text, text, text, text, boolean
) from public;
revoke all on function public.reconcile_rra_info_sheet_obligation_discharge(uuid, uuid, uuid, boolean) from public;
revoke all on function public.reconcile_rra_info_sheet_obligation(uuid, uuid, boolean) from public;
revoke all on function public.list_rra_obligation_instances(uuid, integer, integer) from public;
revoke all on function public.rra_obligation_posture_summary(uuid) from public;
revoke all on function public.list_rra_info_sheet_service_evidence(uuid, uuid) from public;

grant execute on function public.capture_rra_info_sheet_service_evidence(
  uuid, uuid, text, timestamptz, text, text, text, text, boolean
) to authenticated;
grant execute on function public.reconcile_rra_info_sheet_obligation_discharge(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.reconcile_rra_info_sheet_obligation(uuid, uuid, boolean) to authenticated;
grant execute on function public.list_rra_obligation_instances(uuid, integer, integer) to authenticated;
grant execute on function public.rra_obligation_posture_summary(uuid) to authenticated;
grant execute on function public.list_rra_info_sheet_service_evidence(uuid, uuid) to authenticated;

commit;
