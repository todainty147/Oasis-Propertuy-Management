-- SaaS invitation hardening (account-scoped, multi-role)

create table if not exists public.account_invitations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  role text not null,
  token text not null unique,
  invited_by uuid null references auth.users(id) on delete set null,
  accepted_by uuid null references auth.users(id) on delete set null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill columns for legacy installations where account_invitations already exists
alter table public.account_invitations
  add column if not exists invited_by uuid null references auth.users(id) on delete set null,
  add column if not exists accepted_by uuid null references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz null,
  add column if not exists revoked_at timestamptz null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

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

create or replace function public.can_invite_account_role(p_account_id uuid, p_target_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter_role text;
  v_target_role text := lower(coalesce(p_target_role, ''));
begin
  if auth.uid() is null then
    return false;
  end if;

  select lower(am.role::text)
  into v_inviter_role
  from public.account_members am
  where am.account_id = p_account_id
    and am.user_id = auth.uid()
  limit 1;

  if v_inviter_role = 'owner' then
    return v_target_role in ('owner', 'admin', 'staff', 'tenant', 'contractor');
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

drop trigger if exists trg_account_invitations_set_updated_at on public.account_invitations;
create trigger trg_account_invitations_set_updated_at
before insert or update on public.account_invitations
for each row
execute function public.account_invitations_set_updated_at();

alter table public.account_invitations enable row level security;

drop policy if exists account_invitations_select_members on public.account_invitations;
create policy account_invitations_select_members
on public.account_invitations
for select
to authenticated
using (
  exists (
    select 1
    from public.account_members am
    where am.account_id = account_invitations.account_id
      and am.user_id = auth.uid()
  )
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
grant select, insert, update, delete on table public.account_invitations to authenticated;

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
    raise exception 'Invitation not found';
  end if;

  if v_email = '' or lower(v_inv.email) <> v_email then
    raise exception 'Invitation email mismatch';
  end if;

  if v_inv.revoked_at is not null then
    raise exception 'Invitation revoked';
  end if;

  if v_inv.accepted_at is not null then
    return jsonb_build_object('ok', true, 'already_accepted', true, 'account_id', v_inv.account_id);
  end if;

  v_role := lower(coalesce(v_inv.role::text, 'staff'));
  if v_role not in ('owner', 'admin', 'staff', 'tenant', 'contractor') then
    v_role := 'staff';
  end if;

  insert into public.account_members(account_id, user_id, role)
  values (v_inv.account_id, v_uid, v_role)
  on conflict (account_id, user_id) do update set role = excluded.role;

  update public.account_invitations
  set accepted_at = now(),
      accepted_by = v_uid
  where id = v_inv.id;

  return jsonb_build_object('ok', true, 'account_id', v_inv.account_id, 'role', v_role);
end;
$$;

grant execute on function public.accept_account_invite(text) to authenticated;
grant execute on function public.can_invite_account_role(uuid, text) to authenticated;
