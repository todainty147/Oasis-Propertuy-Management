create or replace function public.security_audit_log_work_order_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_had_contractor boolean := false;
  v_has_contractor boolean := false;
begin
  if tg_op = 'INSERT' then
    v_has_contractor := new.contractor_user_id is not null or nullif(coalesce(new.contractor_name, ''), '') is not null;
    if not v_has_contractor then
      return new;
    end if;
  else
    v_had_contractor := old.contractor_user_id is not null or nullif(coalesce(old.contractor_name, ''), '') is not null;
    v_has_contractor := new.contractor_user_id is not null or nullif(coalesce(new.contractor_name, ''), '') is not null;

    if not v_has_contractor then
      return new;
    end if;

    if not (
      old.contractor_user_id is distinct from new.contractor_user_id
      or coalesce(old.contractor_name, '') is distinct from coalesce(new.contractor_name, '')
    ) then
      return new;
    end if;
  end if;

  perform public.log_security_event(
    new.account_id,
    'contractor_assigned',
    'work_order',
    new.id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'work_order_id', new.id,
        'maintenance_request_id', new.maintenance_request_id,
        'property_id', new.property_id,
        'previous_contractor_user_id', case when tg_op = 'UPDATE' then old.contractor_user_id else null end,
        'previous_contractor_name', case when tg_op = 'UPDATE' then nullif(coalesce(old.contractor_name, ''), '') else null end,
        'contractor_user_id', new.contractor_user_id,
        'contractor_name', nullif(coalesce(new.contractor_name, ''), ''),
        'assignment_source', case when tg_op = 'INSERT' and not v_had_contractor then 'work_order_create' else 'work_order_update' end
      )
    )
  );

  return new;
end;
$$;

create or replace function public.security_audit_log_document_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_doc jsonb := to_jsonb(old);
begin
  perform public.log_security_event(
    (v_doc->>'account_id')::uuid,
    'document_deleted',
    'document',
    old.id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'document_id', old.id,
        'storage_path', v_doc->>'storage_path',
        'property_id', v_doc->>'property_id',
        'tenant_id', v_doc->>'tenant_id',
        'scope', v_doc->>'scope',
        'visibility', v_doc->>'visibility',
        'deletion_source', 'documents_delete'
      )
    )
  );

  return old;
end;
$$;

create or replace function public.security_audit_log_account_invitation_create()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_action text := case
    when lower(coalesce(new.role::text, '')) = 'owner' then 'landlord_invitation_created'
    else 'account_invitation_created'
  end;
begin
  if new.accepted_at is not null or new.revoked_at is not null then
    return new;
  end if;

  perform public.log_security_event(
    new.account_id,
    v_action,
    'account_invitation',
    new.id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'invite_id', new.id,
        'email', lower(coalesce(new.email, '')),
        'invited_role', lower(coalesce(new.role::text, '')),
        'invited_by', new.invited_by,
        'account_id', new.account_id
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_security_audit_work_order_assignment on public.work_orders;
create trigger trg_security_audit_work_order_assignment
after insert or update on public.work_orders
for each row
execute function public.security_audit_log_work_order_assignment();

drop trigger if exists trg_security_audit_account_invitation_create on public.account_invitations;
create trigger trg_security_audit_account_invitation_create
after insert on public.account_invitations
for each row
execute function public.security_audit_log_account_invitation_create();

do $$
begin
  if to_regclass('public.documents') is not null then
    execute 'drop trigger if exists trg_security_audit_document_delete on public.documents';
    execute '
      create trigger trg_security_audit_document_delete
      after delete on public.documents
      for each row
      execute function public.security_audit_log_document_delete()
    ';
  end if;
end;
$$;
