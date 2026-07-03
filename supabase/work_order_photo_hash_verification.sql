-- ============================================================
-- E-163: Server-Side Byte-Hash Verification for Work-Order Photo Evidence
-- ============================================================
--
-- Closes the honesty gap in E-150.1: content_hash_client_asserted is what the
-- uploader *claimed* the bytes were; E-163 adds server-side SHA-256 recompute
-- to confirm stored bytes match that claim.
--
-- Three-state hash_trust: client_asserted_unverified → verified | verification_failed.
-- Hard rule: only a confirmed byte mismatch sets verification_failed.
-- A transient read failure stays client_asserted_unverified (retryable).
--
-- Scope: this file adds schema columns, the atomic recording function, the
-- GUC deny-test gate, and the deny-test wrapper. The trusted reader edge
-- function (verify-work-order-photo-hash) enforces two-layer auth.
-- No scanning / quarantine / malware verdicts (that is E-158).

-- ─── §1  Schema additions (replay-safe) ────────────────────────────────────

alter table public.work_order_attachments
  add column if not exists hash_trust                 text default 'client_asserted_unverified',
  add column if not exists content_hash_server_computed text,
  add column if not exists hash_verification_error    text,
  add column if not exists verification_attempted_at  timestamptz;

-- Idempotent CHECK constraint — DO block because Postgres has no
-- ALTER TABLE ADD CONSTRAINT IF NOT EXISTS in PG < 16.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.work_order_attachments'::regclass
       and conname  = 'work_order_attachments_hash_trust_check'
  ) then
    alter table public.work_order_attachments
      add constraint work_order_attachments_hash_trust_check
      check (hash_trust in ('client_asserted_unverified', 'verified', 'verification_failed'));
  end if;
end;
$$;

-- ─── §2  record_work_order_photo_hash_verification ─────────────────────────
--
-- Called by the verify-work-order-photo-hash edge function (service_role).
-- Performs the state transition AND provenance event append atomically.
--
-- Paths:
--   p_match IS NOT NULL  →  terminal: UPDATE + GUC gate + provenance event
--   p_match IS NULL      →  transient: UPDATE error fields only, no event
--
-- Hard rule: read failures (p_match=null) must not set verification_failed.
-- Only a confirmed byte mismatch (p_match=false) may do so.
--
-- Idempotency: rows already in a terminal state return unchanged (no-op).

drop function if exists public.record_work_order_photo_hash_verification(uuid, text, boolean, text);

create or replace function public.record_work_order_photo_hash_verification(
  p_attachment_id uuid,
  p_server_hash   text,
  p_match         boolean,
  p_error         text     default null
) returns public.work_order_attachments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attachment  public.work_order_attachments%rowtype;
  v_property_id uuid;
  v_event_id    uuid;
begin
  if p_attachment_id is null then
    raise exception 'p_attachment_id is required';
  end if;

  if p_match is not null and p_error is not null then
    raise exception 'p_match and p_error are mutually exclusive';
  end if;

  select * into v_attachment
    from public.work_order_attachments
   where id = p_attachment_id;

  if not found then
    raise exception 'work_order_attachment not found: %', p_attachment_id;
  end if;

  -- Idempotency: terminal states are final this pass
  if v_attachment.hash_trust in ('verified', 'verification_failed') then
    return v_attachment;
  end if;

  -- Resolve property_id for provenance event; null-safe if WO is gone
  select wo.property_id into v_property_id
    from public.work_orders wo
   where wo.id = v_attachment.work_order_id;

  if p_match is not null then
    -- ── Terminal path: confirmed match or confirmed mismatch ──────────────

    update public.work_order_attachments
       set content_hash_server_computed = p_server_hash,
           verification_attempted_at    = now(),
           content_hash_verified_at     = case when p_match then now() else null end,
           hash_trust                   = case when p_match then 'verified'
                                               else 'verification_failed' end,
           hash_verification_error      = null
     where id = p_attachment_id
     returning * into v_attachment;

    -- E-163 test-only fault-injection gate. Inert when GUC is absent/false (default).
    -- When armed by the deny-test wrapper (transaction-local 'on'), raises AFTER the
    -- work_order_attachments UPDATE is staged in-transaction, proving the full rollback
    -- includes both the state change and the hash event.
    -- Must RAISE — never skip, no-op, or branch around the real provenance call.
    if current_setting('app.test_force_photo_hash_verification_provenance_failure', true) = 'on' then
      raise exception 'forced photo hash verification provenance failure for E-163 deny-test';
    end if;

    v_event_id := public._append_evidence_provenance_event(
      v_attachment.account_id,
      'work_order',
      v_attachment.work_order_id,
      case when p_match then 'photo.hash_verified' else 'photo.hash_verification_failed' end,
      'system',
      null,
      'system',
      now(),
      case when p_match
        then 'Stored file hash verified — server SHA-256 matched client assertion'
        else 'Stored file hash verification failed — server SHA-256 did not match client assertion'
      end,
      v_property_id,
      null,
      jsonb_build_object(
        'attachment_id',                v_attachment.id,
        'work_order_id',                v_attachment.work_order_id,
        'account_id',                   v_attachment.account_id,
        'content_hash_client_asserted', v_attachment.content_hash_client_asserted,
        'content_hash_server_computed', p_server_hash,
        'content_hash_algorithm',       'sha256',
        'hash_trust',                   case when p_match then 'verified' else 'verification_failed' end,
        'content_hash_verified_at',     case when p_match then now() else null end
      ),
      'work_order_attachment',
      v_attachment.id,
      'internal',
      case when p_match
        then 'work_order_photo.hash_verified:'             || v_attachment.id::text
        else 'work_order_photo.hash_verification_failed:'  || v_attachment.id::text
      end,
      null
    );

  else
    -- ── Transient operational failure ─────────────────────────────────────
    -- Hard rule: read failure must not set hash_trust='verification_failed'.
    -- Only record error fields; no provenance event.
    update public.work_order_attachments
       set hash_verification_error   = p_error,
           verification_attempted_at = now()
     where id = p_attachment_id
     returning * into v_attachment;

  end if;

  return v_attachment;
end;
$$;

revoke all on function public.record_work_order_photo_hash_verification(uuid, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.record_work_order_photo_hash_verification(uuid, text, boolean, text)
  to service_role;

comment on function public.record_work_order_photo_hash_verification(uuid, text, boolean, text) is
  'E-163: Atomic hash-verification state transition + provenance event for work-order photo evidence. '
  'Three states: client_asserted_unverified (default/transient), verified (match), '
  'verification_failed (confirmed mismatch only — never on transient read error). '
  'service_role only; product auth enforced in the verify-work-order-photo-hash edge function.';

-- ─── §3  Atomicity deny-test wrapper ───────────────────────────────────────
--
-- Arms a transaction-local GUC then calls the real recording function.
-- The GUC fires after the state UPDATE and before the provenance event append,
-- proving full rollback of both.  Test-only; inert on the happy path.
-- Mirrors the E-160 (photo.received) and E-153-sig (signature) patterns.

drop function if exists public.record_work_order_photo_hash_verification_atomicity_deny_test(uuid, text, boolean, text);

create or replace function public.record_work_order_photo_hash_verification_atomicity_deny_test(
  p_attachment_id uuid,
  p_server_hash   text,
  p_match         boolean,
  p_error         text default null
) returns public.work_order_attachments
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.test_force_photo_hash_verification_provenance_failure', 'on', true);
  return public.record_work_order_photo_hash_verification(
    p_attachment_id := p_attachment_id,
    p_server_hash   := p_server_hash,
    p_match         := p_match,
    p_error         := p_error
  );
end;
$$;

revoke all on function public.record_work_order_photo_hash_verification_atomicity_deny_test(uuid, text, boolean, text)
  from public, anon;
grant execute on function public.record_work_order_photo_hash_verification_atomicity_deny_test(uuid, text, boolean, text)
  to authenticated;

comment on function public.record_work_order_photo_hash_verification_atomicity_deny_test(uuid, text, boolean, text) is
  'E-163 atomicity deny-test wrapper. Arms a transaction-local GUC then calls the real '
  'record_work_order_photo_hash_verification. The GUC raises after the state UPDATE and '
  'before _append_evidence_provenance_event, proving full rollback of both. Test-only.';
