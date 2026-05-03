alter table if exists public.documents
  add column if not exists tenant_highlight text not null default 'standard';

alter table if exists public.documents
  add column if not exists tenant_highlight_note text;

alter table if exists public.documents
  add column if not exists tenant_highlight_rank integer not null default 100;

alter table if exists public.documents
  add column if not exists tenant_highlight_updated_at timestamptz not null default now();

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

  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_tenant_highlight_rank_check'
  ) then
    alter table public.documents
      add constraint documents_tenant_highlight_rank_check
      check (tenant_highlight_rank >= 1 and tenant_highlight_rank <= 999);
  end if;
end $$;

create index if not exists documents_account_tenant_highlight_idx
  on public.documents (account_id, tenant_highlight);

create index if not exists documents_account_tenant_highlight_rank_idx
  on public.documents (account_id, tenant_highlight, tenant_highlight_rank, tenant_highlight_updated_at desc);

create or replace function public.set_document_tenant_highlight(
  p_document_id uuid,
  p_tenant_highlight text default 'standard',
  p_tenant_highlight_note text default null,
  p_tenant_highlight_rank integer default null,
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

  if p_tenant_highlight_rank is not null and (p_tenant_highlight_rank < 1 or p_tenant_highlight_rank > 999) then
    raise exception 'Invalid tenant_highlight_rank: %', p_tenant_highlight_rank;
  end if;

  update public.documents
  set
    tenant_highlight = p_tenant_highlight,
    tenant_highlight_note = nullif(trim(coalesce(p_tenant_highlight_note, '')), ''),
    tenant_highlight_rank = coalesce(
      p_tenant_highlight_rank,
      tenant_highlight_rank,
      case
        when p_tenant_highlight = 'action_required' then 10
        when p_tenant_highlight = 'current' then 50
        else 100
      end
    ),
    tenant_highlight_updated_at = now(),
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

grant execute on function public.set_document_tenant_highlight(uuid, text, text, integer, uuid) to authenticated;
