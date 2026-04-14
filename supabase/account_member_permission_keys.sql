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
  v_role_name text;
  v_effective_role text;
  v_permission_keys text[];
  v_legacy_permission_keys text[];
begin
  if p_account_id is null or p_user_id is null then
    return array[]::text[];
  end if;

  v_role_id := public.account_member_role_id_for(p_account_id, p_user_id);

  if v_role_id is not null then
    select lower(trim(r.name))
      into v_role_name
    from public.roles r
    where r.id = v_role_id
      and r.account_id = p_account_id
    limit 1;

    select coalesce(
      array_agg(distinct lower(trim(rp.permission_key)) order by lower(trim(rp.permission_key))),
      array[]::text[]
    )
      into v_permission_keys
    from public.role_permissions rp
    where rp.role_id = v_role_id;

    if coalesce(v_role_name, '') not in ('owner', 'admin', 'staff') then
      return v_permission_keys;
    end if;
  end if;

  v_effective_role := public.account_member_effective_role(p_account_id, p_user_id);

  if v_effective_role = 'owner' then
    v_legacy_permission_keys := array[
      'documents.delete', 'documents.read', 'documents.tag', 'documents.upload',
      'finance.create', 'finance.delete', 'finance.read', 'finance.update',
      'properties.create', 'properties.delete', 'properties.read', 'properties.update',
      'tenants.create', 'tenants.delete', 'tenants.read', 'tenants.update',
      'users.invite', 'users.role'
    ];
  elsif v_effective_role = 'admin' then
    v_legacy_permission_keys := array[
      'documents.read', 'documents.tag', 'documents.upload',
      'finance.create', 'finance.read', 'finance.update',
      'properties.create', 'properties.read', 'properties.update',
      'tenants.create', 'tenants.read', 'tenants.update'
    ];
  elsif v_effective_role = 'staff' then
    v_legacy_permission_keys := array[
      'documents.read', 'documents.tag', 'documents.upload',
      'finance.read',
      'properties.read',
      'tenants.read'
    ];
  elsif v_effective_role = 'tenant' then
    v_legacy_permission_keys := array[
      'documents.read',
      'properties.read'
    ];
  else
    v_legacy_permission_keys := array[]::text[];
  end if;

  return array(
    select distinct permission_key
    from unnest(
      coalesce(v_permission_keys, array[]::text[]) ||
      coalesce(v_legacy_permission_keys, array[]::text[])
    ) as permission_key
    order by permission_key
  );
end;
$$;

revoke all on function public.account_member_permission_keys(uuid, uuid) from public;
grant execute on function public.account_member_permission_keys(uuid, uuid) to authenticated;
grant execute on function public.account_member_permission_keys(uuid, uuid) to service_role;
