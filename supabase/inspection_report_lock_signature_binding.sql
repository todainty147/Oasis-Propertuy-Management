-- ============================================================
-- Phase A-2.2 / E-033: Inspection Report Lock + Signature Binding
-- ============================================================
--
-- Implements:
--   1. canonical_inspection_report_hash — deterministic SHA-256 over report
--      content only. Status/locked_at/locked_by EXCLUDED (E-152 fix).
--   2. record_inspection_report_locked — replaces E-144 stub; fires
--      inspection_report.locked provenance event (internal, REVOKE ALL).
--   3. record_signature_captured — replaces E-144 stub; fires
--      signature.captured provenance event (internal, REVOKE ALL).
--   4. lock_inspection_report — atomic public RPC; sole authority to set
--      inspection_reports.status = 'locked'.
--   5. capture_inspection_signature — atomic public RPC; single writer for
--      ALL inspection signatures (manager + tenant/share paths). Inserts
--      signature and anchors content hash before INSERT.
--   6. trg_enforce_lock_via_rpc — trigger that blocks status='locked' outside
--      the RPC (Pin 1 bypass prevention).
--   7. Mutation-after-signature freeze — extends existing item/photo triggers
--      to include 'signed' status (Pin 3 gap closure).
--   8. Atomicity deny-test helpers — integration test utilities.
--   9. Table constraints: signer_type CHECK, per-share uniqueness index.
--  10. RLS tightening: strip INSERT from manager policy; drop tenant direct-
--      insert policy. All writes go through capture_inspection_signature.
--
-- E-152 canonical hash shape (content only, not workflow state):
--   For signature.captured: hash BEFORE the signature INSERT.
--     Includes pre-existing signatures; EXCLUDES the one being captured.
--   For inspection_report.locked: hash BEFORE the status UPDATE.
--     Includes ALL signatures at lock time.
--   status / locked_at / locked_by / raw signature blob / the new signature
--   itself are ALL excluded from the hash. Workflow state is stored in
--   provenance event metadata only (workflow_status_at_signing /
--   workflow_status_at_lock).
--
-- E-033 authorization model (one writer, two auth domains):
--   Manager path  (p_share_id IS NULL):
--     user_can_manage_account(p_account_id) required.
--     signer_role forced 'landlord'; signed_from forced 'landlord_portal'.
--     signer_type may be 'landlord' or 'agent' (p_signer_type param).
--   Tenant/share path (p_share_id IS NOT NULL):
--     Active share verified; share.tenant must match auth.uid().
--     signer_type/signer_role/signed_from/tenant_id server-derived.
--     Client-provided values for those fields are ignored.
--
-- MUST run after evidence_provenance_stub.sql in OVERLAY_SEQUENCE.
-- ============================================================

begin;

set local check_function_bodies = off;

-- ─── §1. canonical_inspection_report_hash ─────────────────────────────────────
-- Canonical SHA-256 of the inspection report CONTENT at call time.
-- Includes:
--   report header (id, account_id, property_id, tenant_id, inspection_type,
--                  title, inspection_date) — NOT status/locked_at/locked_by
--   + rooms (ordered by sort_order asc, id asc)
--     + items (ordered by sort_order asc, id asc)
--       + photos (ordered by captured_at asc, id asc)
--   + pre-existing signatures (ordered by signed_at asc, id asc)
--
-- E-152 exclusions:
--   status        — workflow state, not document content
--   locked_at     — set by the lock act itself
--   locked_by     — set by the lock act itself
--   signature_data — raw blob
-- The newly inserted signature is excluded by calling BEFORE the write.
-- Internal only — REVOKE ALL from authenticated.

create or replace function public.canonical_inspection_report_hash(
  p_report_id uuid
) returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  select jsonb_build_object(
    'report', jsonb_build_object(
      'id',              r.id,
      'account_id',      r.account_id,
      'property_id',     r.property_id,
      'tenant_id',       r.tenant_id,
      'inspection_type', r.inspection_type,
      -- status excluded (E-152): workflow state, not content identity
      -- locked_at / locked_by excluded: set by the lock act itself
      'title',           r.title,
      'inspection_date', r.inspection_date
    ),
    'rooms', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',         rm.id,
            'room_name',  rm.room_name,
            'sort_order', rm.sort_order,
            'items', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id',               ei.id,
                    'item_label',       ei.item_label,
                    'condition_rating', ei.condition_rating,
                    'notes',            ei.notes,
                    'sort_order',       ei.sort_order,
                    'photos', coalesce(
                      (
                        select jsonb_agg(
                          jsonb_build_object(
                            'id',           ph.id,
                            'document_id',  ph.document_id,
                            'storage_path', ph.storage_path,
                            'caption',      ph.caption,
                            'captured_at',  ph.captured_at
                          )
                          order by ph.captured_at asc, ph.id asc
                        )
                        from public.inspection_photos ph
                        where ph.evidence_item_id = ei.id
                      ),
                      '[]'::jsonb
                    )
                  )
                  order by ei.sort_order asc, ei.id asc
                )
                from public.inspection_evidence_items ei
                where ei.inspection_room_id = rm.id
              ),
              '[]'::jsonb
            )
          )
          order by rm.sort_order asc, rm.id asc
        )
        from public.inspection_rooms rm
        where rm.inspection_report_id = r.id
      ),
      '[]'::jsonb
    ),
    'signatures', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',               sig.id,
            'signer_role',      sig.signer_role,
            'signer_type',      sig.signer_type,
            'signer_name',      sig.signer_name,
            'signed_at',        sig.signed_at,
            'signed_from',      sig.signed_from,
            'signature_status', sig.signature_status
          )
          order by sig.signed_at asc, sig.id asc
        )
        from public.inspection_signatures sig
        where sig.inspection_report_id = r.id
      ),
      '[]'::jsonb
    )
  )
  into v_payload
  from public.inspection_reports r
  where r.id = p_report_id;

  if v_payload is null then
    raise exception 'inspection report not found: %', p_report_id;
  end if;

  return public.provenance_content_hash(v_payload);
end;
$$;

revoke all on function public.canonical_inspection_report_hash(uuid)
  from public, anon, authenticated, service_role;

comment on function public.canonical_inspection_report_hash(uuid) is
  'E-152: Deterministic SHA-256 of inspection report CONTENT only. '
  'Excludes status, locked_at, locked_by, raw signature blobs. '
  'Must be called BEFORE the write being attested. '
  'Phase A-2.2 / E-033 / E-152.';

-- ─── §2. get_inspection_report_content_hash ──────────────────────────────────
-- Account-guarded public accessor for canonical_inspection_report_hash.
-- Used by integration tests for non-circular timing proof.

create or replace function public.get_inspection_report_content_hash(
  p_account_id uuid,
  p_report_id  uuid
) returns text
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
    select 1 from public.inspection_reports
    where id = p_report_id and account_id = p_account_id
  ) then
    raise exception 'Inspection report not found for account';
  end if;

  return public.canonical_inspection_report_hash(p_report_id);
end;
$$;

revoke all on function public.get_inspection_report_content_hash(uuid, uuid) from public;
grant execute on function public.get_inspection_report_content_hash(uuid, uuid) to authenticated;

-- ─── §3. record_inspection_report_locked (replaces E-144 stub) ───────────────
-- Internal anchor: fires inspection_report.locked provenance event.
-- Called exclusively from lock_inspection_report — no public grant.
-- p_workflow_status = pre-lock report status (e.g. 'signed', 'ready_for_signature').
-- Stored in metadata only — not in the content hash (E-152).

drop function if exists public.record_inspection_report_locked(uuid, text, text);

create or replace function public.record_inspection_report_locked(
  p_inspection_report_id uuid,
  p_report_content_hash  text,
  p_lock_reason          text default null,
  p_workflow_status      text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report     public.inspection_reports%rowtype;
  v_sig_count  bigint;
  v_event_id   uuid;
begin
  select * into v_report
  from public.inspection_reports
  where id = p_inspection_report_id;

  if not found then
    raise exception 'inspection_report not found: %', p_inspection_report_id;
  end if;

  select count(*) into v_sig_count
  from public.inspection_signatures
  where inspection_report_id = p_inspection_report_id;

  v_event_id := public._append_evidence_provenance_event(
    p_account_id          := v_report.account_id,
    p_entity_type         := 'inspection_report'::text,
    p_entity_id           := p_inspection_report_id,
    p_event_type          := 'inspection_report.locked'::text,
    p_actor_type          := 'human'::text,
    p_actor_user_id       := auth.uid(),
    p_actor_role          := public.account_member_effective_role(v_report.account_id, auth.uid()),
    p_occurred_at         := now(),
    p_summary             := 'Inspection report locked; content hash anchored to provenance ledger'::text,
    p_property_id         := v_report.property_id,
    p_tenancy_id          := null::uuid,
    p_metadata            := jsonb_build_object(
      'report_id',              p_inspection_report_id,
      'account_id',             v_report.account_id,
      'inspection_type',        v_report.inspection_type,
      'locked_by',              auth.uid(),
      'lock_reason',            p_lock_reason,
      'content_hash',           p_report_content_hash,
      'hash_algorithm',         'sha256',
      'signature_count',        v_sig_count,
      'workflow_status_at_lock', p_workflow_status,
      'hash_note',              'content-only hash: excludes status, locked_at, locked_by (E-152); includes all signatures present at lock time'
    ),
    p_source_type         := 'inspection_report'::text,
    p_source_id           := p_inspection_report_id,
    p_visibility          := 'internal'::text,
    p_idempotency_key     := ('inspection_report.locked:' || p_inspection_report_id::text)::text,
    p_supersedes_event_id := null::uuid
  );

  return v_event_id;
end;
$$;

revoke all on function public.record_inspection_report_locked(uuid, text, text, text)
  from public, anon, authenticated, service_role;

-- ─── §4. record_signature_captured (replaces E-144 stub) ─────────────────────
-- Internal anchor: fires signature.captured provenance event.
-- Called exclusively from capture_inspection_signature — no public grant.
-- Hash MUST have been computed by the caller BEFORE the signature INSERT.
--
-- metadata.signature_count = count of pre-existing signatures BEFORE capture
-- (computed here as total_count - 1 since called post-INSERT).
-- p_workflow_status = pre-signing report status. Stored in metadata only (E-152).

drop function if exists public.record_signature_captured(uuid, uuid, text, text, text, uuid);

create or replace function public.record_signature_captured(
  p_inspection_report_id uuid,
  p_signature_id         uuid,
  p_signer_role          text,
  p_signed_from          text,
  p_report_content_hash  text,
  p_share_id             uuid    default null,
  p_tenant_id            uuid    default null,
  p_signer_type          text    default null,
  p_workflow_status      text    default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report          public.inspection_reports%rowtype;
  v_prior_sig_count bigint;
  v_event_id        uuid;
begin
  select * into v_report
  from public.inspection_reports
  where id = p_inspection_report_id;

  if not found then
    raise exception 'inspection_report not found: %', p_inspection_report_id;
  end if;

  -- Called after INSERT; total count - 1 = pre-capture count.
  select greatest(count(*) - 1, 0) into v_prior_sig_count
  from public.inspection_signatures
  where inspection_report_id = p_inspection_report_id;

  -- Test-only fault-injection gate. Default: off (current_setting returns null).
  -- When 'on', raises exception to prove atomicity of the production RPC.
  -- Must RAISE — never skip — so the transaction always rolls back.
  -- Inert in normal use because the GUC is never set outside the test harness.
  if current_setting('app.test_force_signature_provenance_failure', true) = 'on' then
    raise exception 'test_force_signature_provenance_failure: forced provenance failure for atomicity proof';
  end if;

  v_event_id := public._append_evidence_provenance_event(
    p_account_id          := v_report.account_id,
    p_entity_type         := 'inspection_signature'::text,
    p_entity_id           := p_signature_id,
    p_event_type          := 'signature.captured'::text,
    p_actor_type          := 'human'::text,
    p_actor_user_id       := auth.uid(),
    p_actor_role          := coalesce(
                               public.account_member_effective_role(v_report.account_id, auth.uid()),
                               p_signer_role
                             ),
    p_occurred_at         := now(),
    p_summary             := 'Signature captured; report content hash anchored at time of signing'::text,
    p_property_id         := v_report.property_id,
    p_tenancy_id          := null::uuid,
    p_metadata            := jsonb_build_object(
      'report_id',                p_inspection_report_id,
      'account_id',               v_report.account_id,
      'signature_id',             p_signature_id,
      'signer_role',              p_signer_role,
      'signer_type',              p_signer_type,
      'signed_from',              p_signed_from,
      'tenant_id',                p_tenant_id,
      'share_id',                 p_share_id,
      'report_content_hash',      p_report_content_hash,
      'hash_algorithm',           'sha256',
      'hash_timing',              'pre_signature_insert',
      'signature_count',          v_prior_sig_count,
      'workflow_status_at_signing', p_workflow_status,
      'hash_note',                'content-only hash: excludes status, locked_at, locked_by (E-152); excludes the signature being captured; includes prior signatures'
    ),
    p_source_type         := 'inspection_report'::text,
    p_source_id           := p_inspection_report_id,
    p_visibility          := 'internal'::text,
    p_idempotency_key     := ('signature.captured:' || p_signature_id::text)::text,
    p_supersedes_event_id := null::uuid
  );

  return v_event_id;
end;
$$;

revoke all on function public.record_signature_captured(uuid, uuid, text, text, text, uuid, uuid, text, text)
  from public, anon, authenticated, service_role;

-- ─── §5. lock_inspection_report (atomic public RPC) ──────────────────────────
-- The sole authority for setting inspection_reports.status = 'locked'.
-- Uses set_config to authorize the UPDATE through trg_enforce_lock_via_rpc.
-- No EXCEPTION handler between the UPDATE and the provenance call — failure
-- in either rolls back the entire transaction.
-- Passes pre-lock status as p_workflow_status (E-152: stored in metadata, not hash).

create or replace function public.lock_inspection_report(
  p_account_id  uuid,
  p_report_id   uuid,
  p_lock_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report   public.inspection_reports%rowtype;
  v_hash     text;
  v_event_id uuid;
begin
  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Not authorized for account';
  end if;

  select * into v_report
  from public.inspection_reports
  where id = p_report_id
    and account_id = p_account_id
  for update;

  if not found then
    raise exception 'Inspection report not found for account';
  end if;

  if v_report.status in ('locked', 'archived') then
    raise exception 'Inspection report is already % — cannot lock again', v_report.status;
  end if;

  -- Hash computed BEFORE status change (E-152: status not in hash).
  -- Captures fully-signed report content including all existing signatures.
  v_hash := public.canonical_inspection_report_hash(p_report_id);

  -- Authorize the UPDATE to bypass trg_enforce_lock_via_rpc.
  perform set_config('inspection.lock_authorized', 'true', true);

  update public.inspection_reports
  set status    = 'locked',
      locked_at = now(),
      locked_by = auth.uid()
  where id = p_report_id;

  -- Revoke immediately — no subsequent UPDATE in this transaction can bypass.
  perform set_config('inspection.lock_authorized', '', true);

  insert into public.inspection_audit_events (
    account_id, inspection_report_id, user_id, event_type, metadata
  ) values (
    p_account_id, p_report_id, auth.uid(), 'report_locked',
    jsonb_build_object('lock_reason', p_lock_reason)
  );

  -- E-153 lock-half test-only fault-injection gate. Inert when GUC is absent/false (default).
  -- When armed by the deny-test wrapper (transaction-local 'on'), raises AFTER the
  -- inspection_reports UPDATE and audit INSERT are staged in-transaction, proving the
  -- full rollback includes the lock UPDATE and any subsequent provenance event.
  -- Must RAISE — never skip, no-op, or branch around the real provenance call.
  if current_setting('app.test_force_inspection_lock_provenance_failure', true) = 'on' then
    raise exception 'forced inspection lock provenance failure for E-153 lock-half deny-test';
  end if;

  -- No EXCEPTION handler — provenance failure rolls back the UPDATE above.
  -- Pass v_report.status (pre-lock status) for workflow metadata.
  v_event_id := public.record_inspection_report_locked(
    p_inspection_report_id := p_report_id,
    p_report_content_hash  := v_hash,
    p_lock_reason          := p_lock_reason,
    p_workflow_status      := v_report.status
  );

  return jsonb_build_object(
    'event_id',     v_event_id,
    'report_id',    p_report_id,
    'content_hash', v_hash,
    'status',       'locked',
    'locked_by',    auth.uid()
  );
end;
$$;

revoke all on function public.lock_inspection_report(uuid, uuid, text) from public;
grant execute on function public.lock_inspection_report(uuid, uuid, text) to authenticated;

-- ─── §6. capture_inspection_signature (atomic public RPC) ────────────────────
-- Single writer for ALL inspection signatures (E-033).
-- Two authorization domains, one write path:
--
--   Manager path (p_share_id IS NULL):
--     • requires user_can_manage_account(p_account_id)
--     • signer_role forced to 'landlord'; signed_from forced to 'landlord_portal'
--     • p_signer_type may be 'landlord' or 'agent' (defaults to 'landlord')
--     • managers CANNOT fabricate tenant-portal signatures
--
--   Tenant/share path (p_share_id IS NOT NULL):
--     • validates active share ownership against auth.uid()
--     • signer_type, signer_role, signed_from, tenant_id are SERVER-DERIVED
--     • client-provided p_signer_role / p_signed_from / p_signer_type are ignored
--
-- Hash computed BEFORE INSERT (excludes new signature, E-152: excludes status).
-- No EXCEPTION handler between INSERT and provenance call — failure rolls back both.

-- Drop old 7-param signature to allow new parameter layout.
drop function if exists public.capture_inspection_signature(uuid, uuid, text, text, text, text, uuid);

create or replace function public.capture_inspection_signature(
  p_account_id     uuid,
  p_report_id      uuid,
  p_signer_name    text,
  p_signature_data text    default null,
  p_share_id       uuid    default null,
  p_signer_role    text    default 'landlord',
  p_signed_from    text    default 'landlord_portal',
  p_signer_type    text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report                public.inspection_reports%rowtype;
  v_share                 public.inspection_report_shares%rowtype;
  v_tenant                public.tenants%rowtype;
  v_sig_id                uuid;
  v_hash                  text;
  v_event_id              uuid;
  v_effective_signer_role text;
  v_effective_signed_from text;
  v_effective_signer_type text;
  v_effective_tenant_id   uuid;
  v_workflow_status       text;
begin
  if nullif(btrim(p_signer_name), '') is null then
    raise exception 'signer_name is required';
  end if;

  -- ── Authorization branch ─────────────────────────────────────────────────────
  if p_share_id is not null then
    -- ── Tenant/share path ──────────────────────────────────────────────────────
    -- Validate active share. Lock the row to prevent concurrent double-sign.
    select * into v_share
    from public.inspection_report_shares
    where id = p_share_id
      and inspection_report_id = p_report_id
      and account_id = p_account_id
      and revoked_at is null
      and share_status not in ('revoked', 'expired')
    for update;

    if not found then
      raise exception 'No active share found for this report';
    end if;

    -- Verify the calling user IS the share's tenant.
    select * into v_tenant
    from public.tenants
    where id = v_share.tenant_id
      and account_id = p_account_id
      and archived_at is null;

    if not found then
      raise exception 'Tenant not found for share';
    end if;

    if v_tenant.user_id is distinct from auth.uid() then
      raise exception 'Not authorized — caller is not the share tenant';
    end if;

    -- Server-derive all identity fields. Client-provided p_signer_role,
    -- p_signed_from, p_signer_type are intentionally ignored on this path.
    v_effective_signer_type := 'tenant';
    v_effective_signer_role := 'tenant';
    v_effective_signed_from := 'tenant_portal';
    v_effective_tenant_id   := v_share.tenant_id;

  else
    -- ── Manager/landlord path ──────────────────────────────────────────────────
    if not public.user_can_manage_account(p_account_id) then
      raise exception 'Not authorized for account';
    end if;

    -- Manager path is locked to landlord_portal. Prevents fabricating
    -- tenant-portal signatures from the manager surface.
    if coalesce(p_signer_role, 'landlord') <> 'landlord' then
      raise exception 'Manager signing path: signer_role must be ''landlord''';
    end if;

    if coalesce(p_signed_from, 'landlord_portal') <> 'landlord_portal' then
      raise exception 'Manager signing path: signed_from must be ''landlord_portal''';
    end if;

    if coalesce(p_signer_type, 'landlord') not in ('landlord', 'agent') then
      raise exception 'Manager signing path: signer_type must be ''landlord'' or ''agent''';
    end if;

    v_effective_signer_type := coalesce(p_signer_type, 'landlord');
    v_effective_signer_role := 'landlord';
    v_effective_signed_from := 'landlord_portal';
    v_effective_tenant_id   := null;
  end if;

  -- ── Report fetch ─────────────────────────────────────────────────────────────
  select * into v_report
  from public.inspection_reports
  where id = p_report_id
    and account_id = p_account_id
  for update;

  if not found then
    raise exception 'Inspection report not found for account';
  end if;

  if v_report.status in ('locked', 'archived') then
    raise exception 'Inspection report is % — cannot capture signature', v_report.status;
  end if;

  -- Capture pre-signing workflow state (E-152: goes to metadata, not the hash).
  v_workflow_status := v_report.status;

  -- ── Hash (E-152: content-only, status excluded) ───────────────────────────────
  -- Computed BEFORE INSERT — excludes the new signature (Pin 2 contract).
  v_hash := public.canonical_inspection_report_hash(p_report_id);

  -- ── Signature INSERT ─────────────────────────────────────────────────────────
  v_sig_id := gen_random_uuid();

  insert into public.inspection_signatures (
    id, account_id, inspection_report_id,
    signer_type, signer_name, signed_at, signature_data, metadata,
    signer_role, signed_from, signature_status,
    tenant_id, share_id
  ) values (
    v_sig_id, p_account_id, p_report_id,
    v_effective_signer_type, btrim(p_signer_name), now(), p_signature_data,
    jsonb_build_object(
      'signer_role', v_effective_signer_role,
      'signed_from', v_effective_signed_from,
      'share_id',    p_share_id
    ),
    v_effective_signer_role, v_effective_signed_from, 'signed',
    v_effective_tenant_id, p_share_id
  );

  -- Transition to 'signed' on first signature (Pin 3 freeze trigger target).
  if v_report.status <> 'signed' then
    update public.inspection_reports
    set status = 'signed'
    where id = p_report_id;
  end if;

  insert into public.inspection_audit_events (
    account_id, inspection_report_id, user_id, event_type, metadata
  ) values (
    p_account_id, p_report_id, auth.uid(), 'report_signed',
    jsonb_build_object(
      'signer_role', v_effective_signer_role,
      'signer_type', v_effective_signer_type,
      'signature_id', v_sig_id
    )
  );

  -- ── Provenance anchor ─────────────────────────────────────────────────────────
  -- No EXCEPTION handler — provenance failure rolls back INSERT and status UPDATE.
  v_event_id := public.record_signature_captured(
    p_inspection_report_id := p_report_id,
    p_signature_id         := v_sig_id,
    p_signer_role          := v_effective_signer_role,
    p_signed_from          := v_effective_signed_from,
    p_report_content_hash  := v_hash,
    p_share_id             := p_share_id,
    p_tenant_id            := v_effective_tenant_id,
    p_signer_type          := v_effective_signer_type,
    p_workflow_status      := v_workflow_status
  );

  return jsonb_build_object(
    'event_id',     v_event_id,
    'signature_id', v_sig_id,
    'report_id',    p_report_id,
    'content_hash', v_hash,
    'signer_role',  v_effective_signer_role,
    'signer_type',  v_effective_signer_type,
    'signed_from',  v_effective_signed_from
  );
end;
$$;

revoke all on function public.capture_inspection_signature(uuid, uuid, text, text, uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.capture_inspection_signature(uuid, uuid, text, text, uuid, text, text, text)
  to authenticated;

-- ─── §7. trg_enforce_lock_via_rpc (Pin 1 bypass prevention) ─────────────────
-- Blocks any UPDATE that transitions inspection_reports.status to 'locked'
-- unless the transaction was authorized by lock_inspection_report().

create or replace function public.enforce_lock_via_rpc()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'locked' and old.status <> 'locked' then
    if coalesce(current_setting('inspection.lock_authorized', true), '') <> 'true' then
      raise exception
        'inspection_reports.status may only be set to ''locked'' via lock_inspection_report() RPC — bypass attempt denied';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_lock_via_rpc on public.inspection_reports;
create trigger trg_enforce_lock_via_rpc
  before update on public.inspection_reports
  for each row execute function public.enforce_lock_via_rpc();

-- ─── §8. Extend item freeze to include 'signed' (Pin 3) ──────────────────────

create or replace function public.prevent_locked_inspection_item_edits()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select r.status into v_status
  from public.inspection_reports r
  join public.inspection_rooms room on room.inspection_report_id = r.id
  where room.id = coalesce(new.inspection_room_id, old.inspection_room_id);

  if v_status in ('signed', 'locked', 'archived') then
    raise exception 'Signed, locked or archived inspection reports cannot be edited';
  end if;
  return coalesce(new, old);
end;
$$;

-- ─── §9. Extend photo freeze to include 'signed' (Pin 3) ─────────────────────

create or replace function public.prevent_locked_inspection_photo_edits()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select r.status into v_status
  from public.inspection_reports r
  join public.inspection_rooms room on room.inspection_report_id = r.id
  join public.inspection_evidence_items item on item.inspection_room_id = room.id
  where item.id = coalesce(new.evidence_item_id, old.evidence_item_id);

  if v_status in ('signed', 'locked', 'archived') then
    raise exception 'Signed, locked or archived inspection reports cannot be edited';
  end if;
  return coalesce(new, old);
end;
$$;

-- Note: inspection_signature trigger is NOT extended to 'signed' — multiple
-- sequential signatures are valid and expected (landlord then tenant).

-- ─── §10. Atomicity deny-test helpers ────────────────────────────────────────
-- Used by integration tests to prove that primary writes roll back when
-- the provenance call fails.

-- inspect_lock_deny_test (mirror) is replaced by lock_inspection_report_atomicity_deny_test
-- (real-path wrapper, E-153 lock-half). Drop the mirror so it cannot be left running
-- beside the real-path proof (D-10: no strong+weak bifurcation).
drop function if exists public.inspect_lock_deny_test(uuid, uuid);

-- lock_inspection_report_atomicity_deny_test (E-153 lock-half):
-- Thin production-RPC wrapper. Arms the transaction-local GUC, then calls the REAL
-- lock_inspection_report. Inside lock_inspection_report the GUC check fires AFTER the
-- inspection_reports UPDATE is staged but BEFORE record_inspection_report_locked,
-- raising an exception that rolls back the entire transaction.
-- This proves the production lock path is atomic: if provenance anchoring fails,
-- the lock UPDATE (and audit INSERT) are rolled back — no misleading locked state.
-- The GUC is transaction-local (is_local=true): cannot leak across sessions.

drop function if exists public.lock_inspection_report_atomicity_deny_test(uuid, uuid, text);

create or replace function public.lock_inspection_report_atomicity_deny_test(
  p_account_id  uuid,
  p_report_id   uuid,
  p_lock_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.test_force_inspection_lock_provenance_failure', 'on', true);
  return public.lock_inspection_report(
    p_account_id  := p_account_id,
    p_report_id   := p_report_id,
    p_lock_reason := p_lock_reason
  );
end;
$$;

revoke all on function public.lock_inspection_report_atomicity_deny_test(uuid, uuid, text)
  from public, anon;
grant execute on function public.lock_inspection_report_atomicity_deny_test(uuid, uuid, text)
  to authenticated;

-- inspect_sig_deny_test: atomicity pattern proof for signature capture.
-- Inserts the signature (SECURITY DEFINER bypasses RLS as the RPC does),
-- then fails provenance with an empty summary — verifies the INSERT rolls back.

create or replace function public.inspect_sig_deny_test(
  p_account_id uuid,
  p_report_id  uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sig_id uuid := gen_random_uuid();
begin
  insert into public.inspection_signatures (
    id, account_id, inspection_report_id,
    signer_type, signer_name, signed_at, signature_data, metadata,
    signer_role, signed_from, signature_status
  ) values (
    v_sig_id, p_account_id, p_report_id,
    'landlord'::text, 'deny-test signer'::text, now(), null::text, '{}'::jsonb,
    'landlord'::text, 'landlord_portal'::text, 'signed'::text
  );

  -- Deliberately fail provenance
  perform public._append_evidence_provenance_event(
    p_account_id          := p_account_id,
    p_entity_type         := 'inspection_signature'::text,
    p_entity_id           := v_sig_id,
    p_event_type          := 'signature.captured'::text,
    p_actor_type          := 'human'::text,
    p_actor_user_id       := auth.uid(),
    p_actor_role          := null::text,
    p_occurred_at         := now(),
    p_summary             := ''::text
  );
end;
$$;

revoke all on function public.inspect_sig_deny_test(uuid, uuid) from public;
grant execute on function public.inspect_sig_deny_test(uuid, uuid) to authenticated;

-- capture_inspection_signature_atomicity_deny_test:
-- Production-RPC fault-injection test (E-033 Test 7).
-- Sets a transaction-local GUC, then calls the REAL capture_inspection_signature.
-- record_signature_captured reads the GUC and raises before _append_evidence_provenance_event.
-- The raise rolls back the entire transaction — proving the signature INSERT is atomic
-- with the provenance anchor inside the production code path, not a mirror helper.
--
-- The GUC is transaction-local (is_local=true): it cannot leak to any other
-- session or survive beyond this transaction.  It defaults off everywhere else.

create or replace function public.capture_inspection_signature_atomicity_deny_test(
  p_account_id uuid,
  p_report_id  uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Arm the fault injector: transaction-local, inert outside this call.
  perform set_config('app.test_force_signature_provenance_failure', 'on', true);

  -- Call the real production RPC. The GUC will fire inside record_signature_captured
  -- before _append_evidence_provenance_event, causing a raise that rolls back the
  -- signature INSERT and this entire transaction.
  return public.capture_inspection_signature(
    p_account_id  := p_account_id,
    p_report_id   := p_report_id,
    p_signer_name := 'atomicity-deny-test-signer'::text
  );
end;
$$;

revoke all on function public.capture_inspection_signature_atomicity_deny_test(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.capture_inspection_signature_atomicity_deny_test(uuid, uuid)
  to authenticated;

-- ─── §11. Table constraints (E-033) ──────────────────────────────────────────
-- signer_type CHECK: 'agent' is used by EvidenceVaultPage for agent acknowledgements.
-- Distinct values found before adding constraint: 'landlord', 'agent', 'tenant'.

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inspection_signatures_signer_type_check'
      and conrelid = 'public.inspection_signatures'::regclass
  ) then
    alter table public.inspection_signatures
      add constraint inspection_signatures_signer_type_check
      check (signer_type in ('landlord', 'agent', 'tenant'));
  end if;
end $$;

-- Per-share uniqueness: one active signature per tenant per share token.
-- Uses a partial unique index (share_id is not always present for manager sigs).
create unique index if not exists inspection_signatures_share_unique_idx
  on public.inspection_signatures(inspection_report_id, share_id)
  where share_id is not null;

-- ─── §12. RLS tightening (E-033) ─────────────────────────────────────────────
-- All signature writes go through capture_inspection_signature (SECURITY DEFINER).
-- Direct INSERT access is removed from both manager and tenant table policies.

-- Manager policy: restrict to SELECT only (no INSERT/UPDATE/DELETE via table).
-- DROP old manage-all policy and DROP/recreate the read policy for idempotent re-apply.
drop policy if exists "Managers manage inspection signatures" on public.inspection_signatures;
drop policy if exists "Managers read inspection signatures" on public.inspection_signatures;
create policy "Managers read inspection signatures" on public.inspection_signatures
  for select to authenticated
  using (public.user_can_manage_account(account_id));

-- Drop tenant direct-insert policy (tenant signing goes through RPC).
drop policy if exists "Tenants sign shared inspection reports" on public.inspection_signatures;
drop policy if exists "Tenants sign assigned inspection reports" on public.inspection_signatures;

commit;
