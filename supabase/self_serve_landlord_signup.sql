-- Self-serve landlord signup:
-- Allows authenticated users to create exactly one owner account for themselves.
-- Invite-only roles (tenant/contractor/admin/staff) remain invitation-based.

drop function if exists public.create_self_serve_landlord_account(text);
drop function if exists public.create_self_serve_landlord_account(text, boolean);
create or replace function public.create_self_serve_landlord_account(
  p_account_name text default null,
  p_sandbox_mode boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text := trim(coalesce(p_account_name, ''));
  v_existing_owner_account_id uuid;
  v_existing_owner_account_name text;
  v_existing_any_non_owner boolean := false;
  v_existing_other_owner_user uuid;
  v_new_account_id uuid;
  v_sandbox_mode text;
  v_sandbox_lifecycle_status text;
  v_demo_expires_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select lower(u.email::text)
  into v_email
  from auth.users u
  where u.id = v_uid
  limit 1;

  if coalesce(v_email, '') = '' then
    raise exception 'Authenticated email not found';
  end if;

  -- If the user is already owner somewhere, return existing (idempotent).
  select a.id, a.name
  into v_existing_owner_account_id, v_existing_owner_account_name
  from public.account_members am
  join public.accounts a on a.id = am.account_id
  where am.user_id = v_uid
    and public.account_member_effective_role(am.account_id, am.user_id) = 'owner'
  order by a.created_at asc nulls last, a.id
  limit 1;

  if v_existing_owner_account_id is not null then
    select
      coalesce(asp.mode, 'production'),
      coalesce(asp.lifecycle_status, 'active'),
      asp.demo_expires_at
    into v_sandbox_mode, v_sandbox_lifecycle_status, v_demo_expires_at
    from (select v_existing_owner_account_id as account_id) scope
    left join public.account_sandbox_profiles asp on asp.account_id = scope.account_id;

    return jsonb_build_object(
      'ok', true,
      'created', false,
      'account_id', v_existing_owner_account_id,
      'account_name', v_existing_owner_account_name,
      'role', 'owner',
      'sandbox_mode', v_sandbox_mode,
      'sandbox_lifecycle_status', v_sandbox_lifecycle_status,
      'demo_expires_at', v_demo_expires_at
    );
  end if;

  -- Guard: users already invited as non-owner cannot self-escalate to owner.
  select exists (
    select 1
    from public.account_members am
    where am.user_id = v_uid
      and public.account_member_effective_role(am.account_id, am.user_id) <> 'owner'
  )
  into v_existing_any_non_owner;

  if v_existing_any_non_owner then
    raise exception 'This user already belongs to an invited account; landlord self-signup is not allowed';
  end if;

  -- Guard: one landlord(owner) account per email across platform.
  select am.user_id
  into v_existing_other_owner_user
  from public.account_members am
  join auth.users u on u.id = am.user_id
  where lower(u.email::text) = v_email
    and public.account_member_effective_role(am.account_id, am.user_id) = 'owner'
    and am.user_id <> v_uid
  limit 1;

  if v_existing_other_owner_user is not null then
    raise exception 'This email is already used by an existing landlord account';
  end if;

  if v_name = '' then
    v_name := split_part(v_email, '@', 1);
  end if;

  insert into public.accounts(name, created_by)
  values (v_name, v_uid)
  returning id into v_new_account_id;

  insert into public.account_members(account_id, user_id, role)
  values (v_new_account_id, v_uid, 'owner')
  on conflict (account_id, user_id) do update set role = excluded.role;

  insert into public.account_sandbox_profiles(
    account_id,
    mode,
    lifecycle_status,
    seeded_fixture_version,
    demo_expires_at,
    created_by,
    updated_by
  )
  values (
    v_new_account_id,
    case when coalesce(p_sandbox_mode, false) then 'demo' else 'production' end,
    'active',
    case when coalesce(p_sandbox_mode, false) then 'self-serve-v1' else null end,
    case when coalesce(p_sandbox_mode, false) then now() + interval '14 days' else null end,
    v_uid,
    v_uid
  )
  on conflict (account_id) do nothing;

  select
    coalesce(asp.mode, 'production'),
    coalesce(asp.lifecycle_status, 'active'),
    asp.demo_expires_at
  into v_sandbox_mode, v_sandbox_lifecycle_status, v_demo_expires_at
  from (select v_new_account_id as account_id) scope
  left join public.account_sandbox_profiles asp on asp.account_id = scope.account_id;

  return jsonb_build_object(
    'ok', true,
    'created', true,
    'account_id', v_new_account_id,
    'account_name', v_name,
    'role', 'owner',
    'sandbox_mode', v_sandbox_mode,
    'sandbox_lifecycle_status', v_sandbox_lifecycle_status,
    'demo_expires_at', v_demo_expires_at
  );
end;
$$;

grant execute on function public.create_self_serve_landlord_account(text, boolean) to anon;
grant execute on function public.create_self_serve_landlord_account(text, boolean) to authenticated;
