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

-- Back-compat helper for RLS predicates.
create or replace function public.user_can_manage_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_members am
    where am.account_id = p_account_id
      and am.user_id = auth.uid()
      and lower(am.role::text) in ('owner', 'admin', 'staff')
  );
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
grant execute on function public.user_can_manage_account(uuid) to authenticated;

