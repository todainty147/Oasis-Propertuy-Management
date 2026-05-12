-- ============================================================================
-- Advanced Rent Models — Tables and RLS
-- Epic 2: Split Rent, Room-Based Rent, Variable Utilities,
--          Rent Adjustments, STR Nightly
--
-- Guardrails:
--   • All tables account-scoped with RLS using user_can_manage_account().
--   • No ledger writes here — posting goes through post_expected_charge() only.
--   • Rent plan versioning preserved — increases create new versions.
--   • No platform integrations in STR model.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rent_splits
--    Per-tenant rent split configuration for shared tenancies.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rent_splits (
  id                   uuid          primary key default gen_random_uuid(),
  account_id           uuid          not null references public.accounts(id) on delete cascade,
  rent_plan_id         uuid          not null references public.rent_plans(id) on delete cascade,
  tenant_id            uuid          references public.tenants(id) on delete set null,

  split_type           text          not null default 'equal_split'
                                     check (split_type in (
                                       'equal_split', 'percentage_split',
                                       'fixed_amount_split', 'custom_manual_split'
                                     )),
  split_percentage     numeric(7,4)  check (split_percentage >= 0 and split_percentage <= 100),
  fixed_amount         numeric(12,2) check (fixed_amount >= 0),
  currency             text          not null default 'GBP',
  effective_from       date,
  effective_to         date,

  rounding_adjustment  integer       not null default 0, -- pence; explicit remainder tracking
  override_reason      text,                             -- required for custom_manual_split

  status               text          not null default 'active'
                                     check (status in ('draft', 'active', 'superseded', 'cancelled')),
  metadata             jsonb         not null default '{}',
  created_by           uuid          references auth.users(id),
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

-- One active split config per tenant per rent plan
create unique index if not exists rent_splits_one_active_per_tenant
  on public.rent_splits (rent_plan_id, tenant_id)
  where status = 'active' and tenant_id is not null;

alter table public.rent_splits enable row level security;
alter table public.rent_splits force row level security;

drop policy if exists "rent_splits_select_managers" on public.rent_splits;
drop policy if exists "rent_splits_insert_managers" on public.rent_splits;
drop policy if exists "rent_splits_update_managers" on public.rent_splits;

create policy "rent_splits_select_managers" on public.rent_splits
  for select to authenticated using (public.user_can_manage_account(account_id));
create policy "rent_splits_insert_managers" on public.rent_splits
  for insert to authenticated with check (public.user_can_manage_account(account_id));
create policy "rent_splits_update_managers" on public.rent_splits
  for update to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

create index if not exists rent_splits_plan on public.rent_splits (rent_plan_id);
create index if not exists rent_splits_account_tenant on public.rent_splits (account_id, tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. property_rooms
--    Minimal room/unit model for HMO properties.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.property_rooms (
  id            uuid        primary key default gen_random_uuid(),
  account_id    uuid        not null references public.accounts(id) on delete cascade,
  property_id   uuid        not null references public.properties(id) on delete cascade,

  room_label    text        not null,       -- e.g. "Room 1", "Top floor double"
  room_type     text        not null default 'single'
                            check (room_type in ('single', 'double', 'ensuite', 'studio', 'other')),
  floor         text,
  max_occupants smallint    not null default 1 check (max_occupants >= 1),
  amenities     text,

  status        text        not null default 'available'
                            check (status in ('available', 'occupied', 'maintenance', 'inactive')),
  metadata      jsonb       not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.property_rooms enable row level security;
alter table public.property_rooms force row level security;

drop policy if exists "property_rooms_select_managers" on public.property_rooms;
drop policy if exists "property_rooms_insert_managers" on public.property_rooms;
drop policy if exists "property_rooms_update_managers" on public.property_rooms;
drop policy if exists "property_rooms_delete_managers" on public.property_rooms;

create policy "property_rooms_select_managers" on public.property_rooms
  for select to authenticated using (public.user_can_manage_account(account_id));
create policy "property_rooms_insert_managers" on public.property_rooms
  for insert to authenticated with check (public.user_can_manage_account(account_id));
create policy "property_rooms_update_managers" on public.property_rooms
  for update to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));
create policy "property_rooms_delete_managers" on public.property_rooms
  for delete to authenticated using (public.user_can_manage_account(account_id));

create index if not exists property_rooms_property on public.property_rooms (account_id, property_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. room_rent_assignments
--    Per-room rent amounts with optional tenant assignment.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.room_rent_assignments (
  id                uuid          primary key default gen_random_uuid(),
  account_id        uuid          not null references public.accounts(id) on delete cascade,
  rent_plan_id      uuid          references public.rent_plans(id) on delete set null,
  property_id       uuid          not null references public.properties(id) on delete cascade,
  room_id           uuid          not null references public.property_rooms(id) on delete cascade,
  tenant_id         uuid          references public.tenants(id) on delete set null,

  amount            numeric(12,2) not null check (amount >= 0),
  currency          text          not null default 'GBP',
  billing_frequency text          not null default 'monthly'
                                  check (billing_frequency in (
                                    'monthly', 'weekly', 'fortnightly', 'four_weekly', 'annual', 'nightly'
                                  )),
  proration_policy  text          not null default 'actual_days_in_month'
                                  check (proration_policy in (
                                    'actual_days_in_month', 'thirty_day_month',
                                    'annual_daily_365', 'annual_daily_actual_year',
                                    'no_proration', 'manual_override'
                                  )),
  effective_from    date          not null,
  effective_to      date,
  status            text          not null default 'active'
                                  check (status in ('draft', 'active', 'superseded', 'ended')),
  metadata          jsonb         not null default '{}',
  created_by        uuid          references auth.users(id),
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

-- Prevent overlapping active assignments for same room+tenant
create unique index if not exists room_rent_one_active_per_room_tenant
  on public.room_rent_assignments (room_id, tenant_id)
  where status = 'active' and tenant_id is not null;

alter table public.room_rent_assignments enable row level security;
alter table public.room_rent_assignments force row level security;

drop policy if exists "room_rent_select_managers" on public.room_rent_assignments;
drop policy if exists "room_rent_insert_managers" on public.room_rent_assignments;
drop policy if exists "room_rent_update_managers" on public.room_rent_assignments;

create policy "room_rent_select_managers" on public.room_rent_assignments
  for select to authenticated using (public.user_can_manage_account(account_id));
create policy "room_rent_insert_managers" on public.room_rent_assignments
  for insert to authenticated with check (public.user_can_manage_account(account_id));
create policy "room_rent_update_managers" on public.room_rent_assignments
  for update to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

create index if not exists room_rent_assignments_room on public.room_rent_assignments (room_id);
create index if not exists room_rent_assignments_account on public.room_rent_assignments (account_id, property_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. utility_charges
--    Variable utility billing records (meter, invoice, manual).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.utility_charges (
  id                   uuid          primary key default gen_random_uuid(),
  account_id           uuid          not null references public.accounts(id) on delete cascade,
  rent_plan_id         uuid          references public.rent_plans(id) on delete set null,
  property_id          uuid          references public.properties(id) on delete set null,
  tenant_id            uuid          references public.tenants(id) on delete set null,

  utility_type         text          not null
                                     check (utility_type in (
                                       'electricity', 'gas', 'water', 'council_tax',
                                       'internet', 'service_charge', 'other'
                                     )),
  calculation_method   text          not null default 'manual'
                                     check (calculation_method in (
                                       'fixed', 'manual', 'meter_usage', 'invoice_split'
                                     )),

  -- Meter-based fields
  unit_rate            numeric(10,6),                     -- cost per unit (e.g. £/kWh)
  standing_charge      numeric(12,2)  not null default 0, -- pence-level precision via engine
  previous_reading     numeric(12,3),
  current_reading      numeric(12,3),
  reading_start_date   date,
  reading_end_date     date,
  override_reason      text,                              -- required if current < previous

  -- Invoice-based fields
  invoice_amount       numeric(12,2),
  split_method         text          check (split_method in ('equal', 'percentage', 'fixed')),
  split_ratio          numeric(7,4),                      -- tenant's share as fraction (0–1)

  -- Calculated output
  amount_calculated    numeric(12,2),
  currency             text          not null default 'GBP',
  evidence_note        text,

  status               text          not null default 'draft'
                                     check (status in ('draft', 'approved', 'posted', 'cancelled')),
  metadata             jsonb         not null default '{}',
  created_by           uuid          references auth.users(id),
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

alter table public.utility_charges enable row level security;
alter table public.utility_charges force row level security;

drop policy if exists "utility_charges_select_managers" on public.utility_charges;
drop policy if exists "utility_charges_insert_managers" on public.utility_charges;
drop policy if exists "utility_charges_update_managers" on public.utility_charges;

create policy "utility_charges_select_managers" on public.utility_charges
  for select to authenticated using (public.user_can_manage_account(account_id));
create policy "utility_charges_insert_managers" on public.utility_charges
  for insert to authenticated with check (public.user_can_manage_account(account_id));
create policy "utility_charges_update_managers" on public.utility_charges
  for update to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

create index if not exists utility_charges_account_property
  on public.utility_charges (account_id, property_id, status);
create index if not exists utility_charges_tenant
  on public.utility_charges (account_id, tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. rent_adjustments
--    Discounts, promotions, rent holidays, goodwill credits.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rent_adjustments (
  id                   uuid          primary key default gen_random_uuid(),
  account_id           uuid          not null references public.accounts(id) on delete cascade,
  rent_plan_id         uuid          references public.rent_plans(id) on delete set null,
  tenant_id            uuid          references public.tenants(id) on delete set null,
  property_id          uuid          references public.properties(id) on delete set null,

  adjustment_type      text          not null
                                     check (adjustment_type in (
                                       'percentage_discount', 'fixed_discount',
                                       'rent_holiday', 'introductory_offer',
                                       'goodwill_credit', 'manual_adjustment'
                                     )),
  amount               numeric(12,2) not null default 0 check (amount >= 0),
  percentage           numeric(7,4)  check (percentage >= 0 and percentage <= 100),
  applies_to_charge_type text        not null default 'rent'
                                     check (applies_to_charge_type in (
                                       'rent', 'utilities', 'all'
                                     )),

  start_date           date          not null,
  end_date             date,                              -- null = one-off
  reason               text          not null,            -- always required

  status               text          not null default 'draft'
                                     check (status in ('draft', 'active', 'expired', 'cancelled')),
  approved_by          uuid          references auth.users(id),
  metadata             jsonb         not null default '{}',
  created_by           uuid          references auth.users(id),
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

alter table public.rent_adjustments enable row level security;
alter table public.rent_adjustments force row level security;

drop policy if exists "rent_adjustments_select_managers" on public.rent_adjustments;
drop policy if exists "rent_adjustments_insert_managers" on public.rent_adjustments;
drop policy if exists "rent_adjustments_update_managers" on public.rent_adjustments;

create policy "rent_adjustments_select_managers" on public.rent_adjustments
  for select to authenticated using (public.user_can_manage_account(account_id));
create policy "rent_adjustments_insert_managers" on public.rent_adjustments
  for insert to authenticated with check (public.user_can_manage_account(account_id));
create policy "rent_adjustments_update_managers" on public.rent_adjustments
  for update to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

create index if not exists rent_adjustments_account_tenant
  on public.rent_adjustments (account_id, tenant_id, status);
create index if not exists rent_adjustments_active_dates
  on public.rent_adjustments (account_id, start_date, end_date)
  where status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. str_booking_charges
--    Short-term rental booking records (nightly model).
--    No platform integrations — record-keeping only.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.str_booking_charges (
  id                uuid          primary key default gen_random_uuid(),
  account_id        uuid          not null references public.accounts(id) on delete cascade,
  property_id       uuid          references public.properties(id) on delete set null,

  market            text          not null default 'generic'
                                  check (market in ('uk', 'pl', 'generic')),
  currency          text          not null default 'GBP',

  -- Booking identity (no integration — record-only)
  booking_reference text,
  platform          text,                                 -- e.g. "airbnb", "booking.com", "direct"

  -- Period
  check_in_date     date          not null,
  check_out_date    date          not null,
  nights            smallint      not null check (nights > 0),

  -- Charges (all in plan currency; engine uses pence internally)
  nightly_rate      numeric(12,2) not null check (nightly_rate >= 0),
  cleaning_fee      numeric(12,2) not null default 0 check (cleaning_fee >= 0),
  platform_fee      numeric(12,2) not null default 0 check (platform_fee >= 0),
  service_fee       numeric(12,2) not null default 0 check (service_fee >= 0),
  discount_amount   numeric(12,2) not null default 0 check (discount_amount >= 0),
  tax_amount        numeric(12,2) not null default 0 check (tax_amount >= 0),
  total_amount      numeric(12,2) not null check (total_amount >= 0),

  status            text          not null default 'draft'
                                  check (status in ('draft', 'confirmed', 'cancelled', 'posted')),
  notes             text,
  metadata          jsonb         not null default '{}',
  created_by        uuid          references auth.users(id),
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),

  -- Check-out must be after check-in
  constraint str_checkout_after_checkin check (check_out_date > check_in_date)
);

alter table public.str_booking_charges enable row level security;
alter table public.str_booking_charges force row level security;

drop policy if exists "str_bookings_select_managers" on public.str_booking_charges;
drop policy if exists "str_bookings_insert_managers" on public.str_booking_charges;
drop policy if exists "str_bookings_update_managers" on public.str_booking_charges;

create policy "str_bookings_select_managers" on public.str_booking_charges
  for select to authenticated using (public.user_can_manage_account(account_id));
create policy "str_bookings_insert_managers" on public.str_booking_charges
  for insert to authenticated with check (public.user_can_manage_account(account_id));
create policy "str_bookings_update_managers" on public.str_booking_charges
  for update to authenticated
  using (public.user_can_manage_account(account_id))
  with check (public.user_can_manage_account(account_id));

create index if not exists str_bookings_account_property
  on public.str_booking_charges (account_id, property_id, status);
create index if not exists str_bookings_dates
  on public.str_booking_charges (account_id, check_in_date, check_out_date)
  where status not in ('cancelled');

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Extend rent_plans — rent increase workflow fields
--    These columns extend the existing rent_plans table safely.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.rent_plans
  add column if not exists change_reason      text,
  add column if not exists proposed_by        uuid references auth.users(id),
  add column if not exists approved_by        uuid references auth.users(id),
  add column if not exists notice_required    boolean not null default false,
  add column if not exists notice_served_at   timestamptz,
  add column if not exists notice_method      text
    check (notice_method in ('email', 'letter', 'in_person', 'other') or notice_method is null),
  add column if not exists effective_date     date;

-- Extend status to include proposed / notice_pending
-- (existing check constraint needs replacing — done safely via drop/add)
alter table public.rent_plans drop constraint if exists rent_plans_status_check;
alter table public.rent_plans
  add constraint rent_plans_status_check
  check (status in ('draft', 'proposed', 'notice_pending', 'approved', 'active', 'superseded', 'ended', 'cancelled'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Schema patches: data completeness fields
-- ─────────────────────────────────────────────────────────────────────────────

-- rent_adjustments: persist the before/after snapshot so reports can show change history
alter table public.rent_adjustments
  add column if not exists before_amount  numeric(12,2),  -- base charge amount before adjustment
  add column if not exists after_amount   numeric(12,2);  -- net charge amount after adjustment applied

-- rent_splits: joint liability description (e.g. AST joint tenancy wording)
alter table public.rent_splits
  add column if not exists joint_liability_note text;     -- joint liability arrangement description
