-- Account-level branding for invite emails and account presentation.
-- Safe additive migration: does not modify existing invitation schema/functions.

create table if not exists public.account_branding (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  brand_name text,
  logo_url text,
  primary_color text,
  accent_color text,
  email_from_name text,
  reply_to_email text,
  support_email text,
  invite_subject_template text,
  invite_button_label text default 'Accept invitation',
  invite_footer_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.account_branding_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_account_branding_set_updated_at on public.account_branding;
create trigger trg_account_branding_set_updated_at
before update on public.account_branding
for each row
execute function public.account_branding_set_updated_at();

create or replace function public.user_is_root_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_members am
    join public.accounts a on a.id = am.account_id
    where am.user_id = auth.uid()
      and coalesce(a.is_root, false) = true
      and public.account_member_effective_role(am.account_id, am.user_id) = 'owner'
  );
$$;

-- Back-compat helper for RLS predicates and SECURITY DEFINER access guards.
-- Root operators intentionally have cross-account management capability for
-- support/admin actions, gated by user_is_root_operator(). Follow-up:
-- add root cross-account access audit events for account support actions.
create or replace function public.user_can_manage_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    public.user_is_root_operator()
    or public.account_member_effective_role(p_account_id, auth.uid()) in ('owner', 'admin', 'staff')
  ), false);
$$;

create or replace function public.assert_manage_account_access(p_account_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if not public.user_can_manage_account(p_account_id) then
    raise exception 'Access denied';
  end if;

  return p_account_id;
end;
$$;

create or replace function public.assert_tenant_scope_access(
  p_account_id uuid,
  p_tenant_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if public.user_can_manage_account(p_account_id) then
    return p_tenant_id;
  end if;

  if p_tenant_id is null then
    raise exception 'Access denied';
  end if;

  select t.id
  into v_tenant_id
  from public.tenants t
  where t.id = p_tenant_id
    and t.account_id = p_account_id
    and t.user_id = auth.uid()
  limit 1;

  if v_tenant_id is null then
    raise exception 'Access denied';
  end if;

  return v_tenant_id;
end;
$$;

alter table public.account_branding enable row level security;

drop policy if exists account_branding_select_managers on public.account_branding;
create policy account_branding_select_managers
on public.account_branding
for select
to authenticated
using (public.user_can_manage_account(account_id));

drop policy if exists account_branding_insert_managers on public.account_branding;
create policy account_branding_insert_managers
on public.account_branding
for insert
to authenticated
with check (public.user_can_manage_account(account_id));

drop policy if exists account_branding_update_managers on public.account_branding;
create policy account_branding_update_managers
on public.account_branding
for update
to authenticated
using (public.user_can_manage_account(account_id))
with check (public.user_can_manage_account(account_id));

grant select, insert, update on table public.account_branding to authenticated;
grant execute on function public.user_is_root_operator() to authenticated;
grant execute on function public.user_can_manage_account(uuid) to authenticated;
grant execute on function public.assert_manage_account_access(uuid) to authenticated;
grant execute on function public.assert_tenant_scope_access(uuid, uuid) to authenticated;
