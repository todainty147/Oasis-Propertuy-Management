-- =========================================================
-- Document template repository
-- Purpose: account-scoped landlord/admin template library for reusable
-- tenancy, contractor, and compliance document templates.
-- Storage path format:
--   <account_id>/templates/<template_id>/<file>
-- =========================================================

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  country_code text not null,
  language text not null default 'en',
  template_type text not null,
  name text not null,
  description text,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null default 0,
  version integer not null default 1,
  status text not null default 'draft',
  upload_status text not null default 'stub',
  created_by uuid references auth.users(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_templates_country_code_check
    check (country_code ~ '^[A-Z]{2}$'),
  constraint document_templates_language_check
    check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  constraint document_templates_type_check
    check (template_type in (
      'tenancy_agreement',
      'contractor_assignment',
      'maintenance_access_consent',
      'deposit_checklist',
      'rent_receipt',
      'guarantor_form',
      'id_evidence',
      'compliance_notice',
      'other'
    )),
  constraint document_templates_status_check
    check (status in ('draft', 'active', 'archived')),
  constraint document_templates_upload_status_check
    check (upload_status in ('stub', 'uploaded', 'failed')),
  constraint document_templates_mime_check
    check (mime_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )),
  constraint document_templates_size_check
    check (size_bytes >= 0 and size_bytes <= 10485760),
  constraint document_templates_version_check
    check (version >= 1)
);

create index if not exists document_templates_account_idx
  on public.document_templates (account_id);

create index if not exists document_templates_account_country_type_idx
  on public.document_templates (account_id, country_code, template_type, status);

create index if not exists document_templates_account_updated_idx
  on public.document_templates (account_id, updated_at desc);

create or replace function public.can_manage_document_templates(
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
      and public.account_member_effective_role(p_account_id, p_user_id) = any (array['owner', 'admin'])
  );
$$;

revoke all on function public.can_manage_document_templates(uuid, uuid) from public;
grant execute on function public.can_manage_document_templates(uuid, uuid) to authenticated;
grant execute on function public.can_manage_document_templates(uuid, uuid) to service_role;

alter table public.document_templates enable row level security;

drop policy if exists document_templates_select_member on public.document_templates;
drop policy if exists document_templates_insert_manager on public.document_templates;
drop policy if exists document_templates_update_manager on public.document_templates;
drop policy if exists document_templates_delete_none on public.document_templates;

create policy document_templates_select_member
on public.document_templates
for select
to authenticated
using (
  public.account_member_has_permission(account_id, 'documents.read', auth.uid())
  and public.account_member_effective_role(account_id, auth.uid()) = any (array['owner', 'admin', 'staff'])
);

create policy document_templates_insert_manager
on public.document_templates
for insert
to authenticated
with check (public.can_manage_document_templates(account_id, auth.uid()));

create policy document_templates_update_manager
on public.document_templates
for update
to authenticated
using (public.can_manage_document_templates(account_id, auth.uid()))
with check (public.can_manage_document_templates(account_id, auth.uid()));

create policy document_templates_delete_none
on public.document_templates
for delete
to authenticated
using (false);

create or replace function public.sanitize_document_template_filename(p_filename text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_name text := coalesce(nullif(trim(p_filename), ''), 'template.pdf');
begin
  v_name := regexp_replace(v_name, '\s+', '_', 'g');
  v_name := regexp_replace(v_name, '[^A-Za-z0-9_.() -]', '_', 'g');
  v_name := replace(v_name, '/', '_');
  v_name := replace(v_name, '\', '_');
  return left(v_name, 180);
end;
$$;

create or replace function public.create_document_template_stub(
  p_account_id uuid,
  p_country_code text,
  p_language text,
  p_template_type text,
  p_name text,
  p_description text default null,
  p_filename text default null,
  p_mime_type text default 'application/pdf',
  p_size_bytes integer default 0,
  p_actor_user_id uuid default auth.uid()
) returns public.document_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.document_templates;
  v_id uuid := gen_random_uuid();
  v_actor uuid := auth.uid();
  v_country text := upper(trim(coalesce(p_country_code, '')));
  v_language text := lower(trim(coalesce(p_language, 'en')));
  v_filename text := public.sanitize_document_template_filename(p_filename);
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_actor_user_id is not null and p_actor_user_id <> v_actor then
    raise exception 'Actor mismatch';
  end if;

  if p_account_id is null then
    raise exception 'account_id is required';
  end if;

  if not public.can_manage_document_templates(p_account_id, v_actor) then
    raise exception 'Not permitted';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Template name is required';
  end if;

  insert into public.document_templates (
    id,
    account_id,
    country_code,
    language,
    template_type,
    name,
    description,
    storage_path,
    mime_type,
    size_bytes,
    created_by
  )
  values (
    v_id,
    p_account_id,
    v_country,
    v_language,
    p_template_type,
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    p_account_id::text || '/templates/' || v_id::text || '/' || v_filename,
    p_mime_type,
    coalesce(p_size_bytes, 0),
    v_actor
  )
  returning * into v_template;

  return v_template;
end;
$$;

create or replace function public.finalize_document_template_upload(
  p_template_id uuid,
  p_size_bytes integer,
  p_mime_type text,
  p_actor_user_id uuid default auth.uid()
) returns public.document_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.document_templates;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_actor_user_id is not null and p_actor_user_id <> v_actor then
    raise exception 'Actor mismatch';
  end if;

  select * into v_template
  from public.document_templates
  where id = p_template_id;

  if not found then
    raise exception 'Template not found';
  end if;

  if not public.can_manage_document_templates(v_template.account_id, v_actor) then
    raise exception 'Not permitted';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'Invalid file size';
  end if;

  update public.document_templates
  set upload_status = 'uploaded',
      status = 'active',
      size_bytes = p_size_bytes,
      mime_type = p_mime_type,
      uploaded_by = v_actor,
      uploaded_at = now(),
      updated_at = now()
  where id = p_template_id
  returning * into v_template;

  return v_template;
end;
$$;

create or replace function public.archive_document_template(
  p_template_id uuid,
  p_actor_user_id uuid default auth.uid()
) returns public.document_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.document_templates;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_actor_user_id is not null and p_actor_user_id <> v_actor then
    raise exception 'Actor mismatch';
  end if;

  select * into v_template
  from public.document_templates
  where id = p_template_id;

  if not found then
    raise exception 'Template not found';
  end if;

  if not public.can_manage_document_templates(v_template.account_id, v_actor) then
    raise exception 'Not permitted';
  end if;

  update public.document_templates
  set status = 'archived',
      archived_at = coalesce(archived_at, now()),
      updated_at = now()
  where id = p_template_id
  returning * into v_template;

  return v_template;
end;
$$;

create or replace function public.can_access_document_template_storage(
  p_account_id uuid,
  p_template_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.document_templates dt
    where dt.id = p_template_id
      and dt.account_id = p_account_id
      and public.account_member_has_permission(dt.account_id, 'documents.read', auth.uid())
      and public.account_member_effective_role(dt.account_id, auth.uid()) = any (array['owner', 'admin', 'staff'])
  );
$$;

revoke all on function public.create_document_template_stub(uuid, text, text, text, text, text, text, text, integer, uuid) from public;
revoke all on function public.finalize_document_template_upload(uuid, integer, text, uuid) from public;
revoke all on function public.archive_document_template(uuid, uuid) from public;
revoke all on function public.can_access_document_template_storage(uuid, uuid) from public;

grant execute on function public.create_document_template_stub(uuid, text, text, text, text, text, text, text, integer, uuid) to authenticated;
grant execute on function public.finalize_document_template_upload(uuid, integer, text, uuid) to authenticated;
grant execute on function public.archive_document_template(uuid, uuid) to authenticated;
grant execute on function public.can_access_document_template_storage(uuid, uuid) to authenticated;

grant select, insert, update on public.document_templates to authenticated;
grant all on public.document_templates to service_role;

drop policy if exists "document_templates_storage_select_scoped" on storage.objects;
drop policy if exists "document_templates_storage_insert_manager_stub" on storage.objects;

create policy "document_templates_storage_select_scoped"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) = 'templates'
  and split_part(name, '/', 3) ~* '^[0-9a-f-]{36}$'
  and public.can_access_document_template_storage(
    split_part(name, '/', 1)::uuid,
    split_part(name, '/', 3)::uuid
  )
);

create policy "document_templates_storage_insert_manager_stub"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) = 'templates'
  and split_part(name, '/', 3) ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1
    from public.document_templates dt
    where dt.account_id = split_part(name, '/', 1)::uuid
      and dt.id = split_part(name, '/', 3)::uuid
      and dt.upload_status = 'stub'
      and public.can_manage_document_templates(dt.account_id, auth.uid())
  )
);
