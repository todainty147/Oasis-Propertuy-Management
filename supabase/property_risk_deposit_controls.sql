-- Phase 4B: Property Risk & Deposit Financial Controls.
-- Additive overlay. No payment processing, money movement, or money-holding behavior.
-- Contractors only see linked work orders, not the whole eco plan or deposit settlement.

insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
select a.id, flag.feature_key, false, null
from public.accounts a
cross join (
  values
    ('deposit_deductions_log'),
    ('deposit_settlement_statement'),
    ('eco_upgrade_planner'),
    ('portfolio_health_eco_compliance')
) as flag(feature_key)
on conflict (account_id, feature_key) do nothing;

create table if not exists public.deposit_settlements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid null references public.tenants(id) on delete set null,
  tenancy_id uuid null,
  currency text not null default 'GBP',
  deposit_held_amount numeric(12,2) not null default 0,
  proposed_deductions_total numeric(12,2) not null default 0,
  proposed_return_amount numeric(12,2) not null default 0,
  jurisdiction text not null default 'UK',
  status text not null default 'draft',
  tenant_response_status text not null default 'not_shared',
  summary text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locked_at timestamptz null,
  archived_at timestamptz null,
  constraint deposit_settlements_status_check check (status in (
    'draft','ready_for_review','shared_with_tenant','tenant_accepted','tenant_disputed',
    'statement_generated','locked','archived'
  )),
  constraint deposit_settlements_tenant_response_check check (tenant_response_status in (
    'not_shared','pending','accepted','disputed','expired'
  ))
);

create table if not exists public.deposit_deductions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  settlement_id uuid not null references public.deposit_settlements(id) on delete cascade,
  deduction_type text not null,
  title text not null,
  description text null,
  amount numeric(12,2) not null default 0,
  evidence_status text not null default 'missing',
  linked_maintenance_request_id uuid null,
  linked_work_order_id uuid null,
  linked_inspection_report_id uuid null,
  linked_evidence_item_id uuid null,
  linked_document_id uuid null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deposit_deductions_type_check check (deduction_type in (
    'cleaning','damage','missing_keys','rent_arrears','gardening','rubbish_removal',
    'unpaid_bills','repair_invoice','replacement_item','other'
  )),
  constraint deposit_deductions_evidence_status_check check (evidence_status in (
    'missing','partial','attached','needs_review'
  ))
);

create table if not exists public.deposit_deduction_evidence_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  deduction_id uuid not null references public.deposit_deductions(id) on delete cascade,
  evidence_type text not null,
  evidence_id uuid null,
  evidence_label text null,
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint deposit_deduction_evidence_type_check check (evidence_type in (
    'evidence_vault_report','evidence_vault_item','inspection_photo','maintenance_request',
    'work_order','invoice_document','quote_document','receipt_document','tenancy_agreement',
    'communication','note','other'
  ))
);

create table if not exists public.deposit_settlement_exports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  settlement_id uuid not null references public.deposit_settlements(id) on delete cascade,
  export_type text not null default 'pdf',
  status text not null default 'generated',
  document_id uuid null,
  storage_path text null,
  generated_by uuid null,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.deposit_settlement_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  settlement_id uuid null references public.deposit_settlements(id) on delete cascade,
  deduction_id uuid null references public.deposit_deductions(id) on delete cascade,
  user_id uuid null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint deposit_settlement_audit_event_type_check check (event_type in (
    'settlement_created','deduction_added','deduction_updated','evidence_linked',
    'statement_generated','settlement_shared','tenant_accepted','tenant_disputed',
    'settlement_locked','settlement_archived'
  ))
);

create table if not exists public.property_epc_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  current_epc_band text null,
  current_epc_score integer null,
  target_epc_band text not null default 'C',
  target_epc_score integer null,
  property_type text null,
  heating_type text null,
  insulation_notes text null,
  last_epc_date date null,
  epc_certificate_document_id uuid null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, property_id),
  constraint property_epc_profiles_band_check check (coalesce(current_epc_band, 'unknown') in ('A','B','C','D','E','F','G','unknown')),
  constraint property_epc_profiles_target_band_check check (target_epc_band in ('A','B','C','D','E','F','G','unknown'))
);

create table if not exists public.eco_upgrade_options (
  id uuid primary key default gen_random_uuid(),
  upgrade_key text not null unique,
  label text not null,
  description text null,
  typical_cost_low numeric(12,2) null,
  typical_cost_high numeric(12,2) null,
  estimated_epc_points_low integer null,
  estimated_epc_points_high integer null,
  applicable_property_types text[] null,
  category text not null default 'fabric',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint eco_upgrade_options_category_check check (category in (
    'lighting','heating_controls','insulation','glazing','heating_system',
    'renewables','draught_proofing','other'
  ))
);

create table if not exists public.property_eco_upgrade_plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  epc_profile_id uuid null references public.property_epc_profiles(id) on delete set null,
  status text not null default 'draft',
  target_band text not null default 'C',
  estimated_total_cost numeric(12,2) not null default 0,
  estimated_epc_points_gain integer not null default 0,
  estimated_result_band text null,
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_eco_upgrade_plans_status_check check (status in ('draft','planned','in_progress','completed','archived'))
);

create table if not exists public.property_eco_upgrade_plan_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  plan_id uuid not null references public.property_eco_upgrade_plans(id) on delete cascade,
  upgrade_option_id uuid null references public.eco_upgrade_options(id) on delete set null,
  selected boolean not null default false,
  estimated_cost numeric(12,2) null,
  estimated_epc_points_gain integer null,
  priority text not null default 'medium',
  linked_work_order_id uuid null,
  linked_document_id uuid null,
  completed_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_eco_upgrade_plan_items_priority_check check (priority in ('low','medium','high'))
);

create table if not exists public.property_eco_upgrade_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid null references public.properties(id) on delete cascade,
  plan_id uuid null references public.property_eco_upgrade_plans(id) on delete cascade,
  user_id uuid null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'property_eco_upgrade_audit_event_type_check'
      and conrelid = 'public.property_eco_upgrade_audit_events'::regclass
  ) then
    alter table public.property_eco_upgrade_audit_events
      add constraint property_eco_upgrade_audit_event_type_check check (event_type in (
        'eco_plan_created','eco_plan_updated','eco_plan_recalculated',
        'eco_work_order_linked','eco_plan_item_completed','eco_plan_archived'
      ));
  end if;
end $$;

insert into public.eco_upgrade_options
  (upgrade_key, label, description, typical_cost_low, typical_cost_high, estimated_epc_points_low, estimated_epc_points_high, category)
values
  ('led_lighting', 'LED lighting', 'Replace remaining incandescent or halogen bulbs with LEDs.', 50, 250, 1, 3, 'lighting'),
  ('trv_valves', 'Install TRV valves', 'Add thermostatic radiator valves where suitable.', 250, 700, 2, 5, 'heating_controls'),
  ('loft_insulation_100mm', 'Loft insulation to 100mm', 'Top up missing loft insulation to a basic depth.', 350, 900, 4, 8, 'insulation'),
  ('loft_insulation_270mm', 'Loft insulation to 270mm', 'Review loft insulation against typical modern depth.', 600, 1400, 6, 12, 'insulation'),
  ('cavity_wall_insulation', 'Cavity wall insulation review', 'Assess whether cavity wall insulation is suitable.', 800, 2500, 5, 12, 'insulation'),
  ('draught_proofing', 'Draught proofing', 'Seal draughts around doors, windows and floor gaps.', 150, 600, 1, 4, 'draught_proofing'),
  ('hot_water_cylinder_insulation', 'Hot water cylinder insulation', 'Review hot water cylinder jacket and pipe insulation.', 50, 200, 1, 3, 'insulation'),
  ('smart_thermostat', 'Smart thermostat', 'Add programmable heating controls where suitable.', 150, 450, 1, 4, 'heating_controls'),
  ('double_glazing_review', 'Double glazing review', 'Assess glazing upgrade options with a qualified installer.', 2500, 9000, 3, 10, 'glazing'),
  ('boiler_upgrade_review', 'Boiler upgrade review', 'Review heating system efficiency with a qualified assessor.', 2500, 6000, 4, 12, 'heating_system'),
  ('solar_pv_review', 'Solar PV review', 'Assess solar PV suitability and landlord payback assumptions.', 4500, 9000, 4, 15, 'renewables')
on conflict (upgrade_key) do update set
  label = excluded.label,
  description = excluded.description,
  typical_cost_low = excluded.typical_cost_low,
  typical_cost_high = excluded.typical_cost_high,
  estimated_epc_points_low = excluded.estimated_epc_points_low,
  estimated_epc_points_high = excluded.estimated_epc_points_high,
  category = excluded.category,
  active = true;

create index if not exists idx_deposit_settlements_account_property on public.deposit_settlements(account_id, property_id, updated_at desc);
create index if not exists idx_deposit_deductions_settlement on public.deposit_deductions(account_id, settlement_id, sort_order);
create index if not exists idx_deposit_deduction_links_deduction on public.deposit_deduction_evidence_links(account_id, deduction_id);
create index if not exists idx_property_epc_profiles_account_property on public.property_epc_profiles(account_id, property_id);
create index if not exists idx_property_eco_upgrade_plans_account_property on public.property_eco_upgrade_plans(account_id, property_id, updated_at desc);
create index if not exists idx_property_eco_upgrade_plan_items_plan on public.property_eco_upgrade_plan_items(account_id, plan_id);

create or replace function public.set_phase4b_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.enforce_deposit_child_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  if tg_table_name = 'deposit_deductions' then
    select account_id into v_account_id from public.deposit_settlements where id = new.settlement_id;
  elsif tg_table_name = 'deposit_deduction_evidence_links' then
    select account_id into v_account_id from public.deposit_deductions where id = new.deduction_id;
  elsif tg_table_name = 'deposit_settlement_exports' then
    select account_id into v_account_id from public.deposit_settlements where id = new.settlement_id;
  end if;

  if v_account_id is null or v_account_id <> new.account_id then
    raise exception 'Deposit settlement account mismatch';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_eco_plan_child_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  select account_id into v_account_id from public.property_eco_upgrade_plans where id = new.plan_id;
  if v_account_id is null or v_account_id <> new.account_id then
    raise exception 'Eco-upgrade plan account mismatch';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_deposit_settlement_audit_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account_id uuid;
begin
  if new.settlement_id is not null then
    select account_id into v_account_id from public.deposit_settlements where id = new.settlement_id;
    if v_account_id is null or v_account_id <> new.account_id then
      raise exception 'Deposit settlement audit account mismatch';
    end if;
  end if;

  if new.deduction_id is not null then
    select account_id into v_account_id from public.deposit_deductions where id = new.deduction_id;
    if v_account_id is null or v_account_id <> new.account_id then
      raise exception 'Deposit settlement audit deduction account mismatch';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_eco_upgrade_audit_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account_id uuid;
  v_property_id uuid;
begin
  if new.plan_id is not null then
    select account_id, property_id into v_account_id, v_property_id
    from public.property_eco_upgrade_plans
    where id = new.plan_id;

    if v_account_id is null or v_account_id <> new.account_id then
      raise exception 'Eco-upgrade audit plan account mismatch';
    end if;

    if new.property_id is not null and v_property_id <> new.property_id then
      raise exception 'Eco-upgrade audit plan property mismatch';
    end if;
  end if;

  if new.property_id is not null then
    select account_id into v_account_id from public.properties where id = new.property_id;
    if v_account_id is null or v_account_id <> new.account_id then
      raise exception 'Eco-upgrade audit property account mismatch';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_phase4b_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Property risk audit events are immutable';
end;
$$;

drop trigger if exists trg_deposit_settlements_updated_at on public.deposit_settlements;
create trigger trg_deposit_settlements_updated_at before update on public.deposit_settlements
  for each row execute function public.set_phase4b_updated_at();
drop trigger if exists trg_deposit_deductions_updated_at on public.deposit_deductions;
create trigger trg_deposit_deductions_updated_at before update on public.deposit_deductions
  for each row execute function public.set_phase4b_updated_at();
drop trigger if exists trg_property_epc_profiles_updated_at on public.property_epc_profiles;
create trigger trg_property_epc_profiles_updated_at before update on public.property_epc_profiles
  for each row execute function public.set_phase4b_updated_at();
drop trigger if exists trg_property_eco_upgrade_plans_updated_at on public.property_eco_upgrade_plans;
create trigger trg_property_eco_upgrade_plans_updated_at before update on public.property_eco_upgrade_plans
  for each row execute function public.set_phase4b_updated_at();
drop trigger if exists trg_property_eco_upgrade_plan_items_updated_at on public.property_eco_upgrade_plan_items;
create trigger trg_property_eco_upgrade_plan_items_updated_at before update on public.property_eco_upgrade_plan_items
  for each row execute function public.set_phase4b_updated_at();

drop trigger if exists trg_deposit_deductions_account_match on public.deposit_deductions;
create trigger trg_deposit_deductions_account_match before insert or update on public.deposit_deductions
  for each row execute function public.enforce_deposit_child_account();
drop trigger if exists trg_deposit_deduction_links_account_match on public.deposit_deduction_evidence_links;
create trigger trg_deposit_deduction_links_account_match before insert or update on public.deposit_deduction_evidence_links
  for each row execute function public.enforce_deposit_child_account();
drop trigger if exists trg_deposit_settlement_exports_account_match on public.deposit_settlement_exports;
create trigger trg_deposit_settlement_exports_account_match before insert or update on public.deposit_settlement_exports
  for each row execute function public.enforce_deposit_child_account();
drop trigger if exists trg_property_eco_upgrade_plan_items_account_match on public.property_eco_upgrade_plan_items;
create trigger trg_property_eco_upgrade_plan_items_account_match before insert or update on public.property_eco_upgrade_plan_items
  for each row execute function public.enforce_eco_plan_child_account();
drop trigger if exists trg_deposit_settlement_audit_account_match on public.deposit_settlement_audit_events;
create trigger trg_deposit_settlement_audit_account_match before insert on public.deposit_settlement_audit_events
  for each row execute function public.enforce_deposit_settlement_audit_account();
drop trigger if exists trg_property_eco_upgrade_audit_account_match on public.property_eco_upgrade_audit_events;
create trigger trg_property_eco_upgrade_audit_account_match before insert on public.property_eco_upgrade_audit_events
  for each row execute function public.enforce_eco_upgrade_audit_account();
drop trigger if exists trg_deposit_settlement_audit_immutable on public.deposit_settlement_audit_events;
create trigger trg_deposit_settlement_audit_immutable before update or delete on public.deposit_settlement_audit_events
  for each row execute function public.prevent_phase4b_audit_mutation();
drop trigger if exists trg_property_eco_upgrade_audit_immutable on public.property_eco_upgrade_audit_events;
create trigger trg_property_eco_upgrade_audit_immutable before update or delete on public.property_eco_upgrade_audit_events
  for each row execute function public.prevent_phase4b_audit_mutation();

alter table public.deposit_settlements enable row level security;
alter table public.deposit_deductions enable row level security;
alter table public.deposit_deduction_evidence_links enable row level security;
alter table public.deposit_settlement_exports enable row level security;
alter table public.deposit_settlement_audit_events enable row level security;
alter table public.property_epc_profiles enable row level security;
alter table public.eco_upgrade_options enable row level security;
alter table public.property_eco_upgrade_plans enable row level security;
alter table public.property_eco_upgrade_plan_items enable row level security;
alter table public.property_eco_upgrade_audit_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'deposit_settlements','deposit_deductions','deposit_deduction_evidence_links',
    'deposit_settlement_exports','property_epc_profiles',
    'property_eco_upgrade_plans','property_eco_upgrade_plan_items'
  ] loop
    execute format('drop policy if exists "Managers manage %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Managers manage %s" on public.%I for all to authenticated using (public.user_can_manage_account(account_id)) with check (public.user_can_manage_account(account_id))',
      table_name,
      table_name
    );
  end loop;
end $$;

drop policy if exists "Managers manage deposit_settlement_audit_events" on public.deposit_settlement_audit_events;
drop policy if exists "Managers read deposit settlement audit events" on public.deposit_settlement_audit_events;
create policy "Managers read deposit settlement audit events" on public.deposit_settlement_audit_events
  for select to authenticated using (public.user_can_manage_account(account_id));
drop policy if exists "Managers insert deposit settlement audit events" on public.deposit_settlement_audit_events;
create policy "Managers insert deposit settlement audit events" on public.deposit_settlement_audit_events
  for insert to authenticated with check (public.user_can_manage_account(account_id));

drop policy if exists "Managers manage property_eco_upgrade_audit_events" on public.property_eco_upgrade_audit_events;
drop policy if exists "Managers read property eco upgrade audit events" on public.property_eco_upgrade_audit_events;
create policy "Managers read property eco upgrade audit events" on public.property_eco_upgrade_audit_events
  for select to authenticated using (public.user_can_manage_account(account_id));
drop policy if exists "Managers insert property eco upgrade audit events" on public.property_eco_upgrade_audit_events;
create policy "Managers insert property eco upgrade audit events" on public.property_eco_upgrade_audit_events
  for insert to authenticated with check (public.user_can_manage_account(account_id));

drop policy if exists "Managers read eco upgrade options" on public.eco_upgrade_options;
create policy "Managers read eco upgrade options" on public.eco_upgrade_options
  for select to authenticated using (true);

drop policy if exists "Tenants read shared deposit settlements" on public.deposit_settlements;
create policy "Tenants read shared deposit settlements" on public.deposit_settlements
  for select to authenticated using (
    status in ('shared_with_tenant','tenant_accepted','tenant_disputed','statement_generated','locked')
    and (tenant_response_status in ('pending','accepted','disputed','expired')
      or (status = 'locked' and tenant_response_status = 'not_shared'))
    and exists (
      select 1 from public.tenants t
      where t.id = deposit_settlements.tenant_id
        and t.account_id = deposit_settlements.account_id
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

drop policy if exists "Tenants read shared deposit deductions" on public.deposit_deductions;
create policy "Tenants read shared deposit deductions" on public.deposit_deductions
  for select to authenticated using (
    exists (
      select 1 from public.deposit_settlements s
      join public.tenants t on t.id = s.tenant_id and t.account_id = s.account_id
      where s.id = deposit_deductions.settlement_id
        and s.account_id = deposit_deductions.account_id
        and s.status in ('shared_with_tenant','tenant_accepted','tenant_disputed','statement_generated','locked')
        and t.user_id = auth.uid()
        and t.archived_at is null
    )
  );

revoke all on public.deposit_settlements, public.deposit_deductions, public.deposit_deduction_evidence_links,
  public.deposit_settlement_exports, public.deposit_settlement_audit_events,
  public.property_epc_profiles, public.property_eco_upgrade_plans,
  public.property_eco_upgrade_plan_items, public.property_eco_upgrade_audit_events
from anon, authenticated;
grant select, insert, update, delete on public.deposit_settlements, public.deposit_deductions, public.deposit_deduction_evidence_links,
  public.deposit_settlement_exports,
  public.property_epc_profiles, public.property_eco_upgrade_plans,
  public.property_eco_upgrade_plan_items
to authenticated;
grant select, insert on public.deposit_settlement_audit_events, public.property_eco_upgrade_audit_events to authenticated;
grant select on public.eco_upgrade_options to authenticated;
