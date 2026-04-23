-- SaaS invitation hardening (account-scoped, multi-role)

create or replace function public.security_failure_context(
  p_event text,
  p_reason text,
  p_account_id uuid default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns text
language sql
stable
set search_path = public
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'event', nullif(trim(coalesce(p_event, '')), ''),
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'account_id', p_account_id,
      'entity_type', nullif(trim(coalesce(lower(p_entity_type), '')), ''),
      'entity_id', p_entity_id,
      'actor_user_id', auth.uid()
    ) || coalesce(p_metadata, '{}'::jsonb)
  )::text;
$$;

comment on function public.security_failure_context(text, text, uuid, text, uuid, jsonb) is
  'Formats safe structured detail payloads for security-sensitive denied-path and validation exceptions.';

create table if not exists public.account_invitations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  role text not null,
  token text not null unique,
  invited_by uuid null references auth.users(id) on delete set null,
  expires_at timestamptz null,
  accepted_by uuid null references auth.users(id) on delete set null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill columns for legacy installations where account_invitations already exists
alter table public.account_invitations
  add column if not exists invited_by uuid null references auth.users(id) on delete set null,
  add column if not exists expires_at timestamptz null,
  add column if not exists accepted_by uuid null references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz null,
  add column if not exists revoked_at timestamptz null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Mark account as platform-root to allow cross-account landlord provisioning
alter table public.accounts
  add column if not exists is_root boolean not null default false;
alter table public.accounts
  add column if not exists is_disabled boolean not null default false,
  add column if not exists disabled_at timestamptz null;

-- Ensure enum supports all SaaS roles when account_role exists.
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'account_role'
  ) then
    begin
      alter type public.account_role add value if not exists 'tenant';
    exception when duplicate_object then null;
    end;

    begin
      alter type public.account_role add value if not exists 'contractor';
    exception when duplicate_object then null;
    end;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_invitations_role_check'
      and conrelid = 'public.account_invitations'::regclass
  ) then
    alter table public.account_invitations
      add constraint account_invitations_role_check
      check (lower(role::text) in ('owner','admin','staff','tenant','contractor'));
  end if;
end
$$;

create index if not exists account_invitations_account_idx on public.account_invitations(account_id);
create index if not exists account_invitations_email_idx on public.account_invitations(lower(email));
create unique index if not exists account_invitations_token_uidx on public.account_invitations(token);
create unique index if not exists account_invitations_active_account_email_uidx
  on public.account_invitations(account_id, lower(email))
  where accepted_at is null and revoked_at is null;

create or replace function public.can_invite_account_role(p_account_id uuid, p_target_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter_role text;
  v_target_role text := lower(coalesce(p_target_role, ''));
  v_has_admin boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  if public.user_is_root_operator() then
    return v_target_role in ('admin', 'staff', 'tenant', 'contractor');
  end if;

  select exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'account_role'
      and e.enumlabel = 'admin'
  )
  into v_has_admin;

  v_inviter_role := public.account_member_effective_role(p_account_id, auth.uid());

  if v_target_role = 'owner' then
    return false;
  end if;

  if v_target_role = 'admin' and not v_has_admin then
    v_target_role := 'staff';
  end if;

  if v_inviter_role = 'owner' then
    return v_target_role in ('admin', 'staff', 'tenant', 'contractor');
  end if;

  if v_inviter_role = 'admin' then
    return v_target_role in ('admin', 'staff', 'tenant', 'contractor');
  end if;

  if v_inviter_role = 'staff' then
    return v_target_role in ('staff', 'tenant', 'contractor');
  end if;

  return false;
end;
$$;

create or replace function public.account_invitations_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.invited_by is null then
    new.invited_by = auth.uid();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.account_invitations_validate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(new.email, '')));
  v_existing_user_id uuid;
  v_is_owner_invite boolean := lower(coalesce(new.role::text, '')) = 'owner';
begin
  if v_email = '' then
    raise exception 'Missing email';
  end if;
  new.email := v_email;

  -- Only validate active invitations. Accepted/revoked rows are archival.
  if new.accepted_at is not null or new.revoked_at is not null then
    return new;
  end if;

  -- Per-account guard: do not invite the same email twice while invite is active.
  if exists (
    select 1
    from public.account_invitations ai
    where ai.account_id = new.account_id
      and lower(ai.email) = v_email
      and ai.accepted_at is null
      and ai.revoked_at is null
      and (tg_op = 'INSERT' or ai.id <> new.id)
  ) then
    raise exception 'This email already has an active invitation in this account';
  end if;

  -- Per-account guard: do not invite someone who is already a member in this account.
  select u.id
  into v_existing_user_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_existing_user_id is not null and exists (
    select 1
    from public.account_members am
    where am.account_id = new.account_id
      and am.user_id = v_existing_user_id
  ) then
    raise exception 'This email already belongs to a member of this account';
  end if;

  -- Global landlord(owner) guard: one owner account per email.
  if v_is_owner_invite then
    if v_existing_user_id is not null and exists (
      select 1
      from public.account_members am
      where am.user_id = v_existing_user_id
        and public.account_member_effective_role(am.account_id, am.user_id) = 'owner'
    ) then
      raise exception 'This email is already used by an existing landlord account';
    end if;
  end if;

  return new;
end;
$$;

drop function if exists public.check_account_invitation_eligibility(uuid, text, text);
create or replace function public.check_account_invitation_eligibility(
  p_account_id uuid,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := lower(trim(coalesce(p_role, '')));
  v_member_role text;
  v_is_root boolean := false;
  v_has_admin boolean := false;
  v_existing_user_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'not_authenticated', 'message', 'Not authenticated');
  end if;

  if p_account_id is null then
    return jsonb_build_object('ok', false, 'code', 'missing_account', 'message', 'Missing account id');
  end if;

  if v_email = '' then
    return jsonb_build_object('ok', false, 'code', 'missing_email', 'message', 'Missing email');
  end if;

  if v_role = '' then
    return jsonb_build_object('ok', false, 'code', 'missing_role', 'message', 'Missing role');
  end if;

  select exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'account_role'
      and e.enumlabel = 'admin'
  )
  into v_has_admin;

  if v_role = 'admin' and not v_has_admin then
    v_role := 'staff';
  end if;

  v_member_role := public.account_member_effective_role(p_account_id, v_uid);

  if v_member_role is null and not public.user_is_root_operator() then
    return jsonb_build_object('ok', false, 'code', 'not_member', 'message', 'Not a member of this account');
  end if;

  select coalesce(a.is_root, false)
  into v_is_root
  from public.accounts a
  where a.id = p_account_id
  limit 1;

  if v_role = 'owner' then
    if not v_is_root then
      return jsonb_build_object('ok', false, 'code', 'owner_root_only', 'message', 'Only root account can invite landlords');
    end if;
    if v_member_role not in ('owner', 'admin', 'staff') then
      return jsonb_build_object('ok', false, 'code', 'role_forbidden', 'message', 'Insufficient role for landlord invite');
    end if;
  else
    if not public.can_invite_account_role(p_account_id, v_role) then
      return jsonb_build_object('ok', false, 'code', 'role_forbidden', 'message', 'You are not allowed to invite this role');
    end if;
  end if;

  -- Active invite duplicate in the same account
  if exists (
    select 1
    from public.account_invitations ai
    where ai.account_id = p_account_id
      and lower(ai.email) = v_email
      and ai.accepted_at is null
      and ai.revoked_at is null
  ) then
    return jsonb_build_object('ok', false, 'code', 'active_invite_exists', 'message', 'This email already has an active invitation in this account');
  end if;

  select u.id
  into v_existing_user_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_existing_user_id is not null and exists (
    select 1
    from public.account_members am
    where am.account_id = p_account_id
      and am.user_id = v_existing_user_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_member', 'message', 'This email already belongs to a member of this account');
  end if;

  if v_role = 'owner' and v_existing_user_id is not null and exists (
    select 1
    from public.account_members am
    where am.user_id = v_existing_user_id
      and public.account_member_effective_role(am.account_id, am.user_id) = 'owner'
  ) then
    return jsonb_build_object('ok', false, 'code', 'owner_email_taken', 'message', 'This email is already used by an existing landlord account');
  end if;

  return jsonb_build_object('ok', true, 'code', 'ok', 'message', 'Eligible', 'normalized_email', v_email, 'normalized_role', v_role);
end;
$$;

drop trigger if exists trg_account_invitations_set_updated_at on public.account_invitations;
create trigger trg_account_invitations_set_updated_at
before insert or update on public.account_invitations
for each row
execute function public.account_invitations_set_updated_at();

drop trigger if exists trg_account_invitations_validate on public.account_invitations;
create trigger trg_account_invitations_validate
before insert or update on public.account_invitations
for each row
execute function public.account_invitations_validate();

alter table public.account_invitations enable row level security;

drop policy if exists account_invitations_select_members on public.account_invitations;
create policy account_invitations_select_members
on public.account_invitations
for select
to authenticated
using (
  public.user_can_manage_account(account_invitations.account_id)
);

drop policy if exists account_invitations_insert_managers on public.account_invitations;
create policy account_invitations_insert_managers
on public.account_invitations
for insert
to authenticated
with check (
  public.can_invite_account_role(account_invitations.account_id, account_invitations.role::text)
);

drop policy if exists account_invitations_update_managers on public.account_invitations;
create policy account_invitations_update_managers
on public.account_invitations
for update
to authenticated
using (
  public.can_invite_account_role(account_invitations.account_id, account_invitations.role::text)
)
with check (
  public.can_invite_account_role(account_invitations.account_id, account_invitations.role::text)
);

drop policy if exists account_invitations_delete_managers on public.account_invitations;
create policy account_invitations_delete_managers
on public.account_invitations
for delete
to authenticated
using (
  public.can_invite_account_role(account_invitations.account_id, account_invitations.role::text)
);

grant usage on schema public to authenticated;
revoke select on table public.account_invitations from authenticated;
grant select (
  id,
  account_id,
  email,
  role,
  invited_by,
  expires_at,
  accepted_by,
  accepted_at,
  revoked_at,
  created_at,
  updated_at
) on table public.account_invitations to authenticated;
grant insert, update, delete on table public.account_invitations to authenticated;

drop function if exists public.create_landlord_invitation(uuid, text, text);
create or replace function public.create_landlord_invitation(
  p_root_account_id uuid,
  p_email text,
  p_account_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_root_member_role text;
  v_is_root boolean := false;
  v_support_role_text text := 'staff';
  v_support_role public.account_members.role%type;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_account_name, ''));
  v_existing_user_id uuid;
  v_owner_membership_exists boolean := false;
  v_owner_invite_exists boolean := false;
  v_new_account_id uuid;
  v_token text;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception using
      errcode = '28000',
      message = 'Not authenticated',
      detail = public.security_failure_context(
        'accept_account_invite',
        'missing_auth'
      ),
      hint = 'Authenticate with the invited account before accepting an invitation.';
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

  -- Guard: one landlord account per email.
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

  -- Root operator is attached as admin for support/switching workflows.
  insert into public.account_members(account_id, user_id, role)
  values (v_new_account_id, v_uid, v_support_role)
  on conflict (account_id, user_id) do nothing;

  v_token := gen_random_uuid()::text;

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
    'account_id', v_new_account_id,
    'account_name', v_name,
    'email', v_email,
    'role', 'owner',
    'token', v_token
  );
end;
$$;

drop function if exists public.root_list_accounts(uuid);
create or replace function public.root_list_accounts(p_root_account_id uuid)
returns table (
  id uuid,
  name text,
  is_root boolean,
  is_disabled boolean,
  disabled_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member_role text;
  v_is_root boolean := false;
  v_previous_disabled boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_member_role := public.account_member_effective_role(p_root_account_id, v_uid);

  if v_member_role is null then
    raise exception 'Not a member of root account';
  end if;

  if v_member_role <> 'owner' then
    raise exception 'Only root owner can list accounts';
  end if;

  select coalesce(a.is_root, false)
  into v_is_root
  from public.accounts a
  where a.id = p_root_account_id
  limit 1;

  if not v_is_root then
    raise exception 'Account is not root';
  end if;

  return query
  select
    a.id,
    a.name,
    coalesce(a.is_root, false) as is_root,
    coalesce(a.is_disabled, false) as is_disabled,
    a.disabled_at,
    a.created_at
  from public.accounts a
  order by a.created_at desc nulls last, a.id;
end;
$$;

drop function if exists public.root_set_account_disabled(uuid, uuid, boolean);
create or replace function public.root_set_account_disabled(
  p_root_account_id uuid,
  p_target_account_id uuid,
  p_disabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member_role text;
  v_is_root boolean := false;
  v_previous_disabled boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_target_account_id is null then
    raise exception 'Missing target account';
  end if;

  v_member_role := public.account_member_effective_role(p_root_account_id, v_uid);

  if v_member_role is null then
    raise exception 'Not a member of root account';
  end if;

  if v_member_role <> 'owner' then
    raise exception 'Only root owner can update account status';
  end if;

  select coalesce(a.is_root, false)
  into v_is_root
  from public.accounts a
  where a.id = p_root_account_id
  limit 1;

  if not v_is_root then
    raise exception 'Account is not root';
  end if;

  if p_target_account_id = p_root_account_id then
    raise exception 'Cannot disable root account';
  end if;

  select coalesce(a.is_disabled, false)
  into v_previous_disabled
  from public.accounts a
  where a.id = p_target_account_id
  limit 1;

  update public.accounts a
  set
    is_disabled = coalesce(p_disabled, false),
    disabled_at = case when coalesce(p_disabled, false) then now() else null end
  where a.id = p_target_account_id;

  if not found then
    raise exception 'Target account not found';
  end if;

  if coalesce(v_previous_disabled, false) is distinct from coalesce(p_disabled, false) then
    perform public.log_security_event(
      p_target_account_id,
      case when coalesce(p_disabled, false) then 'account_disabled' else 'account_enabled' end,
      'account',
      p_target_account_id,
      jsonb_build_object(
        'target_account_id', p_target_account_id,
        'root_account_id', p_root_account_id,
        'old_is_disabled', coalesce(v_previous_disabled, false),
        'new_is_disabled', coalesce(p_disabled, false)
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'account_id', p_target_account_id,
    'is_disabled', coalesce(p_disabled, false)
  );
end;
$$;

drop function if exists public.account_member_set_role(uuid, uuid, text);
create or replace function public.account_member_set_role(
  p_account_id uuid,
  p_target_user_id uuid,
  p_new_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current_role text;
  v_new_role text := lower(trim(coalesce(p_new_role, '')));
  v_new_member_role public.account_members.role%type;
  v_new_role_id uuid;
  v_has_admin boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if p_target_user_id is null then
    raise exception 'Missing target user';
  end if;

  if v_new_role = '' then
    raise exception 'Missing role';
  end if;

  perform public.assert_manage_account_access(p_account_id);

  select exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'account_role'
      and e.enumlabel = 'admin'
  )
  into v_has_admin;

  if v_new_role = 'admin' and not v_has_admin then
    v_new_role := 'staff';
  end if;

  if not public.can_invite_account_role(p_account_id, v_new_role) then
    raise exception 'Insufficient permission to assign this role';
  end if;

  v_new_member_role := v_new_role;
  v_new_role_id := public.ensure_system_account_role(p_account_id, v_new_member_role);

  v_current_role := public.account_member_effective_role(p_account_id, p_target_user_id);

  if v_current_role is null then
    raise exception 'Target member not found';
  end if;

  if v_current_role = v_new_role then
    return jsonb_build_object(
      'ok', true,
      'account_id', p_account_id,
      'user_id', p_target_user_id,
      'role', v_current_role,
      'changed', false
    );
  end if;

  update public.account_members am
  set role = v_new_member_role,
      role_id = v_new_role_id
  where am.account_id = p_account_id
    and am.user_id = p_target_user_id;

  perform public.log_security_event(
    p_account_id,
    'role_changed',
    'account_member',
    p_target_user_id,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'old_role', v_current_role,
      'new_role', v_new_role,
      'change_source', 'admin_role_edit'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'account_id', p_account_id,
    'user_id', p_target_user_id,
    'old_role', v_current_role,
    'role', v_new_role,
    'changed', true
  );
end;
$$;

drop function if exists public.root_delete_account(uuid, uuid);
create or replace function public.root_delete_account(
  p_root_account_id uuid,
  p_target_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member_role text;
  v_is_root boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_target_account_id is null then
    raise exception 'Missing target account';
  end if;

  v_member_role := public.account_member_effective_role(p_root_account_id, v_uid);

  if v_member_role is null then
    raise exception 'Not a member of root account';
  end if;

  if v_member_role <> 'owner' then
    raise exception 'Only root owner can delete accounts';
  end if;

  select coalesce(a.is_root, false)
  into v_is_root
  from public.accounts a
  where a.id = p_root_account_id
  limit 1;

  if not v_is_root then
    raise exception 'Account is not root';
  end if;

  if p_target_account_id = p_root_account_id then
    raise exception 'Cannot delete root account';
  end if;

  delete from public.accounts a
  where a.id = p_target_account_id;

  if not found then
    raise exception 'Target account not found';
  end if;

  perform public.log_security_event(
    p_root_account_id,
    'account_deleted',
    'account',
    p_target_account_id,
    jsonb_build_object(
      'target_account_id', p_target_account_id,
      'root_account_id', p_root_account_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'account_id', p_target_account_id
  );
exception
  when foreign_key_violation then
    raise exception 'Cannot delete account with related data; disable it instead';
end;
$$;

-- Invite acceptance: bind invite to signed-in user and membership for invite.account_id
drop function if exists public.accept_account_invite(text);
create or replace function public.accept_account_invite(invite_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_inv public.account_invitations%rowtype;
  v_role text;
  v_has_admin boolean := false;
  v_member_role public.account_members.role%type;
  v_previous_role text;
  v_tenant_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_inv
  from public.account_invitations
  where token = invite_token
  limit 1;

  if v_inv.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Invitation not found',
      detail = public.security_failure_context(
        'accept_account_invite',
        'invite_not_found'
      ),
      hint = 'Use a valid current invitation link.';
  end if;

  if v_email = '' or lower(v_inv.email) <> v_email then
    raise exception using
      errcode = '42501',
      message = 'Invitation email mismatch',
      detail = public.security_failure_context(
        'accept_account_invite',
        'invite_email_mismatch',
        v_inv.account_id,
        'account_invitation',
        v_inv.id,
        jsonb_build_object('invited_role', lower(coalesce(v_inv.role::text, '')))
      ),
      hint = 'Sign in with the email address that received the invitation.';
  end if;

  if v_inv.revoked_at is not null then
    raise exception using
      errcode = '42501',
      message = 'Invitation revoked',
      detail = public.security_failure_context(
        'accept_account_invite',
        'invite_revoked',
        v_inv.account_id,
        'account_invitation',
        v_inv.id
      ),
      hint = 'Request a new invitation from an account manager.';
  end if;

  if v_inv.accepted_at is not null then
    return jsonb_build_object('ok', true, 'already_accepted', true, 'account_id', v_inv.account_id);
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception using
      errcode = '22023',
      message = 'Invitation expired',
      detail = public.security_failure_context(
        'accept_account_invite',
        'invite_expired',
        v_inv.account_id,
        'account_invitation',
        v_inv.id
      ),
      hint = 'Request a fresh invitation link before retrying acceptance.';
  end if;

  v_role := lower(coalesce(v_inv.role::text, 'staff'));
  select exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'account_role'
      and e.enumlabel = 'admin'
  )
  into v_has_admin;
  if v_role = 'admin' and not v_has_admin then
    v_role := 'staff';
  end if;
  if v_role not in ('owner', 'admin', 'staff', 'tenant', 'contractor') then
    v_role := 'staff';
  end if;
  v_member_role := v_role;

  v_previous_role := public.account_member_effective_role(v_inv.account_id, v_uid);

  insert into public.account_members(account_id, user_id, role)
  values (v_inv.account_id, v_uid, v_member_role)
  on conflict (account_id, user_id) do update set role = excluded.role;

  update public.account_invitations
  set accepted_at = now(),
      accepted_by = v_uid
  where id = v_inv.id;

  if v_role = 'tenant' then
    update public.tenants
    set user_id = v_uid,
        email = coalesce(nullif(email, ''), lower(v_inv.email)),
        status = case
          when lower(coalesce(status, '')) in ('', 'applicant') then 'active'
          else status
        end
    where account_id = v_inv.account_id
      and archived_at is null
      and (
        user_id = v_uid
        or lower(coalesce(email, '')) = lower(v_inv.email)
      )
    returning id into v_tenant_id;

    if v_tenant_id is null then
      insert into public.tenants(account_id, name, email, user_id, status, created_at)
      values (
        v_inv.account_id,
        coalesce(nullif(split_part(lower(v_inv.email), '@', 1), ''), lower(v_inv.email)),
        lower(v_inv.email),
        v_uid,
        'active',
        now()
      )
      returning id into v_tenant_id;
    end if;
  end if;

  perform public.log_security_event(
    v_inv.account_id,
    'invite_accepted',
    'account_invitation',
    v_inv.id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'invite_id', v_inv.id,
        'accepted_user_id', v_uid,
        'invited_role', v_role,
        'email', lower(v_inv.email),
        'account_id', v_inv.account_id
      )
    )
  );

  if v_previous_role is not null and v_previous_role is distinct from v_role then
    perform public.log_security_event(
      v_inv.account_id,
      'role_changed',
      'account_member',
      v_uid,
      jsonb_strip_nulls(
        jsonb_build_object(
          'target_user_id', v_uid,
          'old_role', v_previous_role,
          'new_role', v_role,
          'change_source', 'invite_acceptance',
          'invite_id', v_inv.id
        )
      )
    );
  end if;

  return jsonb_build_object('ok', true, 'account_id', v_inv.account_id, 'role', v_role);
end;
$$;

update public.tenants t
set user_id = ai.accepted_by,
    email = coalesce(nullif(t.email, ''), lower(ai.email)),
    status = case
      when lower(coalesce(t.status, '')) in ('', 'applicant') then 'active'
      else t.status
    end
from public.account_invitations ai
where ai.account_id = t.account_id
  and lower(ai.role::text) = 'tenant'
  and ai.accepted_at is not null
  and ai.accepted_by is not null
  and ai.revoked_at is null
  and t.archived_at is null
  and t.user_id is null
  and lower(coalesce(t.email, '')) = lower(ai.email);

insert into public.tenants(account_id, name, email, user_id, status, created_at)
select
  ai.account_id,
  coalesce(nullif(split_part(lower(ai.email), '@', 1), ''), lower(ai.email)),
  lower(ai.email),
  ai.accepted_by,
  'active',
  coalesce(ai.accepted_at, now())
from public.account_invitations ai
where lower(ai.role::text) = 'tenant'
  and ai.accepted_at is not null
  and ai.accepted_by is not null
  and ai.revoked_at is null
  and not exists (
    select 1
    from public.tenants t
    where t.account_id = ai.account_id
      and t.archived_at is null
      and (
        t.user_id = ai.accepted_by
        or lower(coalesce(t.email, '')) = lower(ai.email)
      )
  );

grant execute on function public.accept_account_invite(text) to authenticated;
grant execute on function public.account_member_set_role(uuid, uuid, text) to authenticated;
grant execute on function public.can_invite_account_role(uuid, text) to authenticated;
grant execute on function public.create_landlord_invitation(uuid, text, text) to authenticated;
grant execute on function public.root_list_accounts(uuid) to authenticated;
grant execute on function public.root_set_account_disabled(uuid, uuid, boolean) to authenticated;
grant execute on function public.root_delete_account(uuid, uuid) to authenticated;
grant execute on function public.check_account_invitation_eligibility(uuid, text, text) to authenticated;
