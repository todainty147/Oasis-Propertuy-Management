-- HMRC MTD Phase 5C: controlled live endpoint skeleton and operator dry run.
-- This migration is additive. It does not enable public live HMRC submission.

alter table public.mtd_quarterly_update_drafts
  add column if not exists live_submission_status text,
  add column if not exists live_submitted_at timestamptz,
  add column if not exists live_submission_id text,
  add column if not exists live_submission_attempt_id uuid;

create table if not exists public.hmrc_live_submission_attempts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  draft_id uuid not null references public.mtd_quarterly_update_drafts(id) on delete cascade,
  consent_id uuid not null references public.hmrc_live_submission_consents(id) on delete restrict,
  hmrc_connection_id uuid,
  environment text not null default 'live',
  mode text not null default 'dry_run',
  submission_type text not null default 'uk_property_period_summary',
  status text not null default 'started',
  nino_masked text,
  business_id text,
  tax_year text,
  period_start date,
  period_end date,
  request_payload_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  hmrc_correlation_id text,
  hmrc_http_status integer,
  hmrc_error_code text,
  hmrc_error_message text,
  submitted_by uuid,
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hmrc_live_submission_attempts_environment_check check (environment = 'live'),
  constraint hmrc_live_submission_attempts_mode_check check (mode in ('dry_run', 'live_network')),
  constraint hmrc_live_submission_attempts_status_check check (status in ('started', 'dry_run_passed', 'blocked', 'validation_failed', 'success', 'failed')),
  constraint hmrc_live_submission_attempts_type_check check (submission_type = 'uk_property_period_summary')
);

create index if not exists idx_hmrc_live_submission_attempts_account_draft
  on public.hmrc_live_submission_attempts(account_id, draft_id, mode, status);

create unique index if not exists idx_hmrc_live_submission_attempts_one_success
  on public.hmrc_live_submission_attempts(account_id, draft_id)
  where mode = 'live_network' and status = 'success';

create table if not exists public.hmrc_live_submission_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  draft_id uuid references public.mtd_quarterly_update_drafts(id) on delete cascade,
  live_attempt_id uuid references public.hmrc_live_submission_attempts(id) on delete cascade,
  consent_id uuid references public.hmrc_live_submission_consents(id) on delete restrict,
  user_id uuid,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint hmrc_live_submission_events_type_check check (event_type in (
    'live_dry_run_started',
    'live_dry_run_passed',
    'live_submission_blocked',
    'live_network_submission_started',
    'live_network_submission_success',
    'live_network_submission_failed',
    'live_duplicate_blocked',
    'live_operator_kill_switch_checked'
  ))
);

create index if not exists idx_hmrc_live_submission_events_account_draft
  on public.hmrc_live_submission_events(account_id, draft_id, created_at desc);

insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
select a.id, flag.feature_key, flag.enabled, null
from public.accounts a
cross join (values
  ('hmrc_mtd_live_submission_dry_run', false),
  ('hmrc_mtd_live_submission_network_enabled', false)
) as flag(feature_key, enabled)
on conflict (account_id, feature_key) do nothing;

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
      'hmrc_mtd_live_submission',
      'hmrc_mtd_live_submission_pilot',
      'hmrc_mtd_live_submission_dry_run',
      'hmrc_mtd_live_submission_network_enabled',
      'hmrc_mtd_live_submission_allowlist',
      'hmrc_mtd_live_submission_operator_controls'
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
  'Returns whether the account has a plan entitlement or account-level feature flag. HMRC MTD flags, including live dry-run and live network flags, are account-flag only.';

alter table public.hmrc_live_submission_attempts enable row level security;
alter table public.hmrc_live_submission_events enable row level security;

revoke all on public.hmrc_live_submission_attempts from anon, authenticated;
revoke all on public.hmrc_live_submission_events from anon, authenticated;

drop policy if exists "Managers can read live HMRC attempt summaries" on public.hmrc_live_submission_attempts;
create policy "Managers can read live HMRC attempt summaries"
  on public.hmrc_live_submission_attempts
  for select
  to authenticated
  using (
    public.user_can_manage_account(account_id)
    and public.account_has_feature(account_id, 'hmrc_mtd_live_submission_pilot')
    and public.hmrc_live_submission_pilot_enabled(account_id)
  );

drop policy if exists "Managers can read live HMRC event summaries" on public.hmrc_live_submission_events;
create policy "Managers can read live HMRC event summaries"
  on public.hmrc_live_submission_events
  for select
  to authenticated
  using (
    public.user_can_manage_account(account_id)
    and public.account_has_feature(account_id, 'hmrc_mtd_live_submission_pilot')
    and public.hmrc_live_submission_pilot_enabled(account_id)
  );

grant select on public.hmrc_live_submission_attempts to authenticated;
grant select on public.hmrc_live_submission_events to authenticated;
