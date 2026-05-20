begin;

alter table if exists public.documents
  add column if not exists scan_status text not null default 'legacy_unscanned',
  add column if not exists scanned_at timestamptz null,
  add column if not exists scanned_by_system boolean not null default false,
  add column if not exists scan_provider text null,
  add column if not exists scan_reference_id text null,
  add column if not exists scan_error text null,
  add column if not exists quarantine_reason text null,
  add column if not exists storage_path_quarantine text null,
  add column if not exists storage_path_active text null;

alter table public.documents
  drop constraint if exists documents_scan_status_check;

alter table public.documents
  add constraint documents_scan_status_check
  check (scan_status in ('legacy_unscanned', 'pending_scan', 'clean', 'flagged', 'scan_failed'));

alter table public.documents
  drop constraint if exists documents_scan_flag_reason_check;

alter table public.documents
  add constraint documents_scan_flag_reason_check
  check (
    scan_status <> 'flagged'
    or nullif(trim(coalesce(quarantine_reason, '')), '') is not null
  );

alter table public.documents
  drop constraint if exists documents_scan_failed_reason_check;

alter table public.documents
  add constraint documents_scan_failed_reason_check
  check (
    scan_status <> 'scan_failed'
    or nullif(trim(coalesce(scan_error, quarantine_reason, '')), '') is not null
  );

alter table public.documents
  alter column scan_status set default 'pending_scan';

update public.documents
set storage_path_active = storage_path
where storage_path_active is null
  and storage_path is not null
  and scan_status in ('legacy_unscanned', 'clean');

update public.documents
set storage_path_quarantine = storage_path
where storage_path_quarantine is null
  and storage_path like 'quarantine/%';

create index if not exists documents_account_scan_status_idx
  on public.documents (account_id, scan_status, created_at desc);

create index if not exists documents_scan_paths_idx
  on public.documents (account_id, scan_status, storage_path_active, storage_path_quarantine);

comment on column public.documents.scan_status
  is 'Malware scan state. legacy_unscanned is a rollout state for files created before scan enforcement.';

comment on column public.documents.scan_reference_id
  is 'Scanner reference text. For ClamAV this is the sanitized raw INSTREAM response, not a UUID.';

create or replace function public.is_valid_document_storage_path(
  p_storage_path text,
  p_account_id uuid,
  p_document_id uuid,
  p_zone text default null
) returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_parts text[];
  v_zone text;
begin
  if p_storage_path is null or p_account_id is null or p_document_id is null then
    return false;
  end if;

  v_parts := string_to_array(p_storage_path, '/');

  if array_length(v_parts, 1) <> 4 then
    return false;
  end if;

  v_zone := lower(coalesce(v_parts[1], ''));
  if v_zone not in ('quarantine', 'active') then
    return false;
  end if;

  if p_zone is not null and v_zone <> lower(trim(p_zone)) then
    return false;
  end if;

  if v_parts[2] <> p_account_id::text then
    return false;
  end if;

  if v_parts[3] <> p_document_id::text then
    return false;
  end if;

  if nullif(trim(coalesce(v_parts[4], '')), '') is null then
    return false;
  end if;

  return true;
end;
$$;

create or replace function public.can_insert_document_quarantine_storage(
  p_storage_path text
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parts text[];
  v_account_id uuid;
  v_document_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_parts := string_to_array(coalesce(p_storage_path, ''), '/');
  if array_length(v_parts, 1) <> 4 then
    return false;
  end if;

  if v_parts[1] <> 'quarantine' then
    return false;
  end if;

  if public.safe_uuid(v_parts[2]) is null or public.safe_uuid(v_parts[3]) is null then
    return false;
  end if;

  v_account_id := public.safe_uuid(v_parts[2]);
  v_document_id := public.safe_uuid(v_parts[3]);

  return exists (
    select 1
    from public.documents d
    where d.id = v_document_id
      and d.account_id = v_account_id
      and d.scan_status = 'pending_scan'
      and d.upload_status = 'stub'
      and d.storage_path_quarantine = p_storage_path
      and d.storage_path = p_storage_path
      and public.account_member_has_permission(d.account_id, 'documents.upload', auth.uid())
  );
end;
$$;

create or replace function public.create_document_stub(
  p_account_id uuid,
  p_scope text,
  p_visibility text default 'staff',
  p_property_id uuid default null,
  p_tenant_id uuid default null,
  p_filename text default null,
  p_mime_type text default null,
  p_size_bytes integer default null,
  p_tags public.document_tag[] default '{}'::public.document_tag[]
) returns public.documents
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_doc public.documents;
  v_doc_id uuid := gen_random_uuid();
  v_safe_filename text;
  v_storage_path text;
  v_role text;
begin
  if p_account_id is null then
    raise exception 'account_id is required';
  end if;

  v_role := public.account_role_for(p_account_id);
  if v_role not in ('owner','admin','staff') then
    raise exception 'Not permitted';
  end if;

  if p_scope not in ('property','tenant','shared','account') then
    raise exception 'Invalid scope: %', p_scope;
  end if;

  if p_visibility not in ('owner_admin','staff','tenant','private') then
    raise exception 'Invalid visibility: %', p_visibility;
  end if;

  if p_scope = 'property' and (p_property_id is null or p_tenant_id is not null) then
    raise exception 'scope=property requires property_id and tenant_id must be null';
  end if;

  if p_scope = 'tenant' and (p_tenant_id is null or p_property_id is not null) then
    raise exception 'scope=tenant requires tenant_id and property_id must be null';
  end if;

  if p_scope = 'shared' and (p_property_id is null or p_tenant_id is null) then
    raise exception 'scope=shared requires both property_id and tenant_id';
  end if;

  if p_scope = 'account' and (p_property_id is not null or p_tenant_id is not null) then
    raise exception 'scope=account requires property_id and tenant_id to be null';
  end if;

  if p_size_bytes is not null and p_size_bytes > 10485760 then
    raise exception 'File too large (max 10MB)';
  end if;

  if p_mime_type is not null and p_mime_type not in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) then
    raise exception 'Invalid mime_type: %', p_mime_type;
  end if;

  v_safe_filename := coalesce(nullif(trim(p_filename), ''), 'file');
  v_safe_filename := replace(v_safe_filename, '/', '_');
  v_safe_filename := replace(v_safe_filename, '\', '_');
  v_storage_path := 'quarantine/' || p_account_id::text || '/' || v_doc_id::text || '/' || v_safe_filename;

  insert into public.documents (
    id,
    account_id,
    scope,
    visibility,
    property_id,
    tenant_id,
    name,
    storage_path,
    storage_path_quarantine,
    storage_path_active,
    mime_type,
    size_bytes,
    tags,
    created_via,
    created_by_user_id,
    uploaded_by,
    scan_status,
    scanned_by_system,
    upload_status,
    created_at,
    updated_at
  )
  values (
    v_doc_id,
    p_account_id,
    p_scope,
    p_visibility,
    p_property_id,
    p_tenant_id,
    v_safe_filename,
    v_storage_path,
    v_storage_path,
    null,
    p_mime_type,
    coalesce(p_size_bytes, 0),
    coalesce(p_tags, '{}'::public.document_tag[]),
    'rpc',
    auth.uid(),
    auth.uid(),
    'pending_scan',
    false,
    'stub',
    now(),
    now()
  )
  returning * into v_doc;

  return v_doc;
end;
$$;

create or replace function public.create_document_stub_as(
  p_account_id uuid,
  p_scope text,
  p_visibility text default 'staff',
  p_property_id uuid default null,
  p_tenant_id uuid default null,
  p_filename text default null,
  p_mime_type text default null,
  p_size_bytes integer default null,
  p_tags public.document_tag[] default '{}'::public.document_tag[],
  p_actor_user_id uuid default auth.uid()
) returns public.documents
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_actor_user_id is not null and p_actor_user_id <> auth.uid() then
    raise exception 'Actor mismatch';
  end if;

  return public.create_document_stub(
    p_account_id,
    p_scope,
    p_visibility,
    p_property_id,
    p_tenant_id,
    p_filename,
    p_mime_type,
    p_size_bytes,
    p_tags
  );
end;
$$;

create or replace function public.create_document_request_upload_stub(
  p_request_id uuid,
  p_filename text,
  p_mime_type text,
  p_size_bytes integer,
  p_actor_user_id uuid default auth.uid()
) returns public.documents
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.document_requests;
  v_doc public.documents;
  v_doc_id uuid := gen_random_uuid();
  v_upload_id uuid := gen_random_uuid();
  v_safe_filename text;
  v_scope text;
  v_source text;
  v_storage_path text;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;

  select * into v_request from public.document_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;
  if v_request.status in ('accepted', 'cancelled') then raise exception 'Request is closed'; end if;
  if not public.is_document_request_target(p_request_id, v_actor) then raise exception 'Not permitted'; end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'Invalid file size';
  end if;

  if p_mime_type not in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) then
    raise exception 'Invalid mime_type: %', p_mime_type;
  end if;

  v_safe_filename := coalesce(nullif(trim(p_filename), ''), 'document');
  v_safe_filename := replace(v_safe_filename, '/', '_');
  v_safe_filename := replace(v_safe_filename, '\', '_');
  v_storage_path := 'quarantine/' || v_request.account_id::text || '/' || v_doc_id::text || '/' || v_safe_filename;

  v_scope := case
    when v_request.tenant_id is not null and v_request.property_id is not null then 'shared'
    when v_request.tenant_id is not null then 'tenant'
    when v_request.property_id is not null then 'property'
    else 'account'
  end;

  v_source := case when v_request.target_role = 'tenant' then 'tenant_upload' else 'contractor_upload' end;

  insert into public.documents (
    id,
    account_id,
    scope,
    visibility,
    property_id,
    tenant_id,
    name,
    storage_path,
    storage_path_quarantine,
    storage_path_active,
    mime_type,
    size_bytes,
    tags,
    created_via,
    created_by_user_id,
    uploaded_by,
    uploaded_by_user_id,
    uploaded_by_role,
    source,
    review_status,
    scan_status,
    scanned_by_system,
    upload_status,
    created_at,
    updated_at
  )
  values (
    v_doc_id,
    v_request.account_id,
    v_scope,
    'staff',
    v_request.property_id,
    v_request.tenant_id,
    v_safe_filename,
    v_storage_path,
    v_storage_path,
    null,
    p_mime_type,
    p_size_bytes,
    '{}'::public.document_tag[],
    'document_request',
    v_actor,
    v_actor,
    v_actor,
    v_request.target_role,
    v_source,
    'pending_review',
    'pending_scan',
    false,
    'stub',
    now(),
    now()
  )
  returning * into v_doc;

  insert into public.document_request_uploads (
    id,
    account_id,
    request_id,
    document_id,
    uploaded_by,
    uploaded_by_role,
    file_name,
    mime_type,
    size_bytes
  )
  values (
    v_upload_id,
    v_request.account_id,
    v_request.id,
    v_doc.id,
    v_actor,
    v_request.target_role,
    v_safe_filename,
    p_mime_type,
    p_size_bytes
  );

  update public.document_requests
  set status = 'uploaded'
  where id = v_request.id
    and status in ('requested', 'rejected');

  return v_doc;
end;
$$;

create or replace function public.finalize_document_upload(
  p_document_id uuid,
  p_size_bytes integer,
  p_mime_type text,
  p_original_filename text default null,
  p_tags public.document_tag[] default null,
  p_actor_user_id uuid default auth.uid()
) returns public.documents
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_doc public.documents;
  v_role text;
  v_safe_name text;
begin
  if p_document_id is null then
    raise exception 'document_id is required';
  end if;

  if p_actor_user_id is null then
    raise exception 'Not authenticated: actor_user_id is required';
  end if;

  select * into v_doc
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Document not found';
  end if;

  v_role := public.account_role_for(v_doc.account_id);
  if coalesce(v_role, '') not in ('owner','admin','staff') then
    raise exception 'Not permitted';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'size_bytes must be > 0';
  end if;

  if p_size_bytes > 10485760 then
    raise exception 'File too large (max 10MB)';
  end if;

  if p_mime_type not in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) then
    raise exception 'Invalid mime_type: %', p_mime_type;
  end if;

  if v_doc.scan_status <> 'pending_scan' then
    raise exception 'Document upload can be finalized only while scan is pending';
  end if;

  if nullif(trim(coalesce(v_doc.storage_path_quarantine, '')), '') is null then
    raise exception 'Document has no quarantine storage path';
  end if;

  v_safe_name := coalesce(nullif(trim(p_original_filename), ''), v_doc.name);
  v_safe_name := replace(v_safe_name, '/', '_');
  v_safe_name := replace(v_safe_name, '\', '_');

  update public.documents
  set upload_status = 'uploaded',
      uploaded_at = now(),
      size_bytes = p_size_bytes,
      mime_type = p_mime_type,
      original_filename = coalesce(original_filename, v_safe_name),
      name = v_safe_name,
      tags = coalesce(p_tags, tags),
      uploaded_by = coalesce(uploaded_by, p_actor_user_id),
      created_by_user_id = coalesce(created_by_user_id, p_actor_user_id),
      updated_at = now()
  where id = p_document_id
  returning * into v_doc;

  insert into public.document_audit_log (
    document_id,
    action,
    performed_by,
    performed_at,
    account_id,
    property_id,
    tenant_id,
    created_at
  )
  values (
    v_doc.id,
    'upload',
    p_actor_user_id,
    now(),
    v_doc.account_id,
    v_doc.property_id,
    v_doc.tenant_id,
    now()
  );

  return v_doc;
end;
$$;

create or replace function public.audit_document_access(
  p_document_id uuid
) returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_doc
  from public.documents
  where id = p_document_id;

  if not found then
    raise exception 'Document not found';
  end if;

  if not public.can_access_document_storage(v_doc.account_id, v_doc.id) then
    raise exception 'Document access denied';
  end if;

  if v_doc.upload_status <> 'uploaded' then
    raise exception 'Document upload is not complete';
  end if;

  if v_doc.scan_status not in ('clean', 'legacy_unscanned') then
    case v_doc.scan_status
      when 'pending_scan' then
        raise exception 'This file is being scanned and is not available yet';
      when 'flagged' then
        raise exception 'This file has been quarantined and is not available';
      when 'scan_failed' then
        raise exception 'This file scan failed. Retry or review is required';
      else
        raise exception 'Document is not available until malware scanning is clean';
    end case;
  end if;

  if v_doc.scan_status = 'clean'
     and nullif(trim(coalesce(v_doc.storage_path_active, '')), '') is null then
    raise exception 'Document has no active storage path';
  end if;

  if v_doc.scan_status = 'legacy_unscanned'
     and nullif(trim(coalesce(v_doc.storage_path, '')), '') is null then
    raise exception 'Document has no legacy storage path';
  end if;

  insert into public.document_audit_log (
    document_id,
    action,
    performed_by,
    performed_at,
    account_id,
    property_id,
    tenant_id,
    created_at
  )
  values (
    v_doc.id,
    'access',
    auth.uid(),
    now(),
    v_doc.account_id,
    v_doc.property_id,
    v_doc.tenant_id,
    now()
  );

  return v_doc;
end;
$$;

create or replace function public.request_document_scan(
  p_document_id uuid
) returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
  v_actor uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  select *
  into v_doc
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Document not found';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.can_access_document_storage(v_doc.account_id, v_doc.id) then
    raise exception 'You are not allowed to request a scan for this document';
  end if;
  -- Intentionally allow any user who can already read the document to retry scanning.
  -- Only the private scanner service can record a result.

  if v_doc.upload_status <> 'uploaded' then
    raise exception 'Document upload is not complete';
  end if;

  if nullif(trim(coalesce(v_doc.storage_path_quarantine, '')), '') is null then
    raise exception 'Document has no quarantine object to scan';
  end if;

  update public.documents
  set scan_status = 'pending_scan',
      scanned_at = null,
      scanned_by_system = false,
      scan_error = null,
      quarantine_reason = null,
      updated_at = now()
  where id = p_document_id
  returning * into v_doc;

  insert into public.document_audit_log (
    document_id,
    action,
    performed_by,
    performed_at,
    account_id,
    property_id,
    tenant_id,
    created_at
  )
  values (
    v_doc.id,
    'scan_requested',
    v_actor,
    now(),
    v_doc.account_id,
    v_doc.property_id,
    v_doc.tenant_id,
    now()
  );

  return v_doc;
end;
$$;

drop function if exists public.record_document_scan_result(uuid, text, text, text, text, boolean, text, text);

create or replace function public.record_document_scan_result(
  p_document_id uuid,
  p_scan_status text,
  p_scan_provider text default null,
  p_scan_reference_id text default null,
  p_quarantine_reason text default null,
  p_scanned_by_system boolean default true,
  p_storage_path_active text default null,
  p_scan_error text default null
) returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
  v_scan_status text := lower(trim(coalesce(p_scan_status, '')));
  v_reference text := nullif(regexp_replace(coalesce(p_scan_reference_id, ''), '[[:cntrl:]]+', ' ', 'g'), '');
  v_reason text := nullif(trim(coalesce(p_quarantine_reason, '')), '');
  v_scan_error text := nullif(trim(coalesce(p_scan_error, '')), '');
  v_active_path text := nullif(trim(coalesce(p_storage_path_active, '')), '');
  v_actor uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  v_action text;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  if v_scan_status not in ('clean', 'flagged', 'scan_failed') then
    raise exception 'Scan result must be clean, flagged, or scan_failed';
  end if;

  if v_scan_status = 'clean' and v_active_path is null then
    raise exception 'Clean scan result requires active storage path';
  end if;

  if v_scan_status = 'flagged' and v_reason is null then
    raise exception 'Quarantine reason is required for flagged documents';
  end if;

  if v_scan_status = 'scan_failed' and coalesce(v_scan_error, v_reason) is null then
    raise exception 'Scan failure reason is required';
  end if;

  select *
  into v_doc
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Document not found';
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and public.account_member_effective_role(v_doc.account_id, auth.uid()) not in ('owner', 'admin') then
    raise exception 'Service role or account administrator authority required to record scan results';
  end if;

  if v_doc.upload_status <> 'uploaded' then
    raise exception 'Document upload is not complete';
  end if;

  if v_scan_status = 'clean'
     and not public.is_valid_document_storage_path(v_active_path, v_doc.account_id, v_doc.id, 'active') then
    raise exception 'Invalid active storage path for clean document';
  end if;

  v_action := case v_scan_status
    when 'clean' then 'scan_clean'
    when 'scan_failed' then 'scan_failed'
    else 'scan_flagged'
  end;

  update public.documents
  set scan_status = v_scan_status,
      scanned_at = now(),
      scanned_by_system = coalesce(p_scanned_by_system, true),
      scan_provider = nullif(trim(coalesce(p_scan_provider, '')), ''),
      scan_reference_id = v_reference,
      storage_path_active = case when v_scan_status = 'clean' then v_active_path else storage_path_active end,
      storage_path = case when v_scan_status = 'clean' then v_active_path else coalesce(storage_path_quarantine, storage_path) end,
      quarantine_reason = case when v_scan_status = 'flagged' then v_reason else null end,
      scan_error = case when v_scan_status = 'scan_failed' then coalesce(v_scan_error, v_reason) else null end,
      updated_at = now()
  where id = p_document_id
  returning * into v_doc;

  insert into public.document_audit_log (
    document_id,
    action,
    performed_by,
    performed_at,
    account_id,
    property_id,
    tenant_id,
    created_at
  )
  values (
    v_doc.id,
    v_action,
    v_actor,
    now(),
    v_doc.account_id,
    v_doc.property_id,
    v_doc.tenant_id,
    now()
  );

  return v_doc;
end;
$$;

create or replace function public.bypass_document_scan(
  p_document_id uuid,
  p_reason text
) returns public.documents
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Document scan bypass is disabled. Retry scanning or keep the document quarantined.';
end;
$$;

drop policy if exists "documents_storage_insert_member_stub" on storage.objects;

create policy "documents_storage_insert_member_stub"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and public.can_insert_document_quarantine_storage(name)
);

revoke all on function public.is_valid_document_storage_path(text, uuid, uuid, text) from public;
revoke all on function public.can_insert_document_quarantine_storage(text) from public;
revoke all on function public.audit_document_access(uuid) from public;
revoke all on function public.request_document_scan(uuid) from public;
revoke all on function public.record_document_scan_result(uuid, text, text, text, text, boolean, text, text) from public;
revoke all on function public.bypass_document_scan(uuid, text) from public;
revoke all on function public.create_document_stub(uuid, text) from public, anon, authenticated;

grant execute on function public.is_valid_document_storage_path(text, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.can_insert_document_quarantine_storage(text) to authenticated, service_role;
grant execute on function public.audit_document_access(uuid) to authenticated, service_role;
grant execute on function public.request_document_scan(uuid) to authenticated, service_role;
grant execute on function public.record_document_scan_result(uuid, text, text, text, text, boolean, text, text) to service_role;

commit;
