create or replace function public.account_member_permission_keys(
  p_account_id uuid,
  p_user_id uuid default auth.uid()
) returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_effective_role text;
  v_permission_keys text[];
begin
  if p_account_id is null or p_user_id is null then
    return array[]::text[];
  end if;

  v_role_id := public.account_member_role_id_for(p_account_id, p_user_id);

  if v_role_id is not null then
    select coalesce(
      array_agg(distinct lower(trim(rp.permission_key)) order by lower(trim(rp.permission_key))),
      array[]::text[]
    )
      into v_permission_keys
    from public.role_permissions rp
    where rp.role_id = v_role_id;

    if coalesce(array_length(v_permission_keys, 1), 0) > 0 then
      return v_permission_keys;
    end if;
  end if;

  v_effective_role := public.account_member_effective_role(p_account_id, p_user_id);

  if v_effective_role = 'owner' then
    return array[
      'documents.delete', 'documents.read', 'documents.tag', 'documents.upload',
      'finance.create', 'finance.delete', 'finance.read', 'finance.update',
      'properties.create', 'properties.delete', 'properties.read', 'properties.update',
      'tenants.create', 'tenants.delete', 'tenants.read', 'tenants.update',
      'users.invite', 'users.role'
    ];
  end if;

  if v_effective_role = 'admin' then
    return array[
      'documents.read', 'documents.tag', 'documents.upload',
      'finance.create', 'finance.read', 'finance.update',
      'properties.create', 'properties.read', 'properties.update',
      'tenants.create', 'tenants.read', 'tenants.update'
    ];
  end if;

  if v_effective_role = 'staff' then
    return array[
      'documents.read', 'documents.tag', 'documents.upload',
      'finance.read',
      'properties.read',
      'tenants.read'
    ];
  end if;

  if v_effective_role = 'tenant' then
    return array[
      'documents.read',
      'properties.read'
    ];
  end if;

  return array[]::text[];
end;
$$;

revoke all on function public.account_member_permission_keys(uuid, uuid) from public;
grant execute on function public.account_member_permission_keys(uuid, uuid) to authenticated;
grant execute on function public.account_member_permission_keys(uuid, uuid) to service_role;
