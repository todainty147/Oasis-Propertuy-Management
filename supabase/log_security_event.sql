create or replace function public.log_security_event(
  p_account_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_actor_user_id uuid;
  v_row_id uuid;
  v_existing_row_id uuid;
  v_action text;
  v_entity_type text;
  v_is_service_role boolean := coalesce(auth.role(), '') = 'service_role';
begin
  v_actor_user_id := auth.uid();

  v_action := lower(trim(coalesce(p_action, '')));
  v_entity_type := lower(trim(coalesce(p_entity_type, '')));

  if nullif(v_action, '') is null then
    raise exception 'Missing action';
  end if;

  if nullif(v_entity_type, '') is null then
    raise exception 'Missing entity type';
  end if;

  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if v_is_service_role then
    v_account_id := p_account_id;
  elsif public.user_can_manage_account(p_account_id) then
    v_account_id := p_account_id;
  elsif v_actor_user_id is not null
    and exists (
      select 1
      from public.account_members am
      where am.account_id = p_account_id
        and am.user_id = v_actor_user_id
    )
  then
    if v_action = 'invite_accepted' and v_entity_type in ('account_invitation', 'account_invitations') then
      if not exists (
        select 1
        from public.account_invitations ai
        where ai.id = p_entity_id
          and ai.account_id = p_account_id
          and ai.accepted_by = v_actor_user_id
          and ai.accepted_at is not null
      ) then
        raise exception 'Access denied';
      end if;

      select sal.id
      into v_existing_row_id
      from public.security_audit_ledger sal
      where sal.account_id = p_account_id
        and sal.actor_user_id = v_actor_user_id
        and sal.action = v_action
        and sal.entity_id is not distinct from p_entity_id
      order by sal.created_at desc
      limit 1;

      if v_existing_row_id is not null then
        return v_existing_row_id;
      end if;

      v_account_id := p_account_id;
    elsif v_action = 'role_changed'
      and v_entity_type = 'account_member'
      and p_entity_id = v_actor_user_id
      and coalesce(p_metadata->>'change_source', '') = 'invite_acceptance'
    then
      if not exists (
        select 1
        from public.account_members am
        where am.account_id = p_account_id
          and am.user_id = v_actor_user_id
          and lower(am.role::text) = lower(coalesce(p_metadata->>'new_role', ''))
      ) then
        raise exception 'Access denied';
      end if;

      if not exists (
        select 1
        from public.account_invitations ai
        where ai.id::text = coalesce(p_metadata->>'invite_id', '')
          and ai.account_id = p_account_id
          and ai.accepted_by = v_actor_user_id
          and ai.accepted_at is not null
      ) then
        raise exception 'Access denied';
      end if;

      select sal.id
      into v_existing_row_id
      from public.security_audit_ledger sal
      where sal.account_id = p_account_id
        and sal.actor_user_id = v_actor_user_id
        and sal.action = v_action
        and sal.entity_id is not distinct from p_entity_id
        and coalesce(sal.metadata->>'change_source', '') = 'invite_acceptance'
        and coalesce(sal.metadata->>'new_role', '') = coalesce(p_metadata->>'new_role', '')
      order by sal.created_at desc
      limit 1;

      if v_existing_row_id is not null then
        return v_existing_row_id;
      end if;

      v_account_id := p_account_id;
    else
      raise exception 'Access denied';
    end if;
  else
    raise exception 'Access denied';
  end if;

  insert into public.security_audit_ledger (
    account_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_account_id,
    v_actor_user_id,
    v_action,
    v_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_row_id;

  return v_row_id;
end;
$$;

comment on function public.log_security_event(uuid, text, text, uuid, jsonb) is
  'Canonical append-only writer for security_audit_ledger rows. Validates manager/root access for the target account, allows tightly scoped self-service invite acceptance logging, and records auth.uid() as actor_user_id when available.';

revoke all on function public.log_security_event(uuid, text, text, uuid, jsonb) from public;
grant execute on function public.log_security_event(uuid, text, text, uuid, jsonb) to authenticated;
grant execute on function public.log_security_event(uuid, text, text, uuid, jsonb) to service_role;
