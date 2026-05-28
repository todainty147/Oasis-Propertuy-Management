-- Phase 2 landlord tax tools: isolated, account-scoped record-keeping tables.
-- These tables are additive and do not modify existing finance, property,
-- tenant, document, maintenance, or billing behavior.

create extension if not exists pgcrypto;

create or replace function public.tax_tools_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.tax_expense_classifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  source_type text not null default 'manual',
  source_id uuid,
  tax_year text not null,
  expense_date date not null,
  amount numeric(12,2) not null,
  description text not null,
  category text not null,
  mtd_ready boolean not null default false,
  confidence text not null default 'manual',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tax_finance_cost_summaries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  tax_year text not null,
  rental_income numeric(12,2) not null default 0,
  non_finance_expenses numeric(12,2) not null default 0,
  finance_costs numeric(12,2) not null default 0,
  taxable_property_profit_before_finance numeric(12,2) not null default 0,
  estimated_basic_rate_credit numeric(12,2) not null default 0,
  estimated_unused_finance_costs numeric(12,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, property_id, tax_year)
);

create table if not exists public.tax_carried_forward_finance_costs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  tax_year text not null,
  brought_forward_amount numeric(12,2) not null default 0,
  finance_costs_this_year numeric(12,2) not null default 0,
  used_amount numeric(12,2) not null default 0,
  carried_forward_amount numeric(12,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, property_id, tax_year)
);

create table if not exists public.tax_year_summaries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  tax_year text not null,
  readiness_score integer not null default 0 check (readiness_score between 0 and 100),
  qualifying_income numeric(12,2) not null default 0,
  mtd_threshold_status text not null default 'under_threshold',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, property_id, tax_year)
);

create table if not exists public.tax_tool_audit_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tax_expense_classifications_account_year
  on public.tax_expense_classifications(account_id, tax_year, expense_date desc);
create index if not exists idx_tax_expense_classifications_property
  on public.tax_expense_classifications(account_id, property_id)
  where property_id is not null;
create index if not exists idx_tax_finance_cost_summaries_account_year
  on public.tax_finance_cost_summaries(account_id, tax_year);
create index if not exists idx_tax_carried_forward_account_year
  on public.tax_carried_forward_finance_costs(account_id, tax_year);
create index if not exists idx_tax_year_summaries_account_year
  on public.tax_year_summaries(account_id, tax_year);
create index if not exists idx_tax_tool_audit_log_account_created
  on public.tax_tool_audit_log(account_id, created_at desc);

drop trigger if exists trg_tax_expense_classifications_updated_at on public.tax_expense_classifications;
create trigger trg_tax_expense_classifications_updated_at
  before update on public.tax_expense_classifications
  for each row execute function public.tax_tools_set_updated_at();

drop trigger if exists trg_tax_finance_cost_summaries_updated_at on public.tax_finance_cost_summaries;
create trigger trg_tax_finance_cost_summaries_updated_at
  before update on public.tax_finance_cost_summaries
  for each row execute function public.tax_tools_set_updated_at();

drop trigger if exists trg_tax_carried_forward_finance_costs_updated_at on public.tax_carried_forward_finance_costs;
create trigger trg_tax_carried_forward_finance_costs_updated_at
  before update on public.tax_carried_forward_finance_costs
  for each row execute function public.tax_tools_set_updated_at();

drop trigger if exists trg_tax_year_summaries_updated_at on public.tax_year_summaries;
create trigger trg_tax_year_summaries_updated_at
  before update on public.tax_year_summaries
  for each row execute function public.tax_tools_set_updated_at();

alter table public.tax_expense_classifications enable row level security;
alter table public.tax_finance_cost_summaries enable row level security;
alter table public.tax_carried_forward_finance_costs enable row level security;
alter table public.tax_year_summaries enable row level security;
alter table public.tax_tool_audit_log enable row level security;

drop policy if exists "Managers can read tax expense classifications" on public.tax_expense_classifications;
create policy "Managers can read tax expense classifications"
  on public.tax_expense_classifications
  for select to authenticated
  using (public.user_can_manage_account(account_id));

drop policy if exists "Managers can insert tax expense classifications" on public.tax_expense_classifications;
create policy "Managers can insert tax expense classifications"
  on public.tax_expense_classifications
  for insert to authenticated
  with check (public.user_can_manage_account(account_id));

drop policy if exists "Managers can update tax expense classifications" on public.tax_expense_classifications;
create policy "Managers can update tax expense classifications"
  on public.tax_expense_classifications
  for update to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

drop policy if exists "Managers can delete tax expense classifications" on public.tax_expense_classifications;
create policy "Managers can delete tax expense classifications"
  on public.tax_expense_classifications
  for delete to authenticated
  using (public.user_can_manage_account(account_id));

drop policy if exists "Managers can manage tax finance cost summaries" on public.tax_finance_cost_summaries;
create policy "Managers can manage tax finance cost summaries"
  on public.tax_finance_cost_summaries
  for all to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

drop policy if exists "Managers can manage carried forward finance costs" on public.tax_carried_forward_finance_costs;
create policy "Managers can manage carried forward finance costs"
  on public.tax_carried_forward_finance_costs
  for all to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

drop policy if exists "Managers can manage tax year summaries" on public.tax_year_summaries;
create policy "Managers can manage tax year summaries"
  on public.tax_year_summaries
  for all to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

drop policy if exists "Managers can read tax tool audit log" on public.tax_tool_audit_log;
create policy "Managers can read tax tool audit log"
  on public.tax_tool_audit_log
  for select to authenticated
  using (public.user_can_manage_account(account_id));

drop policy if exists "Managers can insert tax tool audit log" on public.tax_tool_audit_log;
create policy "Managers can insert tax tool audit log"
  on public.tax_tool_audit_log
  for insert to authenticated
  with check (public.user_can_manage_account(account_id));

grant select, insert, update, delete on public.tax_expense_classifications to authenticated;
grant select, insert, update, delete on public.tax_finance_cost_summaries to authenticated;
grant select, insert, update, delete on public.tax_carried_forward_finance_costs to authenticated;
grant select, insert, update, delete on public.tax_year_summaries to authenticated;
grant select, insert on public.tax_tool_audit_log to authenticated;
