alter table if exists public.documents
  add column if not exists tenant_highlight text not null default 'standard';

alter table if exists public.documents
  add column if not exists tenant_highlight_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_tenant_highlight_check'
  ) then
    alter table public.documents
      add constraint documents_tenant_highlight_check
      check (tenant_highlight in ('standard', 'current', 'action_required'));
  end if;
end $$;

create index if not exists documents_account_tenant_highlight_idx
  on public.documents (account_id, tenant_highlight);

create or replace function public.set_document_tenant_highlight(
  p_document_id uuid,
  p_tenant_highlight text default 'standard',
  p_tenant_highlight_note text default null,
  p_actor_user_id uuid default auth.uid()
) returns public.documents
language plpgsql
security definer
set search_path = public
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
  if v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Not permitted';
  end if;

  if coalesce(v_doc.visibility, '') <> 'tenant' then
    raise exception 'Tenant highlight can be set only for tenant-visible documents';
  end if;

  if p_tenant_highlight not in ('standard', 'current', 'action_required') then
    raise exception 'Invalid tenant_highlight: %', p_tenant_highlight;
  end if;

  update public.documents
  set
    tenant_highlight = p_tenant_highlight,
    tenant_highlight_note = nullif(trim(coalesce(p_tenant_highlight_note, '')), ''),
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
    'update_tags',
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

grant execute on function public.set_document_tenant_highlight(uuid, text, text, uuid) to authenticated;
