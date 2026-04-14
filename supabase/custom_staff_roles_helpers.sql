create or replace function public.account_member_role_id_for(
  p_account_id uuid,
  p_user_id uuid default auth.uid()
) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select am.role_id
  from public.account_members am
  where am.account_id = p_account_id
    and am.user_id = p_user_id
  limit 1;
$$;

revoke all on function public.account_member_role_id_for(uuid, uuid) from public;
grant execute on function public.account_member_role_id_for(uuid, uuid) to authenticated;
grant execute on function public.account_member_role_id_for(uuid, uuid) to service_role;

create or replace function public.account_member_effective_role(
  p_account_id uuid,
  p_user_id uuid default auth.uid()
) returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      case
        when nullif(lower(trim(r.name)), '') in ('owner', 'admin', 'staff', 'tenant', 'contractor')
          then nullif(lower(trim(r.name)), '')
        else null
      end
    ),
    lower(am.role::text)
  )
  from public.account_members am
  left join public.roles r
    on r.id = am.role_id
  where am.account_id = p_account_id
    and am.user_id = p_user_id
  limit 1;
$$;

revoke all on function public.account_member_effective_role(uuid, uuid) from public;
grant execute on function public.account_member_effective_role(uuid, uuid) to authenticated;
grant execute on function public.account_member_effective_role(uuid, uuid) to service_role;

create or replace function public.account_member_has_permission(
  p_account_id uuid,
  p_permission_key text,
  p_user_id uuid default auth.uid()
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_permission_key text := lower(trim(coalesce(p_permission_key, '')));
  v_role_id uuid;
  v_role_name text;
  v_effective_role text;
begin
  if p_account_id is null or p_user_id is null or v_permission_key = '' then
    return false;
  end if;

  v_role_id := public.account_member_role_id_for(p_account_id, p_user_id);

  if v_role_id is not null then
    select lower(trim(r.name))
      into v_role_name
    from public.roles r
    where r.id = v_role_id
      and r.account_id = p_account_id
    limit 1;

    if exists (
      select 1
      from public.role_permissions rp
      where rp.role_id = v_role_id
        and lower(trim(rp.permission_key)) = v_permission_key
    ) then
      return true;
    end if;

    if coalesce(v_role_name, '') not in ('owner', 'admin', 'staff') then
      return false;
    end if;
  end if;

  v_effective_role := public.account_member_effective_role(p_account_id, p_user_id);

  if v_effective_role = 'owner' then
    return v_permission_key in (
      'properties.read', 'properties.create', 'properties.update', 'properties.delete',
      'tenants.read', 'tenants.create', 'tenants.update', 'tenants.delete',
      'documents.read', 'documents.upload', 'documents.tag', 'documents.delete',
      'finance.read', 'finance.create', 'finance.update', 'finance.delete',
      'users.invite', 'users.role'
    );
  end if;

  if v_effective_role = 'admin' then
    return v_permission_key in (
      'properties.read', 'properties.create', 'properties.update',
      'tenants.read', 'tenants.create', 'tenants.update',
      'documents.read', 'documents.upload', 'documents.tag',
      'finance.read', 'finance.create', 'finance.update'
    );
  end if;

  if v_effective_role = 'staff' then
    return v_permission_key in (
      'properties.read',
      'tenants.read',
      'documents.read', 'documents.upload', 'documents.tag',
      'finance.read'
    );
  end if;

  return false;
end;
$$;

revoke all on function public.account_member_has_permission(uuid, text, uuid) from public;
grant execute on function public.account_member_has_permission(uuid, text, uuid) to authenticated;
grant execute on function public.account_member_has_permission(uuid, text, uuid) to service_role;
