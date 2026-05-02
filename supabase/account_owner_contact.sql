-- Resolve account owner identity (email) for UI context such as Add Property modal.

create or replace function public.get_account_owner_contact(p_account_id uuid)
returns table (
  owner_user_id uuid,
  owner_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_has_direct_access boolean := false;
  v_is_root_operator boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select exists (
    select 1
    from public.account_members am
    where am.account_id = p_account_id
      and am.user_id = v_uid
  )
  into v_has_direct_access;

  select exists (
    select 1
    from public.account_members am
    join public.accounts a on a.id = am.account_id
    where am.user_id = v_uid
      and coalesce(a.is_root, false) = true
  )
  into v_is_root_operator;

  if not v_has_direct_access and not v_is_root_operator then
    raise exception 'Access denied';
  end if;

  return query
  with owner_member as (
    select
      am.user_id as owner_user_id,
      lower(u.email::text) as owner_email
    from public.account_members am
    join auth.users u on u.id = am.user_id
    where am.account_id = p_account_id
      and public.account_member_effective_role(am.account_id, am.user_id) = 'owner'
    order by am.user_id
    limit 1
  ),
  owner_creator as (
    select
      a.created_by as owner_user_id,
      lower(u.email::text) as owner_email
    from public.accounts a
    join auth.users u on u.id = a.created_by
    where a.id = p_account_id
    limit 1
  )
  select *
  from owner_member
  union all
  select *
  from owner_creator
  where not exists (select 1 from owner_member)
  limit 1;
end;
$$;

grant execute on function public.get_account_owner_contact(uuid) to authenticated;
