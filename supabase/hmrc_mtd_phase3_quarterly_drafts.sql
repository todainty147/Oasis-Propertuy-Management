-- HMRC MTD Phase 3: quarterly update draft builder.
-- This creates draft snapshots and review/export metadata only. It does not
-- enable sandbox or live HMRC submission endpoints.

create table if not exists public.mtd_quarterly_update_drafts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  tax_year text not null,
  period_label text,
  period_start date not null,
  period_end date not null,
  obligation_id text,
  property_business_id text,
  income_source_id text,
  hmrc_connection_id uuid,
  status text not null default 'draft',
  source_summary jsonb not null default '{}'::jsonb,
  category_totals jsonb not null default '{}'::jsonb,
  validation_summary jsonb not null default '{}'::jsonb,
  payload_preview jsonb not null default '{}'::jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  locked_at timestamptz,
  locked_by uuid,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mtd_quarterly_update_drafts_period_check check (period_start <= period_end),
  constraint mtd_quarterly_update_drafts_status_check check (
    status in ('draft', 'needs_review', 'ready_for_accountant', 'reviewed', 'locked', 'archived')
  )
);

create table if not exists public.mtd_quarterly_update_draft_lines (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  draft_id uuid not null references public.mtd_quarterly_update_drafts(id) on delete cascade,
  source_type text not null,
  source_table text,
  source_id uuid,
  property_id uuid references public.properties(id) on delete set null,
  transaction_date date not null,
  description text,
  amount numeric(12,2) not null,
  direction text not null,
  tenaqo_category text,
  mtd_category text,
  hmrc_category_key text,
  include_in_draft boolean not null default true,
  issue_status text not null default 'ok',
  issue_reason text,
  evidence_status text,
  created_at timestamptz not null default now(),
  constraint mtd_quarterly_update_draft_lines_direction_check check (
    direction in ('income', 'expense', 'adjustment', 'evidence')
  ),
  constraint mtd_quarterly_update_draft_lines_issue_check check (
    issue_status in ('ok', 'uncategorised', 'missing_evidence', 'needs_review', 'excluded', 'source_estimate_only', 'possible_duplicate')
  )
);

create table if not exists public.mtd_quarterly_update_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  draft_id uuid references public.mtd_quarterly_update_drafts(id) on delete cascade,
  user_id uuid,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_mtd_quarterly_drafts_account_year
  on public.mtd_quarterly_update_drafts(account_id, tax_year, period_start desc);
create index if not exists idx_mtd_quarterly_drafts_account_status
  on public.mtd_quarterly_update_drafts(account_id, status, updated_at desc);
create index if not exists idx_mtd_quarterly_draft_lines_draft
  on public.mtd_quarterly_update_draft_lines(account_id, draft_id);
create index if not exists idx_mtd_quarterly_audit_events_draft
  on public.mtd_quarterly_update_audit_events(account_id, draft_id, created_at desc);

drop trigger if exists trg_mtd_quarterly_update_drafts_updated_at on public.mtd_quarterly_update_drafts;
create trigger trg_mtd_quarterly_update_drafts_updated_at
  before update on public.mtd_quarterly_update_drafts
  for each row execute function public.hmrc_mtd_set_updated_at();

create or replace function public.enforce_mtd_quarterly_draft_line_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_draft_account_id uuid;
begin
  if tg_op = 'UPDATE' and old.draft_id is distinct from new.draft_id then
    raise exception 'MTD quarterly draft lines cannot be reassigned to a different draft';
  end if;

  select d.account_id into v_draft_account_id
  from public.mtd_quarterly_update_drafts d
  where d.id = new.draft_id;

  if v_draft_account_id is null or v_draft_account_id <> new.account_id then
    raise exception 'MTD quarterly draft line account mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_mtd_quarterly_draft_lines_account_match on public.mtd_quarterly_update_draft_lines;
create trigger trg_mtd_quarterly_draft_lines_account_match
  before insert or update on public.mtd_quarterly_update_draft_lines
  for each row execute function public.enforce_mtd_quarterly_draft_line_account();

alter table public.mtd_quarterly_update_drafts enable row level security;
alter table public.mtd_quarterly_update_draft_lines enable row level security;
alter table public.mtd_quarterly_update_audit_events enable row level security;

drop policy if exists "Managers can manage MTD quarterly drafts" on public.mtd_quarterly_update_drafts;
create policy "Managers can manage MTD quarterly drafts"
  on public.mtd_quarterly_update_drafts
  to authenticated
  using (public.user_can_manage_account(account_id) and public.account_has_feature(account_id, 'hmrc_mtd_quarterly_draft_builder'))
  with check (public.user_can_manage_account(account_id) and public.account_has_feature(account_id, 'hmrc_mtd_quarterly_draft_builder'));

drop policy if exists "Managers can manage MTD quarterly draft lines" on public.mtd_quarterly_update_draft_lines;
create policy "Managers can manage MTD quarterly draft lines"
  on public.mtd_quarterly_update_draft_lines
  to authenticated
  using (public.user_can_manage_account(account_id) and public.account_has_feature(account_id, 'hmrc_mtd_quarterly_draft_builder'))
  with check (public.user_can_manage_account(account_id) and public.account_has_feature(account_id, 'hmrc_mtd_quarterly_draft_builder'));

drop policy if exists "Managers can read MTD quarterly draft audit" on public.mtd_quarterly_update_audit_events;
create policy "Managers can read MTD quarterly draft audit"
  on public.mtd_quarterly_update_audit_events
  for select
  to authenticated
  using (public.user_can_manage_account(account_id) and public.account_has_feature(account_id, 'hmrc_mtd_quarterly_draft_builder'));

drop policy if exists "Managers can insert MTD quarterly draft audit" on public.mtd_quarterly_update_audit_events;
create policy "Managers can insert MTD quarterly draft audit"
  on public.mtd_quarterly_update_audit_events
  for insert
  to authenticated
  with check (public.user_can_manage_account(account_id) and public.account_has_feature(account_id, 'hmrc_mtd_quarterly_draft_builder'));

grant select, insert, update, delete on public.mtd_quarterly_update_drafts to authenticated;
grant select, insert, update, delete on public.mtd_quarterly_update_draft_lines to authenticated;
grant select, insert on public.mtd_quarterly_update_audit_events to authenticated;

create or replace function public.account_has_feature(
  p_account_id uuid,
  p_feature text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  with normalized as (
    select lower(trim(coalesce(p_feature, ''))) as feature_key
  )
  select case
    when (select feature_key from normalized) in (
      'hmrc_mtd_connection',
      'hmrc_mtd_sandbox',
      'hmrc_mtd_read_only',
      'hmrc_mtd_sandbox_test_data',
      'hmrc_mtd_quarterly_draft_builder',
      'hmrc_mtd_sandbox_submission',
      'hmrc_mtd_live_submission'
    ) then exists (
      select 1
      from public.account_feature_flags aff, normalized n
      where aff.account_id = p_account_id
        and aff.feature_key = n.feature_key
        and aff.enabled is true
    )
    else exists (
      select 1
      from public.account_feature_flags aff, normalized n
      where aff.account_id = p_account_id
        and aff.feature_key = n.feature_key
        and aff.enabled is true
    )
    or public.account_plan_rank(public.account_subscription_plan(p_account_id))
       >= public.account_plan_rank(public.account_feature_required_plan((select feature_key from normalized)))
  end;
$$;

comment on function public.account_has_feature(uuid, text) is
  'Returns whether the account has a plan entitlement or account-level feature flag. HMRC MTD flags are account-flag only and disabled by default.';

revoke all on function public.account_has_feature(uuid, text) from public;
grant execute on function public.account_has_feature(uuid, text) to authenticated;

insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
select a.id, flag.feature_key, false, null
from public.accounts a
cross join (values
  ('hmrc_mtd_quarterly_draft_builder'),
  ('hmrc_mtd_sandbox_submission'),
  ('hmrc_mtd_live_submission')
) as flag(feature_key)
on conflict (account_id, feature_key) do nothing;
