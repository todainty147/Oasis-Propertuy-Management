-- ============================================================
-- E-158: Work-Order Photo Attachment Scanning / Quarantine
-- ============================================================
-- Extends the ClamAV document-scanning engine (document_antivirus_scanning.sql)
-- to the work-order-attachments bucket.
--
-- Ruled design:
--   D2: five states — legacy_unscanned / pending_scan / clean / flagged / scan_failed
--       scan_failed (transient, retryable) is strictly distinct from flagged (malware)
--   D3: block-and-retain — flagged photos refused by serve gate; retained as evidence; never deleted
--   D4: fail-closed-at-serve (middle path) — anchor immediately; scan async; serve only when clean
--   D5: upload anchoring decoupled from scan
--   D6: provenance events: photo.scan_clean / photo.scan_flagged / photo.scan_failed
--   D7: system path (service-role, no membership check); user re-scan (E-163a caller-auth); sweep
-- ============================================================

-- ─── §1  Schema additions (replay-safe) ────────────────────────────────────

alter table public.work_order_attachments
  add column if not exists scan_status          text    default 'legacy_unscanned',
  add column if not exists scanned_at           timestamptz,
  add column if not exists scan_engine          text,
  add column if not exists scan_signature       text,
  add column if not exists scan_failed_reason   text,
  add column if not exists scan_attempted_at    timestamptz;

-- Guarded CHECK over D2 states (no ADD CONSTRAINT IF NOT EXISTS before PG 16)
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.work_order_attachments'::regclass
       and conname  = 'work_order_attachments_scan_status_check'
  ) then
    alter table public.work_order_attachments
      add constraint work_order_attachments_scan_status_check
      check (scan_status in (
        'legacy_unscanned', 'pending_scan', 'clean', 'flagged', 'scan_failed'
      ));
  end if;
end;
$$;

-- flagged requires a scan_signature
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.work_order_attachments'::regclass
       and conname  = 'woa_scan_flagged_requires_signature'
  ) then
    alter table public.work_order_attachments
      add constraint woa_scan_flagged_requires_signature
      check (
        scan_status <> 'flagged'
        or nullif(trim(coalesce(scan_signature, '')), '') is not null
      );
  end if;
end;
$$;

-- scan_failed requires a reason
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.work_order_attachments'::regclass
       and conname  = 'woa_scan_failed_requires_reason'
  ) then
    alter table public.work_order_attachments
      add constraint woa_scan_failed_requires_reason
      check (
        scan_status <> 'scan_failed'
        or nullif(trim(coalesce(scan_failed_reason, '')), '') is not null
      );
  end if;
end;
$$;

-- Index for sweep queries (pending_scan / scan_failed / legacy_unscanned rows)
create index if not exists woa_scan_status_idx
  on public.work_order_attachments (account_id, scan_status, created_at desc);

-- Index for storage-policy lookup by storage_path (can_serve_work_order_attachment_storage)
create index if not exists woa_storage_path_idx
  on public.work_order_attachments (storage_bucket, storage_path)
  where storage_path is not null;

-- ─── §2  Serve-path storage SELECT policy (fail-closed at storage layer) ──────
--
-- Replaces the membership-only policy with a scan_status='clean' gate.
-- This closes the direct client-side createSignedUrl bypass (D4 / Part-1).
-- The primary gate is the signed-work-order-attachment-url Edge Function;
-- this is the backstop that prevents direct storage client bypasses.
-- admin (service_role) bypasses RLS and can still generate signed URLs for
-- authorized paths inside Edge Functions.

create or replace function public.can_serve_work_order_attachment_storage(p_storage_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parts         text[];
  v_account_id    uuid;
  v_work_order_id uuid;
begin
  if auth.uid() is null then return false; end if;

  v_parts := string_to_array(coalesce(p_storage_path, ''), '/');
  -- Path format: account/<account_id>/work_orders/<work_order_id>/<ts>_<filename>
  if array_length(v_parts, 1) < 5 then return false; end if;
  if v_parts[1] <> 'account' or v_parts[3] <> 'work_orders' then return false; end if;

  v_account_id    := public.safe_uuid(v_parts[2]);
  v_work_order_id := public.safe_uuid(v_parts[4]);

  if v_account_id is null or v_work_order_id is null then return false; end if;

  -- Membership check (same as original policy) AND scan_status='clean'
  -- Fail-closed-at-serve (D4): pending_scan / flagged / scan_failed / legacy_unscanned all refused
  return public.can_view_work_order_attachment(v_account_id, v_work_order_id)
    and exists (
      select 1
        from public.work_order_attachments woa
       where woa.storage_bucket = 'work-order-attachments'
         and woa.storage_path   = p_storage_path
         and woa.scan_status    = 'clean'
    );
end;
$$;

revoke all on function public.can_serve_work_order_attachment_storage(text) from public;
grant execute on function public.can_serve_work_order_attachment_storage(text)
  to authenticated, service_role;

-- Replace storage SELECT policy: was membership-only, now scan_status='clean' gated
drop policy if exists "wo_attach_select_members_or_assigned_contractor" on storage.objects;

create policy "wo_attach_select_members_or_assigned_contractor"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'work-order-attachments'
  and public.can_serve_work_order_attachment_storage(name)
);

-- ─── §3  record_work_order_attachment_received — scan_status='pending_scan' ──
--
-- Same signature as the existing function (replay-safe CREATE OR REPLACE).
-- Only change: INSERT now includes scan_status='pending_scan' so new uploads
-- enter the scan queue immediately and are refused by the serve gate until clean.

create or replace function public.record_work_order_attachment_received(
  p_account_id                   uuid,
  p_work_order_id                uuid,
  p_storage_path                 text,
  p_file_name                    text,
  p_mime_type                    text    default null,
  p_file_size                    bigint  default null,
  p_kind                         text    default 'photo',
  p_attester_role                text    default null,
  p_maintenance_stage            text    default null,
  p_capture_method               text    default 'uploaded',
  p_content_hash_client_asserted text    default null
) returns public.work_order_attachments
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_actor                  uuid := auth.uid();
  v_work_order             public.work_orders%rowtype;
  v_attachment             public.work_order_attachments%rowtype;
  v_event_id               uuid;
  v_hash_trust             text;
  v_is_manager             boolean;
  v_is_assigned_contractor boolean;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if p_account_id is null or p_work_order_id is null then
    raise exception 'account_id and work_order_id are required';
  end if;

  select * into v_work_order
    from public.work_orders wo
   where wo.id         = p_work_order_id
     and wo.account_id = p_account_id;

  if not found then
    raise exception 'work order not found';
  end if;

  v_is_manager             := public.is_account_manager(p_account_id);
  v_is_assigned_contractor := v_work_order.contractor_user_id = v_actor;

  if not (v_is_manager or v_is_assigned_contractor) then
    raise exception 'not authorized for work order attachment upload';
  end if;

  if nullif(btrim(p_storage_path), '') is null then
    raise exception 'storage_path is required';
  end if;

  if not exists (
    select 1 from storage.objects so
     where so.bucket_id = 'work-order-attachments'
       and so.name      = p_storage_path
  ) then
    raise exception 'storage object not found for work-order attachment';
  end if;

  if coalesce(p_kind, 'photo') not in ('photo', 'document') then
    raise exception 'invalid work-order attachment kind';
  end if;

  if p_attester_role is not null
     and p_attester_role not in ('contractor', 'landlord', 'tenant', 'admin', 'system') then
    raise exception 'invalid attester_role';
  end if;

  if coalesce(p_capture_method, 'uploaded') not in ('uploaded', 'in_app_camera') then
    raise exception 'invalid capture_method';
  end if;

  if p_content_hash_client_asserted is not null
     and p_content_hash_client_asserted !~ '^[0-9a-f]{64}$' then
    raise exception 'content_hash_client_asserted must be lowercase SHA-256 hex';
  end if;

  if p_maintenance_stage is not null
     and p_maintenance_stage <> 'contractor_completion' then
    raise exception 'invalid maintenance_stage';
  end if;

  if p_maintenance_stage = 'contractor_completion' then
    if coalesce(p_kind, 'photo') <> 'photo' then
      raise exception 'contractor completion evidence must be a photo';
    end if;

    if p_attester_role <> 'contractor' then
      raise exception 'contractor completion evidence requires attester_role=contractor';
    end if;

    if not v_is_assigned_contractor then
      raise exception 'only the assigned contractor can upload contractor completion evidence';
    end if;

    if lower(coalesce(v_work_order.status, '')) in (
      'completed', 'cancelled', 'zakończone', 'anulowane'
    ) then
      raise exception 'contractor completion photo uploads are blocked after work-order completion or cancellation';
    end if;
  end if;

  insert into public.work_order_attachments (
    account_id,
    work_order_id,
    uploaded_by,
    attester_role,
    file_name,
    mime_type,
    file_size,
    storage_bucket,
    storage_path,
    kind,
    maintenance_stage,
    capture_method,
    work_order_status_at_received,
    late_upload,
    content_hash_client_asserted,
    content_hash_algorithm,
    content_hash_verified_at,
    scan_status              -- E-158: new uploads enter the scan queue immediately
  ) values (
    p_account_id,
    p_work_order_id,
    v_actor,
    p_attester_role,
    p_file_name,
    p_mime_type,
    p_file_size,
    'work-order-attachments',
    p_storage_path,
    coalesce(p_kind, 'photo'),
    p_maintenance_stage,
    coalesce(p_capture_method, 'uploaded'),
    v_work_order.status,
    false,
    p_content_hash_client_asserted,
    case when p_content_hash_client_asserted is not null then 'sha256' else null end,
    null,
    'pending_scan'           -- E-158: blocked by serve gate until scanner confirms clean
  )
  returning * into v_attachment;

  if p_maintenance_stage = 'contractor_completion' then
    v_hash_trust := case
      when p_content_hash_client_asserted is not null then 'client_asserted_unverified'
      else 'not_available'
    end;

    -- E-160 fault-injection gate (unchanged)
    if current_setting('app.test_force_wo_photo_provenance_failure', true) = 'on' then
      raise exception 'test_force_wo_photo_provenance_failure: forced provenance failure for atomicity proof';
    end if;

    v_event_id := public._append_evidence_provenance_event(
      p_account_id,
      'work_order',
      p_work_order_id,
      'photo.received',
      'human',
      v_actor,
      'contractor',
      v_attachment.created_at,
      'Contractor completion photo received for work order',
      v_work_order.property_id,
      null,
      jsonb_build_object(
        'attachment_id',                  v_attachment.id,
        'work_order_id',                  p_work_order_id,
        'account_id',                     p_account_id,
        'attester_role',                  p_attester_role,
        'maintenance_stage',              p_maintenance_stage,
        'work_order_status_at_received',  v_work_order.status,
        'capture_method',                 coalesce(p_capture_method, 'uploaded'),
        'received_at',                    v_attachment.created_at,
        'storage_bucket',                 'work-order-attachments',
        'storage_path',                   p_storage_path,
        'mime_type',                      p_mime_type,
        'file_size',                      p_file_size,
        'content_hash_client_asserted',   p_content_hash_client_asserted,
        'content_hash_algorithm',         case when p_content_hash_client_asserted is not null then 'sha256' else null end,
        'content_hash_verified_at',       null,
        'hash_trust',                     v_hash_trust,
        'late_upload',                    false,
        'scan_status',                    'pending_scan'  -- E-158
      ),
      'work_order_attachment',
      v_attachment.id,
      'internal',
      'work_order_photo.received:' || v_attachment.id::text,
      null
    );

    update public.work_order_attachments
       set provenance_event_id = v_event_id
     where id = v_attachment.id
     returning * into v_attachment;
  end if;

  return v_attachment;
end;
$$;

revoke all on function public.record_work_order_attachment_received(
  uuid, uuid, text, text, text, bigint, text, text, text, text, text
) from public, anon;
grant execute on function public.record_work_order_attachment_received(
  uuid, uuid, text, text, text, bigint, text, text, text, text, text
) to authenticated, service_role;

-- ─── §4  work_order_attachments_list — add scan columns to return type ────────
-- Return type change requires DROP FUNCTION IF EXISTS before recreate.

drop function if exists public.work_order_attachments_list(uuid);

create or replace function public.work_order_attachments_list(
  p_work_order_id uuid
) returns table(
  id                           uuid,
  account_id                   uuid,
  work_order_id                uuid,
  uploaded_by                  uuid,
  attester_role                text,
  file_name                    text,
  mime_type                    text,
  file_size                    bigint,
  storage_bucket               text,
  storage_path                 text,
  kind                         text,
  created_at                   timestamptz,
  maintenance_stage            text,
  capture_method               text,
  work_order_status_at_received text,
  late_upload                  boolean,
  content_hash_client_asserted text,
  content_hash_algorithm       text,
  content_hash_verified_at     timestamptz,
  provenance_event_id          uuid,
  scan_status                  text,
  scanned_at                   timestamptz,
  scan_engine                  text,
  scan_signature               text,
  scan_failed_reason           text,
  scan_attempted_at            timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.account_id,
    a.work_order_id,
    a.uploaded_by,
    a.attester_role,
    a.file_name,
    a.mime_type,
    a.file_size,
    a.storage_bucket,
    a.storage_path,
    a.kind,
    a.created_at,
    a.maintenance_stage,
    a.capture_method,
    a.work_order_status_at_received,
    a.late_upload,
    a.content_hash_client_asserted,
    a.content_hash_algorithm,
    a.content_hash_verified_at,
    a.provenance_event_id,
    coalesce(a.scan_status, 'legacy_unscanned'),
    a.scanned_at,
    a.scan_engine,
    a.scan_signature,
    a.scan_failed_reason,
    a.scan_attempted_at
  from public.work_order_attachments a
  where a.work_order_id = p_work_order_id
    and public.can_access_work_order(a.account_id, a.work_order_id)
  order by a.created_at desc;
$$;

revoke all on function public.work_order_attachments_list(uuid) from public, anon;
grant execute on function public.work_order_attachments_list(uuid) to authenticated, service_role;

-- ─── §5  record_work_order_attachment_scan_result ─────────────────────────────
--
-- Atomic: state UPDATE + provenance event, in one transaction.
-- service_role only — the scanner worker (system path) calls this via service role.
-- Terminal idempotency: clean and flagged are final; scan_failed is retryable.
-- Hard rule: scan_failed (transient) ≠ flagged (malware confirmed). Never collapse.

drop function if exists public.record_work_order_attachment_scan_result(uuid, text, text, text, text);

create or replace function public.record_work_order_attachment_scan_result(
  p_attachment_id      uuid,
  p_scan_status        text,
  p_scan_engine        text    default null,
  p_scan_signature     text    default null,
  p_scan_failed_reason text    default null
) returns public.work_order_attachments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attachment  public.work_order_attachments%rowtype;
  v_property_id uuid;
  v_event_id    uuid;
  v_status      text := lower(trim(coalesce(p_scan_status, '')));
  v_event_type  text;
  v_event_desc  text;
begin
  if p_attachment_id is null then
    raise exception 'p_attachment_id is required';
  end if;

  if v_status not in ('clean', 'flagged', 'scan_failed') then
    raise exception 'p_scan_status must be clean, flagged, or scan_failed — got: %', v_status;
  end if;

  if v_status = 'flagged'
     and nullif(trim(coalesce(p_scan_signature, '')), '') is null then
    raise exception 'p_scan_signature is required when p_scan_status = flagged';
  end if;

  if v_status = 'scan_failed'
     and nullif(trim(coalesce(p_scan_failed_reason, '')), '') is null then
    raise exception 'p_scan_failed_reason is required when p_scan_status = scan_failed';
  end if;

  select * into v_attachment
    from public.work_order_attachments
   where id = p_attachment_id
     for update;

  if not found then
    raise exception 'work_order_attachment not found: %', p_attachment_id;
  end if;

  -- Terminal idempotency: clean and flagged are final; scan_failed is retryable
  if v_attachment.scan_status in ('clean', 'flagged') then
    return v_attachment;
  end if;

  -- Resolve property_id for provenance event metadata (null-safe)
  select wo.property_id into v_property_id
    from public.work_orders wo
   where wo.id = v_attachment.work_order_id;

  -- State UPDATE (staged in-transaction; rolled back if GUC gate fires below)
  update public.work_order_attachments
     set scan_status        = v_status,
         scan_engine        = nullif(trim(coalesce(p_scan_engine, '')), ''),
         scan_signature     = case when v_status = 'flagged'     then p_scan_signature     else null end,
         scan_failed_reason = case when v_status = 'scan_failed' then p_scan_failed_reason else null end,
         scanned_at         = case when v_status in ('clean', 'flagged') then now() else scanned_at end,
         scan_attempted_at  = now()
   where id = p_attachment_id
   returning * into v_attachment;

  -- E-158 atomicity deny-test gate.
  -- Inert when GUC is absent or false (production default).
  -- When armed by the deny-test wrapper (transaction-local 'on'), raises AFTER the
  -- UPDATE is staged, BEFORE the provenance event, proving full rollback of both.
  -- Must RAISE — never skip, no-op, or branch around the real append call.
  if current_setting('app.test_force_photo_scan_provenance_failure', true) = 'on' then
    raise exception 'forced photo scan provenance failure for E-158 deny-test';
  end if;

  -- Provenance event type and human description
  v_event_type := case v_status
    when 'clean'       then 'photo.scan_clean'
    when 'flagged'     then 'photo.scan_flagged'
    when 'scan_failed' then 'photo.scan_failed'
  end;

  v_event_desc := case v_status
    when 'clean'       then 'Malware scan clean — work-order photo cleared for serving'
    when 'flagged'     then 'Malware scan flagged — work-order photo quarantined, retained as evidence'
    when 'scan_failed' then 'Malware scan transient failure — retryable; not a malware verdict'
  end;

  -- Append provenance event atomically with the UPDATE
  v_event_id := public._append_evidence_provenance_event(
    v_attachment.account_id,
    'work_order',
    v_attachment.work_order_id,
    v_event_type,
    'system',
    null,
    'system',
    now(),
    v_event_desc,
    v_property_id,
    null,
    jsonb_build_object(
      'attachment_id',        v_attachment.id,
      'work_order_id',        v_attachment.work_order_id,
      'account_id',           v_attachment.account_id,
      'scan_status',          v_status,
      'scan_engine',          p_scan_engine,
      'scan_signature',       p_scan_signature,
      'scan_failed_reason',   p_scan_failed_reason,
      'scanned_at',           now()
    ),
    'work_order_attachment',
    v_attachment.id,
    'internal',
    'work_order_attachment.scan:' || v_attachment.id::text || ':' || v_status,
    null
  );

  return v_attachment;
end;
$$;

revoke all on function public.record_work_order_attachment_scan_result(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_work_order_attachment_scan_result(uuid, text, text, text, text)
  to service_role;

comment on function public.record_work_order_attachment_scan_result(uuid, text, text, text, text) is
  'E-158: Atomic scan-state transition + provenance event for work-order photo attachments. '
  'States: clean (terminal), flagged (terminal, retained), scan_failed (retryable). '
  'Hard rule: scan_failed ≠ flagged. service_role only; scanner worker uses service role.';

-- ─── §6  Atomicity deny-test wrapper ───────────────────────────────────────────
--
-- Arms a transaction-local GUC then calls the real recording function.
-- GUC fires AFTER the state UPDATE, BEFORE the provenance event, proving rollback.
-- Mirrors E-163 / E-160 / E-153-sig deny-test patterns.

drop function if exists public.record_work_order_attachment_scan_result_atomicity_deny_test(uuid, text, text, text, text);

create or replace function public.record_work_order_attachment_scan_result_atomicity_deny_test(
  p_attachment_id      uuid,
  p_scan_status        text,
  p_scan_engine        text    default null,
  p_scan_signature     text    default null,
  p_scan_failed_reason text    default null
) returns public.work_order_attachments
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.test_force_photo_scan_provenance_failure', 'on', true);
  return public.record_work_order_attachment_scan_result(
    p_attachment_id      := p_attachment_id,
    p_scan_status        := p_scan_status,
    p_scan_engine        := p_scan_engine,
    p_scan_signature     := p_scan_signature,
    p_scan_failed_reason := p_scan_failed_reason
  );
end;
$$;

revoke all on function public.record_work_order_attachment_scan_result_atomicity_deny_test(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.record_work_order_attachment_scan_result_atomicity_deny_test(uuid, text, text, text, text)
  to authenticated;

comment on function public.record_work_order_attachment_scan_result_atomicity_deny_test(uuid, text, text, text, text) is
  'E-158 atomicity deny-test wrapper. Arms the transaction-local GUC then calls the real '
  'record_work_order_attachment_scan_result. GUC raises after UPDATE, before event, proving rollback. Test-only.';
