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
-- E-084 is recorded as REDUCED, not CLOSED.
-- Phase A-2 will wire the provenance event inside record_compliance_value_human_verified.

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
-- Phase A-2 will add a provenance event here; until then E-084 is REDUCED not CLOSED.
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
  v_actor uuid := auth.uid();
begin
  perform public.assert_manage_account_access(p_account_id);

  update public.tenancy_compliance_items
  set
    human_verified_at = now(),
    human_verified_by = v_actor
  where id        = p_item_id
    and account_id = p_account_id
    and ocr_source_extraction_id is not null;

  if not found then
    raise exception 'compliance item not found or not OCR-sourced';
  end if;
end;
$$;

revoke all on function public.record_compliance_value_human_verified(uuid, uuid) from public, anon;
grant execute on function public.record_compliance_value_human_verified(uuid, uuid) to authenticated;

comment on function public.record_compliance_value_human_verified(uuid, uuid) is
  'E-084 interim gate: marks an OCR-sourced compliance value as human-verified. Phase A-2 will append a provenance event here to close E-084.';
