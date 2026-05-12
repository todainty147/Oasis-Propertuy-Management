-- ============================================================================
-- Rent Calculation Engine — Tables, RLS, and Posting RPCs
-- Phase B+C of the Rent Calculation Engine epic.
--
-- Guardrails enforced here:
--   • All tables are account-scoped (account_id FK, RLS on every table).
--   • Calculation engine never mutates ledger_entries directly.
--   • Expected charges post to payments only through post_expected_charge().
--   • Rent plan changes are versioned; active plans are superseded, not deleted.
--   • No hardcoded market-specific rules in table constraints.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rent_plans
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rent_plans (
  id                   uuid        primary key default gen_random_uuid(),
  account_id           uuid        not null references public.accounts(id) on delete cascade,
  property_id          uuid        references public.properties(id) on delete set null,
  tenant_id            uuid        references public.tenants(id) on delete set null,
  lease_id             uuid        references public.leases(id) on delete set null,

  -- Market context (used for deposit checks and market-specific warnings only)
  market               text        not null default 'generic'
                                   check (market in ('uk', 'pl', 'generic')),
  currency             text        not null default 'GBP',

  -- Core rent schedule
  billing_frequency    text        not null default 'monthly'
                                   check (billing_frequency in (
                                     'monthly', 'weekly', 'fortnightly',
                                     'four_weekly', 'annual', 'nightly', 'custom'
                                   )),
  base_rent_amount     numeric(12,2) not null check (base_rent_amount >= 0),
  due_day              smallint    not null default 1 check (due_day between 1 and 28),
  start_date           date        not null,
  end_date             date,

  -- Policies (calculation engine reads these; never hardcode rules here)
  proration_policy     text        not null default 'actual_days_in_month'
                                   check (proration_policy in (
                                     'actual_days_in_month', 'thirty_day_month',
                                     'annual_daily_365', 'annual_daily_actual_year',
                                     'no_proration', 'manual_override'
                                   )),
  deposit_policy       text        not null default 'market_default'
                                   check (deposit_policy in ('market_default', 'custom', 'none')),
  deposit_amount       numeric(12,2) check (deposit_amount >= 0),
  utilities_policy     text        not null default 'rent_only'
                                   check (utilities_policy in (
                                     'rent_only', 'bills_inclusive',
                                     'fixed_utility_charge', 'variable_utility_charge'
                                   )),
  rounding_policy      text        not null default 'nearest_penny'
                                   check (rounding_policy in (
                                     'nearest_penny', 'round_up', 'round_down', 'none'
                                   )),

  -- Lifecycle
  status               text        not null default 'draft'
                                   check (status in ('draft', 'active', 'superseded', 'ended')),
  version_number       integer     not null default 1 check (version_number >= 1),
  supersedes_id        uuid        references public.rent_plans(id) on delete set null,

  notes                text,
  created_by           uuid        references auth.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Only one active plan per (account, property, tenant) at a time
create unique index if not exists rent_plans_one_active_per_property_tenant
  on public.rent_plans (account_id, property_id, tenant_id)
  where status = 'active' and property_id is not null and tenant_id is not null;

alter table public.rent_plans enable row level security;
alter table public.rent_plans force row level security;

create policy "rent_plans_select_managers" on public.rent_plans
  for select to authenticated
  using (public.user_can_manage_account(account_id));

create policy "rent_plans_insert_managers" on public.rent_plans
  for insert to authenticated
  with check (public.user_can_manage_account(account_id));

create policy "rent_plans_update_managers" on public.rent_plans
  for update to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

-- No delete policy — plans are versioned/ended, never hard-deleted

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rent_charge_rules
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rent_charge_rules (
  id                uuid        primary key default gen_random_uuid(),
  account_id        uuid        not null references public.accounts(id) on delete cascade,
  rent_plan_id      uuid        not null references public.rent_plans(id) on delete cascade,

  charge_type       text        not null
                                check (charge_type in (
                                  'rent', 'utilities', 'service_charge',
                                  'parking', 'deposit', 'adjustment', 'other'
                                )),
  label             text        not null,
  amount            numeric(12,2) not null check (amount >= 0),
  calculation_type  text        not null default 'fixed'
                                check (calculation_type in (
                                  'fixed', 'percentage', 'metered', 'formula', 'manual'
                                )),
  frequency         text        not null default 'monthly'
                                check (frequency in (
                                  'monthly', 'weekly', 'fortnightly',
                                  'four_weekly', 'annual', 'one_off', 'custom'
                                )),
  included_in_rent  boolean     not null default false,
  taxable_flag      boolean     not null default false,
  effective_from    date,
  effective_to      date,
  metadata          jsonb       not null default '{}',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.rent_charge_rules enable row level security;
alter table public.rent_charge_rules force row level security;

create policy "rent_charge_rules_select_managers" on public.rent_charge_rules
  for select to authenticated
  using (public.user_can_manage_account(account_id));

create policy "rent_charge_rules_insert_managers" on public.rent_charge_rules
  for insert to authenticated
  with check (public.user_can_manage_account(account_id));

create policy "rent_charge_rules_update_managers" on public.rent_charge_rules
  for update to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

create policy "rent_charge_rules_delete_managers" on public.rent_charge_rules
  for delete to authenticated
  using (public.user_can_manage_account(account_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rent_calculation_runs
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rent_calculation_runs (
  id                  uuid        primary key default gen_random_uuid(),
  account_id          uuid        not null references public.accounts(id) on delete cascade,
  rent_plan_id        uuid        references public.rent_plans(id) on delete set null,
  tenant_id           uuid        references public.tenants(id) on delete set null,
  property_id         uuid        references public.properties(id) on delete set null,

  period_start        date        not null,
  period_end          date        not null,

  -- Full snapshot of inputs and outputs for auditability
  calculation_input   jsonb       not null default '{}',
  calculation_result  jsonb       not null default '{}',
  warnings            jsonb       not null default '[]',

  status              text        not null default 'preview'
                                  check (status in ('preview', 'approved', 'posted', 'discarded')),

  created_by          uuid        references auth.users(id),
  created_at          timestamptz not null default now()
  -- Intentionally no updated_at: runs are immutable audit records
);

alter table public.rent_calculation_runs enable row level security;
alter table public.rent_calculation_runs force row level security;

create policy "rent_calc_runs_select_managers" on public.rent_calculation_runs
  for select to authenticated
  using (public.user_can_manage_account(account_id));

create policy "rent_calc_runs_insert_managers" on public.rent_calculation_runs
  for insert to authenticated
  with check (public.user_can_manage_account(account_id));

-- No update/delete: calculation runs are immutable. Status changes go through RPCs.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. expected_charges
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.expected_charges (
  id                  uuid        primary key default gen_random_uuid(),
  account_id          uuid        not null references public.accounts(id) on delete cascade,
  rent_plan_id        uuid        references public.rent_plans(id) on delete set null,
  tenant_id           uuid        references public.tenants(id) on delete set null,
  property_id         uuid        references public.properties(id) on delete set null,

  charge_type         text        not null
                                  check (charge_type in (
                                    'rent', 'utilities', 'service_charge',
                                    'parking', 'deposit', 'adjustment', 'other'
                                  )),
  period_start        date        not null,
  period_end          date        not null,
  due_date            date        not null,
  amount              numeric(12,2) not null check (amount >= 0),
  currency            text        not null default 'GBP',

  status              text        not null default 'scheduled'
                                  check (status in ('scheduled', 'posted', 'cancelled', 'superseded')),
  source              text        not null default 'rent_plan'
                                  check (source in ('rent_plan', 'manual', 'adjustment')),

  calculation_run_id  uuid        references public.rent_calculation_runs(id) on delete set null,
  posted_payment_id   uuid        references public.payments(id) on delete set null,
  notes               text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Prevent duplicate charges for the same tenant/period/charge_type unless explicitly allowed
create unique index if not exists expected_charges_no_dup
  on public.expected_charges (account_id, tenant_id, property_id, charge_type, period_start)
  where status not in ('cancelled', 'superseded') and tenant_id is not null;

alter table public.expected_charges enable row level security;
alter table public.expected_charges force row level security;

create policy "expected_charges_select_managers" on public.expected_charges
  for select to authenticated
  using (public.user_can_manage_account(account_id));

create policy "expected_charges_insert_managers" on public.expected_charges
  for insert to authenticated
  with check (public.user_can_manage_account(account_id));

create policy "expected_charges_update_managers" on public.expected_charges
  for update to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: activate_rent_plan
--    Transitions a draft plan to active, superseding any existing active plan.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.activate_rent_plan(
  p_account_id   uuid,
  p_rent_plan_id uuid
)
returns public.rent_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan      public.rent_plans;
  v_old_id    uuid;
begin
  perform public.assert_manage_account_access(p_account_id);

  select * into v_plan
  from public.rent_plans
  where id = p_rent_plan_id
    and account_id = p_account_id;

  if not found then
    raise exception 'rent plan not found';
  end if;

  if v_plan.status not in ('draft') then
    raise exception 'only draft plans can be activated; current status: %', v_plan.status;
  end if;

  -- Supersede any existing active plan for the same property+tenant
  if v_plan.property_id is not null and v_plan.tenant_id is not null then
    update public.rent_plans
    set    status = 'superseded', updated_at = now()
    where  account_id  = p_account_id
      and  property_id = v_plan.property_id
      and  tenant_id   = v_plan.tenant_id
      and  status      = 'active'
      and  id          <> p_rent_plan_id
    returning id into v_old_id;

    -- Link the new plan to the one it supersedes
    if v_old_id is not null then
      update public.rent_plans
      set    supersedes_id = v_old_id
      where  id = p_rent_plan_id;
    end if;
  end if;

  update public.rent_plans
  set    status = 'active', updated_at = now()
  where  id = p_rent_plan_id
  returning * into v_plan;

  return v_plan;
end;
$$;

grant execute on function public.activate_rent_plan(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC: save_calculation_run
--    Persists a completed calculation (preview → approved → posted).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.save_calculation_run(
  p_account_id        uuid,
  p_rent_plan_id      uuid,
  p_tenant_id         uuid,
  p_property_id       uuid,
  p_period_start      date,
  p_period_end        date,
  p_calculation_input jsonb,
  p_calculation_result jsonb,
  p_warnings          jsonb  default '[]'
)
returns public.rent_calculation_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.rent_calculation_runs;
begin
  perform public.assert_manage_account_access(p_account_id);

  insert into public.rent_calculation_runs (
    account_id, rent_plan_id, tenant_id, property_id,
    period_start, period_end,
    calculation_input, calculation_result, warnings,
    status, created_by
  ) values (
    p_account_id, p_rent_plan_id, p_tenant_id, p_property_id,
    p_period_start, p_period_end,
    p_calculation_input, p_calculation_result, p_warnings,
    'preview', auth.uid()
  )
  returning * into v_run;

  return v_run;
end;
$$;

grant execute on function public.save_calculation_run(uuid, uuid, uuid, uuid, date, date, jsonb, jsonb, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC: generate_expected_charge
--    Creates an expected_charge from an approved calculation run.
--    Does NOT write to payments or ledger_entries.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.generate_expected_charge(
  p_account_id         uuid,
  p_rent_plan_id       uuid,
  p_tenant_id          uuid,
  p_property_id        uuid,
  p_charge_type        text,
  p_period_start       date,
  p_period_end         date,
  p_due_date           date,
  p_amount             numeric,
  p_currency           text,
  p_calculation_run_id uuid  default null,
  p_notes              text  default null
)
returns public.expected_charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge public.expected_charges;
begin
  perform public.assert_manage_account_access(p_account_id);

  insert into public.expected_charges (
    account_id, rent_plan_id, tenant_id, property_id,
    charge_type, period_start, period_end, due_date,
    amount, currency, status, source,
    calculation_run_id, notes
  ) values (
    p_account_id, p_rent_plan_id, p_tenant_id, p_property_id,
    p_charge_type, p_period_start, p_period_end, p_due_date,
    p_amount, p_currency, 'scheduled', 'rent_plan',
    p_calculation_run_id, p_notes
  )
  returning * into v_charge;

  return v_charge;
end;
$$;

grant execute on function public.generate_expected_charge(uuid, uuid, uuid, uuid, text, date, date, date, numeric, text, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RPC: post_expected_charge
--    Posts a scheduled expected_charge to the payments table via create_payment.
--    This is the ONLY approved path from expected_charges → payments.
--    Ledger entry is NOT written here — Finance page handles that separately.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.post_expected_charge(
  p_account_id         uuid,
  p_expected_charge_id uuid
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge  public.expected_charges;
  v_payment public.payments;
begin
  perform public.assert_manage_account_access(p_account_id);

  select * into v_charge
  from public.expected_charges
  where id = p_expected_charge_id
    and account_id = p_account_id;

  if not found then
    raise exception 'expected charge not found';
  end if;

  if v_charge.status <> 'scheduled' then
    raise exception 'only scheduled charges can be posted; current status: %', v_charge.status;
  end if;

  -- Delegate to the approved payment creation RPC (preserves all existing guards)
  select * into v_payment
  from public.create_payment(
    p_account_id  => p_account_id,
    p_property_id => v_charge.property_id,
    p_tenant_id   => v_charge.tenant_id,
    p_amount      => v_charge.amount,
    p_due_date    => v_charge.due_date,
    p_paid_at     => null,
    p_notes       => coalesce(v_charge.notes, 'Posted from expected charge ' || v_charge.id::text)
  );

  -- Mark the expected charge as posted and link it to the new payment
  update public.expected_charges
  set    status           = 'posted',
         posted_payment_id = v_payment.id,
         updated_at       = now()
  where  id = p_expected_charge_id;

  return v_payment;
end;
$$;

grant execute on function public.post_expected_charge(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RPC: cancel_expected_charge
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.cancel_expected_charge(
  p_account_id         uuid,
  p_expected_charge_id uuid,
  p_notes              text default null
)
returns public.expected_charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge public.expected_charges;
begin
  perform public.assert_manage_account_access(p_account_id);

  update public.expected_charges
  set    status     = 'cancelled',
         notes      = coalesce(p_notes, notes),
         updated_at = now()
  where  id         = p_expected_charge_id
    and  account_id = p_account_id
    and  status     = 'scheduled'
  returning * into v_charge;

  if not found then
    raise exception 'expected charge not found or already posted/cancelled';
  end if;

  return v_charge;
end;
$$;

grant execute on function public.cancel_expected_charge(uuid, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists rent_plans_account_property
  on public.rent_plans (account_id, property_id);

create index if not exists rent_plans_account_tenant
  on public.rent_plans (account_id, tenant_id);

create index if not exists rent_plans_status
  on public.rent_plans (account_id, status);

create index if not exists rent_charge_rules_plan
  on public.rent_charge_rules (rent_plan_id);

create index if not exists rent_calc_runs_plan
  on public.rent_calculation_runs (account_id, rent_plan_id);

create index if not exists expected_charges_account_tenant
  on public.expected_charges (account_id, tenant_id, status);

create index if not exists expected_charges_due_date
  on public.expected_charges (account_id, due_date)
  where status = 'scheduled';
