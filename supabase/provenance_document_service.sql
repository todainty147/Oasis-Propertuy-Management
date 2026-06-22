-- Tenaqo Provenance Sprint 3: Service, Receipt & Access Evidence
-- Evidential primitives for document service, access, download, receipt,
-- and acknowledgement — all recorded in the existing provenance_events ledger.

-- ─── Document Identity Model ────────────────────────────────────────────────────
-- document_family_id groups versions of the same logical document.
-- The document.id IS the version identifier (document_version_id).

alter table public.documents
  add column if not exists document_family_id uuid;

alter table public.documents
  add column if not exists version_number integer not null default 1;

-- Backfill: each existing document is its own family.
update public.documents
   set document_family_id = id
 where document_family_id is null;

alter table public.documents
  alter column document_family_id set not null;

alter table public.documents
  alter column document_family_id set default gen_random_uuid();

create index if not exists idx_documents_family_id
  on public.documents(document_family_id);

create unique index if not exists idx_documents_family_version
  on public.documents(document_family_id, version_number);

comment on column public.documents.document_family_id is
  'Groups versions of the same logical document (e.g. Gas Safety Certificate). Each version is a separate row with the same family_id.';

comment on column public.documents.version_number is
  'Monotonically increasing version within a document_family_id. v1 = first upload.';

-- ─── Internal validation helper ─────────────────────────────────────────────────

create or replace function public._validate_document_provenance_context(
  p_document_id uuid,
  out v_account_id uuid,
  out v_property_id uuid,
  out v_tenant_id uuid,
  out v_tenancy_id uuid,
  out v_document_family_id uuid,
  out v_version_number integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
  v_lease record;
begin
  select d.id, d.account_id, d.property_id, d.tenant_id,
         d.document_family_id, d.version_number, d.upload_status
    into v_doc
    from public.documents d
   where d.id = p_document_id;

  if not found then
    raise exception 'document not found';
  end if;

  v_account_id := v_doc.account_id;
  v_property_id := v_doc.property_id;
  v_tenant_id := v_doc.tenant_id;
  v_document_family_id := v_doc.document_family_id;
  v_version_number := v_doc.version_number;

  -- Resolve tenancy from active lease if tenant + property are known
  if v_doc.tenant_id is not null and v_doc.property_id is not null then
    select l.id into v_lease
      from public.leases l
     where l.tenant_id = v_doc.tenant_id
       and l.property_id = v_doc.property_id
       and lower(coalesce(l.renewal_status, 'active')) <> 'ended'
     order by l.created_at desc
     limit 1;

    if found then
      v_tenancy_id := v_lease.id;
    end if;
  end if;
end;
$$;

revoke all on function public._validate_document_provenance_context(uuid)
  from public, anon, authenticated;

-- ─── Internal event append (bypasses auth check for tenant-facing events) ───────

create or replace function public._append_document_provenance_event(
  p_account_id uuid,
  p_entity_id uuid,
  p_event_type text,
  p_actor_type text,
  p_actor_user_id uuid,
  p_actor_role text,
  p_occurred_at timestamptz,
  p_summary text,
  p_property_id uuid default null,
  p_tenancy_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_source_type text default null,
  p_visibility text default 'internal',
  p_idempotency_key text default null
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
  perform pg_advisory_xact_lock(hashtext('provenance:' || p_account_id::text), 0);

  if p_idempotency_key is not null then
    select *
      into v_existing_event
      from public.provenance_events
     where account_id = p_account_id
       and idempotency_key = p_idempotency_key;

    if found then
      return v_existing_event.id;
    end if;
  end if;

  insert into public.provenance_event_counters(account_id, next_sequence)
  values (p_account_id, 2)
  on conflict (account_id) do update
    set next_sequence = public.provenance_event_counters.next_sequence + 1
  returning next_sequence - 1 into v_sequence_number;

  insert into public.provenance_events (
    id, account_id, sequence_number,
    entity_type, entity_id, property_id, tenancy_id,
    event_type, event_version,
    actor_type, actor_user_id, actor_role,
    occurred_at, recorded_at,
    summary, reason, metadata,
    source_type,
    visibility,
    previous_event_hash, event_hash, hash_version,
    idempotency_key, created_at
  ) values (
    v_event_id, p_account_id, v_sequence_number,
    'document', p_entity_id, p_property_id, p_tenancy_id,
    p_event_type, 1,
    p_actor_type,
    case when p_actor_type = 'human' then p_actor_user_id else null end,
    p_actor_role,
    p_occurred_at, now(),
    p_summary, null, p_metadata,
    p_source_type,
    p_visibility,
    null, null, 0,
    p_idempotency_key, now()
  );

  return v_event_id;
end;
$$;

revoke all on function public._append_document_provenance_event(
  uuid, uuid, text, text, uuid, text, timestamptz, text, uuid, uuid, jsonb, text, text, text
) from public, anon, authenticated;

-- ─── 1. document.uploaded ───────────────────────────────────────────────────────

create or replace function public.record_document_uploaded(
  p_document_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_ctx record;
  v_doc record;
  v_idem_key text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  v_role := public.account_member_effective_role(v_ctx.v_account_id, v_uid);
  if coalesce(v_role, '') not in ('owner', 'admin', 'staff') then
    raise exception 'account operator role required';
  end if;

  select d.name, d.mime_type, d.size_bytes,
         d.source, d.uploaded_at, d.document_family_id, d.version_number,
         d.upload_status, d.scan_status
    into v_doc
    from public.documents d where d.id = p_document_id;

  if coalesce(v_doc.upload_status, 'stub') <> 'uploaded' then
    raise exception 'document upload not completed (status: %)', coalesce(v_doc.upload_status, 'stub');
  end if;

  if coalesce(v_doc.scan_status, 'legacy_unscanned') in ('flagged', 'scan_failed') then
    raise exception 'document failed malware scan (status: %)', v_doc.scan_status;
  end if;

  v_idem_key := 'document.uploaded:' || p_document_id::text;

  return public._append_document_provenance_event(
    v_ctx.v_account_id, p_document_id,
    'document.uploaded', 'human', v_uid, v_role,
    coalesce(v_doc.uploaded_at, now()),
    'Document transfer completed: ' || coalesce(v_doc.name, 'unknown'),
    v_ctx.v_property_id, v_ctx.v_tenancy_id,
    jsonb_build_object(
      'document_family_id', v_ctx.v_document_family_id,
      'document_version_id', p_document_id,
      'version_number', v_ctx.v_version_number,
      'filename', v_doc.name,
      'mime_type', v_doc.mime_type,
      'file_size', v_doc.size_bytes,
      'document_source', v_doc.source,
      'scan_pending', coalesce(v_doc.scan_status, 'legacy_unscanned') = 'pending_scan'
    ),
    null, 'account', v_idem_key
  );
end;
$$;

revoke all on function public.record_document_uploaded(uuid)
  from public, anon, authenticated;
grant execute on function public.record_document_uploaded(uuid) to authenticated;

-- ─── 2. document.served_asserted ────────────────────────────────────────────────

create or replace function public.record_document_served_asserted(
  p_document_id uuid,
  p_service_method text,
  p_recipient text,
  p_asserted_service_date timestamptz,
  p_assertion_note text default null,
  p_supporting_evidence_reference text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_ctx record;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  v_role := public.account_member_effective_role(v_ctx.v_account_id, v_uid);
  if coalesce(v_role, '') not in ('owner', 'admin', 'staff') then
    raise exception 'account operator role required';
  end if;

  if nullif(btrim(p_service_method), '') is null then
    raise exception 'service_method is required';
  end if;
  if nullif(btrim(p_recipient), '') is null then
    raise exception 'recipient is required';
  end if;

  return public._append_document_provenance_event(
    v_ctx.v_account_id, p_document_id,
    'document.served_asserted', 'human', v_uid, v_role,
    coalesce(p_asserted_service_date, now()),
    'Landlord-recorded service assertion',
    v_ctx.v_property_id, v_ctx.v_tenancy_id,
    jsonb_build_object(
      'document_family_id', v_ctx.v_document_family_id,
      'document_version_id', p_document_id,
      'service_method', p_service_method,
      'recipient_hash', encode(extensions.digest(convert_to(btrim(lower(p_recipient)), 'UTF8'), 'sha256'), 'hex'),
      'asserted_service_date', p_asserted_service_date,
      'asserted_by_user', v_uid,
      'supporting_evidence_reference', p_supporting_evidence_reference
    ),
    null, 'account', null
  );
end;
$$;

revoke all on function public.record_document_served_asserted(uuid, text, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.record_document_served_asserted(uuid, text, text, timestamptz, text, text) to authenticated;

-- ─── 3. document.served_system ──────────────────────────────────────────────────
-- Service-role only: system events must originate from trusted backend callers.

create or replace function public.record_document_served_system(
  p_document_id uuid,
  p_recipient_user_id uuid,
  p_recipient_email text,
  p_notification_id uuid default null,
  p_provider_message_id text default null,
  p_send_status text default 'sent',
  p_sent_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_idem_key text;
  v_notification record;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'service_role required for system events';
  end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  if p_notification_id is not null then
    select n.id, n.account_id, n.recipient_user_id,
           n.entity_type, n.entity_id
      into v_notification
      from public.notifications n
     where n.id = p_notification_id;
    if not found then
      raise exception 'referenced notification not found';
    end if;
    if v_notification.account_id <> v_ctx.v_account_id then
      raise exception 'notification does not belong to this account';
    end if;
    if v_notification.recipient_user_id <> p_recipient_user_id then
      raise exception 'notification recipient does not match';
    end if;
    if v_notification.entity_id is not null and v_notification.entity_id <> p_document_id then
      raise exception 'notification does not reference this document';
    end if;
  end if;

  v_idem_key := 'document.served_system:' || p_document_id::text
    || ':' || coalesce(p_provider_message_id, coalesce(p_notification_id::text, p_recipient_user_id::text));

  return public._append_document_provenance_event(
    v_ctx.v_account_id, p_document_id,
    'document.served_system', 'system', null, 'system',
    coalesce(p_sent_at, now()),
    'Service sent by Tenaqo',
    v_ctx.v_property_id, v_ctx.v_tenancy_id,
    jsonb_build_object(
      'document_family_id', v_ctx.v_document_family_id,
      'document_version_id', p_document_id,
      'recipient_user_id', p_recipient_user_id,
      'recipient_email_hash', encode(extensions.digest(convert_to(btrim(lower(p_recipient_email)), 'UTF8'), 'sha256'), 'hex'),
      'notification_id', p_notification_id,
      'provider_message_id', p_provider_message_id,
      'send_status', p_send_status,
      'sent_at', coalesce(p_sent_at, now())
    ),
    'notification', 'account', v_idem_key
  );
end;
$$;

revoke all on function public.record_document_served_system(uuid, uuid, text, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_document_served_system(uuid, uuid, text, uuid, text, text, timestamptz) to service_role;

-- ─── 4. document.delivery_confirmed ─────────────────────────────────────────────
-- Service-role only: webhook events must originate from trusted backend callers.

create or replace function public.record_document_delivery_confirmed(
  p_document_id uuid,
  p_provider_message_id text,
  p_confirmed_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_idem_key text;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'service_role required for webhook events';
  end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  -- Causal validation: a served_system event with this provider_message_id must exist
  if not exists (
    select 1 from public.provenance_events pe
     where pe.account_id = v_ctx.v_account_id
       and pe.entity_type = 'document'
       and pe.entity_id = p_document_id
       and pe.event_type = 'document.served_system'
       and pe.metadata ->> 'provider_message_id' = p_provider_message_id
  ) then
    raise exception 'no preceding served_system event with this provider_message_id';
  end if;

  v_idem_key := 'document.delivery_confirmed:' || p_document_id::text
    || ':' || p_provider_message_id;

  return public._append_document_provenance_event(
    v_ctx.v_account_id, p_document_id,
    'document.delivery_confirmed', 'system', null, 'system',
    coalesce(p_confirmed_at, now()),
    'Delivery confirmed by provider',
    v_ctx.v_property_id, v_ctx.v_tenancy_id,
    jsonb_build_object(
      'document_family_id', v_ctx.v_document_family_id,
      'document_version_id', p_document_id,
      'provider_message_id', p_provider_message_id,
      'confirmed_at', coalesce(p_confirmed_at, now())
    ),
    'webhook', 'account', v_idem_key
  );
end;
$$;

revoke all on function public.record_document_delivery_confirmed(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_document_delivery_confirmed(uuid, text, timestamptz) to service_role;

-- ─── 5. document.service_failed ─────────────────────────────────────────────────
-- Service-role only: webhook events must originate from trusted backend callers.

create or replace function public.record_document_service_failed(
  p_document_id uuid,
  p_provider_message_id text,
  p_failure_reason text,
  p_failed_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_idem_key text;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'service_role required for webhook events';
  end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  -- Causal validation: a served_system event with this provider_message_id must exist
  if not exists (
    select 1 from public.provenance_events pe
     where pe.account_id = v_ctx.v_account_id
       and pe.entity_type = 'document'
       and pe.entity_id = p_document_id
       and pe.event_type = 'document.served_system'
       and pe.metadata ->> 'provider_message_id' = p_provider_message_id
  ) then
    raise exception 'no preceding served_system event with this provider_message_id';
  end if;

  v_idem_key := 'document.service_failed:' || p_document_id::text
    || ':' || p_provider_message_id;

  return public._append_document_provenance_event(
    v_ctx.v_account_id, p_document_id,
    'document.service_failed', 'system', null, 'system',
    coalesce(p_failed_at, now()),
    'Service attempt failed',
    v_ctx.v_property_id, v_ctx.v_tenancy_id,
    jsonb_build_object(
      'document_family_id', v_ctx.v_document_family_id,
      'document_version_id', p_document_id,
      'provider_message_id', p_provider_message_id,
      'failure_category', case
        when p_failure_reason ilike '%bounce%' then 'bounced'
        when p_failure_reason ilike '%reject%' then 'rejected'
        when p_failure_reason ilike '%timeout%' then 'timeout'
        else 'other'
      end,
      'failed_at', coalesce(p_failed_at, now())
    ),
    'webhook', 'account', v_idem_key
  );
end;
$$;

revoke all on function public.record_document_service_failed(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_document_service_failed(uuid, text, text, timestamptz) to service_role;

-- ─── 6. document.available ──────────────────────────────────────────────────────

create or replace function public.record_document_available(
  p_document_id uuid,
  p_tenant_user_id uuid,
  p_access_grant_id uuid,
  p_access_channel text,
  p_available_from timestamptz default null,
  p_available_until timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_ctx record;
  v_doc_visibility text;
  v_idem_key text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  v_role := public.account_member_effective_role(v_ctx.v_account_id, v_uid);
  if coalesce(v_role, '') not in ('owner', 'admin', 'staff') then
    raise exception 'account operator role required';
  end if;

  -- Validate document visibility is 'tenant' (making it available to a tenant)
  select d.visibility into v_doc_visibility
    from public.documents d where d.id = p_document_id;

  if coalesce(v_doc_visibility, 'staff') <> 'tenant' then
    raise exception 'document visibility must be tenant to make available';
  end if;

  -- Validate tenant belongs to this account
  if not exists (
    select 1 from public.tenants t
     where t.user_id = p_tenant_user_id
       and t.account_id = v_ctx.v_account_id
  ) then
    raise exception 'invalid tenant for this account';
  end if;

  -- Validate tenant is associated with this document
  if v_ctx.v_tenant_id is not null then
    if not exists (
      select 1 from public.tenants t
       where t.user_id = p_tenant_user_id
         and t.id = v_ctx.v_tenant_id
    ) then
      raise exception 'tenant does not match document association';
    end if;
  end if;

  v_idem_key := 'document.available:' || p_document_id::text
    || ':' || p_access_grant_id::text;

  return public._append_document_provenance_event(
    v_ctx.v_account_id, p_document_id,
    'document.available', 'human', v_uid, v_role,
    coalesce(p_available_from, now()),
    'Document made available to tenant',
    v_ctx.v_property_id, v_ctx.v_tenancy_id,
    jsonb_build_object(
      'document_family_id', v_ctx.v_document_family_id,
      'document_version_id', p_document_id,
      'tenant_user_id', p_tenant_user_id,
      'access_grant_id', p_access_grant_id,
      'access_channel', p_access_channel,
      'available_from', coalesce(p_available_from, now()),
      'available_until', p_available_until
    ),
    'access_grant', 'account', v_idem_key
  );
end;
$$;

revoke all on function public.record_document_available(uuid, uuid, uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_document_available(uuid, uuid, uuid, text, timestamptz, timestamptz) to authenticated;

-- ─── 30-minute debounce bucket helper ───────────────────────────────────────────

create or replace function public._document_debounce_window(
  p_timestamp timestamptz default now()
) returns text
language sql
immutable
as $$
  select to_char(
    date_trunc('hour', p_timestamp)
      + (floor(extract(minute from p_timestamp) / 30) * interval '30 minutes'),
    'YYYY-MM-DD"T"HH24:MI'
  );
$$;

-- ─── 7. document.viewed ─────────────────────────────────────────────────────────
-- Service-role only. Must be called from the authoritative document access path,
-- not directly from the browser. Validates document visibility for the tenant.

create or replace function public.record_document_viewed(
  p_document_id uuid,
  p_tenant_user_id uuid,
  p_access_grant_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_tenant record;
  v_doc_visibility text;
  v_window text;
  v_idem_key text;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'service_role required for access evidence';
  end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  select t.id, t.user_id into v_tenant
    from public.tenants t
   where t.user_id = p_tenant_user_id
     and t.account_id = v_ctx.v_account_id;

  if not found then
    raise exception 'tenant access required';
  end if;

  if v_ctx.v_tenant_id is not null and v_tenant.id <> v_ctx.v_tenant_id then
    raise exception 'document not accessible to this tenant';
  end if;

  select d.visibility into v_doc_visibility
    from public.documents d where d.id = p_document_id;

  if coalesce(v_doc_visibility, 'staff') <> 'tenant' then
    raise exception 'document visibility does not permit tenant access';
  end if;

  v_window := public._document_debounce_window(now());
  v_idem_key := 'document.viewed:' || p_document_id::text
    || ':' || p_tenant_user_id::text || ':' || v_window;

  return public._append_document_provenance_event(
    v_ctx.v_account_id, p_document_id,
    'document.viewed', 'human', p_tenant_user_id, 'tenant',
    now(),
    'Tenant viewed this document',
    v_ctx.v_property_id, v_ctx.v_tenancy_id,
    jsonb_build_object(
      'document_family_id', v_ctx.v_document_family_id,
      'document_version_id', p_document_id,
      'tenant_user_id', p_tenant_user_id,
      'access_grant_id', p_access_grant_id,
      'viewed_at', now(),
      'debounce_window', v_window
    ),
    null, 'account', v_idem_key
  );
end;
$$;

revoke all on function public.record_document_viewed(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_document_viewed(uuid, uuid, uuid) to service_role;

-- ─── 8. document.downloaded ─────────────────────────────────────────────────────
-- Service-role only. Must be called from the authoritative download endpoint
-- after access validation and signed-URL delivery succeeds.

create or replace function public.record_document_downloaded(
  p_document_id uuid,
  p_tenant_user_id uuid,
  p_download_route text default 'signed_url'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_tenant record;
  v_doc_visibility text;
  v_window text;
  v_idem_key text;
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'service_role required for access evidence';
  end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  select t.id, t.user_id into v_tenant
    from public.tenants t
   where t.user_id = p_tenant_user_id
     and t.account_id = v_ctx.v_account_id;

  if not found then
    raise exception 'tenant access required';
  end if;

  if v_ctx.v_tenant_id is not null and v_tenant.id <> v_ctx.v_tenant_id then
    raise exception 'document not accessible to this tenant';
  end if;

  select d.visibility into v_doc_visibility
    from public.documents d where d.id = p_document_id;

  if coalesce(v_doc_visibility, 'staff') <> 'tenant' then
    raise exception 'document visibility does not permit tenant access';
  end if;

  v_window := public._document_debounce_window(now());
  v_idem_key := 'document.downloaded:' || p_document_id::text
    || ':' || p_tenant_user_id::text || ':' || v_window;

  return public._append_document_provenance_event(
    v_ctx.v_account_id, p_document_id,
    'document.downloaded', 'human', p_tenant_user_id, 'tenant',
    now(),
    'Tenant downloaded this document',
    v_ctx.v_property_id, v_ctx.v_tenancy_id,
    jsonb_build_object(
      'document_family_id', v_ctx.v_document_family_id,
      'document_version_id', p_document_id,
      'tenant_user_id', p_tenant_user_id,
      'download_route', p_download_route,
      'downloaded_at', now(),
      'debounce_window', v_window
    ),
    null, 'account', v_idem_key
  );
end;
$$;

revoke all on function public.record_document_downloaded(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_document_downloaded(uuid, uuid, text) to service_role;

-- ─── 9. document.acknowledged ───────────────────────────────────────────────────
-- Duplicate acknowledgements are kept (each is a real event).
-- Only network retries are deduped via submission_nonce.
-- Tenant-callable but validates document visibility.

create or replace function public.record_document_acknowledged(
  p_document_id uuid,
  p_acknowledgement_text text,
  p_acknowledgement_text_version text,
  p_acknowledgement_method text default 'click',
  p_locale text default 'en',
  p_access_grant_id uuid default null,
  p_submission_nonce text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ctx record;
  v_tenant record;
  v_doc_visibility text;
  v_idem_key text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  if nullif(btrim(p_acknowledgement_text), '') is null then
    raise exception 'acknowledgement_text is required';
  end if;
  if nullif(btrim(p_acknowledgement_text_version), '') is null then
    raise exception 'acknowledgement_text_version is required';
  end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  select t.id, t.user_id into v_tenant
    from public.tenants t
   where t.user_id = v_uid
     and t.account_id = v_ctx.v_account_id;

  if not found then
    raise exception 'tenant access required';
  end if;

  if v_ctx.v_tenant_id is not null and v_tenant.id <> v_ctx.v_tenant_id then
    raise exception 'document not accessible to this tenant';
  end if;

  select d.visibility into v_doc_visibility
    from public.documents d where d.id = p_document_id;

  if coalesce(v_doc_visibility, 'staff') <> 'tenant' then
    raise exception 'document visibility does not permit tenant access';
  end if;

  -- Dedup only network retries via submission_nonce
  if p_submission_nonce is not null then
    v_idem_key := 'document.acknowledged:' || p_document_id::text
      || ':' || v_uid::text || ':' || p_submission_nonce;
  end if;

  return public._append_document_provenance_event(
    v_ctx.v_account_id, p_document_id,
    'document.acknowledged', 'human', v_uid, 'tenant',
    now(),
    'Tenant acknowledged receipt',
    v_ctx.v_property_id, v_ctx.v_tenancy_id,
    jsonb_build_object(
      'document_family_id', v_ctx.v_document_family_id,
      'document_version_id', p_document_id,
      'tenant_user_id', v_uid,
      'acknowledgement_text', p_acknowledgement_text,
      'acknowledgement_text_version', p_acknowledgement_text_version,
      'acknowledgement_method', p_acknowledgement_method,
      'locale', p_locale,
      'access_grant_id', p_access_grant_id,
      'acknowledged_at', now(),
      'submission_nonce', p_submission_nonce
    ),
    null, 'account', v_idem_key
  );
end;
$$;

revoke all on function public.record_document_acknowledged(uuid, text, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_document_acknowledged(uuid, text, text, text, text, uuid, text) to authenticated;

-- ─── 10. document.expired ───────────────────────────────────────────────────────

create or replace function public.record_document_expired(
  p_document_id uuid,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_ctx record;
  v_idem_key text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  v_role := public.account_member_effective_role(v_ctx.v_account_id, v_uid);
  if coalesce(v_role, '') not in ('owner', 'admin', 'staff') then
    raise exception 'account operator role required';
  end if;

  v_idem_key := 'document.expired:' || p_document_id::text;

  return public._append_document_provenance_event(
    v_ctx.v_account_id, p_document_id,
    'document.expired', 'human', v_uid, v_role,
    now(),
    'Document expired',
    v_ctx.v_property_id, v_ctx.v_tenancy_id,
    jsonb_build_object(
      'document_family_id', v_ctx.v_document_family_id,
      'document_version_id', p_document_id,
      'reason', p_reason
    ),
    null, 'account', v_idem_key
  );
end;
$$;

revoke all on function public.record_document_expired(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_document_expired(uuid, text) to authenticated;

-- ─── 11. document.replaced ──────────────────────────────────────────────────────

create or replace function public.record_document_replaced(
  p_document_id uuid,
  p_replacement_document_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_ctx record;
  v_replacement record;
  v_next_version integer;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  v_role := public.account_member_effective_role(v_ctx.v_account_id, v_uid);
  if coalesce(v_role, '') not in ('owner', 'admin', 'staff') then
    raise exception 'account operator role required';
  end if;

  -- Cannot replace a document with itself
  if p_replacement_document_id = p_document_id then
    raise exception 'cannot replace a document with itself';
  end if;

  -- Validate replacement document exists and belongs to the same account
  select d.id, d.account_id, d.document_family_id
    into v_replacement
    from public.documents d where d.id = p_replacement_document_id
    for update;

  if not found then
    raise exception 'replacement document not found';
  end if;
  if v_replacement.account_id <> v_ctx.v_account_id then
    raise exception 'replacement document must belong to the same account';
  end if;

  -- Prevent re-parenting a document that already has provenance history
  if exists (
    select 1 from public.provenance_events pe
     where pe.entity_type = 'document'
       and pe.entity_id = p_replacement_document_id
  ) then
    raise exception 'replacement document already has provenance history';
  end if;

  -- Family-level advisory lock for safe version allocation
  perform pg_advisory_xact_lock(
    hashtext('doc_family:' || v_ctx.v_document_family_id::text), 0
  );

  -- Compute next version safely under family lock
  select coalesce(max(d.version_number), 0) + 1
    into v_next_version
    from public.documents d
   where d.document_family_id = v_ctx.v_document_family_id;

  update public.documents
     set document_family_id = v_ctx.v_document_family_id,
         version_number = v_next_version
   where id = p_replacement_document_id;

  return public._append_document_provenance_event(
    v_ctx.v_account_id, p_document_id,
    'document.replaced', 'human', v_uid, v_role,
    now(),
    'Document replaced by new version',
    v_ctx.v_property_id, v_ctx.v_tenancy_id,
    jsonb_build_object(
      'document_family_id', v_ctx.v_document_family_id,
      'document_version_id', p_document_id,
      'replacement_document_id', p_replacement_document_id,
      'replacement_version_number', v_next_version
    ),
    null, 'account', null
  );
end;
$$;

revoke all on function public.record_document_replaced(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_document_replaced(uuid, uuid) to authenticated;

-- ─── 12. document.withdrawn ─────────────────────────────────────────────────────

create or replace function public.record_document_withdrawn(
  p_document_id uuid,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_ctx record;
  v_idem_key text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  v_role := public.account_member_effective_role(v_ctx.v_account_id, v_uid);
  if coalesce(v_role, '') not in ('owner', 'admin', 'staff') then
    raise exception 'account operator role required';
  end if;

  v_idem_key := 'document.withdrawn:' || p_document_id::text;

  return public._append_document_provenance_event(
    v_ctx.v_account_id, p_document_id,
    'document.withdrawn', 'human', v_uid, v_role,
    now(),
    'Document withdrawn',
    v_ctx.v_property_id, v_ctx.v_tenancy_id,
    jsonb_build_object(
      'document_family_id', v_ctx.v_document_family_id,
      'document_version_id', p_document_id,
      'reason', p_reason
    ),
    null, 'account', v_idem_key
  );
end;
$$;

revoke all on function public.record_document_withdrawn(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_document_withdrawn(uuid, text) to authenticated;

-- ─── Document service status projection ─────────────────────────────────────────
-- Computes the current service lifecycle state for a document version
-- from the immutable event stream.

create or replace function public.document_service_projection(
  p_document_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ctx record;
  v_role text;
  v_is_tenant boolean := false;
  v_doc_visibility text;
  v_has_uploaded boolean := false;
  v_has_served_asserted boolean := false;
  v_has_served_system boolean := false;
  v_has_delivery_confirmed boolean := false;
  v_has_service_failed boolean := false;
  v_has_available boolean := false;
  v_has_viewed boolean := false;
  v_has_downloaded boolean := false;
  v_has_acknowledged boolean := false;
  v_has_expired boolean := false;
  v_has_replaced boolean := false;
  v_has_withdrawn boolean := false;
  v_first_ack_at timestamptz;
  v_ack_count integer := 0;
  v_view_count integer := 0;
  v_download_count integer := 0;
  v_status text;
  v_evidence_strength integer := 0;
  v_ev record;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  v_role := public.account_member_effective_role(v_ctx.v_account_id, v_uid);
  if coalesce(v_role, '') not in ('owner', 'admin', 'staff') then
    -- Check if tenant
    if exists (
      select 1 from public.tenants t
       where t.user_id = v_uid and t.account_id = v_ctx.v_account_id
    ) then
      v_is_tenant := true;
    else
      raise exception 'access denied';
    end if;
  end if;

  -- Tenant callers: validate document visibility
  if v_is_tenant then
    select d.visibility into v_doc_visibility
      from public.documents d where d.id = p_document_id;

    if coalesce(v_doc_visibility, 'staff') <> 'tenant' then
      raise exception 'document visibility does not permit tenant access';
    end if;

    -- Successor tenant isolation
    if v_ctx.v_tenant_id is not null then
      if not exists (
        select 1 from public.tenants t
         where t.user_id = v_uid and t.id = v_ctx.v_tenant_id
      ) then
        raise exception 'document not accessible to this tenant';
      end if;
    end if;
  end if;

  for v_ev in
    select pe.event_type, pe.occurred_at, pe.metadata
      from public.provenance_events pe
     where pe.account_id = v_ctx.v_account_id
       and pe.entity_type = 'document'
       and pe.entity_id = p_document_id
     order by pe.sequence_number asc
  loop
    case v_ev.event_type
      when 'document.uploaded' then v_has_uploaded := true;
      when 'document.served_asserted' then v_has_served_asserted := true;
      when 'document.served_system' then v_has_served_system := true;
      when 'document.delivery_confirmed' then v_has_delivery_confirmed := true;
      when 'document.service_failed' then v_has_service_failed := true;
      when 'document.available' then v_has_available := true;
      when 'document.viewed' then
        v_has_viewed := true;
        v_view_count := v_view_count + 1;
      when 'document.downloaded' then
        v_has_downloaded := true;
        v_download_count := v_download_count + 1;
      when 'document.acknowledged' then
        v_ack_count := v_ack_count + 1;
        if not v_has_acknowledged then
          v_has_acknowledged := true;
          v_first_ack_at := v_ev.occurred_at;
        end if;
      when 'document.expired' then v_has_expired := true;
      when 'document.replaced' then v_has_replaced := true;
      when 'document.withdrawn' then v_has_withdrawn := true;
      else null;
    end case;
  end loop;

  -- Compute projection status (Finding 6: service_failed now affects status)
  v_status := case
    when v_has_withdrawn then 'withdrawn'
    when v_has_expired then 'expired'
    when v_has_replaced then 'replaced'
    when v_has_acknowledged then 'acknowledged'
    when v_has_downloaded then 'available_downloaded'
    when v_has_viewed then 'available_viewed'
    when v_has_available and not v_has_viewed then 'available_no_access'
    when v_has_service_failed and not v_has_delivery_confirmed
         and not v_has_served_asserted then 'service_failed'
    when v_has_delivery_confirmed then 'delivery_confirmed'
    when v_has_served_system or v_has_served_asserted then 'service_recorded'
    when v_has_uploaded then 'uploaded'
    else 'unknown'
  end;

  -- Access Evidence Strength (1-4)
  -- Delivery confirmation strengthens service evidence but stays at level 2
  -- Service failure with no confirmation/assertion downgrades to 1
  v_evidence_strength := case
    when v_has_acknowledged then 4
    when v_has_viewed or v_has_downloaded then 3
    when (v_has_served_asserted or v_has_served_system)
         and not (v_has_service_failed and not v_has_delivery_confirmed
                  and not v_has_served_asserted) then 2
    when v_has_uploaded then 1
    else 0
  end;

  return jsonb_build_object(
    'document_id', p_document_id,
    'document_family_id', v_ctx.v_document_family_id,
    'version_number', v_ctx.v_version_number,
    'status', v_status,
    'access_evidence_strength', v_evidence_strength,
    'has_uploaded', v_has_uploaded,
    'has_served_asserted', v_has_served_asserted,
    'has_served_system', v_has_served_system,
    'has_delivery_confirmed', v_has_delivery_confirmed,
    'has_service_failed', v_has_service_failed,
    'has_available', v_has_available,
    'has_viewed', v_has_viewed,
    'has_downloaded', v_has_downloaded,
    'has_acknowledged', v_has_acknowledged,
    'has_expired', v_has_expired,
    'has_replaced', v_has_replaced,
    'has_withdrawn', v_has_withdrawn,
    'view_count', v_view_count,
    'download_count', v_download_count,
    'acknowledgement_count', v_ack_count,
    'first_acknowledgement_at', v_first_ack_at
  );
end;
$$;

revoke all on function public.document_service_projection(uuid)
  from public, anon, authenticated;
grant execute on function public.document_service_projection(uuid) to authenticated;

-- ─── Timeline RPC ───────────────────────────────────────────────────────────────
-- Reuses existing chain verification and anchoring infrastructure.

create or replace function public.get_document_service_timeline(
  p_document_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ctx record;
  v_role text;
  v_is_tenant boolean := false;
  v_tenant_id uuid;
  v_doc_visibility text;
  v_events jsonb := '[]'::jsonb;
  v_ev record;
  v_doc record;
  v_chain_valid boolean;
  v_chain_checked bigint;
  v_chain_verified_at timestamptz;
  v_chain_stale boolean := true;
  v_anchor record;
  v_projection jsonb;
  v_status record;
  v_current_head record;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_ctx
    from public._validate_document_provenance_context(p_document_id);

  v_role := public.account_member_effective_role(v_ctx.v_account_id, v_uid);
  if coalesce(v_role, '') not in ('owner', 'admin', 'staff') then
    select t.id into v_tenant_id
      from public.tenants t
     where t.user_id = v_uid and t.account_id = v_ctx.v_account_id;

    if v_tenant_id is null then
      raise exception 'access denied';
    end if;

    v_is_tenant := true;

    -- Successor tenant must not see prior tenant evidence
    if v_ctx.v_tenant_id is not null and v_tenant_id <> v_ctx.v_tenant_id then
      raise exception 'document not accessible to this tenant';
    end if;

    -- Tenant callers: validate document visibility
    select d.visibility into v_doc_visibility
      from public.documents d where d.id = p_document_id;

    if coalesce(v_doc_visibility, 'staff') <> 'tenant' then
      raise exception 'document visibility does not permit tenant access';
    end if;
  end if;

  -- Document metadata
  select d.name, d.mime_type, d.size_bytes, d.document_family_id, d.version_number
    into v_doc
    from public.documents d where d.id = p_document_id;

  -- Collect events for this document version
  for v_ev in
    select pe.id as event_id,
           pe.event_type,
           pe.occurred_at as effective_at,
           pe.recorded_at,
           pe.actor_type,
           pe.actor_role,
           pe.source_type,
           pe.summary,
           pe.event_hash as evidence_hash,
           pe.metadata
      from public.provenance_events pe
     where pe.account_id = v_ctx.v_account_id
       and pe.entity_type = 'document'
       and pe.entity_id = p_document_id
     order by pe.sequence_number asc
  loop
    v_events := v_events || jsonb_build_object(
      'event_id', v_ev.event_id,
      'event_type', v_ev.event_type,
      'effective_at', v_ev.effective_at,
      'recorded_at', v_ev.recorded_at,
      'actor_type', v_ev.actor_type,
      'actor_role', v_ev.actor_role,
      'source_type', v_ev.source_type,
      'document_version_id', p_document_id,
      'safe_metadata_summary', v_ev.summary,
      'evidence_hash', v_ev.evidence_hash,
      'is_system_observed', v_ev.actor_type in ('system', 'integration'),
      'is_manual_assertion', v_ev.event_type = 'document.served_asserted',
      'is_reconstructed', coalesce(
        (v_ev.metadata ->> 'reconstructed')::boolean,
        (v_ev.metadata ->> 'source') = 'reconstruction',
        false
      )
    );
  end loop;

  -- Head-freshness check: compare stored verification head to current chain head
  select h.head_sequence, h.head_hash
    into v_current_head
    from public.get_provenance_chain_head(v_ctx.v_account_id) h;

  select s.verified, s.last_verified_at, s.event_count,
         s.head_sequence, s.head_hash
    into v_status
    from public.provenance_chain_status s
   where s.account_id = v_ctx.v_account_id;

  if found then
    v_chain_stale := v_status.head_sequence is distinct from coalesce(v_current_head.head_sequence, 0)
                  or v_status.head_hash is distinct from v_current_head.head_hash;
    if not v_chain_stale then
      v_chain_valid := v_status.verified;
      v_chain_checked := v_status.event_count;
      v_chain_verified_at := v_status.last_verified_at;
    else
      v_chain_valid := null;
      v_chain_checked := 0;
      v_chain_verified_at := null;
    end if;
  else
    v_chain_valid := null;
    v_chain_checked := 0;
    v_chain_verified_at := null;
  end if;

  -- Default anchor to safe nulls; tenant callers lack verify permission
  select false as has_anchor, null::boolean as anchor_consistent,
         0::bigint as events_after_anchor, null::timestamptz as anchored_at
    into v_anchor;

  if not v_is_tenant then
    begin
      select va.has_anchor, va.anchor_consistent, va.events_after_anchor, va.anchored_at
        into v_anchor
        from public.verify_provenance_anchor(v_ctx.v_account_id) va;
    exception when others then
      null;
    end;
  end if;

  -- Projection for status and access evidence strength
  v_projection := public.document_service_projection(p_document_id);

  return jsonb_build_object(
    'document_id', p_document_id,
    'document_family_id', v_doc.document_family_id,
    'document_version', jsonb_build_object(
      'version_number', v_doc.version_number,
      'filename', v_doc.name,
      'mime_type', v_doc.mime_type,
      'file_size', v_doc.size_bytes
    ),
    'status', v_projection ->> 'status',
    'access_evidence_strength', (v_projection ->> 'access_evidence_strength')::integer,
    'events', v_events,
    'ledger_integrity_status', case
      when v_chain_stale then 'stale'
      when v_chain_valid is true then 'passed'
      when v_chain_valid is false then 'failed'
      else 'unverified'
    end,
    'verified_at', v_chain_verified_at,
    'anchor_summary', jsonb_build_object(
      'has_anchor', coalesce(v_anchor.has_anchor, false),
      'anchor_consistent', v_anchor.anchor_consistent,
      'events_after_anchor', coalesce(v_anchor.events_after_anchor, 0),
      'anchored_at', v_anchor.anchored_at
    ),
    'safe_user_message', case
      when v_chain_valid is false then
        'A verification check found an inconsistency. Our team has been notified.'
      else
        'This reflects Tenaqo''s access record only and does not determine legal validity of service.'
    end,
    'access_evidence_disclaimer',
      'This reflects Tenaqo''s access record only and does not determine legal validity of service.'
  );
end;
$$;

comment on function public.get_document_service_timeline(uuid) is
  'Returns the full service & access timeline for a document version, including access evidence strength, ledger integrity, and anchor summary. Sprint 3.';

revoke all on function public.get_document_service_timeline(uuid)
  from public, anon, authenticated;
grant execute on function public.get_document_service_timeline(uuid) to authenticated;
