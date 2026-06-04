-- HMRC MTD Phase 5B: controlled live submission pilot design.
-- This migration adds pilot controls only. It does not create a live submission endpoint.

alter table public.hmrc_connections
  drop constraint if exists hmrc_connections_environment_check;

alter table public.hmrc_connections
  add constraint hmrc_connections_environment_check
  check (environment in ('sandbox', 'live'));

alter table public.hmrc_api_audit_log
  drop constraint if exists hmrc_api_audit_log_environment_check;

alter table public.hmrc_api_audit_log
  add constraint hmrc_api_audit_log_environment_check
  check (environment in ('sandbox', 'live'));

alter table public.mtd_quarterly_update_drafts
  add column if not exists live_submission_status text,
  add column if not exists live_submitted_at timestamptz,
  add column if not exists live_submission_id text,
  add column if not exists live_submission_attempt_id uuid;

create table if not exists public.hmrc_live_submission_pilot_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  enabled boolean not null default false,
  enabled_by uuid,
  enabled_at timestamptz,
  disabled_by uuid,
  disabled_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id)
);

create index if not exists idx_hmrc_live_submission_pilot_accounts_enabled
  on public.hmrc_live_submission_pilot_accounts(account_id)
  where enabled is true;

drop trigger if exists hmrc_live_submission_pilot_accounts_set_updated_at on public.hmrc_live_submission_pilot_accounts;
create trigger hmrc_live_submission_pilot_accounts_set_updated_at
  before update on public.hmrc_live_submission_pilot_accounts
  for each row execute function public.hmrc_mtd_set_updated_at();

insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
select a.id, flag.feature_key, false, null
from public.accounts a
cross join (values
  ('hmrc_mtd_live_submission_pilot'),
  ('hmrc_mtd_live_submission_allowlist'),
  ('hmrc_mtd_live_submission_operator_controls')
) as flag(feature_key)
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
  'Returns whether the account has a plan entitlement or account-level feature flag. HMRC MTD flags, including live pilot flags, are account-flag only and disabled by default.';

revoke all on function public.account_has_feature(uuid, text) from public;
grant execute on function public.account_has_feature(uuid, text) to authenticated;

create or replace function public.hmrc_live_submission_pilot_enabled(
  p_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  if auth.uid() is not null and not public.user_can_manage_account(p_account_id) then
    raise exception 'not_permitted';
  end if;

  select exists (
    select 1
    from public.hmrc_live_submission_pilot_accounts p
    where p.account_id = p_account_id
      and p.enabled is true
  ) into v_enabled;

  return coalesce(v_enabled, false);
end;
$$;

create or replace function public.set_hmrc_live_submission_pilot_account(
  p_account_id uuid,
  p_enabled boolean,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_action text;
begin
  if not public.user_is_root_operator() then
    raise exception 'not_permitted';
  end if;

  if p_account_id is null then
    raise exception 'missing_account_id';
  end if;

  if p_enabled is true then
    insert into public.hmrc_live_submission_pilot_accounts (
      account_id,
      enabled,
      enabled_by,
      enabled_at,
      disabled_by,
      disabled_at,
      reason
    ) values (
      p_account_id,
      true,
      auth.uid(),
      now(),
      null,
      null,
      nullif(trim(coalesce(p_reason, '')), '')
    )
    on conflict (account_id) do update
      set enabled = true,
          enabled_by = auth.uid(),
          enabled_at = now(),
          disabled_by = null,
          disabled_at = null,
          reason = nullif(trim(coalesce(p_reason, '')), '')
    returning id into v_id;

    v_action := 'live_pilot_enabled';
  else
    insert into public.hmrc_live_submission_pilot_accounts (
      account_id,
      enabled,
      disabled_by,
      disabled_at,
      reason
    ) values (
      p_account_id,
      false,
      auth.uid(),
      now(),
      nullif(trim(coalesce(p_reason, '')), '')
    )
    on conflict (account_id) do update
      set enabled = false,
          disabled_by = auth.uid(),
          disabled_at = now(),
          reason = nullif(trim(coalesce(p_reason, '')), '')
    returning id into v_id;

    v_action := 'live_pilot_disabled';
  end if;

  insert into public.hmrc_api_audit_log (
    account_id,
    user_id,
    environment,
    action,
    status,
    request_summary,
    response_summary
  ) values (
    p_account_id,
    auth.uid(),
    'live',
    v_action,
    'success',
    jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), '')),
    jsonb_build_object('enabled', p_enabled)
  );

  return v_id;
end;
$$;

alter table public.hmrc_live_submission_pilot_accounts enable row level security;

revoke all on public.hmrc_live_submission_pilot_accounts from anon, authenticated;

drop policy if exists "Managers can read their HMRC live pilot allowlist state" on public.hmrc_live_submission_pilot_accounts;
create policy "Managers can read their HMRC live pilot allowlist state"
  on public.hmrc_live_submission_pilot_accounts
  for select
  to authenticated
  using (public.user_can_manage_account(account_id));

grant select on public.hmrc_live_submission_pilot_accounts to authenticated;

revoke all on function public.hmrc_live_submission_pilot_enabled(uuid) from public;
grant execute on function public.hmrc_live_submission_pilot_enabled(uuid) to authenticated, service_role;

revoke all on function public.set_hmrc_live_submission_pilot_account(uuid, boolean, text) from public;
grant execute on function public.set_hmrc_live_submission_pilot_account(uuid, boolean, text) to authenticated;
