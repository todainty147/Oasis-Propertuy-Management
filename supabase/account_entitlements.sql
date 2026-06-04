create or replace function public.account_plan_rank(
  p_plan text
)
returns integer
language sql
stable
set search_path = public
as $$
  select case lower(trim(coalesce(p_plan, 'starter')))
    when 'operator_agency' then 4
    when 'pro'             then 3
    when 'growth'          then 2
    else 1  -- starter
  end;
$$;

comment on function public.account_plan_rank(text) is
  'Maps canonical billing plan keys to a comparable numeric rank.';

revoke all on function public.account_plan_rank(text) from public;
grant execute on function public.account_plan_rank(text) to authenticated;

create or replace function public.account_subscription_plan(
  p_account_id uuid
)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when a.is_root then 'operator_agency'
    else lower(trim(coalesce(a.subscription_plan, 'starter')))
  end
  from public.accounts a
  where a.id = p_account_id;
$$;

comment on function public.account_subscription_plan(uuid) is
  'Returns the normalized subscription plan key for the target account.';

revoke all on function public.account_subscription_plan(uuid) from public;
grant execute on function public.account_subscription_plan(uuid) to authenticated;

create or replace function public.account_feature_required_plan(
  p_feature text
)
returns text
language sql
stable
set search_path = public
as $$
  select case lower(trim(coalesce(p_feature, '')))
    -- ── Core features ────────────────────────────────────────────────────
    when 'command_center'          then 'growth'
    when 'portfolio_health'        then 'growth'
    when 'maintenance_kpi'         then 'growth'
    when 'playbooks'               then 'pro'
    when 'advanced_automation'     then 'pro'
    when 'security_audit'          then 'pro'
    when 'root_telemetry'          then 'pro'
    when 'support_tooling'         then 'pro'

    -- ── AI features: Growth tier ─────────────────────────────────────────
    when 'ai_maintenance_triage'        then 'growth'
    when 'ai_attention_insight'         then 'growth'
    when 'ai_property_health'           then 'growth'

    -- ── AI features: Pro tier ────────────────────────────────────────────
    when 'ai_contractor_recommendation' then 'pro'
    when 'ai_weekly_portfolio_summary'  then 'pro'
    when 'ai_message_drafts'            then 'pro'
    when 'ai_document_summaries'        then 'pro'

    -- ── AI features: Operator/Agency tier ────────────────────────────────
    when 'ai_security_copilot'          then 'operator_agency'
    when 'ai_natural_language_query'    then 'operator_agency'
    when 'ai_advanced_audit_summaries'  then 'operator_agency'

    -- ── Compliance & Risk Suite: Growth tier ─────────────────────────────
    when 'tax_readiness_dashboard'      then 'growth'
    when 'rent_shield'                  then 'growth'
    when 'ai_rent_shield_explainer'     then 'growth'
    when 'deposit_deductions_log'       then 'growth'
    when 'deposit_settlement_statement' then 'growth'
    when 'eco_upgrade_planner'          then 'growth'
    when 'portfolio_health_eco_compliance' then 'growth'

    -- ── Compliance & Risk Suite: Pro tier ────────────────────────────────
    when 'ai_lease_auditor'             then 'pro'

    -- ── Document Intelligence: Growth tier ───────────────────────────────
    -- Foundation for AI Lease Auditor, document summaries, compliance checks.
    -- Extraction text never exposed to tenants/contractors (enforced by RLS).
    when 'document_extraction'          then 'growth'

    else 'starter'
  end;
$$;

comment on function public.account_feature_required_plan(text) is
  'Canonical definition — single source of truth for all feature plan requirements. '
  'Duplicate definitions in ai_cost_controls.sql and compliance_suite_phase0.sql are '
  'no-ops; this file must be applied last. (L-001 resolved)';

revoke all on function public.account_feature_required_plan(text) from public;
grant execute on function public.account_feature_required_plan(text) to authenticated;

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
  'Returns whether the account has a plan entitlement or account-level feature flag. HMRC MTD flags are account-flag only and disabled by default.';

revoke all on function public.account_has_feature(uuid, text) from public;
grant execute on function public.account_has_feature(uuid, text) to authenticated;

create or replace function public.assert_account_feature_access(
  p_account_id uuid,
  p_feature text
)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_feature text := lower(trim(coalesce(p_feature, '')));
  v_required_plan text;
begin
  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  if nullif(v_feature, '') is null then
    raise exception 'Missing feature key';
  end if;

  if public.user_is_root_operator() then
    return p_account_id;
  end if;

  if public.account_has_feature(p_account_id, v_feature) then
    return p_account_id;
  end if;

  v_required_plan := public.account_feature_required_plan(v_feature);
  raise exception 'Feature % requires % plan or higher for this account', v_feature, v_required_plan;
end;
$$;

comment on function public.assert_account_feature_access(uuid, text) is
  'Raises when the target account plan does not include the requested feature.';

revoke all on function public.assert_account_feature_access(uuid, text) from public;
grant execute on function public.assert_account_feature_access(uuid, text) to authenticated;

create or replace function public.account_usage_limit(
  p_account_id uuid,
  p_resource text
)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select case lower(trim(coalesce(p_resource, '')))
    when 'properties' then
      case public.account_subscription_plan(p_account_id)
        when 'pro' then null
        when 'growth' then 50
        else 10
      end
    else null
  end;
$$;

comment on function public.account_usage_limit(uuid, text) is
  'Returns the current billing-plan usage limit for the requested resource, or null for unlimited.';

revoke all on function public.account_usage_limit(uuid, text) from public;
grant execute on function public.account_usage_limit(uuid, text) to authenticated;

create or replace function public.assert_account_property_capacity(
  p_account_id uuid,
  p_exclude_property_id uuid default null
)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if p_account_id is null then
    raise exception 'Missing account id';
  end if;

  v_limit := public.account_usage_limit(p_account_id, 'properties');
  if v_limit is null then
    return p_account_id;
  end if;

  select count(*)
  into v_count
  from public.properties p
  where p.account_id = p_account_id
    and (p_exclude_property_id is null or p.id <> p_exclude_property_id);

  if coalesce(v_count, 0) >= v_limit then
    raise exception 'Plan limit reached: this account allows up to % properties', v_limit;
  end if;

  return p_account_id;
end;
$$;

comment on function public.assert_account_property_capacity(uuid, uuid) is
  'Raises when a property create/move would exceed the current billing-plan property cap.';

revoke all on function public.assert_account_property_capacity(uuid, uuid) from public;
grant execute on function public.assert_account_property_capacity(uuid, uuid) to authenticated;

create or replace function public.tg_enforce_property_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_id is null then
    raise exception 'Missing account id';
  end if;

  if tg_op = 'INSERT' then
    perform public.assert_account_property_capacity(new.account_id, null);
  elsif tg_op = 'UPDATE' and new.account_id is distinct from old.account_id then
    perform public.assert_account_property_capacity(new.account_id, old.id);
  end if;

  return new;
end;
$$;

comment on function public.tg_enforce_property_plan_limit() is
  'Trigger guard that enforces billing-plan property caps on property inserts and cross-account moves.';

drop trigger if exists trg_enforce_property_plan_limit on public.properties;
create trigger trg_enforce_property_plan_limit
before insert or update on public.properties
for each row
execute function public.tg_enforce_property_plan_limit();
