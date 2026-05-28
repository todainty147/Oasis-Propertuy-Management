-- HMRC MTD Phase 2: real read-only sandbox verification.
-- Additive only. No live submission or write endpoints are introduced.

create table if not exists public.hmrc_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  connection_id uuid references public.hmrc_connections(id) on delete set null,
  environment text not null default 'sandbox',
  check_type text not null,
  status text not null,
  hmrc_status_code integer,
  hmrc_code text,
  summary jsonb not null default '{}',
  checked_by uuid,
  checked_at timestamptz not null default now(),
  constraint hmrc_readiness_checks_environment_check check (environment in ('sandbox')),
  constraint hmrc_readiness_checks_type_check check (check_type in (
    'business_details',
    'obligations_income_and_expenditure',
    'property_business_read',
    'individual_details',
    'accounts_read'
  )),
  constraint hmrc_readiness_checks_status_check check (status in (
    'not_run',
    'success',
    'no_data',
    'failed',
    'blocked'
  ))
);

create index if not exists hmrc_readiness_checks_account_checked_idx
  on public.hmrc_readiness_checks (account_id, checked_at desc);

create index if not exists hmrc_readiness_checks_account_type_idx
  on public.hmrc_readiness_checks (account_id, check_type, checked_at desc);

alter table public.hmrc_readiness_checks enable row level security;

drop policy if exists hmrc_readiness_checks_select_managers on public.hmrc_readiness_checks;
create policy hmrc_readiness_checks_select_managers
  on public.hmrc_readiness_checks
  for select to authenticated
  using (public.user_can_manage_account(account_id));

revoke all on public.hmrc_readiness_checks from anon, authenticated;
grant select on public.hmrc_readiness_checks to authenticated;
