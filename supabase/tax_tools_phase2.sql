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

alter table public.tax_expense_classifications
  add column if not exists source_table text,
  add column if not exists source_label text,
  add column if not exists source_original_category text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists review_status text not null default 'manual',
  add column if not exists include_in_mtd boolean not null default false,
  add column if not exists classification_confidence text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists excluded_reason text,
  add column if not exists synced_at timestamptz;

alter table public.tax_expense_classifications
  drop constraint if exists tax_expense_classifications_source_type_check;
alter table public.tax_expense_classifications
  add constraint tax_expense_classifications_source_type_check
  check (source_type is null or source_type in ('manual', 'property_operating_expense', 'imported_csv', 'system', 'migrated'));

alter table public.tax_expense_classifications
  drop constraint if exists tax_expense_classifications_review_status_check;
alter table public.tax_expense_classifications
  add constraint tax_expense_classifications_review_status_check
  check (review_status in ('manual', 'candidate', 'needs_review', 'reviewed', 'excluded'));

alter table public.tax_expense_classifications
  drop constraint if exists tax_expense_classifications_confidence_check;
alter table public.tax_expense_classifications
  add constraint tax_expense_classifications_confidence_check
  check (classification_confidence is null or classification_confidence in ('suggested', 'landlord_confirmed', 'accountant_review_required'));

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
alter table public.tax_expense_classifications
  drop constraint if exists tax_expense_classifications_source_unique;
alter table public.tax_expense_classifications
  add constraint tax_expense_classifications_source_unique
  unique(account_id, source_type, source_id);
create unique index if not exists tax_expense_classifications_source_unique_idx
  on public.tax_expense_classifications(account_id, source_type, source_id)
  where source_type is not null and source_id is not null;
create index if not exists idx_tax_expense_classifications_review
  on public.tax_expense_classifications(account_id, tax_year, review_status, include_in_mtd);
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

create or replace function public.enforce_tax_expense_classification_source_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source record;
begin
  if new.source_type is distinct from 'property_operating_expense' or new.source_id is null then
    return new;
  end if;

  select account_id, property_id
    into v_source
  from public.property_operating_expenses
  where id = new.source_id;

  if not found then
    raise exception 'Property operating expense source not found';
  end if;

  if v_source.account_id is distinct from new.account_id then
    raise exception 'Property operating expense source account mismatch';
  end if;

  if new.property_id is not null and v_source.property_id is distinct from new.property_id then
    raise exception 'Property operating expense source property mismatch';
  end if;

  new.source_table = coalesce(new.source_table, 'property_operating_expenses');
  new.property_id = coalesce(new.property_id, v_source.property_id);
  return new;
end;
$$;

drop trigger if exists trg_tax_expense_classifications_source_account on public.tax_expense_classifications;
create trigger trg_tax_expense_classifications_source_account
  before insert or update on public.tax_expense_classifications
  for each row execute function public.enforce_tax_expense_classification_source_account();

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
