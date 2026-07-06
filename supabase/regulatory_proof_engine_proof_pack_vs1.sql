-- supabase/regulatory_proof_engine_proof_pack_vs1.sql
--
-- Proof Pack VS-1: Per-Obligation Assembly Read Model.
--
-- Scope:
--   * One SECURITY DEFINER read-only RPC that assembles a single obligation's
--     full story from stored RPE records.
--   * NO recomputation — reads stored evaluation, obligation, evidence,
--     basis-review, and provenance values unchanged.
--   * Deterministic provenance ordering (sequence_number preferred, recorded_at + id fallback).
--   * Provenance trace status (reading-for-presence, NOT a verdict).
--   * Completeness/state indicators only — no legal verdict.
--   * Demo-only until Gate-B approval.
--
-- Deliberately out of scope:
--   * PDF / panel / export / visual artefact (Proof Pack VS-2).
--   * Tenancy-level aggregation.
--   * Legal verdict / court-readiness / compliance score.
--   * Any write / mutation / event emission.

begin;

create or replace function public.get_obligation_proof_pack(
  p_account_id uuid,
  p_obligation_instance_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_obligation public.obligation_instance%rowtype;
  v_evaluation record;
  v_property record;
  v_tenancy record;
  v_evidence jsonb;
  v_basis_review jsonb;
  v_latest_evaluation_id uuid;
  v_provenance jsonb;
  v_expected_events text[];
  v_present_event_types text[];
  v_missing_events text[];
begin
  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  select * into v_obligation
  from public.obligation_instance
  where id = p_obligation_instance_id
    and account_id = p_account_id;

  if not found then
    raise exception 'Obligation not found for account';
  end if;

  -- Read stored evaluation (no recomputation)
  select re.id, re.result, re.evaluation_confidence, re.decision_path,
         re.input_snapshot_hash, re.evaluated_at, re.demo_mode,
         re.reason_codes, re.impact_rule_version
    into v_evaluation
    from public.rule_evaluation re
   where re.id = v_obligation.source_evaluation_id;

  -- Read stored evidence (present iff discharged via VS-2C)
  select jsonb_agg(jsonb_build_object(
    'evidence_id', e.id,
    'official_info_sheet_identity', e.official_info_sheet_identity,
    'service_evidence_timestamp', e.service_evidence_timestamp,
    'evidence_type', e.evidence_type,
    'captured_by', e.captured_by,
    'captured_at', e.created_at
  ) order by e.created_at)
  into v_evidence
  from public.rra_info_sheet_service_evidence e
  where e.obligation_instance_id = p_obligation_instance_id;

  -- Read stored basis review (present iff post-discharge basis change — VS-2D)
  select br.latest_evaluation_id,
         jsonb_build_object(
    'basis_review_id', br.id,
    'latest_evaluation_id', br.latest_evaluation_id,
    'latest_evaluation_result', br.latest_evaluation_result,
    'basis_change_kind', br.basis_change_kind,
    'review_required', br.review_required,
    'review_flagged_at', br.review_flagged_at,
    'last_seen_at', br.last_seen_at
  )
  into v_latest_evaluation_id, v_basis_review
  from public.obligation_basis_review br
  where br.obligation_instance_id = p_obligation_instance_id
    and br.review_required is true
  limit 1;

  -- Read property summary (best-effort; null if property_id is not set or row deleted)
  select p.id, p.address, p.city
    into v_property
    from public.properties p
   where p.id = v_obligation.property_id;

  -- Read tenancy summary from lease (best-effort; null if not found)
  select l.id, l.lease_start_date, l.lease_end_date,
         l.rent_amount, l.rent_frequency, l.tenancy_class
    into v_tenancy
    from public.leases l
   where l.id = v_obligation.lease_id;

  -- Assemble provenance trail in deterministic lifecycle order.
  -- sequence_number is NOT NULL with a positive check on provenance_events,
  -- so the ordering key is always populated.
  select jsonb_agg(jsonb_build_object(
    'event_id', pe.id,
    'entity_type', pe.entity_type,
    'entity_id', pe.entity_id,
    'event_type', pe.event_type,
    'recorded_at', pe.recorded_at,
    'sequence_number', pe.sequence_number,
    'summary', pe.summary,
    'reason', pe.reason,
    'metadata', pe.metadata
  ) order by pe.sequence_number, pe.recorded_at, pe.id)
  into v_provenance
  from public.provenance_events pe
  where pe.account_id = p_account_id
    and (
      (pe.entity_type = 'obligation_instance' and pe.entity_id = p_obligation_instance_id)
      or (pe.entity_type = 'rule_evaluation' and pe.entity_id = v_obligation.source_evaluation_id)
      or (pe.entity_type = 'rule_evaluation' and pe.entity_id = v_latest_evaluation_id)
      or (pe.entity_type = 'rra_info_sheet_service_evidence' and pe.entity_id in (
        select ese.id from public.rra_info_sheet_service_evidence ese
        where ese.obligation_instance_id = p_obligation_instance_id
      ))
      or (pe.entity_type = 'obligation_basis_review' and pe.entity_id in (
        select obr.id from public.obligation_basis_review obr
        where obr.obligation_instance_id = p_obligation_instance_id
      ))
    );

  v_expected_events := array['evaluation_run', 'rpe.obligation.created'];

  if v_obligation.posture = 'discharged' then
    v_expected_events := v_expected_events || array['rpe.service_evidence.captured', 'rpe.obligation.discharged'];
  end if;

  if v_basis_review is not null then
    v_expected_events := v_expected_events || array['rpe.obligation.basis_change_recorded'];
  end if;

  select array_agg(distinct pe.event_type)
  into v_present_event_types
  from public.provenance_events pe
  where pe.account_id = p_account_id
    and (
      (pe.entity_type = 'obligation_instance' and pe.entity_id = p_obligation_instance_id)
      or (pe.entity_type = 'rule_evaluation' and pe.entity_id = v_obligation.source_evaluation_id)
      or (pe.entity_type = 'rule_evaluation' and pe.entity_id = v_latest_evaluation_id)
      or (pe.entity_type = 'rra_info_sheet_service_evidence' and pe.entity_id in (
        select ese.id from public.rra_info_sheet_service_evidence ese
        where ese.obligation_instance_id = p_obligation_instance_id
      ))
      or (pe.entity_type = 'obligation_basis_review' and pe.entity_id in (
        select obr.id from public.obligation_basis_review obr
        where obr.obligation_instance_id = p_obligation_instance_id
      ))
    )
    and pe.event_type = any(v_expected_events);

  v_present_event_types := coalesce(v_present_event_types, array[]::text[]);

  select array_agg(evt)
  into v_missing_events
  from unnest(v_expected_events) evt
  where evt <> all(v_present_event_types);

  v_missing_events := coalesce(v_missing_events, array[]::text[]);

  -- For basis-changed obligations, verify the later evaluation also has its evaluation_run.
  -- The standard expected-event check cannot distinguish original vs later evaluation_run
  -- (both share the same event_type), so we check entity-level presence explicitly.
  if v_latest_evaluation_id is not null then
    if not exists (
      select 1 from public.provenance_events pe
      where pe.account_id = p_account_id
        and pe.entity_type = 'rule_evaluation'
        and pe.entity_id = v_latest_evaluation_id
        and pe.event_type = 'evaluation_run'
    ) then
      v_missing_events := v_missing_events || array['evaluation_run:basis_trigger_evaluation'];
    end if;
  end if;

  return jsonb_build_object(
    'evaluation', case when v_evaluation.id is not null then jsonb_build_object(
      'evaluation_id', v_evaluation.id,
      'result', v_evaluation.result,
      'confidence', v_evaluation.evaluation_confidence,
      'decision_path', to_jsonb(v_evaluation.decision_path),
      'input_snapshot_hash', v_evaluation.input_snapshot_hash,
      'evaluated_at', v_evaluation.evaluated_at,
      'demo_mode', v_evaluation.demo_mode,
      'reason_codes', to_jsonb(coalesce(v_evaluation.reason_codes, array[]::text[])),
      'impact_rule_version', v_evaluation.impact_rule_version
    ) else null end,
    'obligation', jsonb_build_object(
      'obligation_instance_id', v_obligation.id,
      'posture', v_obligation.posture,
      'obligation_kind', v_obligation.obligation_kind,
      'exposure_gbp_ceiling', v_obligation.exposure_gbp_ceiling,
      'created_at', v_obligation.created_at,
      'last_transition_at', v_obligation.last_transition_at
    ),
    'evidence', coalesce(v_evidence, '[]'::jsonb),
    'basis_review', v_basis_review,
    'provenance', coalesce(v_provenance, '[]'::jsonb),
    'status', jsonb_build_object(
      'evaluation_recorded', v_evaluation.id is not null,
      'obligation_created', true,
      'discharge_evidence_present', v_evidence is not null and jsonb_array_length(v_evidence) > 0,
      'provenance_trail_intact', v_provenance is not null and jsonb_array_length(v_provenance) > 0,
      'basis_review_required', v_basis_review is not null and (v_basis_review ->> 'review_required')::boolean is true,
      'evidence_missing', v_evidence is null or jsonb_array_length(v_evidence) = 0,
      'provenance_trace_status', jsonb_build_object(
        'expected_events_present', array_length(v_missing_events, 1) is null,
        'missing_event_types', to_jsonb(v_missing_events)
      ),
      'demo_mode', true,
      'gate_b_signed_off', false,
      'customer_facing_allowed', false,
      'pack_status_label', 'Demo proof pack — not legal sign-off'
    ),
    'property', case when v_property.id is not null then jsonb_build_object(
      'property_id', v_property.id,
      'address', v_property.address,
      'city', v_property.city
    ) else null end,
    'tenancy', case when v_tenancy.id is not null then jsonb_build_object(
      'lease_id', v_tenancy.id,
      'start_date', v_tenancy.lease_start_date,
      'end_date', v_tenancy.lease_end_date,
      'rent_amount', v_tenancy.rent_amount,
      'rent_frequency', v_tenancy.rent_frequency,
      'tenancy_class', v_tenancy.tenancy_class
    ) else null end
  );
end;
$$;

-- Revoke / grant block
revoke all on function public.get_obligation_proof_pack(uuid, uuid) from public;
grant execute on function public.get_obligation_proof_pack(uuid, uuid) to authenticated;

commit;
