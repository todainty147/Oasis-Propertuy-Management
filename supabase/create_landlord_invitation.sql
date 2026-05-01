create or replace function public.create_landlord_invitation(
  p_root_account_id uuid,
  p_email          text,
  p_account_name   text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid                    uuid := auth.uid();
  v_root_member_role       text;
  v_is_root                boolean := false;
  v_support_role_text      text := 'staff';
  v_support_role           public.account_members.role%type;
  v_email                  text := lower(trim(coalesce(p_email, '')));
  v_name                   text := trim(coalesce(p_account_name, ''));
  v_existing_user_id       uuid;
  v_owner_membership_exists boolean := false;
  v_owner_invite_exists    boolean := false;
  v_new_account_id         uuid;
  v_token                  text;
  v_now                    timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_root_account_id is null then
    raise exception 'Missing root account id';
  end if;

  v_root_member_role := public.account_member_effective_role(p_root_account_id, v_uid);

  if v_root_member_role is null then
    raise exception 'Not a member of root account';
  end if;

  select coalesce(a.is_root, false)
    into v_is_root
  from public.accounts a
  where a.id = p_root_account_id
  limit 1;

  if not v_is_root then
    raise exception 'Only root account can invite landlords';
  end if;

  if v_root_member_role <> 'owner' then
    raise exception 'Insufficient role for landlord invite';
  end if;

  -- Resolve the best available support role for the root operator's membership.
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'account_role'
      and e.enumlabel = 'admin'
  ) then
    v_support_role_text := 'admin';
  elsif exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'account_role'
      and e.enumlabel = 'staff'
  ) then
    v_support_role_text := 'staff';
  else
    v_support_role_text := 'owner';
  end if;
  v_support_role := v_support_role_text;

  if v_email = '' then
    raise exception 'Missing email';
  end if;

  -- Guard: one owner account per email address.
  select u.id
    into v_existing_user_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_existing_user_id is not null then
    select exists (
      select 1
      from public.account_members am
      where am.user_id = v_existing_user_id
        and public.account_member_effective_role(am.account_id, am.user_id) = 'owner'
    )
    into v_owner_membership_exists;
  end if;

  if v_owner_membership_exists then
    raise exception 'This email is already used by an existing landlord account';
  end if;

  select exists (
    select 1
    from public.account_invitations ai
    where lower(ai.email) = v_email
      and lower(ai.role::text) = 'owner'
      and ai.revoked_at is null
  )
  into v_owner_invite_exists;

  if v_owner_invite_exists then
    raise exception 'This email already has an active landlord invitation';
  end if;

  if v_name = '' then
    v_name := split_part(v_email, '@', 1);
  end if;

  insert into public.accounts(name)
  values (v_name)
  returning id into v_new_account_id;

  -- Root operator attached as support member for account-switching workflows.
  insert into public.account_members(account_id, user_id, role)
  values (v_new_account_id, v_uid, v_support_role)
  on conflict (account_id, user_id) do nothing;

  -- extensions.gen_random_bytes is used explicitly because search_path = 'public'
  -- does not include the extensions schema where pgcrypto is installed.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.account_invitations(
    account_id,
    email,
    role,
    token,
    invited_by,
    created_at,
    updated_at
  )
  values (
    v_new_account_id,
    v_email,
    'owner',
    v_token,
    v_uid,
    v_now,
    v_now
  );

  return jsonb_build_object(
    'account_id',   v_new_account_id,
    'account_name', v_name,
    'email',        v_email,
    'role',         'owner',
    'token',        v_token
  );
end;
$$;
