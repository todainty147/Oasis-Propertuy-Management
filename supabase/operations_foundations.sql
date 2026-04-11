begin;

create table if not exists public.property_financial_profiles (
  property_id uuid primary key references public.properties(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  estimated_market_value numeric(12, 2),
  target_cap_rate numeric(6, 3),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_financial_profiles_market_value_nonnegative
    check (estimated_market_value is null or estimated_market_value >= 0),
  constraint property_financial_profiles_cap_rate_nonnegative
    check (target_cap_rate is null or target_cap_rate >= 0)
);

create table if not exists public.property_operating_expenses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  category text not null,
  expense_date date not null,
  amount numeric(12, 2) not null,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_operating_expenses_amount_nonnegative check (amount >= 0),
  constraint property_operating_expenses_category_check check (
    lower(category) in ('mortgage', 'tax', 'insurance', 'utilities', 'vacancy_loss', 'other')
  )
);

create table if not exists public.compliance_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  title text not null,
  category text not null,
  due_date date not null,
  status text not null default 'active',
  reminder_window_days integer not null default 30,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compliance_items_status_check check (
    lower(status) in ('active', 'completed', 'paused', 'cancelled')
  ),
  constraint compliance_items_reminder_window_check check (
    reminder_window_days between 0 and 365
  )
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete set null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  event_type text not null,
  event_at timestamptz not null default now(),
  old_status text,
  new_status text,
  amount numeric(12, 2),
  actor_source text not null default 'db_trigger',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_execution_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  rule_id text not null,
  event_key text not null,
  execution_type text not null default 'signal',
  status text not null default 'recorded',
  entity_type text,
  entity_id text,
  title text,
  details jsonb not null default '{}'::jsonb,
  executed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint automation_execution_log_status_check check (
    lower(status) in ('recorded', 'skipped', 'failed')
  )
);

alter table public.work_orders
  add column if not exists assigned_at timestamptz,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledgement_due_at timestamptz,
  add column if not exists acknowledgement_status text;

update public.work_orders
set
  assigned_at = coalesce(assigned_at, updated_at, created_at),
  acknowledgement_due_at = coalesce(acknowledgement_due_at, coalesce(assigned_at, updated_at, created_at) + interval '48 hours'),
  acknowledgement_status = coalesce(nullif(acknowledgement_status, ''), 'pending')
where (contractor_user_id is not null or nullif(coalesce(contractor_name, ''), '') is not null)
  and assigned_at is null;

update public.work_orders
set acknowledgement_status = 'not_required'
where (contractor_user_id is null and nullif(coalesce(contractor_name, ''), '') is null)
  and coalesce(acknowledgement_status, '') = '';

create index if not exists property_operating_expenses_account_property_idx
  on public.property_operating_expenses(account_id, property_id, expense_date desc);
create index if not exists property_operating_expenses_category_idx
  on public.property_operating_expenses(account_id, category, expense_date desc);
create index if not exists compliance_items_account_due_idx
  on public.compliance_items(account_id, status, due_date);
create index if not exists compliance_items_property_idx
  on public.compliance_items(property_id, due_date);
create index if not exists payment_events_account_event_idx
  on public.payment_events(account_id, event_at desc);
create index if not exists payment_events_payment_idx
  on public.payment_events(payment_id, event_at desc);
create index if not exists automation_execution_log_account_rule_idx
  on public.automation_execution_log(account_id, rule_id, executed_at desc);
create index if not exists work_orders_ack_due_idx
  on public.work_orders(account_id, acknowledgement_due_at);

create or replace function public.tg_set_updated_at_operations_foundations()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_property_financial_profiles_updated_at on public.property_financial_profiles;
create trigger trg_property_financial_profiles_updated_at
before update on public.property_financial_profiles
for each row
execute function public.tg_set_updated_at_operations_foundations();

drop trigger if exists trg_property_operating_expenses_updated_at on public.property_operating_expenses;
create trigger trg_property_operating_expenses_updated_at
before update on public.property_operating_expenses
for each row
execute function public.tg_set_updated_at_operations_foundations();

drop trigger if exists trg_compliance_items_updated_at on public.compliance_items;
create trigger trg_compliance_items_updated_at
before update on public.compliance_items
for each row
execute function public.tg_set_updated_at_operations_foundations();

create or replace function public.tg_work_order_ack_defaults()
returns trigger
language plpgsql
as $$
declare
  has_contractor boolean;
  contractor_changed boolean;
begin
  has_contractor := new.contractor_user_id is not null or nullif(coalesce(new.contractor_name, ''), '') is not null;
  contractor_changed := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    contractor_changed := contractor_changed
      or old.contractor_user_id is distinct from new.contractor_user_id
      or coalesce(old.contractor_name, '') is distinct from coalesce(new.contractor_name, '');
  end if;

  if not has_contractor then
    new.assigned_at := null;
    new.acknowledged_at := null;
    new.acknowledgement_due_at := null;
    new.acknowledgement_status := 'not_required';
    return new;
  end if;

  if contractor_changed then
    new.assigned_at := coalesce(new.assigned_at, now());
    if tg_op = 'UPDATE' and old.acknowledged_at is distinct from new.acknowledged_at then
      null;
    elsif tg_op = 'UPDATE' and (
      old.contractor_user_id is distinct from new.contractor_user_id
      or coalesce(old.contractor_name, '') is distinct from coalesce(new.contractor_name, '')
    ) then
      new.acknowledged_at := null;
      new.acknowledgement_status := 'pending';
      new.acknowledgement_due_at := now() + interval '48 hours';
    end if;
  end if;

  new.assigned_at := coalesce(new.assigned_at, now());
  new.acknowledgement_due_at := coalesce(new.acknowledgement_due_at, new.assigned_at + interval '48 hours');

  if new.acknowledged_at is not null then
    new.acknowledgement_status := 'acknowledged';
  else
    new.acknowledgement_status := coalesce(nullif(new.acknowledgement_status, ''), 'pending');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_work_order_ack_defaults on public.work_orders;
create trigger trg_work_order_ack_defaults
before insert or update on public.work_orders
for each row
execute function public.tg_work_order_ack_defaults();

create or replace function public.tg_capture_payment_events()
returns trigger
language plpgsql
as $$
declare
  next_event_type text;
  next_old_status text;
  next_new_status text;
  next_payment_id uuid;
  next_account_id uuid;
  next_property_id uuid;
  next_tenant_id uuid;
  next_amount numeric(12, 2);
  next_event_at timestamptz;
  next_metadata jsonb;
begin
  if tg_op = 'DELETE' then
    next_event_type := 'payment_deleted';
    next_old_status := old.status;
    next_new_status := null;
    next_payment_id := null;
    next_account_id := old.account_id;
    next_property_id := old.property_id;
    next_tenant_id := old.tenant_id;
    next_amount := old.amount;
    next_event_at := now();
    next_metadata := jsonb_build_object(
      'payment_id', old.id,
      'due_date', old.due_date,
      'paid_at', old.paid_at
    );
  elsif tg_op = 'INSERT' then
    next_event_type := case
      when new.paid_at is not null or lower(coalesce(new.status, '')) = 'paid' then 'payment_paid'
      else 'payment_created'
    end;
    next_old_status := null;
    next_new_status := new.status;
    next_payment_id := new.id;
    next_account_id := new.account_id;
    next_property_id := new.property_id;
    next_tenant_id := new.tenant_id;
    next_amount := new.amount;
    next_event_at := coalesce(new.paid_at, new.created_at, now());
    next_metadata := jsonb_build_object(
      'due_date', new.due_date,
      'paid_at', new.paid_at
    );
  else
    next_event_type := case
      when old.paid_at is distinct from new.paid_at and new.paid_at is not null then 'payment_paid'
      when lower(coalesce(old.status, '')) is distinct from lower(coalesce(new.status, ''))
        and lower(coalesce(new.status, '')) in ('overdue', 'zaległe', 'zalegle') then 'payment_overdue'
      when lower(coalesce(old.status, '')) is distinct from lower(coalesce(new.status, ''))
        and lower(coalesce(old.status, '')) = 'paid'
        and coalesce(new.paid_at, null) is null then 'payment_reopened'
      when old.amount is distinct from new.amount or old.due_date is distinct from new.due_date then 'payment_updated'
      else 'payment_status_changed'
    end;
    next_old_status := old.status;
    next_new_status := new.status;
    next_payment_id := new.id;
    next_account_id := new.account_id;
    next_property_id := new.property_id;
    next_tenant_id := new.tenant_id;
    next_amount := new.amount;
    next_event_at := coalesce(new.paid_at, now());
    next_metadata := jsonb_build_object(
      'due_date', new.due_date,
      'paid_at', new.paid_at,
      'old_due_date', old.due_date,
      'old_paid_at', old.paid_at
    );
  end if;

  insert into public.payment_events (
    payment_id,
    account_id,
    property_id,
    tenant_id,
    event_type,
    event_at,
    old_status,
    new_status,
    amount,
    actor_source,
    metadata
  ) values (
    next_payment_id,
    next_account_id,
    next_property_id,
    next_tenant_id,
    next_event_type,
    coalesce(next_event_at, now()),
    next_old_status,
    next_new_status,
    next_amount,
    'db_trigger',
    coalesce(next_metadata, '{}'::jsonb)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_payment_events on public.payments;
create trigger trg_capture_payment_events
after insert or update or delete on public.payments
for each row
execute function public.tg_capture_payment_events();

alter table public.property_financial_profiles enable row level security;
alter table public.property_operating_expenses enable row level security;
alter table public.compliance_items enable row level security;
alter table public.payment_events enable row level security;
alter table public.automation_execution_log enable row level security;

drop policy if exists "property_financial_profiles_select_managers" on public.property_financial_profiles;
create policy "property_financial_profiles_select_managers"
on public.property_financial_profiles
for select
to authenticated
using (public.user_can_manage_account(property_financial_profiles.account_id));

drop policy if exists "property_financial_profiles_write_managers" on public.property_financial_profiles;
create policy "property_financial_profiles_write_managers"
on public.property_financial_profiles
for all
to authenticated
using (public.user_can_manage_account(property_financial_profiles.account_id))
with check (public.user_can_manage_account(property_financial_profiles.account_id));

drop policy if exists "property_operating_expenses_select_managers" on public.property_operating_expenses;
create policy "property_operating_expenses_select_managers"
on public.property_operating_expenses
for select
to authenticated
using (public.user_can_manage_account(property_operating_expenses.account_id));

drop policy if exists "property_operating_expenses_write_managers" on public.property_operating_expenses;
create policy "property_operating_expenses_write_managers"
on public.property_operating_expenses
for all
to authenticated
using (public.user_can_manage_account(property_operating_expenses.account_id))
with check (public.user_can_manage_account(property_operating_expenses.account_id));

drop policy if exists "compliance_items_select_managers" on public.compliance_items;
create policy "compliance_items_select_managers"
on public.compliance_items
for select
to authenticated
using (public.user_can_manage_account(compliance_items.account_id));

drop policy if exists "compliance_items_write_managers" on public.compliance_items;
create policy "compliance_items_write_managers"
on public.compliance_items
for all
to authenticated
using (public.user_can_manage_account(compliance_items.account_id))
with check (public.user_can_manage_account(compliance_items.account_id));

drop policy if exists "payment_events_select_managers" on public.payment_events;
create policy "payment_events_select_managers"
on public.payment_events
for select
to authenticated
using (public.user_can_manage_account(payment_events.account_id));

drop policy if exists "automation_execution_log_select_managers" on public.automation_execution_log;
create policy "automation_execution_log_select_managers"
on public.automation_execution_log
for select
to authenticated
using (public.user_can_manage_account(automation_execution_log.account_id));

drop policy if exists "automation_execution_log_write_managers" on public.automation_execution_log;
create policy "automation_execution_log_write_managers"
on public.automation_execution_log
for all
to authenticated
using (public.user_can_manage_account(automation_execution_log.account_id))
with check (public.user_can_manage_account(automation_execution_log.account_id));

commit;
