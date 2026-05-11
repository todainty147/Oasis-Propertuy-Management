-- =============================================================================
-- Authentication Hardening v1: Password Security Profile
-- =============================================================================
-- Tracks each user's password policy compliance posture so OASIS can:
--   • Show admins which account members have legacy/weak passwords
--   • Prompt individual users to upgrade before hard enforcement begins
--   • Provide audit evidence of when each user accepted the v1 policy
--
-- password_strength_status values:
--   unknown        — user existed before this table; posture not yet assessed
--   legacy_weak    — user was created before v1 policy; assumed non-compliant
--   strong         — user set a password that passed the v1 policy validator
--   reset_required — admin-flagged; user MUST reset before next login (Stage 4)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.user_security_profile (
  user_id                 uuid        primary key references auth.users(id) on delete cascade,
  account_id              uuid        references public.accounts(id) on delete cascade,
  password_policy_version integer     not null default 0,
  password_strength_status text       not null default 'unknown'
    check (password_strength_status in ('unknown', 'strong', 'legacy_weak', 'reset_required')),
  password_last_set_at    timestamptz,
  mfa_required            boolean     not null default false,
  mfa_enrolled            boolean     not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.user_security_profile is
  'Per-user auth security posture: password policy version, strength status, and MFA state.';

comment on column public.user_security_profile.password_policy_version is
  '0 = pre-policy (legacy), 1 = Auth Hardening v1 (12-char strong policy).';

comment on column public.user_security_profile.password_strength_status is
  'unknown | legacy_weak | strong | reset_required';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists usp_account_status_idx
  on public.user_security_profile(account_id, password_strength_status);

create index if not exists usp_status_idx
  on public.user_security_profile(password_strength_status);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.tg_user_security_profile_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_usp_set_updated_at on public.user_security_profile;
create trigger trg_usp_set_updated_at
before update on public.user_security_profile
for each row
execute function public.tg_user_security_profile_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.user_security_profile enable row level security;

-- Users can read their own profile
drop policy if exists "usp_select_own" on public.user_security_profile;
create policy "usp_select_own"
on public.user_security_profile
for select
to authenticated
using (user_id = auth.uid());

-- Account managers can read profiles for all members in their account
drop policy if exists "usp_select_manager" on public.user_security_profile;
create policy "usp_select_manager"
on public.user_security_profile
for select
to authenticated
using (public.is_account_manager(account_id));

-- No direct INSERT / UPDATE / DELETE — all writes go through SECURITY DEFINER RPCs

-- ---------------------------------------------------------------------------
-- RPC: record_strong_password
-- Called by every auth flow (signup, invite, reset, profile) immediately after
-- a v1-policy-compliant password is successfully committed to Supabase Auth.
-- ---------------------------------------------------------------------------

create or replace function public.record_strong_password(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller must be a member of the given account
  if not exists (
    select 1 from public.account_members
    where account_id = p_account_id
      and user_id    = v_user_id
  ) then
    raise exception 'Not a member of this account';
  end if;

  insert into public.user_security_profile (
    user_id, account_id,
    password_policy_version, password_strength_status,
    password_last_set_at
  )
  values (
    v_user_id, p_account_id,
    1, 'strong',
    now()
  )
  on conflict (user_id) do update
  set
    account_id              = p_account_id,
    password_policy_version = 1,
    password_strength_status = 'strong',
    password_last_set_at    = now(),
    updated_at              = now();

  -- Append to security audit trail
  perform public.log_security_event(
    p_account_id,
    'auth_password_policy_v1_accepted',
    'user',
    v_user_id,
    jsonb_build_object('policy_version', 1)
  );
end;
$$;

grant execute on function public.record_strong_password(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: record_own_strong_password
-- Account-agnostic variant used by tenants, contractors, and any flow where
-- the caller is authenticated but is not an account_members row (e.g. tenant
-- invite acceptance, password reset without a known account context).
-- ---------------------------------------------------------------------------

create or replace function public.record_own_strong_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Try to resolve a primary account for the audit log (best-effort)
  select account_id into v_account_id
  from public.account_members
  where user_id = v_user_id
  order by created_at
  limit 1;

  insert into public.user_security_profile (
    user_id, account_id,
    password_policy_version, password_strength_status,
    password_last_set_at
  )
  values (
    v_user_id, v_account_id,
    1, 'strong',
    now()
  )
  on conflict (user_id) do update
  set
    password_policy_version  = 1,
    password_strength_status = 'strong',
    password_last_set_at     = now(),
    updated_at               = now();

  -- Audit log only if we resolved an account
  if v_account_id is not null then
    perform public.log_security_event(
      v_account_id,
      'auth_password_policy_v1_accepted',
      'user',
      v_user_id,
      jsonb_build_object('policy_version', 1, 'flow', 'self')
    );
  end if;
end;
$$;

grant execute on function public.record_own_strong_password() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: get_own_security_profile
-- Users read their own posture (no account_id required).
-- ---------------------------------------------------------------------------

create or replace function public.get_own_security_profile()
returns table (
  password_policy_version  integer,
  password_strength_status text,
  password_last_set_at     timestamptz,
  mfa_required             boolean,
  mfa_enrolled             boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce(usp.password_policy_version, 0),
    coalesce(usp.password_strength_status, 'unknown'),
    usp.password_last_set_at,
    coalesce(usp.mfa_required, false),
    coalesce(usp.mfa_enrolled, false)
  from public.user_security_profile usp
  where usp.user_id = auth.uid();
$$;

grant execute on function public.get_own_security_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: list_account_password_security
-- Managers see all account members' security posture.
-- Returns members sorted worst-first so admins can prioritise.
-- ---------------------------------------------------------------------------

create or replace function public.list_account_password_security(p_account_id uuid)
returns table (
  user_id                  uuid,
  email                    text,
  display_name             text,
  role                     text,
  password_policy_version  integer,
  password_strength_status text,
  password_last_set_at     timestamptz,
  mfa_enrolled             boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_account_manager(p_account_id) then
    raise exception 'Access denied';
  end if;

  return query
  select
    am.user_id,
    au.email::text,
    coalesce(
      nullif(trim(au.raw_user_meta_data->>'full_name'), ''),
      au.email
    )::text                                              as display_name,
    coalesce(am.role, 'staff')::text                   as role,
    coalesce(usp.password_policy_version, 0)           as password_policy_version,
    coalesce(usp.password_strength_status, 'unknown')  as password_strength_status,
    usp.password_last_set_at,
    coalesce(usp.mfa_enrolled, false)                  as mfa_enrolled
  from public.account_members am
  join auth.users au on au.id = am.user_id
  left join public.user_security_profile usp on usp.user_id = am.user_id
  where am.account_id = p_account_id
  order by
    -- worst status first so the top of the list needs attention
    case coalesce(usp.password_strength_status, 'unknown')
      when 'reset_required' then 0
      when 'legacy_weak'    then 1
      when 'unknown'        then 2
      else                       3
    end,
    au.email;
end;
$$;

grant execute on function public.list_account_password_security(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap: mark all existing account members as legacy_weak
-- Only inserts rows that don't already exist — idempotent.
-- Uses distinct on user_id so each user gets one row (their primary account).
-- ---------------------------------------------------------------------------

insert into public.user_security_profile (
  user_id, account_id,
  password_policy_version, password_strength_status
)
select distinct on (am.user_id)
  am.user_id,
  am.account_id,
  0,
  'legacy_weak'
from public.account_members am
where not exists (
  select 1 from public.user_security_profile usp
  where usp.user_id = am.user_id
)
order by am.user_id, am.created_at;
