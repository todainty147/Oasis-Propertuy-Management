-- compliance_safe_e084_interim_gate.sql
-- Branch B: E-084 OCR false-compliance safety gate.
-- Adds three verification columns to tenancy_compliance_items and defines
-- the RPC that the gate and Phase A-2 provenance wiring depend on.
--
-- Gate rule (enforced in JS, not SQL):
--   ocr_source_extraction_id IS NOT NULL AND human_verified_at IS NULL
--   → deriveComplianceItemStatus() returns 'needs_review' for any trusted-compliant status.
--   'expired' is intentionally excluded — an OCR-read past date is still a real past date.
--
-- Phase A-2.1: E-084 is CLOSED. record_compliance_value_human_verified now emits a
-- compliance_item.value_human_verified provenance event in the SAME TRANSACTION as the
-- verification write. No EXCEPTION handler between the UPDATE and the provenance INSERT,
-- so a provenance failure aborts the function and rolls back the verification write.

alter table public.tenancy_compliance_items
  add column if not exists ocr_source_extraction_id uuid null
    references public.document_extractions(id) on delete set null,
  add column if not exists human_verified_at timestamptz null,
  add column if not exists human_verified_by uuid null;
  -- human_verified_by is pseudonymous — not a FK on auth.users (same pattern as provenance actor_user_id).

-- Fast lookup for the review queue and CC badge: all OCR-sourced items that still need a human check.
create index if not exists tenancy_compliance_items_ocr_unverified_idx
  on public.tenancy_compliance_items(account_id, id)
  where ocr_source_extraction_id is not null and human_verified_at is null;

-- record_compliance_value_human_verified:
-- Called when a human operator confirms that the OCR-extracted value is correct.
-- Sets human_verified_at = now(), human_verified_by = calling user, lifting the E-084 gate.
-- Emits compliance_item.value_human_verified into the provenance ledger in the SAME TRANSACTION.
-- No EXCEPTION handler: provenance failure aborts the function → UPDATE rolls back.
create or replace function public.record_compliance_value_human_verified(
  p_account_id uuid,
  p_item_id    uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_ocr_id uuid;
begin
  perform public.assert_manage_account_access(p_account_id);

  -- Step 1: verification write
  update public.tenancy_compliance_items
  set
    human_verified_at = now(),
    human_verified_by = v_actor
  where id         = p_item_id
    and account_id = p_account_id
    and ocr_source_extraction_id is not null
  returning ocr_source_extraction_id into v_ocr_id;

  if not found then
    raise exception 'compliance item not found or not OCR-sourced';
  end if;

  -- Step 2: provenance anchor — NO EXCEPTION handler; failure rolls back Step 1.
  -- Explicit ::text casts required: PL/pgSQL string literals are 'unknown' and PostgreSQL
  -- cannot resolve the overload without casts when uuid params are also present.
  perform public._append_evidence_provenance_event(
    p_account_id,                        -- p_account_id uuid
    'compliance_item'::text,             -- p_entity_type text
    p_item_id,                           -- p_entity_id uuid
    'compliance_item.value_human_verified'::text, -- p_event_type text
    'human'::text,                       -- p_actor_type text
    v_actor,                             -- p_actor_user_id uuid
    coalesce(public.account_member_effective_role(p_account_id, v_actor), 'owner'), -- p_actor_role text
    now(),                               -- p_occurred_at timestamptz
    'Human verified OCR-extracted compliance value against source document'::text, -- p_summary text
    null::uuid,                          -- p_property_id uuid
    null::uuid,                          -- p_tenancy_id uuid
    jsonb_build_object('compliance_item_id', p_item_id, 'ocr_extraction_id', v_ocr_id, 'verified_at', now()) -- p_metadata jsonb
  );
end;
$$;

revoke all on function public.record_compliance_value_human_verified(uuid, uuid) from public, anon;
grant execute on function public.record_compliance_value_human_verified(uuid, uuid) to authenticated;

comment on function public.record_compliance_value_human_verified(uuid, uuid) is
  'E-084 Phase A-2.1: marks an OCR-sourced compliance value as human-verified and anchors a provenance event in the same transaction. Provenance failure aborts the verification write.';

-- record_compliance_verification_deny_test:
-- Test-only helper that mirrors the real function but passes an empty p_summary to
-- _append_evidence_provenance_event, which raises ''summary is required''. Because there
-- is no EXCEPTION handler, the UPDATE rolls back — proving atomicity.
-- This function must never be called in production code.
create or replace function public.record_compliance_verification_deny_test(
  p_account_id uuid,
  p_item_id    uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_ocr_id uuid;
begin
  perform public.assert_manage_account_access(p_account_id);

  update public.tenancy_compliance_items
  set
    human_verified_at = now(),
    human_verified_by = v_actor
  where id         = p_item_id
    and account_id = p_account_id
    and ocr_source_extraction_id is not null
  returning ocr_source_extraction_id into v_ocr_id;

  if not found then
    raise exception 'compliance item not found or not OCR-sourced';
  end if;

  -- Deliberate failure: empty p_summary raises 'summary is required';
  -- no handler → UPDATE above rolls back.
  -- Explicit ::text casts required: PL/pgSQL string literals are 'unknown' (see real function above).
  perform public._append_evidence_provenance_event(
    p_account_id,                        -- p_account_id uuid
    'compliance_item'::text,             -- p_entity_type text
    p_item_id,                           -- p_entity_id uuid
    'compliance_item.value_human_verified'::text, -- p_event_type text
    'human'::text,                       -- p_actor_type text
    v_actor,                             -- p_actor_user_id uuid
    'owner'::text,                       -- p_actor_role text
    now(),                               -- p_occurred_at timestamptz
    ''::text                             -- p_summary text intentionally empty → raises 'summary is required'
  );
end;
$$;

revoke all on function public.record_compliance_verification_deny_test(uuid, uuid) from public, anon;
grant execute on function public.record_compliance_verification_deny_test(uuid, uuid) to authenticated;

comment on function public.record_compliance_verification_deny_test(uuid, uuid) is
  'E-084 test-only atomicity probe: forces provenance failure via empty summary; confirms verification UPDATE rolls back. Must not be called in production.';
