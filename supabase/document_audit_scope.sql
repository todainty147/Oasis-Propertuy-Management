alter table if exists public.document_audit_log
  add column if not exists property_id uuid,
  add column if not exists tenant_id uuid;

create index if not exists document_audit_log_property_id_idx
  on public.document_audit_log (property_id);

create index if not exists document_audit_log_tenant_id_idx
  on public.document_audit_log (tenant_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_audit_log_property_id_fkey'
  ) then
    alter table public.document_audit_log
      add constraint document_audit_log_property_id_fkey
      foreign key (property_id) references public.properties(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_audit_log_tenant_id_fkey'
  ) then
    alter table public.document_audit_log
      add constraint document_audit_log_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id);
  end if;
end $$;

update public.document_audit_log dal
set
  property_id = d.property_id,
  tenant_id = d.tenant_id
from public.documents d
where dal.document_id = d.id
  and (
    dal.property_id is distinct from d.property_id
    or dal.tenant_id is distinct from d.tenant_id
  );

create or replace function public.delete_document_and_audit(
  p_document_id uuid,
  p_actor_user_id uuid default auth.uid()
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_doc public.documents;
  v_role text;
begin
  if p_document_id is null then
    raise exception 'document_id is required';
  end if;

  if p_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_doc
  from public.documents
  where id = p_document_id;

  if not found then
    raise exception 'Document not found';
  end if;

  v_role := public.account_role_for(v_doc.account_id);
  if v_role not in ('owner','admin') then
    raise exception 'Not permitted';
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
    'delete',
    p_actor_user_id,
    now(),
    v_doc.account_id,
    v_doc.property_id,
    v_doc.tenant_id,
    now()
  );

  delete from public.documents where id = v_doc.id;
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
  where id = p_document_id;

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

create or replace function public.log_document_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  insert into public.document_audit_log (
    document_id,
    action,
    performed_by,
    account_id,
    property_id,
    tenant_id,
    created_at
  )
  values (
    old.id,
    'delete',
    auth.uid(),
    old.account_id,
    old.property_id,
    old.tenant_id,
    now()
  );

  return old;
end;
$$;

create or replace function public.set_document_tags(
  p_document_id uuid,
  p_tags public.document_tag[],
  p_actor_user_id uuid default auth.uid()
) returns public.documents
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_doc public.documents;
  v_role text;
begin
  if p_document_id is null then
    raise exception 'document_id is required';
  end if;

  if p_actor_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_doc
  from public.documents
  where id = p_document_id;

  if not found then
    raise exception 'Document not found';
  end if;

  v_role := public.account_role_for(v_doc.account_id);
  if v_role not in ('owner','admin','staff') then
    raise exception 'Not permitted';
  end if;

  update public.documents
  set tags = coalesce(p_tags, '{}'::public.document_tag[]),
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
    'download',
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
