create table if not exists public.account_payment_collection_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  collection_status text not null default 'disabled'
    check (collection_status in ('disabled', 'manual', 'external_portal')),
  accepted_methods text[] not null default '{}'::text[],
  instructions text,
  portal_url text,
  support_email text,
  autopay_status text not null default 'not_available'
    check (autopay_status in ('not_available', 'external')),
  autopay_instructions text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_payment_collection_settings_portal_required
    check (
      collection_status <> 'external_portal'
      or coalesce(length(trim(portal_url)), 0) > 0
    )
);

create or replace function public.account_payment_collection_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_account_payment_collection_settings_set_updated_at
on public.account_payment_collection_settings;
create trigger trg_account_payment_collection_settings_set_updated_at
before update on public.account_payment_collection_settings
for each row
execute function public.account_payment_collection_settings_set_updated_at();

alter table public.account_payment_collection_settings enable row level security;

drop policy if exists account_payment_collection_settings_select_managers
on public.account_payment_collection_settings;
create policy account_payment_collection_settings_select_managers
on public.account_payment_collection_settings
for select
to authenticated
using (
  public.user_can_manage_account(account_id)
);

drop policy if exists account_payment_collection_settings_select_tenants
on public.account_payment_collection_settings;
create policy account_payment_collection_settings_select_tenants
on public.account_payment_collection_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.tenants t
    where t.account_id = account_payment_collection_settings.account_id
      and t.user_id = auth.uid()
      and t.archived_at is null
      and t.status in ('active', 'accepted_pending_signing')
  )
);

drop policy if exists account_payment_collection_settings_upsert_managers
on public.account_payment_collection_settings;
create policy account_payment_collection_settings_upsert_managers
on public.account_payment_collection_settings
to authenticated
using (
  public.user_can_manage_account(account_id)
)
with check (
  public.user_can_manage_account(account_id)
);

grant select, insert, update on table public.account_payment_collection_settings to authenticated;
