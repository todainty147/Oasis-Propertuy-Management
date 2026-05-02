-- =========================================================
-- Document template storage path repair
-- Purpose: recover from legacy/stale stub rows that do not use the
-- canonical <account_id>/templates/<template_id>/<file> storage path.
-- =========================================================

create or replace function public.repair_document_template_stub_path(
  p_template_id uuid,
  p_filename text,
  p_actor_user_id uuid default auth.uid()
) returns public.document_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.document_templates;
  v_actor uuid := auth.uid();
  v_filename text := public.sanitize_document_template_filename(p_filename);
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_actor_user_id is not null and p_actor_user_id <> v_actor then
    raise exception 'Actor mismatch';
  end if;

  select *
    into v_template
  from public.document_templates
  where id = p_template_id;

  if not found then
    raise exception 'Template not found';
  end if;

  if not public.can_manage_document_templates(v_template.account_id, v_actor) then
    raise exception 'Not permitted';
  end if;

  if v_template.upload_status <> 'stub' then
    raise exception 'Template upload already finalized';
  end if;

  update public.document_templates
  set storage_path = v_template.account_id::text || '/templates/' || v_template.id::text || '/' || v_filename,
      updated_at = now()
  where id = v_template.id
  returning * into v_template;

  return v_template;
end;
$$;

revoke all on function public.repair_document_template_stub_path(uuid, text, uuid) from public;
grant execute on function public.repair_document_template_stub_path(uuid, text, uuid) to authenticated;
grant execute on function public.repair_document_template_stub_path(uuid, text, uuid) to service_role;
