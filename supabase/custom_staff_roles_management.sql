create or replace function public.list_account_roles(
  p_account_id uuid
) returns table (
  role_id uuid,
  name text,
  permission_keys text[],
  member_count bigint,
  is_system boolean
)
language sql
security definer
set search_path = public
as $$
  with scoped_roles as (
    select r.id, r.name
    from public.roles r
    where r.account_id = public.assert_manage_account_access(p_account_id)
  )
  select
    r.id as role_id,
    r.name,
    coalesce(
      array_agg(distinct lower(trim(rp.permission_key)) order by lower(trim(rp.permission_key)))
        filter (where rp.permission_key is not null),
      array[]::text[]
    ) as permission_keys,
    count(distinct am.user_id)::bigint as member_count,
    lower(trim(r.name)) in ('owner', 'admin', 'staff') as is_system
  from scoped_roles r
  left join public.role_permissions rp
    on rp.role_id = r.id
  left join public.account_members am
    on am.account_id = p_account_id
   and am.role_id = r.id
  group by r.id, r.name
  order by lower(trim(r.name));
$$;

revoke all on function public.list_account_roles(uuid) from public;
grant execute on function public.list_account_roles(uuid) to authenticated;
grant execute on function public.list_account_roles(uuid) to service_role;

create or replace function public.create_account_role(
  p_account_id uuid,
  p_name text,
  p_permission_keys text[] default array[]::text[]
) returns table (
  role_id uuid,
  name text,
  permission_keys text[],
  is_system boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_account_id uuid;
  v_name text := lower(trim(coalesce(p_name, '')));
  v_role_id uuid;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  if v_name = '' then
    raise exception 'Role name is required';
  end if;

  if v_name in ('owner', 'admin', 'staff') then
    raise exception 'System roles cannot be created via this flow';
  end if;

  insert into public.roles (account_id, name)
  values (v_account_id, v_name)
  returning id into v_role_id;

  insert into public.role_permissions (role_id, permission_key)
  select v_role_id, lower(trim(permission_key))
  from unnest(coalesce(p_permission_keys, array[]::text[])) permission_key
  where trim(coalesce(permission_key, '')) <> ''
  on conflict (role_id, permission_key) do nothing;

  return query
  select
    r.id as role_id,
    r.name,
    coalesce(
      array_agg(distinct lower(trim(rp.permission_key)) order by lower(trim(rp.permission_key)))
        filter (where rp.permission_key is not null),
      array[]::text[]
    ) as permission_keys,
    false as is_system
  from public.roles r
  left join public.role_permissions rp
    on rp.role_id = r.id
  where r.id = v_role_id
  group by r.id, r.name;
end;
$$;

revoke all on function public.create_account_role(uuid, text, text[]) from public;
grant execute on function public.create_account_role(uuid, text, text[]) to authenticated;
grant execute on function public.create_account_role(uuid, text, text[]) to service_role;

create or replace function public.update_account_role_permissions(
  p_account_id uuid,
  p_role_id uuid,
  p_permission_keys text[] default array[]::text[]
) returns table (
  role_id uuid,
  name text,
  permission_keys text[],
  is_system boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_account_id uuid;
  v_role_name text;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  if p_role_id is null then
    raise exception 'role_id is required';
  end if;

  select r.name
    into v_role_name
  from public.roles r
  where r.id = p_role_id
    and r.account_id = v_account_id;

  if v_role_name is null then
    raise exception 'Role not found in this account';
  end if;

  if lower(trim(v_role_name)) in ('owner', 'admin', 'staff') then
    raise exception 'System role permissions cannot be changed via this flow';
  end if;

  delete from public.role_permissions rp
  where rp.role_id = p_role_id;

  insert into public.role_permissions (role_id, permission_key)
  select p_role_id, lower(trim(permission_key))
  from unnest(coalesce(p_permission_keys, array[]::text[])) permission_key
  where trim(coalesce(permission_key, '')) <> ''
  on conflict (role_id, permission_key) do nothing;

  return query
  select
    r.id as role_id,
    r.name,
    coalesce(
      array_agg(distinct lower(trim(rp.permission_key)) order by lower(trim(rp.permission_key)))
        filter (where rp.permission_key is not null),
      array[]::text[]
    ) as permission_keys,
    false as is_system
  from public.roles r
  left join public.role_permissions rp
    on rp.role_id = r.id
  where r.id = p_role_id
  group by r.id, r.name;
end;
$$;

revoke all on function public.update_account_role_permissions(uuid, uuid, text[]) from public;
grant execute on function public.update_account_role_permissions(uuid, uuid, text[]) to authenticated;
grant execute on function public.update_account_role_permissions(uuid, uuid, text[]) to service_role;

create or replace function public.assign_account_member_role_id(
  p_account_id uuid,
  p_target_user_id uuid,
  p_role_id uuid default null
) returns table (
  ok boolean,
  account_id uuid,
  user_id uuid,
  legacy_role public.account_role,
  role_id uuid,
  role_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_legacy_role public.account_role;
  v_role_name text;
begin
  v_account_id := public.assert_manage_account_access(p_account_id);

  if p_target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  select am.role
    into v_legacy_role
  from public.account_members am
  where am.account_id = v_account_id
    and am.user_id = p_target_user_id;

  if v_legacy_role is null then
    raise exception 'Target user is not a member of this account';
  end if;

  if p_role_id is not null then
    select r.name
      into v_role_name
    from public.roles r
    where r.id = p_role_id
      and r.account_id = v_account_id;

    if v_role_name is null then
      raise exception 'Role not found in this account';
    end if;
  end if;

  update public.account_members am
  set role_id = p_role_id
  where am.account_id = v_account_id
    and am.user_id = p_target_user_id;

  return query
  select
    true as ok,
    v_account_id as account_id,
    p_target_user_id as user_id,
    v_legacy_role as legacy_role,
    p_role_id as role_id,
    v_role_name as role_name;
end;
$$;

revoke all on function public.assign_account_member_role_id(uuid, uuid, uuid) from public;
grant execute on function public.assign_account_member_role_id(uuid, uuid, uuid) to authenticated;
grant execute on function public.assign_account_member_role_id(uuid, uuid, uuid) to service_role;

create or replace function public.list_account_members_for_role_assignment(
  p_account_id uuid
) returns table (
  user_id uuid,
  email text,
  legacy_role public.account_role,
  role_id uuid,
  role_name text
)
language sql
security definer
set search_path = public, auth
as $$
  select
    am.user_id,
    lower(coalesce(u.email, '')) as email,
    am.role as legacy_role,
    am.role_id,
    r.name as role_name
  from public.account_members am
  left join auth.users u
    on u.id = am.user_id
  left join public.roles r
    on r.id = am.role_id
  where am.account_id = public.assert_manage_account_access(p_account_id)
  order by lower(coalesce(u.email, '')), am.user_id;
$$;

revoke all on function public.list_account_members_for_role_assignment(uuid) from public;
grant execute on function public.list_account_members_for_role_assignment(uuid) to authenticated;
grant execute on function public.list_account_members_for_role_assignment(uuid) to service_role;
