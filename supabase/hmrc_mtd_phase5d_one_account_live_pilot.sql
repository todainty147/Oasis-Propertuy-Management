-- HMRC MTD Phase 5D: one-account live network pilot controls.
-- This migration does not enable general live submission.

create table if not exists public.hmrc_live_pilot_evidence (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  draft_id uuid references public.mtd_quarterly_update_drafts(id) on delete set null,
  evidence_type text not null,
  evidence_status text not null default 'pending',
  evidence_summary jsonb not null default '{}'::jsonb,
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  constraint hmrc_live_pilot_evidence_type_check check (evidence_type in (
    'full_suite_passed',
    'focused_hmrc_tests_passed',
    'build_passed',
    'lint_passed',
    'support_runbook_reviewed',
    'consent_validated',
    'dry_run_passed',
    'operator_approval',
    'rollback_verified'
  )),
  constraint hmrc_live_pilot_evidence_status_check check (evidence_status in (
    'pending',
    'passed',
    'failed',
    'waived'
  ))
);

create index if not exists idx_hmrc_live_pilot_evidence_account_type
  on public.hmrc_live_pilot_evidence(account_id, draft_id, evidence_type, evidence_status);

create or replace function public.enforce_hmrc_live_pilot_evidence_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft_account_id uuid;
begin
  if new.draft_id is null then
    return new;
  end if;

  select d.account_id
  into v_draft_account_id
  from public.mtd_quarterly_update_drafts d
  where d.id = new.draft_id;

  if v_draft_account_id is null then
    raise exception 'quarterly_draft_not_found';
  end if;

  if v_draft_account_id is distinct from new.account_id then
    raise exception 'hmrc_live_pilot_evidence_account_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_hmrc_live_pilot_evidence_account on public.hmrc_live_pilot_evidence;
create trigger trg_hmrc_live_pilot_evidence_account
  before insert or update of account_id, draft_id on public.hmrc_live_pilot_evidence
  for each row execute function public.enforce_hmrc_live_pilot_evidence_account();

insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
select a.id, flag.feature_key, false, null
from public.accounts a
cross join (values
  ('hmrc_mtd_live_submission'),
  ('hmrc_mtd_live_submission_pilot'),
  ('hmrc_mtd_live_submission_allowlist'),
  ('hmrc_mtd_live_submission_operator_controls'),
  ('hmrc_mtd_live_submission_dry_run'),
  ('hmrc_mtd_live_submission_network_enabled')
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
  'Returns whether the account has a plan entitlement or account-level feature flag. HMRC MTD live pilot flags are account-flag only and disabled by default.';

alter table public.hmrc_live_pilot_evidence enable row level security;

revoke all on public.hmrc_live_pilot_evidence from anon, authenticated;

drop policy if exists "Root operators can manage HMRC live pilot evidence" on public.hmrc_live_pilot_evidence;
create policy "Root operators can manage HMRC live pilot evidence"
  on public.hmrc_live_pilot_evidence
  for all
  to authenticated
  using (public.user_is_root_operator())
  with check (public.user_is_root_operator());

drop policy if exists "Account managers can read HMRC live pilot evidence summaries" on public.hmrc_live_pilot_evidence;
create policy "Account managers can read HMRC live pilot evidence summaries"
  on public.hmrc_live_pilot_evidence
  for select
  to authenticated
  using (
    public.user_can_manage_account(account_id)
    and public.account_has_feature(account_id, 'hmrc_mtd_live_submission_pilot')
    and public.hmrc_live_submission_pilot_enabled(account_id)
  );

grant select, insert, update, delete on public.hmrc_live_pilot_evidence to authenticated;

revoke all on function public.enforce_hmrc_live_pilot_evidence_account() from public;

create or replace function public.hmrc_user_is_root_operator(
  p_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.account_members am
    join public.accounts a on a.id = am.account_id
    where am.user_id = p_user_id
      and coalesce(a.is_root, false) = true
      and lower(coalesce(am.role, '')) in ('owner', 'admin', 'staff', 'root')
  );
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

  if p_enabled is true and exists (
    select 1
    from public.hmrc_live_submission_pilot_accounts p
    where p.enabled is true
      and p.account_id <> p_account_id
  ) then
    raise exception 'one_live_pilot_account_already_enabled';
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

    insert into public.account_feature_flags (account_id, feature_key, enabled, created_by)
    select p_account_id, flag.feature_key, true, auth.uid()
    from (values
      ('hmrc_mtd_live_submission'),
      ('hmrc_mtd_live_submission_pilot'),
      ('hmrc_mtd_live_submission_allowlist'),
      ('hmrc_mtd_live_submission_operator_controls'),
      ('hmrc_mtd_live_submission_dry_run')
    ) as flag(feature_key)
    on conflict (account_id, feature_key) do update
      set enabled = true,
          created_by = coalesce(account_feature_flags.created_by, auth.uid());

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

    update public.account_feature_flags
    set enabled = false
    where account_id = p_account_id
      and feature_key in (
        'hmrc_mtd_live_submission',
        'hmrc_mtd_live_submission_pilot',
        'hmrc_mtd_live_submission_allowlist',
        'hmrc_mtd_live_submission_operator_controls',
        'hmrc_mtd_live_submission_dry_run',
        'hmrc_mtd_live_submission_network_enabled'
      );

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
    jsonb_build_object('enabled', p_enabled, 'oneAccountPilot', true)
  );

  return v_id;
end;
$$;

alter table public.hmrc_live_submission_events
  drop constraint if exists hmrc_live_submission_events_type_check;

alter table public.hmrc_live_submission_events
  add constraint hmrc_live_submission_events_type_check check (event_type in (
    'live_dry_run_started',
    'live_dry_run_passed',
    'live_submission_blocked',
    'live_network_submission_started',
    'live_network_submission_success',
    'live_network_submission_failed',
    'live_network_local_write_failed',
    'live_network_readback_failed',
    'live_duplicate_blocked',
    'live_operator_kill_switch_checked'
  ));

revoke all on function public.hmrc_user_is_root_operator(uuid) from public;
grant execute on function public.hmrc_user_is_root_operator(uuid) to service_role;

revoke all on function public.set_hmrc_live_submission_pilot_account(uuid, boolean, text) from public;
grant execute on function public.set_hmrc_live_submission_pilot_account(uuid, boolean, text) to authenticated;
