begin;

create table if not exists public.billing_customers (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  stripe_customer_id text not null unique,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  stripe_product_id text,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_end timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);

alter table public.billing_events
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists billing_events_account_created_idx
  on public.billing_events(account_id, created_at desc);

update public.billing_events
set account_id = (payload #>> '{data,object,metadata,account_id}')::uuid
where account_id is null
  and (payload #>> '{data,object,metadata,account_id}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

update public.billing_events be
set account_id = bc.account_id
from public.billing_customers bc
where be.account_id is null
  and payload #>> '{data,object,customer}' = bc.stripe_customer_id;

alter table public.accounts
  add column if not exists subscription_status text,
  add column if not exists subscription_plan text,
  add column if not exists subscription_renews_at timestamptz,
  add column if not exists billing_locked_at timestamptz;

create or replace function public.tg_set_updated_at_billing()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_billing_customers_updated_at on public.billing_customers;
create trigger trg_billing_customers_updated_at
before update on public.billing_customers
for each row
execute function public.tg_set_updated_at_billing();

drop trigger if exists trg_billing_subscriptions_updated_at on public.billing_subscriptions;
create trigger trg_billing_subscriptions_updated_at
before update on public.billing_subscriptions
for each row
execute function public.tg_set_updated_at_billing();

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists "billing_customers_select_managers" on public.billing_customers;
create policy "billing_customers_select_managers"
on public.billing_customers
for select
to authenticated
using (
  public.user_can_manage_account(billing_customers.account_id)
);

drop policy if exists "billing_customers_no_direct_write" on public.billing_customers;
create policy "billing_customers_no_direct_write"
on public.billing_customers
for all
to authenticated
using (false)
with check (false);

drop policy if exists "billing_subscriptions_select_managers" on public.billing_subscriptions;
create policy "billing_subscriptions_select_managers"
on public.billing_subscriptions
for select
to authenticated
using (
  public.user_can_manage_account(billing_subscriptions.account_id)
);

drop policy if exists "billing_subscriptions_no_direct_write" on public.billing_subscriptions;
create policy "billing_subscriptions_no_direct_write"
on public.billing_subscriptions
for all
to authenticated
using (false)
with check (false);

drop policy if exists "billing_events_select_managers" on public.billing_events;
create policy "billing_events_select_managers"
on public.billing_events
for select
to authenticated
using (
  billing_events.account_id is not null
  and public.user_can_manage_account(billing_events.account_id)
);

drop policy if exists "billing_events_no_direct_write" on public.billing_events;
create policy "billing_events_no_direct_write"
on public.billing_events
for all
to authenticated
using (false)
with check (false);

commit;
