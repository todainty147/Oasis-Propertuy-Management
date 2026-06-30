-- ============================================================
-- E-144 Evidence → Provenance Integration — Design Spike Skeleton
-- ============================================================
--
-- Status: INERT SKELETON. Not wired to any production flow.
--   Consumer wiring is gated on E-144 implementation decision.
--
-- Purpose:
--   Defines the minimal shared integration surface between the evidence layer
--   (inspection reports, signatures, OCR, compliance, proof packs) and the
--   existing provenance ledger (provenance_events.sql, provenance_document_service.sql).
--
-- The substrate is already generic. This file adds:
--   1. Allowed evidence event type taxonomy (documented, not enforced by constraint).
--   2. A generic internal helper _append_evidence_provenance_event that accepts
--      any entity_type — unlike _append_document_provenance_event which hardcodes
--      entity_type='document'. Not callable from RLS-guarded surfaces.
--   3. A stub RPC record_evidence_event (disabled by default) that is the proposed
--      entry point for anchor-additive evidence events.
--   4. A content_hash helper for computing report/signature state hashes server-side.
--
-- Taxonomy rule (hard constraint from E-144 brief):
--   No event type name may assert a legal or regulatory conclusion the system
--   cannot mechanically verify. Names attest WHAT HAPPENED, never what it legally means.
--   See Section 3 of the design report for the full overclaim test per event.
--
-- This file MUST run after:
--   provenance_events.sql
--   provenance_document_service.sql
-- ============================================================

-- ─── §1. Event type taxonomy (documentation — not a DB constraint) ────────────
--
-- Evidence entity types supported:
--   'document'            — handled by provenance_document_service.sql
--   'inspection_report'   — this file (stub)
--   'inspection_evidence' — this file (stub)
--   'inspection_signature'— this file (stub)
--   'compliance_item'     — this file (stub)
--   'proof_pack'          — this file (stub)
--
-- Taxonomy (all event names checked against the legal/regulatory overclaim rule):
--
-- document.*              — already in provenance_document_service.sql:
--   document.uploaded
--   document.served_asserted     (GOOD: "asserted" — never "served" or "validly_served")
--   document.served_system       (GOOD: "system" denotes the send act, not legal validity)
--   document.delivery_confirmed  (GOOD: "confirmed" by provider, not legal validity)
--   document.service_failed
--   document.available
--   document.viewed
--   document.downloaded
--   document.acknowledged
--   document.expired
--   document.replaced
--   document.withdrawn
--
-- inspection_report.*:
--   inspection_report.created
--   inspection_report.locked           (GOOD: mechanical state — "locked" not "legally immutable")
--   inspection_report.archived
--   inspection_report.shared_with_tenant
--   inspection_report.lock_superseded  (correction event when locked report header must change)
--   inspection_report.deleted          (if delete-block E-032 is not yet live — audit trail)
--
-- inspection_evidence.*:
--   inspection_evidence.attached       (photo/item added — anchor-additive)
--   inspection_evidence.scan_completed (antivirus gate passed — anchor-additive)
--   inspection_evidence.scan_clean     (scan_status=clean — anchor-additive, NOT "safe")
--   inspection_evidence.superseded     (item replaced — references prior event)
--
-- signature.*:
--   signature.captured        (GOOD: "captured" — never "legally_executed" or "binding")
--   signature.invalidated     (if signed-not-locked mutation detected — correction event)
--   signature.superseded      (if report was mutated after signing — correction)
--   NOTE: anchor-atomic. signature.captured is ONLY meaningful if it captures the
--   report content hash AT THE INSTANT OF SIGNING. Anchoring afterward attests the wrong
--   state. This is the most critical anchor-atomic event family in the evidence layer.
--
-- service_event.*  (replacing the bare served_at timestamp gap in E-035):
--   Already covered by document.served_asserted / document.served_system in Sprint 3.
--   No separate service_event.* namespace needed for document service.
--   For compliance item service acts, use compliance_item.service_recorded (see below).
--
-- ocr.*:
--   ocr.extraction_completed   (GOOD: "completed" — never "validated" or "confirmed")
--   ocr.extraction_stale       (source file changed — prior extraction obsolete)
--   ocr.value_human_verified   (GOOD: "human_verified" — the verification ACT, not the result)
--   NOTE: ocr.value_human_verified is anchor-atomic: the verification act itself
--   is the evidence. Anchoring after the fact (e.g. on page load) would attest nothing.
--
-- compliance_item.*:
--   compliance_item.evidence_linked      (document attached to compliance item)
--   compliance_item.service_recorded     (landlord recorded service — never "validly_served")
--   compliance_item.value_human_verified (expiry date verified against source document)
--   compliance_item.acknowledged         (tenant acknowledgement captured)
--   compliance_item.expired
--   compliance_item.legal_hold_applied   (GOOD: mechanical state — a hold was applied)
--   compliance_item.legal_hold_released
--
-- proof_pack.*:
--   proof_pack.assembled           (pack created — anchor-additive)
--   proof_pack.exported            (pack printed/exported — anchor-additive)
--   proof_pack.source_set_frozen   (artifact list frozen at a point in time)
--   proof_pack.locked
--
-- deposit_dispute_pack.*:
--   deposit_dispute_pack.created
--   deposit_dispute_pack.exported         (replaces fire-and-forget recordDepositDisputePackExport)
--   deposit_dispute_pack.locked
--   deposit_dispute_pack.disclosure_basis_recorded  (why this pack was assembled/exported)
--
-- legal_hold.*:
--   legal_hold.applied          (GOOD: mechanical state)
--   legal_hold.released
--   legal_hold.scope_changed
--
-- ─── §2. Generic internal evidence helper ────────────────────────────────────
--
-- Extends the pattern of _append_document_provenance_event to accept any entity_type.
-- Used by entity-specific public functions (record_inspection_report_locked, etc.)
-- NOT exposed to RLS-guarded callers directly.

create or replace function public._append_evidence_provenance_event(
  p_account_id    uuid,
  p_entity_type   text,    -- e.g. 'inspection_report', 'signature', 'compliance_item'
  p_entity_id     uuid,
  p_event_type    text,    -- from taxonomy above
  p_actor_type    text,    -- 'human' | 'system' | 'ai' | 'integration'
  p_actor_user_id uuid,
  p_actor_role    text,
  p_occurred_at   timestamptz,
  p_summary       text,
  p_property_id   uuid         default null,
  p_tenancy_id    uuid         default null,
  p_metadata      jsonb        default '{}'::jsonb,
  p_source_type   text         default null,
  p_source_id     uuid         default null,
  p_visibility    text         default 'internal',
  p_idempotency_key text       default null,
  p_supersedes_event_id uuid   default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := gen_random_uuid();
  v_sequence_number bigint;
  v_existing_event public.provenance_events%rowtype;
begin
  -- Entity type must not be empty
  if nullif(btrim(p_entity_type), '') is null then
    raise exception 'entity_type is required';
  end if;

  -- Event type must not be empty
  if nullif(btrim(p_event_type), '') is null then
    raise exception 'event_type is required';
  end if;

  -- Summary must not be empty
  if nullif(btrim(p_summary), '') is null then
    raise exception 'summary is required';
  end if;

  -- Serialization: per-account advisory lock (same pattern as finance and document events)
  perform pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0);

  -- Idempotency check
  if p_idempotency_key is not null then
    select *
      into v_existing_event
      from public.provenance_events
     where account_id    = p_account_id
       and idempotency_key = p_idempotency_key;

    if found then
      return v_existing_event.id;
    end if;
  end if;

  -- Allocate sequence number
  insert into public.provenance_event_counters(account_id, next_sequence)
  values (p_account_id, 2)
  on conflict (account_id) do update
    set next_sequence = public.provenance_event_counters.next_sequence + 1
  returning next_sequence - 1 into v_sequence_number;

  -- Insert — hash computed by trg_provenance_events_compute_hash BEFORE INSERT
  insert into public.provenance_events (
    id, account_id, sequence_number,
    entity_type, entity_id, property_id, tenancy_id,
    event_type, event_version,
    actor_type, actor_user_id, actor_role,
    occurred_at, recorded_at,
    summary, metadata,
    source_type, source_id,
    supersedes_event_id,
    visibility,
    previous_event_hash, event_hash, hash_version,
    idempotency_key, created_at
  ) values (
    v_event_id, p_account_id, v_sequence_number,
    p_entity_type, p_entity_id, p_property_id, p_tenancy_id,
    p_event_type, 1,
    p_actor_type,
    case when p_actor_type = 'human' then p_actor_user_id else null end,
    p_actor_role,
    p_occurred_at, now(),
    p_summary, coalesce(p_metadata, '{}'::jsonb),
    p_source_type, p_source_id,
    p_supersedes_event_id,
    coalesce(nullif(btrim(p_visibility), ''), 'internal'),
    null, null, 0,
    p_idempotency_key, now()
  );

  return v_event_id;
end;
$$;

-- Internal only — no grants to authenticated or service_role.
revoke all on function public._append_evidence_provenance_event(
  uuid, text, uuid, text, text, uuid, text, timestamptz, text,
  uuid, uuid, jsonb, text, uuid, text, text, uuid
) from public, anon, authenticated, service_role;

comment on function public._append_evidence_provenance_event(
  uuid, text, uuid, text, text, uuid, text, timestamptz, text,
  uuid, uuid, jsonb, text, uuid, text, text, uuid
) is
  'Generic internal helper for non-document evidence events. '
  'Accepts any entity_type (inspection_report, signature, compliance_item, etc.). '
  'Delegates hash computation to trg_provenance_events_compute_hash. '
  'E-144 skeleton — not yet wired to production flows.';

-- ─── §3. Content-hash helper ──────────────────────────────────────────────────
--
-- Computes a SHA-256 hex hash of the canonical representation of a JSON object.
-- Used to bind signatures and proof pack exports to a specific report/document state.
-- Callers should pass the serialised row payload they want to commit to.

create or replace function public.provenance_content_hash(
  p_payload jsonb
) returns text
language sql
immutable
parallel safe
as $$
  select encode(
    extensions.digest(
      convert_to(p_payload::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function public.provenance_content_hash(jsonb)
  from public, anon, authenticated;

comment on function public.provenance_content_hash(jsonb) is
  'Compute SHA-256 hex of a JSONB payload. '
  'Used by signature.captured and inspection_report.locked to bind events to specific content states. '
  'E-144 skeleton.';

-- ─── §4. Stub public RPCs (DISABLED — not callable) ──────────────────────────
--
-- Signatures only. No GRANT to authenticated or service_role.
-- These are the proposed entry points for anchor-additive evidence events.
-- Consumer wiring must go through separate implementation prompts.
--
-- TODO(E-144): Wire these after decision gate.

-- record_inspection_report_locked:
--   Anchor-atomic: must be called INSIDE the same transaction that sets
--   inspection_reports.status = 'locked'. The metadata.report_content_hash
--   must capture the report state at that instant.
--   Consumer: add call to legalSecurityService.js lockInspectionReport().

create or replace function public.record_inspection_report_locked(
  p_inspection_report_id uuid,
  p_report_content_hash  text,    -- SHA-256 hex of the report's canonical JSON state
  p_lock_reason          text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  -- TODO(E-144): implement once decision gate clears.
  -- This stub is intentionally unreachable: no GRANT has been issued.
  raise exception 'record_inspection_report_locked: not yet implemented (E-144 stub)';
end;
$$;

revoke all on function public.record_inspection_report_locked(uuid, text, text)
  from public, anon, authenticated, service_role;

comment on function public.record_inspection_report_locked(uuid, text, text) is
  'Anchor-atomic: must be called in the same transaction as inspection_reports status=locked. '
  'report_content_hash = provenance_content_hash(canonical_report_jsonb). '
  'E-144 stub — not callable (no GRANT). Wire after decision gate.';

-- record_signature_captured:
--   Anchor-atomic: must be called INSIDE the same transaction that inserts
--   inspection_signatures. report_content_hash captures the report state
--   at the instant of signing — not after.
--   Consumer: add call to legalSecurityService.js inside signature insert RPC.

create or replace function public.record_signature_captured(
  p_inspection_report_id uuid,
  p_signature_id         uuid,
  p_signer_role          text,    -- 'landlord' | 'tenant'
  p_signed_from          text,    -- 'landlord_portal' | 'tenant_portal'
  p_report_content_hash  text,    -- SHA-256 hex of canonical report state AT signing time
  p_share_id             uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'record_signature_captured: not yet implemented (E-144 stub)';
end;
$$;

revoke all on function public.record_signature_captured(uuid, uuid, text, text, text, uuid)
  from public, anon, authenticated, service_role;

comment on function public.record_signature_captured(uuid, uuid, text, text, text, uuid) is
  'Anchor-atomic: must be called in the same transaction as inspection_signatures INSERT. '
  'report_content_hash must be computed BEFORE the insert (over the current report state). '
  'E-144 stub — not callable (no GRANT). Wire after decision gate.';

-- record_compliance_value_human_verified:
--   Anchor-atomic: the human_verified event IS the evidence. Anchoring after page
--   load attests nothing — the manager may have changed the value.
--   Consumer: add to ComplianceSafePage.jsx verification confirmation flow.

create or replace function public.record_compliance_value_human_verified(
  p_compliance_item_id    uuid,
  p_verified_field        text,    -- e.g. 'expires_at'
  p_verified_value        text,    -- the value the human confirmed against the source document
  p_source_document_id    uuid default null,
  p_ocr_extraction_id     uuid default null  -- links to document_extractions row if OCR was involved
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'record_compliance_value_human_verified: not yet implemented (E-144 stub)';
end;
$$;

revoke all on function public.record_compliance_value_human_verified(uuid, text, text, uuid, uuid)
  from public, anon, authenticated, service_role;

comment on function public.record_compliance_value_human_verified(uuid, text, text, uuid, uuid) is
  'Anchor-atomic: anchors the human verification act. '
  'Closes the OCR auto-trust gap (E-018/E-084): links verified value to the source document '
  'and OCR extraction row, so the ledger distinguishes human-verified from OCR-assumed values. '
  'E-144 stub — not callable (no GRANT). Wire after decision gate.';

-- record_proof_pack_exported:
--   Anchor-additive: can be recorded slightly after the export event.
--   Must include content_hash of the assembled artifact list.
--   Consumer: replaces fire-and-forget recordDepositDisputePackExport().

create or replace function public.record_proof_pack_exported(
  p_pack_id              uuid,
  p_pack_type            text,    -- 'deposit_dispute_pack' | 'inspection_report_pack'
  p_export_type          text,    -- 'pdf' | 'browser_print'
  p_content_hash         text,    -- SHA-256 of assembled artifact list
  p_disclosure_basis     text default null,  -- why this pack was exported
  p_artifact_count       integer default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'record_proof_pack_exported: not yet implemented (E-144 stub)';
end;
$$;

revoke all on function public.record_proof_pack_exported(uuid, text, text, text, text, integer)
  from public, anon, authenticated, service_role;

comment on function public.record_proof_pack_exported(uuid, text, text, text, text, integer) is
  'Anchor-additive: replaces fire-and-forget export recording with ledger-anchored event. '
  'content_hash = SHA-256 of the ordered list of artifact IDs + version IDs included in the pack. '
  'disclosure_basis is the reason the pack was assembled/exported (closes E-036 gap). '
  'E-144 stub — not callable (no GRANT). Wire after decision gate.';
