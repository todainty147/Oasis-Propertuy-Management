-- =========================================================
-- AI attention insights foundation
-- Purpose: cached, auditable operator briefings for account-scoped AI insights.
-- This first slice supports read-only attention briefings on top of the
-- existing command center and attention center surfaces.
-- =========================================================

create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  insight_type text not null,
  entity_type text not null default 'account',
  entity_id uuid,
  scope_entity_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  status text not null default 'ready',
  payload_json jsonb not null default '{}'::jsonb,
  source_hash text,
  provider text,
  model text,
  generated_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint ai_insights_type_check
    check (insight_type in ('attention_briefing')),
  constraint ai_insights_entity_type_check
    check (entity_type in ('account', 'property', 'tenant', 'work_order', 'payment', 'portfolio')),
  constraint ai_insights_status_check
    check (status in ('ready', 'fallback', 'failed', 'expired'))
);

update public.ai_insights
set scope_entity_id = coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
where scope_entity_id is distinct from coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid);

drop index if exists public.ai_insights_scope_unique_idx;

create unique index if not exists ai_insights_scope_unique_idx
  on public.ai_insights (account_id, insight_type, entity_type, scope_entity_id);

create index if not exists ai_insights_account_generated_idx
  on public.ai_insights (account_id, insight_type, generated_at desc);

create table if not exists public.ai_prompt_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  insight_type text not null,
  entity_type text not null default 'account',
  entity_id uuid,
  provider text not null default 'openai',
  model text,
  prompt_version text not null default 'attention_briefing_v1',
  status text not null default 'completed',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  error_code text,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_prompt_runs_type_check
    check (insight_type in ('attention_briefing')),
  constraint ai_prompt_runs_entity_type_check
    check (entity_type in ('account', 'property', 'tenant', 'work_order', 'payment', 'portfolio')),
  constraint ai_prompt_runs_status_check
    check (status in ('completed', 'fallback', 'failed', 'skipped'))
);

create index if not exists ai_prompt_runs_account_created_idx
  on public.ai_prompt_runs (account_id, insight_type, created_at desc);

create table if not exists public.ai_usage_meter (
  account_id uuid not null references public.accounts(id) on delete cascade,
  period_key text not null,
  feature_key text not null,
  prompt_runs integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost numeric(12, 6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (account_id, period_key, feature_key)
);

create or replace function public.set_ai_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ai_insights_updated_at
on public.ai_insights;

create trigger trg_ai_insights_updated_at
before update on public.ai_insights
for each row execute function public.set_ai_updated_at();

drop trigger if exists trg_ai_usage_meter_updated_at
on public.ai_usage_meter;

create trigger trg_ai_usage_meter_updated_at
before update on public.ai_usage_meter
for each row execute function public.set_ai_updated_at();

alter table public.ai_insights enable row level security;
alter table public.ai_prompt_runs enable row level security;
alter table public.ai_usage_meter enable row level security;

drop policy if exists ai_insights_select_managers
on public.ai_insights;

create policy ai_insights_select_managers
on public.ai_insights
for select
to authenticated
using (
  entity_type = 'account'
  and (
    public.user_is_root_operator()
    or exists (
      select 1
      from public.account_members am
      where am.account_id = ai_insights.account_id
        and am.user_id = auth.uid()
        and am.role in ('owner', 'admin', 'staff')
    )
  )
);

drop policy if exists ai_prompt_runs_select_managers
on public.ai_prompt_runs;

create policy ai_prompt_runs_select_managers
on public.ai_prompt_runs
for select
to authenticated
using (
  entity_type = 'account'
  and (
    public.user_is_root_operator()
    or exists (
      select 1
      from public.account_members am
      where am.account_id = ai_prompt_runs.account_id
        and am.user_id = auth.uid()
        and am.role in ('owner', 'admin', 'staff')
    )
  )
);

drop policy if exists ai_usage_meter_select_managers
on public.ai_usage_meter;

create policy ai_usage_meter_select_managers
on public.ai_usage_meter
for select
to authenticated
using (
  public.user_is_root_operator()
  or exists (
    select 1
    from public.account_members am
    where am.account_id = ai_usage_meter.account_id
      and am.user_id = auth.uid()
      and am.role in ('owner', 'admin', 'staff')
  )
);

drop policy if exists ai_insights_no_direct_write
on public.ai_insights;

create policy ai_insights_no_direct_write
on public.ai_insights
for all
to authenticated
using (false)
with check (false);

drop policy if exists ai_prompt_runs_no_direct_write
on public.ai_prompt_runs;

create policy ai_prompt_runs_no_direct_write
on public.ai_prompt_runs
for all
to authenticated
using (false)
with check (false);

drop policy if exists ai_usage_meter_no_direct_write
on public.ai_usage_meter;

create policy ai_usage_meter_no_direct_write
on public.ai_usage_meter
for all
to authenticated
using (false)
with check (false);

create or replace function public.get_latest_ai_attention_briefing(
  p_account_id uuid
)
returns public.ai_insights
language sql
security definer
stable
set search_path = public
as $$
  select ai.*
  from public.ai_insights ai
  where ai.account_id = public.assert_manage_account_access(p_account_id)
    and ai.insight_type = 'attention_briefing'
    and ai.entity_type = 'account'
  order by ai.generated_at desc
  limit 1;
$$;

comment on function public.get_latest_ai_attention_briefing(uuid) is
  'Returns the latest cached AI attention briefing for the target account after manager/root access checks.';

revoke all on function public.get_latest_ai_attention_briefing(uuid) from public;
grant execute on function public.get_latest_ai_attention_briefing(uuid) to authenticated;
grant execute on function public.get_latest_ai_attention_briefing(uuid) to service_role;
