-- Account sandbox/demo lifecycle metadata.
-- This keeps demo identity separate from core account records so production
-- accounts are not accidentally treated as disposable demo data.

create table if not exists public.account_sandbox_profiles (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  mode text not null default 'production' check (mode in ('production', 'demo')),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'reset_requested', 'resetting', 'expired')),
  seeded_fixture_version text,
  demo_expires_at timestamptz,
  reset_requested_at timestamptz,
  reset_completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_sandbox_profiles_mode_idx
on public.account_sandbox_profiles(mode, lifecycle_status);

create or replace function public.account_sandbox_profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_account_sandbox_profiles_set_updated_at on public.account_sandbox_profiles;
create trigger trg_account_sandbox_profiles_set_updated_at
before update on public.account_sandbox_profiles
for each row
execute function public.account_sandbox_profiles_set_updated_at();

alter table public.account_sandbox_profiles enable row level security;

drop policy if exists account_sandbox_profiles_select_managers on public.account_sandbox_profiles;
create policy account_sandbox_profiles_select_managers
on public.account_sandbox_profiles
for select
to authenticated
using (public.user_can_manage_account(account_id));

drop policy if exists account_sandbox_profiles_no_direct_write on public.account_sandbox_profiles;
create policy account_sandbox_profiles_no_direct_write
on public.account_sandbox_profiles
for all
to authenticated
using (false)
with check (false);

drop function if exists public.get_account_sandbox_status(uuid);
create or replace function public.get_account_sandbox_status(
  p_account_id uuid
)
returns table (
  account_id uuid,
  mode text,
  lifecycle_status text,
  seeded_fixture_version text,
  demo_expires_at timestamptz,
  reset_requested_at timestamptz,
  reset_completed_at timestamptz,
  is_demo boolean,
  reset_pending boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_manage_account_access(p_account_id);

  if not exists (select 1 from public.accounts a where a.id = p_account_id) then
    raise exception 'Account not found';
  end if;

  return query
  select
    p_account_id,
    coalesce(asp.mode, 'production') as mode,
    coalesce(asp.lifecycle_status, 'active') as lifecycle_status,
    asp.seeded_fixture_version,
    asp.demo_expires_at,
    asp.reset_requested_at,
    asp.reset_completed_at,
    coalesce(asp.mode, 'production') = 'demo' as is_demo,
    coalesce(asp.lifecycle_status, 'active') in ('reset_requested', 'resetting') as reset_pending
  from (select p_account_id as account_id) scope
  left join public.account_sandbox_profiles asp on asp.account_id = scope.account_id;
end;
$$;

grant select on table public.account_sandbox_profiles to authenticated;
grant execute on function public.get_account_sandbox_status(uuid) to anon;
grant execute on function public.get_account_sandbox_status(uuid) to authenticated;
