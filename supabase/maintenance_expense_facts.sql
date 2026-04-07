create table if not exists public.maintenance_expenses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid null references public.properties(id) on delete set null,
  work_order_id uuid null,
  maintenance_request_id uuid null,
  vendor_id uuid null references public.contractors(id) on delete set null,
  vendor_name text,
  category text not null default 'general_repair',
  approval_state text not null default 'draft',
  amount numeric not null default 0,
  currency text not null default 'GBP',
  expense_date date not null default current_date,
  posted_at timestamptz not null default now(),
  source text not null default 'work_order_invoice',
  source_key text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_expenses_amount_nonnegative check (amount >= 0),
  constraint maintenance_expenses_category_nonempty check (length(trim(category)) > 0),
  constraint maintenance_expenses_state check (approval_state in ('draft', 'submitted', 'approved', 'rejected', 'void'))
);

create unique index if not exists maintenance_expenses_source_idx
  on public.maintenance_expenses(source, source_key);
create index if not exists maintenance_expenses_account_idx
  on public.maintenance_expenses(account_id);
create index if not exists maintenance_expenses_property_idx
  on public.maintenance_expenses(property_id);
create index if not exists maintenance_expenses_vendor_idx
  on public.maintenance_expenses(vendor_id);
create index if not exists maintenance_expenses_expense_date_idx
  on public.maintenance_expenses(expense_date);
create index if not exists maintenance_expenses_category_idx
  on public.maintenance_expenses(category);

create table if not exists public.maintenance_budgets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid null references public.properties(id) on delete set null,
  category text null,
  period_month date not null,
  budget_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_budgets_amount_nonnegative check (budget_amount >= 0)
);

create index if not exists maintenance_budgets_account_idx
  on public.maintenance_budgets(account_id);
create index if not exists maintenance_budgets_period_idx
  on public.maintenance_budgets(period_month);
create index if not exists maintenance_budgets_property_idx
  on public.maintenance_budgets(property_id);

create or replace function public.tg_set_updated_at_maintenance_expenses()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_maintenance_expenses_updated_at on public.maintenance_expenses;
create trigger trg_maintenance_expenses_updated_at
before update on public.maintenance_expenses
for each row
execute function public.tg_set_updated_at_maintenance_expenses();

drop trigger if exists trg_maintenance_budgets_updated_at on public.maintenance_budgets;
create trigger trg_maintenance_budgets_updated_at
before update on public.maintenance_budgets
for each row
execute function public.tg_set_updated_at_maintenance_expenses();

alter table public.maintenance_expenses enable row level security;
alter table public.maintenance_budgets enable row level security;

drop policy if exists "maintenance_expenses_select_managers" on public.maintenance_expenses;
create policy "maintenance_expenses_select_managers"
on public.maintenance_expenses
for select
to authenticated
using (
  public.user_can_manage_account(maintenance_expenses.account_id)
);

drop policy if exists "maintenance_expenses_write_managers" on public.maintenance_expenses;
create policy "maintenance_expenses_write_managers"
on public.maintenance_expenses
for all
to authenticated
using (
  public.user_can_manage_account(maintenance_expenses.account_id)
)
with check (
  public.user_can_manage_account(maintenance_expenses.account_id)
);

drop policy if exists "maintenance_budgets_select_managers" on public.maintenance_budgets;
create policy "maintenance_budgets_select_managers"
on public.maintenance_budgets
for select
to authenticated
using (
  public.user_can_manage_account(maintenance_budgets.account_id)
);

drop policy if exists "maintenance_budgets_write_managers" on public.maintenance_budgets;
create policy "maintenance_budgets_write_managers"
on public.maintenance_budgets
for all
to authenticated
using (
  public.user_can_manage_account(maintenance_budgets.account_id)
)
with check (
  public.user_can_manage_account(maintenance_budgets.account_id)
);

create or replace function public.sync_work_order_expense_fact(p_work_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fin record;
  wo record;
  contractor_row record;
  next_state text;
begin
  if p_work_order_id is null then
    return;
  end if;

  select *
  into fin
  from public.work_order_financials
  where work_order_id = p_work_order_id
  limit 1;

  if not found then
    delete from public.maintenance_expenses
    where source = 'work_order_invoice'
      and source_key = p_work_order_id::text;
    return;
  end if;

  select *
  into wo
  from public.work_orders
  where id = p_work_order_id
  limit 1;

  if not found then
    return;
  end if;

  if coalesce(fin.rejected_at, null) is not null then
    next_state := 'rejected';
  elsif coalesce(fin.approved_at, null) is not null or lower(coalesce(fin.quote_status, '')) = 'approved' then
    next_state := 'approved';
  elsif lower(coalesce(fin.quote_status, '')) = 'submitted' then
    next_state := 'submitted';
  else
    next_state := 'draft';
  end if;

  if coalesce(fin.invoice_amount, 0) <= 0 then
    delete from public.maintenance_expenses
    where source = 'work_order_invoice'
      and source_key = p_work_order_id::text;
    return;
  end if;

  if wo.contractor_user_id is not null then
    select id, name
    into contractor_row
    from public.contractors c
    where c.account_id = wo.account_id
      and c.user_id = wo.contractor_user_id
    limit 1;
  end if;

  insert into public.maintenance_expenses (
    account_id,
    property_id,
    work_order_id,
    maintenance_request_id,
    vendor_id,
    vendor_name,
    category,
    approval_state,
    amount,
    currency,
    expense_date,
    posted_at,
    source,
    source_key,
    notes
  )
  values (
    wo.account_id,
    wo.property_id,
    wo.id,
    wo.maintenance_request_id,
    contractor_row.id,
    coalesce(wo.contractor_name, contractor_row.name),
    'general_repair',
    next_state,
    fin.invoice_amount,
    coalesce(fin.invoice_currency, 'GBP'),
    coalesce(fin.invoice_issued_at::date, fin.approved_at::date, current_date),
    coalesce(fin.invoice_issued_at, fin.approved_at, now()),
    'work_order_invoice',
    wo.id::text,
    fin.quote_notes
  )
  on conflict (source, source_key)
  do update set
    account_id = excluded.account_id,
    property_id = excluded.property_id,
    work_order_id = excluded.work_order_id,
    maintenance_request_id = excluded.maintenance_request_id,
    vendor_id = excluded.vendor_id,
    vendor_name = excluded.vendor_name,
    approval_state = excluded.approval_state,
    amount = excluded.amount,
    currency = excluded.currency,
    expense_date = excluded.expense_date,
    posted_at = excluded.posted_at,
    notes = excluded.notes,
    updated_at = now();
end;
$$;

create or replace function public.tg_sync_work_order_expense_fact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_work_order_expense_fact(coalesce(new.work_order_id, old.work_order_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_work_order_expense_fact on public.work_order_financials;
create trigger trg_sync_work_order_expense_fact
after insert or update on public.work_order_financials
for each row
execute function public.tg_sync_work_order_expense_fact();

insert into public.maintenance_expenses (
  account_id,
  property_id,
  work_order_id,
  maintenance_request_id,
  vendor_id,
  vendor_name,
  category,
  approval_state,
  amount,
  currency,
  expense_date,
  posted_at,
  source,
  source_key,
  notes
)
select
  wo.account_id,
  wo.property_id,
  wo.id,
  wo.maintenance_request_id,
  c.id,
  coalesce(wo.contractor_name, c.name),
  'general_repair' as category,
  case
    when fin.rejected_at is not null then 'rejected'
    when fin.approved_at is not null or lower(coalesce(fin.quote_status, '')) = 'approved' then 'approved'
    when lower(coalesce(fin.quote_status, '')) = 'submitted' then 'submitted'
    else 'draft'
  end as approval_state,
  fin.invoice_amount,
  coalesce(fin.invoice_currency, 'GBP'),
  coalesce(fin.invoice_issued_at::date, fin.approved_at::date, current_date),
  coalesce(fin.invoice_issued_at, fin.approved_at, now()),
  'work_order_invoice' as source,
  wo.id::text as source_key,
  fin.quote_notes
from public.work_order_financials fin
join public.work_orders wo on wo.id = fin.work_order_id
left join public.contractors c
  on c.account_id = wo.account_id
 and c.user_id = wo.contractor_user_id
where coalesce(fin.invoice_amount, 0) > 0
on conflict (source, source_key)
do update set
  account_id = excluded.account_id,
  property_id = excluded.property_id,
  work_order_id = excluded.work_order_id,
  maintenance_request_id = excluded.maintenance_request_id,
  vendor_id = excluded.vendor_id,
  vendor_name = excluded.vendor_name,
  approval_state = excluded.approval_state,
  amount = excluded.amount,
  currency = excluded.currency,
  expense_date = excluded.expense_date,
  posted_at = excluded.posted_at,
  notes = excluded.notes,
  updated_at = now();
