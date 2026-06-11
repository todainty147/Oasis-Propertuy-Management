-- HMRC MTD Phase 4: sandbox-only UK Property Income & Expenses period summary submission.
-- This stores safe sandbox submission receipts only. Live HMRC submission remains blocked.

alter table public.mtd_quarterly_update_drafts
  add column if not exists sandbox_submitted_at timestamptz,
  add column if not exists sandbox_submission_status text,
  add column if not exists sandbox_submission_attempt_id uuid,
  add column if not exists sandbox_submission_id text,
  add column if not exists sandbox_receipt_summary jsonb not null default '{}'::jsonb;

create table if not exists public.mtd_quarterly_submission_attempts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  draft_id uuid not null references public.mtd_quarterly_update_drafts(id) on delete cascade,
  hmrc_connection_id uuid,
  environment text not null default 'sandbox',
  submission_mode text not null default 'sandbox',
  submission_type text not null default 'uk_property_period_summary',
  status text not null default 'started',
  nino_masked text,
  business_id text,
  tax_year text,
  period_start date,
  period_end date,
  request_payload_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  hmrc_submission_id text,
  hmrc_correlation_id text,
  hmrc_http_status integer,
  hmrc_error_code text,
  hmrc_error_message text,
  submitted_by uuid,
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mtd_quarterly_submission_attempts_environment_check check (environment = 'sandbox'),
  constraint mtd_quarterly_submission_attempts_mode_check check (submission_mode = 'sandbox'),
  constraint mtd_quarterly_submission_attempts_type_check check (submission_type = 'uk_property_period_summary'),
  constraint mtd_quarterly_submission_attempts_status_check check (
    status in ('started', 'success', 'failed', 'blocked', 'validation_failed')
  )
);

create table if not exists public.mtd_quarterly_submission_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  draft_id uuid references public.mtd_quarterly_update_drafts(id) on delete cascade,
  submission_attempt_id uuid references public.mtd_quarterly_submission_attempts(id) on delete cascade,
  user_id uuid,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mtd_quarterly_drafts_sandbox_attempt_fkey'
      and conrelid = 'public.mtd_quarterly_update_drafts'::regclass
  ) then
    alter table public.mtd_quarterly_update_drafts
      add constraint mtd_quarterly_drafts_sandbox_attempt_fkey
      foreign key (sandbox_submission_attempt_id)
      references public.mtd_quarterly_submission_attempts(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'mtd_quarterly_submission_attempts_connection_fkey'
      and conrelid = 'public.mtd_quarterly_submission_attempts'::regclass
  ) then
    alter table public.mtd_quarterly_submission_attempts
      add constraint mtd_quarterly_submission_attempts_connection_fkey
      foreign key (hmrc_connection_id)
      references public.hmrc_connections(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'mtd_quarterly_submission_events_type_check'
      and conrelid = 'public.mtd_quarterly_submission_events'::regclass
  ) then
    alter table public.mtd_quarterly_submission_events
      add constraint mtd_quarterly_submission_events_type_check
      check (event_type in (
        'sandbox_submission_started',
        'sandbox_submission_blocked',
        'sandbox_submission_validation_failed',
        'sandbox_submission_success',
        'sandbox_submission_failed',
        'sandbox_submission_retrieved_after_submit'
      ));
  end if;
end $$;

create index if not exists idx_mtd_quarterly_submission_attempts_draft
  on public.mtd_quarterly_submission_attempts(account_id, draft_id, submitted_at desc);
create index if not exists idx_mtd_quarterly_submission_attempts_status
  on public.mtd_quarterly_submission_attempts(account_id, status, submitted_at desc);
create index if not exists idx_mtd_quarterly_submission_events_draft
  on public.mtd_quarterly_submission_events(account_id, draft_id, created_at desc);

create or replace function public.enforce_mtd_quarterly_submission_attempt_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_draft_account_id uuid;
begin
  if tg_op = 'UPDATE' and old.draft_id is distinct from new.draft_id then
    raise exception 'MTD quarterly submission attempts cannot be reassigned to a different draft';
  end if;

  select d.account_id into v_draft_account_id
  from public.mtd_quarterly_update_drafts d
  where d.id = new.draft_id;

  if v_draft_account_id is null or v_draft_account_id <> new.account_id then
    raise exception 'MTD quarterly submission attempt account mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_mtd_quarterly_submission_attempt_account_match on public.mtd_quarterly_submission_attempts;
create trigger trg_mtd_quarterly_submission_attempt_account_match
  before insert or update on public.mtd_quarterly_submission_attempts
  for each row execute function public.enforce_mtd_quarterly_submission_attempt_account();

create or replace function public.enforce_mtd_quarterly_submission_event_account()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_draft_account_id uuid;
  v_attempt_account_id uuid;
begin
  if new.draft_id is not null then
    select d.account_id into v_draft_account_id
    from public.mtd_quarterly_update_drafts d
    where d.id = new.draft_id;

    if v_draft_account_id is null or v_draft_account_id <> new.account_id then
      raise exception 'MTD quarterly submission event draft account mismatch';
    end if;
  end if;

  if new.submission_attempt_id is not null then
    select a.account_id into v_attempt_account_id
    from public.mtd_quarterly_submission_attempts a
    where a.id = new.submission_attempt_id;

    if v_attempt_account_id is null or v_attempt_account_id <> new.account_id then
      raise exception 'MTD quarterly submission event attempt account mismatch';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_mtd_quarterly_submission_event_account_match on public.mtd_quarterly_submission_events;
create trigger trg_mtd_quarterly_submission_event_account_match
  before insert on public.mtd_quarterly_submission_events
  for each row execute function public.enforce_mtd_quarterly_submission_event_account();

alter table public.mtd_quarterly_submission_attempts enable row level security;
alter table public.mtd_quarterly_submission_events enable row level security;

revoke all on public.mtd_quarterly_submission_attempts from anon, authenticated;
revoke all on public.mtd_quarterly_submission_events from anon, authenticated;

drop policy if exists "Managers can read MTD sandbox submission attempts" on public.mtd_quarterly_submission_attempts;
create policy "Managers can read MTD sandbox submission attempts"
  on public.mtd_quarterly_submission_attempts
  for select
  to authenticated
  using (
    public.user_can_manage_account(account_id)
  );

drop policy if exists "Managers can read MTD sandbox submission events" on public.mtd_quarterly_submission_events;
create policy "Managers can read MTD sandbox submission events"
  on public.mtd_quarterly_submission_events
  for select
  to authenticated
  using (
    public.user_can_manage_account(account_id)
  );

grant select on public.mtd_quarterly_submission_attempts to authenticated;
grant select on public.mtd_quarterly_submission_events to authenticated;

insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
select a.id, 'hmrc_mtd_sandbox_submission', false, null
from public.accounts a
on conflict (account_id, feature_key) do nothing;
