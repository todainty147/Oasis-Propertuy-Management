-- =========================================================
-- Document requests and intake
-- Purpose: tenant/contractor document upload requests with manager review.
-- Builds on public.documents without exposing manager-only files broadly.
-- =========================================================

alter table if exists public.documents
  add column if not exists source text not null default 'landlord_upload',
  add column if not exists uploaded_by_role text,
  add column if not exists uploaded_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists review_status text not null default 'accepted',
  add column if not exists review_note text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_source_check') then
    alter table public.documents
      add constraint documents_source_check
      check (source in ('landlord_upload', 'tenant_upload', 'contractor_upload', 'template_generated', 'signature_completed'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'documents_uploaded_by_role_check') then
    alter table public.documents
      add constraint documents_uploaded_by_role_check
      check (uploaded_by_role is null or uploaded_by_role in ('owner', 'admin', 'staff', 'tenant', 'contractor'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'documents_review_status_check') then
    alter table public.documents
      add constraint documents_review_status_check
      check (review_status in ('pending_review', 'accepted', 'rejected'));
  end if;
end $$;

create index if not exists documents_account_source_idx
  on public.documents (account_id, source);

create index if not exists documents_account_review_status_idx
  on public.documents (account_id, review_status);

create table if not exists public.document_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  target_role text not null,
  tenant_id uuid references public.tenants(id) on delete cascade,
  contractor_id uuid references public.contractors(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  template_id uuid references public.document_templates(id) on delete set null,
  request_type text not null,
  title text not null,
  instructions text,
  due_at date,
  status text not null default 'requested',
  requested_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_requests_target_role_check
    check (target_role in ('tenant', 'contractor')),
  constraint document_requests_target_check
    check (
      (target_role = 'tenant' and tenant_id is not null and contractor_id is null)
      or
      (target_role = 'contractor' and contractor_id is not null and tenant_id is null)
    ),
  constraint document_requests_type_check
    check (request_type in (
      'id_document',
      'bank_payment_receipt',
      'signed_agreement',
      'insurance_certificate',
      'contractor_terms',
      'other'
    )),
  constraint document_requests_status_check
    check (status in ('requested', 'uploaded', 'accepted', 'rejected', 'cancelled'))
);

create table if not exists public.document_request_uploads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  request_id uuid not null references public.document_requests(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_role text not null,
  file_name text not null,
  mime_type text,
  size_bytes integer not null default 0,
  review_status text not null default 'pending_review',
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_request_uploads_role_check
    check (uploaded_by_role in ('tenant', 'contractor')),
  constraint document_request_uploads_review_status_check
    check (review_status in ('pending_review', 'accepted', 'rejected'))
);

create index if not exists document_requests_account_status_idx
  on public.document_requests (account_id, status, created_at desc);

create index if not exists document_requests_tenant_idx
  on public.document_requests (tenant_id, status, created_at desc);

create index if not exists document_requests_contractor_idx
  on public.document_requests (contractor_id, status, created_at desc);

create index if not exists document_request_uploads_request_idx
  on public.document_request_uploads (request_id, created_at desc);

create or replace function public.set_document_request_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_document_requests_updated_at on public.document_requests;
create trigger trg_document_requests_updated_at
before update on public.document_requests
for each row execute function public.set_document_request_updated_at();

drop trigger if exists trg_document_request_uploads_updated_at on public.document_request_uploads;
create trigger trg_document_request_uploads_updated_at
before update on public.document_request_uploads
for each row execute function public.set_document_request_updated_at();

create or replace function public.can_manage_document_requests(
  p_account_id uuid,
  p_user_id uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_members am
    where am.account_id = p_account_id
      and am.user_id = p_user_id
      and public.account_member_has_permission(p_account_id, 'documents.upload', p_user_id)
      and public.account_member_effective_role(p_account_id, p_user_id) = any (array['owner', 'admin', 'staff'])
  );
$$;

create or replace function public.is_document_request_target(
  p_request_id uuid,
  p_user_id uuid default auth.uid()
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.document_requests dr
    left join public.tenants t
      on t.id = dr.tenant_id
      and t.account_id = dr.account_id
      and t.archived_at is null
    left join public.contractors c
      on c.id = dr.contractor_id
      and c.account_id = dr.account_id
      and c.active = true
    where dr.id = p_request_id
      and (
        (dr.target_role = 'tenant' and t.user_id = p_user_id)
        or
        (dr.target_role = 'contractor' and c.user_id = p_user_id)
      )
  );
$$;

create or replace function public.create_document_request(
  p_account_id uuid,
  p_target_role text,
  p_tenant_id uuid default null,
  p_contractor_id uuid default null,
  p_property_id uuid default null,
  p_template_id uuid default null,
  p_request_type text default 'other',
  p_title text default null,
  p_instructions text default null,
  p_due_at date default null,
  p_actor_user_id uuid default auth.uid()
) returns public.document_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.document_requests;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;
  if p_account_id is null then raise exception 'account_id is required'; end if;
  if not public.can_manage_document_requests(p_account_id, v_actor) then raise exception 'Not permitted'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'Request title is required'; end if;

  if p_target_role = 'tenant' then
    if not exists (
      select 1 from public.tenants t
      where t.id = p_tenant_id and t.account_id = p_account_id and t.archived_at is null
    ) then
      raise exception 'Tenant not found';
    end if;
  elsif p_target_role = 'contractor' then
    if not exists (
      select 1 from public.contractors c
      where c.id = p_contractor_id and c.account_id = p_account_id and c.active = true
    ) then
      raise exception 'Contractor not found';
    end if;
  else
    raise exception 'Invalid target_role';
  end if;

  if p_property_id is not null and not exists (
    select 1 from public.properties p where p.id = p_property_id and p.account_id = p_account_id
  ) then
    raise exception 'Property not found';
  end if;

  if p_template_id is not null and not exists (
    select 1 from public.document_templates dt where dt.id = p_template_id and dt.account_id = p_account_id
  ) then
    raise exception 'Template not found';
  end if;

  insert into public.document_requests (
    account_id,
    target_role,
    tenant_id,
    contractor_id,
    property_id,
    template_id,
    request_type,
    title,
    instructions,
    due_at,
    requested_by
  )
  values (
    p_account_id,
    p_target_role,
    p_tenant_id,
    p_contractor_id,
    p_property_id,
    p_template_id,
    p_request_type,
    trim(p_title),
    nullif(trim(coalesce(p_instructions, '')), ''),
    p_due_at,
    v_actor
  )
  returning * into v_request;

  return v_request;
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
set search_path = public
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
    v_request.account_id::text || '/' || v_doc_id::text || '/' || v_safe_filename,
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

create or replace function public.finalize_document_request_upload(
  p_document_id uuid,
  p_size_bytes integer,
  p_mime_type text,
  p_original_filename text default null,
  p_actor_user_id uuid default auth.uid()
) returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_doc public.documents;
  v_upload public.document_request_uploads;
  v_request public.document_requests;
  v_safe_name text;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;

  select * into v_doc from public.documents where id = p_document_id;
  if not found then raise exception 'Document not found'; end if;

  select * into v_upload from public.document_request_uploads where document_id = p_document_id;
  if not found then raise exception 'Upload not found'; end if;

  select * into v_request from public.document_requests where id = v_upload.request_id;
  if not found then raise exception 'Request not found'; end if;

  if not public.is_document_request_target(v_request.id, v_actor) then raise exception 'Not permitted'; end if;

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
      uploaded_by = v_actor,
      uploaded_by_user_id = v_actor,
      uploaded_by_role = v_request.target_role,
      review_status = 'pending_review',
      updated_at = now()
  where id = p_document_id
  returning * into v_doc;

  update public.document_request_uploads
  set file_name = v_safe_name,
      mime_type = p_mime_type,
      size_bytes = p_size_bytes,
      review_status = 'pending_review'
  where id = v_upload.id;

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

create or replace function public.review_document_request_upload(
  p_upload_id uuid,
  p_review_status text,
  p_review_note text default null,
  p_actor_user_id uuid default auth.uid()
) returns public.document_request_uploads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_upload public.document_request_uploads;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;
  if p_review_status not in ('accepted', 'rejected') then raise exception 'Invalid review status'; end if;

  select * into v_upload from public.document_request_uploads where id = p_upload_id;
  if not found then raise exception 'Upload not found'; end if;

  if not public.can_manage_document_requests(v_upload.account_id, v_actor) then raise exception 'Not permitted'; end if;

  update public.document_request_uploads
  set review_status = p_review_status,
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      reviewed_by = v_actor,
      reviewed_at = now()
  where id = p_upload_id
  returning * into v_upload;

  update public.documents
  set review_status = p_review_status,
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      reviewed_by = v_actor,
      reviewed_at = now(),
      updated_at = now()
  where id = v_upload.document_id;

  update public.document_requests
  set status = p_review_status,
      reviewed_by = v_actor,
      reviewed_at = now()
  where id = v_upload.request_id;

  return v_upload;
end;
$$;

create or replace function public.cancel_document_request(
  p_request_id uuid,
  p_actor_user_id uuid default auth.uid()
) returns public.document_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.document_requests;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> v_actor then raise exception 'Actor mismatch'; end if;

  select * into v_request from public.document_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;
  if not public.can_manage_document_requests(v_request.account_id, v_actor) then raise exception 'Not permitted'; end if;

  update public.document_requests
  set status = 'cancelled'
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

create or replace function public.can_insert_document_request_upload_storage(
  p_account_id uuid,
  p_document_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents d
    join public.document_request_uploads dru on dru.document_id = d.id
    join public.document_requests dr on dr.id = dru.request_id
    where d.account_id = p_account_id
      and d.id = p_document_id
      and d.upload_status = 'stub'
      and public.is_document_request_target(dr.id, p_user_id)
  );
$$;

alter table public.document_requests enable row level security;
alter table public.document_request_uploads enable row level security;

drop policy if exists document_requests_select_managers_or_target on public.document_requests;
create policy document_requests_select_managers_or_target
on public.document_requests
for select
to authenticated
using (
  public.can_manage_document_requests(account_id, auth.uid())
  or public.is_document_request_target(id, auth.uid())
);

drop policy if exists document_requests_no_direct_write on public.document_requests;
create policy document_requests_no_direct_write
on public.document_requests
for all
to authenticated
using (false)
with check (false);

drop policy if exists document_request_uploads_select_managers_or_target on public.document_request_uploads;
create policy document_request_uploads_select_managers_or_target
on public.document_request_uploads
for select
to authenticated
using (
  public.can_manage_document_requests(account_id, auth.uid())
  or exists (
    select 1 from public.document_requests dr
    where dr.id = document_request_uploads.request_id
      and public.is_document_request_target(dr.id, auth.uid())
  )
);

drop policy if exists document_request_uploads_no_direct_write on public.document_request_uploads;
create policy document_request_uploads_no_direct_write
on public.document_request_uploads
for all
to authenticated
using (false)
with check (false);

create or replace function public.can_access_document_storage(
  p_account_id uuid,
  p_document_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and d.account_id = p_account_id
      and (
        public.account_member_effective_role(d.account_id, auth.uid()) = any (array['owner','admin'])
        or (
          public.account_member_effective_role(d.account_id, auth.uid()) = 'staff'
          and d.visibility <> 'owner_admin'
        )
        or (
          d.visibility = 'tenant'
          and exists (
            select 1
            from public.tenants t
            where t.account_id = d.account_id
              and t.user_id = auth.uid()
              and t.archived_at is null
              and t.id = d.tenant_id
          )
        )
        or exists (
          select 1
          from public.document_request_uploads dru
          join public.document_requests dr on dr.id = dru.request_id
          where dru.document_id = d.id
            and public.is_document_request_target(dr.id, auth.uid())
        )
      )
  );
$$;

drop policy if exists "document_request_upload_storage_insert_target" on storage.objects;
create policy "document_request_upload_storage_insert_target"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and public.can_insert_document_request_upload_storage(
    split_part(name, '/', 1)::uuid,
    split_part(name, '/', 2)::uuid,
    auth.uid()
  )
);

revoke all on function public.can_manage_document_requests(uuid, uuid) from public;
revoke all on function public.is_document_request_target(uuid, uuid) from public;
revoke all on function public.create_document_request(uuid, text, uuid, uuid, uuid, uuid, text, text, text, date, uuid) from public;
revoke all on function public.create_document_request_upload_stub(uuid, text, text, integer, uuid) from public;
revoke all on function public.finalize_document_request_upload(uuid, integer, text, text, uuid) from public;
revoke all on function public.review_document_request_upload(uuid, text, text, uuid) from public;
revoke all on function public.cancel_document_request(uuid, uuid) from public;
revoke all on function public.can_insert_document_request_upload_storage(uuid, uuid, uuid) from public;

grant execute on function public.can_manage_document_requests(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_document_request_target(uuid, uuid) to authenticated, service_role;
grant execute on function public.create_document_request(uuid, text, uuid, uuid, uuid, uuid, text, text, text, date, uuid) to authenticated, service_role;
grant execute on function public.create_document_request_upload_stub(uuid, text, text, integer, uuid) to authenticated, service_role;
grant execute on function public.finalize_document_request_upload(uuid, integer, text, text, uuid) to authenticated, service_role;
grant execute on function public.review_document_request_upload(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function public.cancel_document_request(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_insert_document_request_upload_storage(uuid, uuid, uuid) to authenticated, service_role;

grant select on public.document_requests to authenticated;
grant select on public.document_request_uploads to authenticated;
grant all on public.document_requests to service_role;
grant all on public.document_request_uploads to service_role;
