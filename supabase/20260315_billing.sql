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
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz not null default now()
);

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

drop policy if exists "billing_subscriptions_select_managers" on public.billing_subscriptions;
create policy "billing_subscriptions_select_managers"
on public.billing_subscriptions
for select
to authenticated
using (
  public.user_can_manage_account(billing_subscriptions.account_id)
);

commit;
