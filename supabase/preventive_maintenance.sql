create table if not exists public.preventive_maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  title text not null,
  category text not null default 'general_upkeep',
  frequency text not null default 'quarterly',
  frequency_interval_days integer null,
  next_due_date date not null,
  last_completed_at timestamptz null,
  assigned_to_contractor_id uuid null references public.contractors(id) on delete set null,
  notes text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint preventive_maintenance_tasks_frequency_check check (
    lower(frequency) in ('monthly', 'quarterly', 'yearly', 'custom')
  ),
  constraint preventive_maintenance_tasks_status_check check (
    lower(status) in ('active', 'paused', 'completed')
  ),
  constraint preventive_maintenance_tasks_custom_interval_check check (
    (
      lower(frequency) <> 'custom'
      and frequency_interval_days is null
    ) or (
      lower(frequency) = 'custom'
      and frequency_interval_days is not null
      and frequency_interval_days > 0
    )
  )
);

alter table public.preventive_maintenance_tasks
  add column if not exists account_id uuid references public.accounts(id) on delete cascade,
  add column if not exists property_id uuid references public.properties(id) on delete cascade,
  add column if not exists title text,
  add column if not exists category text default 'general_upkeep',
  add column if not exists frequency text default 'quarterly',
  add column if not exists frequency_interval_days integer,
  add column if not exists next_due_date date,
  add column if not exists last_completed_at timestamptz,
  add column if not exists assigned_to_contractor_id uuid references public.contractors(id) on delete set null,
  add column if not exists notes text,
  add column if not exists status text default 'active',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.preventive_maintenance_tasks
set
  category = coalesce(nullif(category, ''), 'general_upkeep'),
  frequency = coalesce(nullif(frequency, ''), 'quarterly'),
  status = coalesce(nullif(status, ''), 'active'),
  title = coalesce(nullif(title, ''), 'Preventive maintenance task'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

create index if not exists preventive_maintenance_tasks_account_idx
  on public.preventive_maintenance_tasks(account_id);
create index if not exists preventive_maintenance_tasks_property_idx
  on public.preventive_maintenance_tasks(property_id);
create index if not exists preventive_maintenance_tasks_due_idx
  on public.preventive_maintenance_tasks(next_due_date);
create index if not exists preventive_maintenance_tasks_status_idx
  on public.preventive_maintenance_tasks(status);

create or replace function public.tg_set_updated_at_preventive_maintenance_tasks()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_preventive_maintenance_tasks_updated_at
on public.preventive_maintenance_tasks;
create trigger trg_preventive_maintenance_tasks_updated_at
before update on public.preventive_maintenance_tasks
for each row
execute function public.tg_set_updated_at_preventive_maintenance_tasks();

alter table public.preventive_maintenance_tasks enable row level security;

drop policy if exists "preventive_maintenance_tasks_select_members" on public.preventive_maintenance_tasks;
create policy "preventive_maintenance_tasks_select_members"
on public.preventive_maintenance_tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.account_members am
    where am.account_id = preventive_maintenance_tasks.account_id
      and am.user_id = auth.uid()
  )
);

drop policy if exists "preventive_maintenance_tasks_insert_managers" on public.preventive_maintenance_tasks;
create policy "preventive_maintenance_tasks_insert_managers"
on public.preventive_maintenance_tasks
for insert
to authenticated
with check (
  public.user_can_manage_account(preventive_maintenance_tasks.account_id)
);

drop policy if exists "preventive_maintenance_tasks_update_managers" on public.preventive_maintenance_tasks;
create policy "preventive_maintenance_tasks_update_managers"
on public.preventive_maintenance_tasks
for update
to authenticated
using (
  public.user_can_manage_account(preventive_maintenance_tasks.account_id)
)
with check (
  public.user_can_manage_account(preventive_maintenance_tasks.account_id)
);

drop policy if exists "preventive_maintenance_tasks_delete_managers" on public.preventive_maintenance_tasks;
create policy "preventive_maintenance_tasks_delete_managers"
on public.preventive_maintenance_tasks
for delete
to authenticated
using (
  public.user_can_manage_account(preventive_maintenance_tasks.account_id)
);

create or replace function public.preventive_maintenance_next_due_date(
  p_frequency text,
  p_frequency_interval_days integer,
  p_completed_at date
)
returns date
language sql
immutable
as $$
  select
    case lower(coalesce(p_frequency, 'quarterly'))
      when 'monthly' then (p_completed_at + interval '1 month')::date
      when 'quarterly' then (p_completed_at + interval '3 months')::date
      when 'yearly' then (p_completed_at + interval '1 year')::date
      when 'custom' then (p_completed_at + (greatest(coalesce(p_frequency_interval_days, 1), 1) || ' days')::interval)::date
      else (p_completed_at + interval '3 months')::date
    end
$$;

create or replace function public.complete_preventive_maintenance_task(
  p_task_id uuid,
  p_completed_at timestamptz default now()
)
returns public.preventive_maintenance_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.preventive_maintenance_tasks;
  effective_completed_at timestamptz := coalesce(p_completed_at, now());
begin
  update public.preventive_maintenance_tasks
  set
    last_completed_at = effective_completed_at,
    next_due_date = public.preventive_maintenance_next_due_date(
      frequency,
      frequency_interval_days,
      effective_completed_at::date
    ),
    status = case when lower(status) = 'paused' then status else 'active' end,
    updated_at = now()
  where id = p_task_id
  returning * into task_row;

  return task_row;
end;
$$;

grant execute on function public.complete_preventive_maintenance_task(uuid, timestamptz) to authenticated;

create or replace function public.preventive_maintenance_attention(
  p_account_id uuid,
  p_due_soon_days integer default 14,
  p_limit integer default 25
)
returns table (
  item_key text,
  item_type text,
  property_id uuid,
  property_label text,
  title text,
  category text,
  next_due_date date,
  days_until_due integer,
  assigned_to_label text,
  link_path text,
  sort_order integer
)
language sql
security definer
set search_path = public
as $$
  with cfg as (
    select
      greatest(1, least(coalesce(p_due_soon_days, 14), 90)) as due_soon_days,
      greatest(1, least(coalesce(p_limit, 25), 200)) as max_items
  ),
  authz as (
    select public.assert_manage_account_access(p_account_id) as account_id
  ),
  scoped_tasks as (
    select
      t.id,
      t.property_id,
      coalesce(p.address, '—') as property_label,
      t.title,
      t.category,
      t.next_due_date,
      (t.next_due_date - current_date)::int as days_until_due,
      coalesce(c.name, '') as assigned_to_label
    from public.preventive_maintenance_tasks t
    cross join authz a
    left join public.properties p on p.id = t.property_id
    left join public.contractors c on c.id = t.assigned_to_contractor_id
    where t.account_id = a.account_id
      and lower(coalesce(t.status, 'active')) = 'active'
  ),
  items as (
    select
      'preventive-overdue-' || st.id::text as item_key,
      'preventive_task_overdue'::text as item_type,
      st.property_id,
      st.property_label,
      st.title,
      st.category,
      st.next_due_date,
      st.days_until_due,
      st.assigned_to_label,
      ('/properties/' || st.property_id::text)::text as link_path,
      20 as sort_order
    from scoped_tasks st
    where st.next_due_date < current_date

    union all

    select
      'preventive-due-soon-' || st.id::text,
      'preventive_task_due_soon'::text,
      st.property_id,
      st.property_label,
      st.title,
      st.category,
      st.next_due_date,
      st.days_until_due,
      st.assigned_to_label,
      ('/properties/' || st.property_id::text)::text,
      40 as sort_order
    from scoped_tasks st, cfg
    where st.next_due_date >= current_date
      and st.next_due_date <= current_date + (cfg.due_soon_days || ' days')::interval
  )
  select
    i.item_key,
    i.item_type,
    i.property_id,
    i.property_label,
    i.title,
    i.category,
    i.next_due_date,
    i.days_until_due,
    i.assigned_to_label,
    i.link_path,
    i.sort_order
  from items i
  order by i.sort_order, i.next_due_date asc nulls last, i.title, i.item_key
  limit (select max_items from cfg);
$$;

grant execute on function public.preventive_maintenance_attention(uuid, integer, integer) to authenticated;
