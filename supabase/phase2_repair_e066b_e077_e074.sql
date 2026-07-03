-- ============================================================
-- Phase 2 Critical / High repair pass
-- E-066b : Emergency diagnostics misrouting        (Critical)
-- E-077  : Maintenance evidence strength           (High)
-- E-074  : Checkatrade go-live gating             (Medium)
-- Applied after maintenance_smart_diagnostics.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- E-066b  Remove immediate_danger duplicate steps
--
-- Background:
--   Legacy migrations inserted `immediate_danger` steps into
--   boiler_heating, electrical_issue, and leak templates at the
--   same sort_order (10) as `emergency_risk` (triggers_emergency=t).
--   PostgREST returns rows in ctid/heap order when no ORDER BY
--   is present. Because `immediate_danger` was inserted first its
--   ctid is lower; ES2019 stable sort preserves that order when
--   both share sort_order=10. The non-emergency question renders
--   before the emergency question. A tenant answering YES to the
--   first visible gas-smell prompt does NOT fire the emergency
--   flag — it is silently swallowed.
--
-- Fix:
--   Delete the duplicate non-emergency steps so only
--   emergency_risk (triggers_emergency=true) remains at the
--   top of each hazard template.
-- ────────────────────────────────────────────────────────────

-- Delete the non-emergency immediate_danger duplicates for templates that already
-- have an emergency_risk step (boiler_heating, electrical_issue). The DELETE in
-- legal_security_phase3.sql (which runs before this file) is the source-level fix;
-- this is the safety net for any environment that ran legal_security_phase3.sql
-- before the cleanup block was added.
delete from public.maintenance_diagnostic_steps mds
using public.maintenance_diagnostic_templates mdt
where mds.template_id = mdt.id
  and mdt.issue_type in ('boiler_heating', 'electrical_issue')
  and mds.step_key = 'immediate_danger';

-- no_hot_water has immediate_danger (triggers_emergency=false by default) but no
-- conflicting emergency_risk step. Fix the flag so a gas-smell answer actually fires
-- the emergency path instead of being silently dropped.
update public.maintenance_diagnostic_steps mds
set    triggers_emergency = true
from   public.maintenance_diagnostic_templates mdt
where  mds.template_id = mdt.id
  and  mdt.issue_type  = 'no_hot_water'
  and  mds.step_key    = 'immediate_danger';

-- ────────────────────────────────────────────────────────────
-- E-077  Evidence lock and attester metadata
--
-- Part 1: attester_role column
--   Records which party uploaded each evidence item and in what
--   capacity. Required to distinguish independent attestation
--   (e.g. third-party inspection) from aligned attestation
--   (contractor's own completion photo) in the deposit dispute
--   pack.
-- ────────────────────────────────────────────────────────────

alter table public.work_order_attachments
  add column if not exists attester_role text
  check (
    attester_role is null
    or attester_role in ('contractor', 'landlord', 'tenant', 'admin', 'system')
  );

comment on column public.work_order_attachments.attester_role is
  'Role of the uploading party (contractor, landlord, tenant, admin, system). '
  'Used in the deposit dispute pack to flag aligned vs independent attestation.';

-- E-150: Work-order contractor completion photo evidence.
--
-- Existing rows remain legacy/unanchored: all new evidence columns are nullable.
-- A row is evidence-bearing only when maintenance_stage/capture_method and
-- provenance_event_id are present. No historical backfill is attempted.
alter table public.work_order_attachments
  add column if not exists maintenance_stage text
    check (
      maintenance_stage is null
      or maintenance_stage in ('contractor_completion')
    ),
  add column if not exists capture_method text
    check (
      capture_method is null
      or capture_method in ('uploaded', 'in_app_camera')
    ),
  add column if not exists work_order_status_at_received text,
  add column if not exists late_upload boolean,
  add column if not exists content_hash_client_asserted text
    check (
      content_hash_client_asserted is null
      or content_hash_client_asserted ~ '^[0-9a-f]{64}$'
    ),
  add column if not exists content_hash_algorithm text
    check (
      content_hash_algorithm is null
      or content_hash_algorithm = 'sha256'
    ),
  add column if not exists content_hash_verified_at timestamptz,
  add column if not exists provenance_event_id uuid;

comment on column public.work_order_attachments.maintenance_stage is
  'Evidence context for work-order photos. E-150 first slice supports contractor_completion only. Nullable legacy rows are not evidence-bearing.';

comment on column public.work_order_attachments.capture_method is
  'How the bytes reached Tenaqo. E-150 contractor path records uploaded only; in_app_camera is reserved for a future MobileUploadZone slice.';

comment on column public.work_order_attachments.work_order_status_at_received is
  'Server-observed work_orders.status at the time the attachment row and provenance event were committed.';

comment on column public.work_order_attachments.late_upload is
  'True only for explicitly allowed late evidence uploads. E-150 blocks post-completion contractor completion photos, so normal contractor evidence is false.';

comment on column public.work_order_attachments.content_hash_client_asserted is
  'Client-computed SHA-256 of uploaded bytes. Not server verified; provenance metadata must label hash_trust as client_asserted_unverified.';

comment on column public.work_order_attachments.content_hash_verified_at is
  'Null until a trusted server-side byte recompute verifies content_hash_client_asserted. E-150 does not perform server verification.';

comment on column public.work_order_attachments.provenance_event_id is
  'photo.received provenance_events.id for evidence-bearing contractor completion photos. Null means legacy/unanchored or generic attachment.';

create index if not exists woa_provenance_event_idx
  on public.work_order_attachments(provenance_event_id)
  where provenance_event_id is not null;

create index if not exists woa_evidence_stage_idx
  on public.work_order_attachments(account_id, work_order_id, maintenance_stage, created_at desc)
  where maintenance_stage is not null;

-- E-159 policy hygiene: repair the canonical helper so the retained woa_* family
-- preserves all current readers (owner/admin/staff, assigned contractor, tenant
-- view where can_access_work_order already permits it) without relying on the
-- legacy wo_attach_* or wo_attachments_* families.
create or replace function public.can_access_work_order(
  p_account_id uuid,
  p_work_order_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_orders wo
    where wo.id = p_work_order_id
      and wo.account_id = p_account_id
      and (
        public.is_account_manager(p_account_id)
        or wo.contractor_user_id = auth.uid()
        or public.is_tenant_for_work_order(p_work_order_id)
      )
  );
$$;

comment on function public.can_access_work_order(uuid, uuid) is
  'Account-scoped work-order read helper. Preserves manager, assigned-contractor, and tenant visibility semantics for retained woa_* RLS policies.';

-- Work-order attachment list RPC: keep consumer access through the canonical
-- helper and expose the new evidence fields without requiring callers to read
-- provenance_events directly.
drop function if exists public.work_order_attachments_list(uuid);

create or replace function public.work_order_attachments_list(
  p_work_order_id uuid
) returns table(
  id uuid,
  account_id uuid,
  work_order_id uuid,
  uploaded_by uuid,
  attester_role text,
  file_name text,
  mime_type text,
  file_size bigint,
  storage_bucket text,
  storage_path text,
  kind text,
  created_at timestamptz,
  maintenance_stage text,
  capture_method text,
  work_order_status_at_received text,
  late_upload boolean,
  content_hash_client_asserted text,
  content_hash_algorithm text,
  content_hash_verified_at timestamptz,
  provenance_event_id uuid
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
    a.provenance_event_id
  from public.work_order_attachments a
  where a.work_order_id = p_work_order_id
    and public.can_access_work_order(a.account_id, a.work_order_id)
  order by a.created_at desc;
$$;

revoke all on function public.work_order_attachments_list(uuid) from public, anon;
grant execute on function public.work_order_attachments_list(uuid) to authenticated, service_role;

comment on function public.work_order_attachments_list(uuid) is
  'Lists work-order attachments with E-150 evidence metadata for authorized readers only.';

create or replace function public.record_work_order_attachment_received(
  p_account_id uuid,
  p_work_order_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text default null,
  p_file_size bigint default null,
  p_kind text default 'photo',
  p_attester_role text default null,
  p_maintenance_stage text default null,
  p_capture_method text default 'uploaded',
  p_content_hash_client_asserted text default null
) returns public.work_order_attachments
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_actor uuid := auth.uid();
  v_work_order public.work_orders%rowtype;
  v_attachment public.work_order_attachments%rowtype;
  v_event_id uuid;
  v_hash_trust text;
  v_is_manager boolean;
  v_is_assigned_contractor boolean;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if p_account_id is null or p_work_order_id is null then
    raise exception 'account_id and work_order_id are required';
  end if;

  select *
    into v_work_order
    from public.work_orders wo
   where wo.id = p_work_order_id
     and wo.account_id = p_account_id;

  if not found then
    raise exception 'work order not found';
  end if;

  v_is_manager := public.is_account_manager(p_account_id);
  v_is_assigned_contractor := v_work_order.contractor_user_id = v_actor;

  if not (v_is_manager or v_is_assigned_contractor) then
    raise exception 'not authorized for work order attachment upload';
  end if;

  if nullif(btrim(p_storage_path), '') is null then
    raise exception 'storage_path is required';
  end if;

  if not exists (
    select 1
    from storage.objects so
    where so.bucket_id = 'work-order-attachments'
      and so.name = p_storage_path
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

    if lower(coalesce(v_work_order.status, '')) in ('completed', 'cancelled', 'zakończone', 'anulowane') then
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
    content_hash_verified_at
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
    null
  )
  returning * into v_attachment;

  if p_maintenance_stage = 'contractor_completion' then
    v_hash_trust := case
      when p_content_hash_client_asserted is not null then 'client_asserted_unverified'
      else 'not_available'
    end;

    -- E-160 test-only fault-injection gate. Inert when GUC is absent/false (default).
    -- When armed by the deny-test wrapper (transaction-local 'on'), raises AFTER the
    -- work_order_attachments row INSERT is staged in-transaction, proving the full
    -- rollback includes both the row and any photo.received event.
    -- Must RAISE — never skip, no-op, or branch around the real append call.
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
        'attachment_id', v_attachment.id,
        'work_order_id', p_work_order_id,
        'account_id', p_account_id,
        'attester_role', p_attester_role,
        'maintenance_stage', p_maintenance_stage,
        'work_order_status_at_received', v_work_order.status,
        'capture_method', coalesce(p_capture_method, 'uploaded'),
        'received_at', v_attachment.created_at,
        'storage_bucket', 'work-order-attachments',
        'storage_path', p_storage_path,
        'mime_type', p_mime_type,
        'file_size', p_file_size,
        'content_hash_client_asserted', p_content_hash_client_asserted,
        'content_hash_algorithm', case when p_content_hash_client_asserted is not null then 'sha256' else null end,
        'content_hash_verified_at', null,
        'hash_trust', v_hash_trust,
        'late_upload', false
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

comment on function public.record_work_order_attachment_received(
  uuid, uuid, text, text, text, bigint, text, text, text, text, text
) is
  'Storage-first work-order attachment recorder. Inserts DB row and photo.received provenance atomically after confirming the storage object exists. E-150 does not trust EXIF/client timestamps and does not server-verify byte hashes.';

-- Part 2: Evidence lock at work-order completion.
--
-- Lock boundary: COMPLETION, not upload.
--   In-progress work orders: uploaders may freely edit their
--     own evidence (correcting a mis-uploaded photo is legitimate).
--   Completed/cancelled work orders: only account owner/admin/staff
--     may delete (data-correction path). The uploader arm is blocked.
--
-- E-159 consolidation:
--   Keep only the canonical woa_* family. The legacy wo_attach_* family and
--   older wo_attachments_* active-account family are dropped so permissive RLS
--   cannot OR a looser rule back into effect. The retained family is built on
--   can_access_work_order(account_id, work_order_id), repaired above to preserve
--   owner/admin/staff, assigned-contractor, and tenant read semantics.

drop policy if exists "wo_attach_read" on public.work_order_attachments;
drop policy if exists "wo_attach_insert" on public.work_order_attachments;
drop policy if exists "wo_attach_delete" on public.work_order_attachments;
drop policy if exists "wo_attachments_select" on public.work_order_attachments;
drop policy if exists "wo_attachments_insert" on public.work_order_attachments;
drop policy if exists "wo_attachments_delete" on public.work_order_attachments;

drop policy if exists "woa_select" on public.work_order_attachments;
create policy "woa_select" on public.work_order_attachments
  for select to authenticated
  using (
    public.can_access_work_order(account_id, work_order_id)
  );

drop policy if exists "woa_insert" on public.work_order_attachments;
create policy "woa_insert" on public.work_order_attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1
      from public.work_orders wo
      where wo.id = work_order_attachments.work_order_id
        and wo.account_id = work_order_attachments.account_id
        and lower(coalesce(wo.status, '')) not in (
          'completed', 'cancelled',
          'zakończone', 'anulowane'
        )
        and (
          public.is_account_manager(wo.account_id)
          or wo.contractor_user_id = auth.uid()
        )
    )
  );

drop policy if exists "woa_delete" on public.work_order_attachments;
create policy "woa_delete" on public.work_order_attachments
  for delete to authenticated
  using (
    (
      -- Uploader may delete while the work order is still open
      uploaded_by = auth.uid()
      and exists (
        select 1
        from public.work_orders wo
        where wo.id        = work_order_attachments.work_order_id
          and wo.account_id = work_order_attachments.account_id
          and wo.status not in (
            'completed',  'cancelled',
            'zakończone', 'anulowane'
          )
      )
    )
    or
    -- Account owner / admin / staff may always delete (data-correction)
    exists (
      select 1
      from public.account_members am
      where am.account_id = work_order_attachments.account_id
        and am.user_id    = auth.uid()
        and lower(am.role::text) = any(
          array['owner', 'admin', 'staff']
        )
    )
  );

-- ────────────────────────────────────────────────────────────
-- E-074  Checkatrade go-live gate
--
-- category_ids_verified must be true before any account is
-- allowed to set configuration.live_submission_enabled or
-- configuration.external_submission_url.
-- A database trigger enforces this invariant.
-- ────────────────────────────────────────────────────────────

alter table public.marketplace_integration_settings
  add column if not exists category_ids_verified boolean not null default false;

comment on column public.marketplace_integration_settings.category_ids_verified is
  'Must be true (IDs verified against live Checkatrade category API at '
  'https://developer.checkatrade.com/affiliate/categories) before '
  'configuration.live_submission_enabled may be set. '
  'Enforced by tg_enforce_checkatrade_go_live_gate.';

create or replace function public.enforce_checkatrade_go_live_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.provider_key = 'checkatrade'
     and (
       (new.configuration->>'live_submission_enabled')::boolean is true
       or (new.configuration->>'external_submission_url') is not null
     )
     and new.category_ids_verified is not true
  then
    raise exception
      'Checkatrade go-live gate: category_ids_verified must be true before '
      'enabling live submission or setting an external_submission_url. '
      'Verify all 18 category IDs against https://developer.checkatrade.com/affiliate/categories '
      'then set category_ids_verified = true on this record.';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_enforce_checkatrade_go_live_gate
  on public.marketplace_integration_settings;

create trigger tg_enforce_checkatrade_go_live_gate
  before insert or update on public.marketplace_integration_settings
  for each row execute function public.enforce_checkatrade_go_live_gate();

-- ────────────────────────────────────────────────────────────
-- E-160  Atomicity deny-test wrapper (production-path fault injection)
--
-- Sets a transaction-local GUC then calls the REAL
-- record_work_order_attachment_received. The GUC fires inside that function
-- AFTER the work_order_attachments INSERT is staged and BEFORE
-- _append_evidence_provenance_event, raising an exception that rolls back
-- the entire transaction (row + event). Proves the production atomicity
-- claim is executed, not merely inferred from PL/pgSQL semantics.
--
-- The GUC is transaction-local (is_local=true in set_config) and is never
-- set outside this wrapper, so the happy path is completely unaffected.
-- Mirrors capture_inspection_signature_atomicity_deny_test (E-033/E-153).
-- ────────────────────────────────────────────────────────────

drop function if exists public.record_work_order_attachment_received_atomicity_deny_test(
  uuid, uuid, text, text, text, bigint, text, text, text, text, text
);

create or replace function public.record_work_order_attachment_received_atomicity_deny_test(
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
set search_path = public
as $$
begin
  -- Arm the fault injector: transaction-local, inert outside this call.
  perform set_config('app.test_force_wo_photo_provenance_failure', 'on', true);

  -- Call the real production RPC. The GUC fires inside
  -- record_work_order_attachment_received after the INSERT and before
  -- _append_evidence_provenance_event, raising and rolling back everything.
  return public.record_work_order_attachment_received(
    p_account_id                   := p_account_id,
    p_work_order_id                := p_work_order_id,
    p_storage_path                 := p_storage_path,
    p_file_name                    := p_file_name,
    p_mime_type                    := p_mime_type,
    p_file_size                    := p_file_size,
    p_kind                         := p_kind,
    p_attester_role                := p_attester_role,
    p_maintenance_stage            := p_maintenance_stage,
    p_capture_method               := p_capture_method,
    p_content_hash_client_asserted := p_content_hash_client_asserted
  );
end;
$$;

revoke all on function public.record_work_order_attachment_received_atomicity_deny_test(
  uuid, uuid, text, text, text, bigint, text, text, text, text, text
) from public, anon;
grant execute on function public.record_work_order_attachment_received_atomicity_deny_test(
  uuid, uuid, text, text, text, bigint, text, text, text, text, text
) to authenticated;

comment on function public.record_work_order_attachment_received_atomicity_deny_test(
  uuid, uuid, text, text, text, bigint, text, text, text, text, text
) is
  'E-160 atomicity deny-test wrapper. Arms a transaction-local GUC then calls '
  'the real record_work_order_attachment_received. The GUC raises after the '
  'work_order_attachments INSERT and before _append_evidence_provenance_event, '
  'rolling back both to prove production atomicity. Inert outside this wrapper.';

-- Also return category_ids_verified from the settings listing function
-- so the UI can surface an honest staged-vs-live distinction.
drop function if exists public.list_marketplace_integration_settings(uuid);

create or replace function public.list_marketplace_integration_settings(
  p_account_id uuid
)
returns table(
  provider_key          text,
  enabled               boolean,
  configuration         jsonb,
  category_ids_verified boolean,
  updated_at            timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    mp.provider_key,
    coalesce(s.enabled, false),
    coalesce(s.configuration, '{}'::jsonb),
    coalesce(s.category_ids_verified, false),
    s.updated_at
  from public.marketplace_providers mp
  left join public.marketplace_integration_settings s
    on s.provider_key = mp.provider_key
   and s.account_id   = p_account_id
  order by mp.provider_key;
$$;
