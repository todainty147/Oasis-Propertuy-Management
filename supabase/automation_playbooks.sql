begin;

create table if not exists public.automation_rule_settings (
  account_id uuid not null references public.accounts(id) on delete cascade,
  rule_id text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, rule_id)
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  rule_id text not null,
  source_key text not null,
  state text not null default 'open',
  severity text not null default 'action',
  title text not null,
  body text null,
  entity_type text null,
  entity_id text null,
  link_path text null,
  details jsonb not null default '{}'::jsonb,
  first_triggered_at timestamptz not null default now(),
  last_triggered_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_runs_state_check check (lower(state) in ('open', 'resolved')),
  constraint automation_runs_severity_check check (lower(severity) in ('info', 'action', 'urgent')),
  constraint automation_runs_source_unique unique (account_id, rule_id, source_key)
);

alter table public.automation_rule_settings
  add column if not exists account_id uuid references public.accounts(id) on delete cascade,
  add column if not exists rule_id text,
  add column if not exists enabled boolean default true,
  add column if not exists config jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.automation_runs
  add column if not exists account_id uuid references public.accounts(id) on delete cascade,
  add column if not exists rule_id text,
  add column if not exists source_key text,
  add column if not exists state text default 'open',
  add column if not exists severity text default 'action',
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists link_path text,
  add column if not exists details jsonb default '{}'::jsonb,
  add column if not exists first_triggered_at timestamptz default now(),
  add column if not exists last_triggered_at timestamptz default now(),
  add column if not exists resolved_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.automation_rule_settings
set
  enabled = coalesce(enabled, true),
  config = coalesce(config, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

update public.automation_runs
set
  state = coalesce(nullif(state, ''), 'open'),
  severity = coalesce(nullif(severity, ''), 'action'),
  title = coalesce(nullif(title, ''), 'Automation signal'),
  details = coalesce(details, '{}'::jsonb),
  first_triggered_at = coalesce(first_triggered_at, now()),
  last_triggered_at = coalesce(last_triggered_at, now()),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

create index if not exists automation_runs_account_state_idx
  on public.automation_runs(account_id, state, last_triggered_at desc);
create index if not exists automation_runs_rule_idx
  on public.automation_runs(account_id, rule_id, last_triggered_at desc);

create or replace function public.tg_set_updated_at_automation_tables()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_automation_rule_settings_updated_at on public.automation_rule_settings;
create trigger trg_automation_rule_settings_updated_at
before update on public.automation_rule_settings
for each row
execute function public.tg_set_updated_at_automation_tables();

drop trigger if exists trg_automation_runs_updated_at on public.automation_runs;
create trigger trg_automation_runs_updated_at
before update on public.automation_runs
for each row
execute function public.tg_set_updated_at_automation_tables();

alter table public.automation_rule_settings enable row level security;
alter table public.automation_runs enable row level security;

drop policy if exists "automation_rule_settings_select_managers" on public.automation_rule_settings;
create policy "automation_rule_settings_select_managers"
on public.automation_rule_settings
for select
to authenticated
using (
  public.user_can_manage_account(automation_rule_settings.account_id)
  and public.account_has_feature(automation_rule_settings.account_id, 'playbooks')
);

drop policy if exists "automation_rule_settings_insert_managers" on public.automation_rule_settings;
create policy "automation_rule_settings_insert_managers"
on public.automation_rule_settings
for insert
to authenticated
with check (
  public.user_can_manage_account(automation_rule_settings.account_id)
  and public.account_has_feature(automation_rule_settings.account_id, 'playbooks')
);

drop policy if exists "automation_rule_settings_update_managers" on public.automation_rule_settings;
create policy "automation_rule_settings_update_managers"
on public.automation_rule_settings
for update
to authenticated
using (
  public.user_can_manage_account(automation_rule_settings.account_id)
  and public.account_has_feature(automation_rule_settings.account_id, 'playbooks')
)
with check (
  public.user_can_manage_account(automation_rule_settings.account_id)
  and public.account_has_feature(automation_rule_settings.account_id, 'playbooks')
);

drop policy if exists "automation_rule_settings_delete_managers" on public.automation_rule_settings;
create policy "automation_rule_settings_delete_managers"
on public.automation_rule_settings
for delete
to authenticated
using (
  public.user_can_manage_account(automation_rule_settings.account_id)
  and public.account_has_feature(automation_rule_settings.account_id, 'playbooks')
);

drop policy if exists "automation_runs_select_managers" on public.automation_runs;
create policy "automation_runs_select_managers"
on public.automation_runs
for select
to authenticated
using (
  public.user_can_manage_account(automation_runs.account_id)
  and public.account_has_feature(automation_runs.account_id, 'playbooks')
);

drop policy if exists "automation_runs_insert_managers" on public.automation_runs;
create policy "automation_runs_insert_managers"
on public.automation_runs
for insert
to authenticated
with check (
  public.user_can_manage_account(automation_runs.account_id)
  and public.account_has_feature(automation_runs.account_id, 'playbooks')
);

drop policy if exists "automation_runs_update_managers" on public.automation_runs;
create policy "automation_runs_update_managers"
on public.automation_runs
for update
to authenticated
using (
  public.user_can_manage_account(automation_runs.account_id)
  and public.account_has_feature(automation_runs.account_id, 'playbooks')
)
with check (
  public.user_can_manage_account(automation_runs.account_id)
  and public.account_has_feature(automation_runs.account_id, 'playbooks')
);

commit;
