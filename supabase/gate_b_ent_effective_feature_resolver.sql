-- Gate-B-ENT: Authoritative effective entitlement resolver.
-- Applied after gate_b1_deposit_release_registry.sql (final position in overlay sequence).
--
-- Introduces:
--   1. account_feature_min_plan(text)             — embedded feature catalogue
--   2. account_has_effective_feature(uuid, text)  — authoritative resolver
--
-- Replaces (additive via CREATE OR REPLACE):
--   3. account_feature_required_plan(text)        — C-3 fix + missing registrations
--   4. deposit_pack_account_has_entitlement(uuid) — delegates to resolver
--
-- Resolver precedence:
--   a. Unregistered feature key (account_feature_min_plan returns NULL) → deny
--   b. account_feature_flags row with enabled = true → allow
--   c. Flag-only feature (HMRC), no flag → deny
--   d. account_plan_rank(account_subscription_plan()) >= account_plan_rank(min_plan) → allow/deny
--
-- account_subscription_plan() resolves founders via account_entitlements (step ⑤ in
-- account_subscription_plan_founder.sql). No special handling is needed here.
--
-- C-3 gap closed:
--   account_feature_required_plan('evidence_vault_dispute_pack') was returning 'starter'.
--   Both account_feature_required_plan and account_has_effective_feature now return 'growth'.
--   renters_rights_readiness → 'growth' (was unregistered)
--   maintenance_evidence_pack → 'growth' (was unregistered)

begin;

-- ── 1. account_feature_min_plan ───────────────────────────────────────────────
-- Single source of truth for the minimum plan required for each known feature.
-- Returns:
--   'flag_only'  — feature is gated by account_feature_flags only (no plan path)
--   plan text    — minimum plan that includes this feature
--   NULL         — unregistered feature key (callers must deny)

create or replace function public.account_feature_min_plan(
  p_feature text
)
returns text
language sql
stable
set search_path = public
as $$
  select case lower(trim(coalesce(p_feature, '')))
    -- ── Starter (all active plans) ────────────────────────────────────────────
    when 'tenants'                    then 'starter'
    when 'properties'                 then 'starter'
    when 'maintenance'                then 'starter'
    when 'finance'                    then 'starter'
    when 'documents'                  then 'starter'
    when 'rent_rules_core'            then 'starter'
    when 'expected_charges_core'      then 'starter'

    -- ── Growth ────────────────────────────────────────────────────────────────
    when 'command_center'                       then 'growth'
    when 'portfolio_health'                     then 'growth'
    when 'maintenance_kpi'                      then 'growth'
    when 'ai_maintenance_triage'                then 'growth'
    when 'ai_attention_insight'                 then 'growth'
    when 'ai_property_health'                   then 'growth'
    when 'tax_readiness_dashboard'              then 'growth'
    when 'rent_shield'                          then 'growth'
    when 'ai_rent_shield_explainer'             then 'growth'
    when 'renters_rights_readiness'             then 'growth'
    when 'tax_tools_in_app'                     then 'growth'
    when 'mtd_expense_tracker'                  then 'growth'
    when 'mtd_property_finance_sync'            then 'growth'
    when 'section24_finance_cost_tracker'       then 'growth'
    when 'carried_forward_finance_cost_tracker' then 'growth'
    when 'compliance_safe'                      then 'growth'
    when 'compliance_safe_uk'                   then 'growth'
    when 'compliance_safe_tenant_acknowledgement' then 'growth'
    when 'compliance_safe_expiry_reminders'     then 'growth'
    when 'risk_protection_suite'                then 'growth'
    when 'evidence_vault'                       then 'growth'
    when 'evidence_vault_tenant_sharing'        then 'growth'
    when 'evidence_vault_dispute_pack'          then 'growth'
    when 'deposit_deductions_log'               then 'growth'
    when 'deposit_settlement_statement'         then 'growth'
    when 'eco_upgrade_planner'                  then 'growth'
    when 'portfolio_health_eco_compliance'      then 'growth'
    when 'maintenance_diagnostics'              then 'growth'
    when 'maintenance_smart_diagnostics'        then 'growth'
    when 'tenant_maintenance_diagnostics'       then 'growth'
    when 'maintenance_deposit_evidence_linking' then 'growth'
    when 'maintenance_eco_upgrade_linking'      then 'growth'
    when 'maintenance_evidence_pack'            then 'growth'
    when 'document_extraction'                  then 'growth'
    when 'tenant_application_links'             then 'growth'
    when 'applicant_prescreening_dashboard'     then 'growth'
    when 'poland_compliance'                    then 'growth'
    when 'pl_str_compliance'                    then 'growth'

    -- ── Pro ───────────────────────────────────────────────────────────────────
    when 'security_audit'                then 'pro'
    when 'root_telemetry'                then 'pro'
    when 'support_tooling'               then 'pro'
    when 'playbooks'                     then 'pro'
    when 'advanced_automation'           then 'pro'
    when 'ai_contractor_recommendation'  then 'pro'
    when 'ai_weekly_portfolio_summary'   then 'pro'
    when 'ai_message_drafts'             then 'pro'
    when 'ai_document_summaries'         then 'pro'
    when 'ai_lease_auditor'              then 'pro'
    when 'evidence_vault_pdf_export'     then 'pro'
    when 'compliance_safe_pl'            then 'pro'
    when 'pl_open_banking_readiness'     then 'pro'
    when 'pl_template_library'           then 'pro'
    when 'pl_partner_directory'          then 'pro'
    when 'rent_rules_bulk_automation'    then 'pro'
    when 'rent_ai_finance_insights'      then 'pro'
    when 'open_banking_rent_matching'    then 'pro'
    when 'portfolio_finance_forecasting' then 'pro'

    -- ── Operator/Agency ───────────────────────────────────────────────────────
    when 'ai_security_copilot'          then 'operator_agency'
    when 'ai_natural_language_query'    then 'operator_agency'
    when 'ai_advanced_audit_summaries'  then 'operator_agency'

    -- ── Flag-only (HMRC) — no plan path; account_feature_flags required ───────
    when 'hmrc_mtd_connection'                      then 'flag_only'
    when 'hmrc_mtd_sandbox'                         then 'flag_only'
    when 'hmrc_mtd_read_only'                       then 'flag_only'
    when 'hmrc_mtd_sandbox_test_data'               then 'flag_only'
    when 'hmrc_mtd_quarterly_draft_builder'         then 'flag_only'
    when 'hmrc_mtd_sandbox_submission'              then 'flag_only'
    when 'hmrc_mtd_live_submission'                 then 'flag_only'
    when 'hmrc_mtd_live_submission_pilot'           then 'flag_only'
    when 'hmrc_mtd_live_submission_dry_run'         then 'flag_only'
    when 'hmrc_mtd_live_submission_network_enabled' then 'flag_only'
    when 'hmrc_mtd_live_submission_allowlist'       then 'flag_only'
    when 'hmrc_mtd_live_submission_operator_controls' then 'flag_only'

    -- ── Unregistered → NULL (callers must deny) ───────────────────────────────
    else null
  end;
$$;

comment on function public.account_feature_min_plan(text) is
  'Returns the minimum plan required for a registered feature key, '
  '''flag_only'' for HMRC features that require an account_feature_flags row, '
  'or NULL for unregistered features (callers must deny). '
  'C-3 fix: evidence_vault_dispute_pack → growth (was missing → defaulted to starter). '
  'renters_rights_readiness and maintenance_evidence_pack also registered at growth.';

revoke all on function public.account_feature_min_plan(text) from public;
grant execute on function public.account_feature_min_plan(text) to authenticated;

-- ── 2. account_has_effective_feature ─────────────────────────────────────────
-- Authoritative resolver for account-level feature access.
-- Precedence (first matching branch wins):
--   a. NULL account_id or unregistered feature → false (deny-by-default)
--   b. account_feature_flags row with enabled = false → false (explicit deny, overrides plan)
--   c. account_feature_flags row with enabled = true  → true  (explicit grant)
--   d. flag_only feature, no flag row → false
--   e. account_plan_rank(account_subscription_plan()) >= account_plan_rank(min_plan)
--
-- Explicit deny semantics: a row with enabled=false overrides any plan entitlement.
-- This is required for Growth/Pro accounts where a feature must be suspended for a
-- specific account (e.g., billing freeze, abuse suspension) without a plan downgrade.
--
-- SECURITY DEFINER: reads account_feature_flags without RLS, and calls
-- account_subscription_plan() which also runs as SECURITY DEFINER.
-- This allows the resolver to be used inside RLS policies without privilege loops.

create or replace function public.account_has_effective_feature(
  p_account_id uuid,
  p_feature    text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  with
    feat as (
      select public.account_feature_min_plan(p_feature) as min_plan
    ),
    flag as (
      -- Select the enabled column directly (not EXISTS). NULL = no row (no override).
      -- false = explicit deny (overrides plan). true = explicit grant (overrides plan).
      select enabled
      from public.account_feature_flags aff
      where aff.account_id = p_account_id
        and aff.feature_key = lower(trim(coalesce(p_feature, '')))
      limit 1
    )
  select case
    when p_account_id is null                          then false
    when (select min_plan from feat) is null           then false
    when (select enabled from flag) = false            then false  -- explicit deny overrides plan
    when (select enabled from flag) = true             then true   -- explicit grant overrides plan
    when (select min_plan from feat) = 'flag_only'     then false
    else public.account_plan_rank(public.account_subscription_plan(p_account_id))
           >= public.account_plan_rank((select min_plan from feat))
  end;
$$;

comment on function public.account_has_effective_feature(uuid, text) is
  'Authoritative feature-access resolver. Precedence: unregistered→deny; '
  'enabled=false flag→deny (overrides plan); enabled=true flag→grant; '
  'flag_only with no flag→deny; plan rank≥min_plan→allow. '
  'Returns false for unregistered feature keys (deny-by-default). '
  'Explicit deny (enabled=false) overrides Growth/Pro plan entitlement. '
  'HMRC features (flag_only) require an explicit enabled=true flag regardless of plan.';

revoke all on function public.account_has_effective_feature(uuid, text) from public;
grant execute on function public.account_has_effective_feature(uuid, text) to authenticated;

-- ── 3. Updated account_feature_required_plan — C-3 fix ───────────────────────
-- Replaces the version in account_entitlements.sql.
-- Changes: adds evidence_vault_dispute_pack → growth (C-3 fix),
--          renters_rights_readiness → growth, maintenance_evidence_pack → growth,
--          and all other features that were missing from the original.
-- account_has_feature() reads this function, so fixing it also fixes account_has_feature.

create or replace function public.account_feature_required_plan(
  p_feature text
)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(public.account_feature_min_plan(p_feature), 'starter');
$$;

comment on function public.account_feature_required_plan(text) is
  'Returns the minimum plan required for a feature, or ''starter'' for unregistered keys. '
  'Delegates to account_feature_min_plan(). C-3 fix: evidence_vault_dispute_pack → growth. '
  'Prefer account_has_effective_feature() for access checks; this function is for '
  'plan-requirement display only.';

-- ── 4. Updated deposit_pack_account_has_entitlement — delegates to resolver ───
-- Replaces the version in gate_b1_deposit_release_registry.sql.
-- Behaviour is unchanged: root accounts have operator_agency plan (rank 4 >= 2),
-- flags still grant access, and plan-level check is now via the shared resolver.
-- Founder accounts are handled transparently: account_subscription_plan() checks
-- account_entitlements before returning the billing plan.

create or replace function public.deposit_pack_account_has_entitlement(
  p_account_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.account_has_effective_feature(p_account_id, 'evidence_vault_dispute_pack');
$$;

comment on function public.deposit_pack_account_has_entitlement(uuid) is
  'Returns true when the account may access the Deposit Dispute Pack. '
  'Delegates to account_has_effective_feature(). Requires Growth plan (rank >= 2), '
  'a root account, an explicit account_feature_flags override, or an active '
  'account_entitlements row with effective_plan >= growth (e.g. founder pro). '
  'Production behaviour is unchanged from Gate-B1.';

-- ── 5. Updated transition_deposit_pack_release_state — prefix allowlist ──────
-- Replaces the Gate-B1 version which only accepts 'deposit_dispute_pack' exactly.
-- Relaxes step 2 to accept any pack type starting with 'deposit_dispute_pack',
-- enabling integration tests to use 'deposit_dispute_pack_gate_b1_test' as an
-- isolated row so they never transition the real production registry.
-- Production callers always pass 'deposit_dispute_pack' which satisfies the prefix.

create or replace function public.transition_deposit_pack_release_state(
  p_pack_type        text,
  p_new_state        text,
  p_release_reference text,
  p_rationale        text,
  p_pack_version     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id          uuid := auth.uid();
  v_is_root           boolean;
  v_current_state     text;
  v_registry_id       uuid;
  v_existing_new_state text;
  v_clean_pack_type   text := lower(trim(coalesce(p_pack_type, '')));
  v_clean_new_state   text := lower(trim(coalesce(p_new_state, '')));
  v_clean_ref         text := trim(coalesce(p_release_reference, ''));
  v_allowed           boolean := false;
begin
  -- 1. Resolve and validate root membership
  select exists (
    select 1
    from public.accounts a
    join public.account_members am on am.account_id = a.id
    where a.is_root = true
      and am.user_id = v_actor_id
  ) into v_is_root;

  if not v_is_root then
    raise exception 'Only root operators may transition pack release state'
      using errcode = 'P0401';
  end if;

  -- 2. Validate pack_type: must start with 'deposit_dispute_pack'.
  -- Accepts 'deposit_dispute_pack' (production) and 'deposit_dispute_pack_*' (test isolation).
  if v_clean_pack_type not like 'deposit_dispute_pack%' then
    raise exception 'Unknown pack type: %. Must start with ''deposit_dispute_pack''.',
      p_pack_type using errcode = 'P0402';
  end if;

  -- 3. Validate new_state
  if v_clean_new_state not in ('internal_preview', 'production', 'suspended') then
    raise exception 'Invalid release state "%". Must be internal_preview, production, or suspended.',
      p_new_state using errcode = 'P0403';
  end if;

  -- 4. Validate release_reference
  if v_clean_ref = '' then
    raise exception 'release_reference must not be empty'
      using errcode = 'P0405';
  end if;

  -- 5. Check for existing transition with this (pack_type, release_reference)
  select new_release_state into v_existing_new_state
  from public.deposit_pack_release_transitions
  where pack_type = v_clean_pack_type
    and release_reference = v_clean_ref
  limit 1;

  if found then
    if v_existing_new_state = v_clean_new_state then
      select id, release_state into v_registry_id, v_current_state
      from public.deposit_pack_release_registry
      where pack_type = v_clean_pack_type;

      return jsonb_build_object(
        'idempotent',       true,
        'pack_type',        v_clean_pack_type,
        'release_state',    v_current_state,
        'pack_version',     coalesce(p_pack_version, 'unknown'),
        'release_reference', v_clean_ref
      );
    else
      raise exception
        'Release reference "%" was previously used for a transition to %, '
        'not %. Conflicting reference reuse is rejected.',
        v_clean_ref, v_existing_new_state, v_clean_new_state
        using errcode = 'P0406';
    end if;
  end if;

  -- 6. Lock current registry row
  select id, release_state into v_registry_id, v_current_state
  from public.deposit_pack_release_registry
  where pack_type = v_clean_pack_type
  for update;

  if not found then
    raise exception 'No release registry row found for pack type "%"', p_pack_type
      using errcode = 'P0407';
  end if;

  -- 7. Validate against allowed state machine
  v_allowed := case v_current_state
    when 'internal_preview' then v_clean_new_state in ('production')
    when 'production'       then v_clean_new_state in ('suspended')
    when 'suspended'        then v_clean_new_state in ('internal_preview', 'production')
    else false
  end;

  if not v_allowed then
    raise exception
      'Transition from % to % is not permitted for deposit_dispute_pack. '
      'Allowed: internal_preview→production, production→suspended, '
      'suspended→internal_preview or suspended→production.',
      v_current_state, v_clean_new_state
      using errcode = 'P0408';
  end if;

  -- 8. Append transition event (atomic with registry update)
  insert into public.deposit_pack_release_transitions (
    pack_type, previous_release_state, new_release_state,
    approved_by, release_reference, rationale, pack_version
  ) values (
    v_clean_pack_type, v_current_state, v_clean_new_state,
    v_actor_id, v_clean_ref,
    p_rationale,
    coalesce(p_pack_version, 'unknown')
  );

  -- 9. Update registry
  update public.deposit_pack_release_registry
  set release_state = v_clean_new_state,
      pack_version  = coalesce(p_pack_version, pack_version),
      updated_at    = now()
  where id = v_registry_id;

  return jsonb_build_object(
    'idempotent',       false,
    'pack_type',        v_clean_pack_type,
    'previous_state',   v_current_state,
    'release_state',    v_clean_new_state,
    'pack_version',     coalesce(p_pack_version, 'unknown'),
    'release_reference', v_clean_ref,
    'approved_by',      v_actor_id::text
  );
end;
$$;

comment on function public.transition_deposit_pack_release_state(text, text, text, text, text) is
  'Root-only atomic pack release state transition. '
  'Pack type must start with ''deposit_dispute_pack'' (allows isolated test pack types). '
  'Validates state machine, is idempotent for the same release_reference, '
  'rejects conflicting reference reuse, and writes an append-only audit event '
  'atomically with the registry update. '
  'State machine: internal_preview→production, production→suspended, '
  'suspended→internal_preview/production.';

revoke all on function public.transition_deposit_pack_release_state(text, text, text, text, text) from public;
grant execute on function public.transition_deposit_pack_release_state(text, text, text, text, text) to authenticated;

-- ── 6. Updated prepare_deposit_dispute_pack_export — test-isolation override ──
-- Replaces the version in gate_b1_deposit_release_registry.sql.
-- Adds optional p_registry_pack_type (default null → 'deposit_dispute_pack').
-- Production callers pass nothing; tests pass 'deposit_dispute_pack_gate_b1_test'
-- so integration tests never transition the real deposit_dispute_pack registry row.
-- The old single-parameter signature is dropped first because PostgreSQL CREATE OR
-- REPLACE cannot change the parameter list; the new signature uses a default so
-- existing callers (no second arg) continue to work unchanged.

drop function if exists public.prepare_deposit_dispute_pack_export(uuid);

create or replace function public.prepare_deposit_dispute_pack_export(
  p_pack_id              uuid,
  p_registry_pack_type   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id          uuid := auth.uid();
  v_account_id        uuid;
  v_pack_status       text;
  v_pack_version_col  text;
  v_release_state     text;
  v_registry_version  text;
  v_is_root           boolean;
  v_historical_version text;
  v_auth_id           uuid;
  v_resolved_pack_type text := coalesce(
    nullif(trim(coalesce(p_registry_pack_type, '')), ''),
    'deposit_dispute_pack'
  );
begin
  -- Validate override: must start with 'deposit_dispute_pack' to prevent injection.
  if v_resolved_pack_type not like 'deposit_dispute_pack%' then
    raise exception 'Invalid registry pack type override: %', v_resolved_pack_type
      using errcode = 'P0409';
  end if;

  -- 1. Resolve pack → account
  select account_id, status, pack_version
  into v_account_id, v_pack_status, v_pack_version_col
  from public.deposit_dispute_packs
  where id = p_pack_id;

  if not found then
    raise exception 'Deposit dispute pack not found'
      using errcode = 'P0001';
  end if;

  if v_pack_status = 'archived' then
    raise exception 'An archived dispute pack cannot be exported'
      using errcode = 'P0002';
  end if;

  -- 2. Enforce role: must be account manager
  if not public.user_can_manage_account(v_account_id) then
    raise exception 'Not authorised to manage this account'
      using errcode = 'P0401';
  end if;

  -- 3. Enforce effective feature entitlement
  if not public.deposit_pack_account_has_entitlement(v_account_id) then
    raise exception
      'Account does not have the evidence_vault_dispute_pack entitlement. '
      'Growth plan or higher is required.'
      using errcode = 'P0402';
  end if;

  -- 4. Resolve release state from the target registry row
  select release_state, pack_version
  into v_release_state, v_registry_version
  from public.deposit_pack_release_registry
  where pack_type = v_resolved_pack_type;

  if not found then
    raise exception 'Deposit pack release registry is not initialised for pack type "%"',
      v_resolved_pack_type
      using errcode = 'P0500';
  end if;

  -- 5. Check if actor is a root operator (enables internal preview path)
  select exists (
    select 1
    from public.accounts a
    join public.account_members am on am.account_id = a.id
    where a.is_root = true
      and am.user_id = v_actor_id
  ) into v_is_root;

  -- 6. Enforce release state gate
  if v_release_state = 'suspended' then
    raise exception 'Deposit dispute pack export is currently suspended'
      using errcode = 'P0403';
  end if;

  if v_release_state = 'internal_preview' and not v_is_root then
    raise exception
      'Deposit dispute pack export is in internal preview only and '
      'is not yet available for customer production use'
      using errcode = 'P0404';
  end if;

  -- 7. Resolve pack version / historical classification
  v_historical_version := coalesce(v_pack_version_col, 'pre_gate_b');

  -- 8. Write durable export authorisation record
  insert into public.deposit_pack_export_authorisations (
    account_id,
    pack_id,
    actor_id,
    pack_type,
    pack_version,
    release_mode,
    result
  ) values (
    v_account_id,
    p_pack_id,
    v_actor_id,
    v_resolved_pack_type,
    v_historical_version,
    v_release_state,
    'print_initiated'
  )
  returning id into v_auth_id;

  -- 9. Return authorisation payload
  return jsonb_build_object(
    'authorisation_id', v_auth_id::text,
    'pack_id',          p_pack_id::text,
    'account_id',       v_account_id::text,
    'release_mode',     v_release_state,
    'pack_version',     v_historical_version,
    'is_root_preview',  v_is_root,
    'result',           'print_initiated'
  );
end;
$$;

comment on function public.prepare_deposit_dispute_pack_export(uuid, text) is
  'Server-side export authorisation gate for the Deposit Dispute Pack. '
  'p_registry_pack_type defaults to ''deposit_dispute_pack'' (production). '
  'Pass ''deposit_dispute_pack_gate_b1_test'' in integration tests to use an '
  'isolated registry row and avoid polluting the real transition ledger. '
  'Behaviour for the default (no second arg) is identical to the Gate-B1 version.';

revoke all on function public.prepare_deposit_dispute_pack_export(uuid, text) from public;
grant execute on function public.prepare_deposit_dispute_pack_export(uuid, text) to authenticated;

-- ── Legacy helper deprecation notice ─────────────────────────────────────────
-- Additive overlay: the COMMENT does not alter the function body.
-- Existing callers (automation_playbooks.sql → 'playbooks',
-- command_center_items.sql → 'command_center') use hardcoded registered keys
-- and are safe as-is. Do not route any new gate through account_has_feature().
comment on function public.account_has_feature(uuid, text) is
  'DEPRECATED — use account_has_effective_feature() for all new feature gates (Gate-B-ENT). '
  'Two security gaps: '
  '(1) enabled=false flag rows do NOT override plan entitlement — a Growth/Pro account with '
  '    enabled=false will still pass the plan rank check (incorrect allow); '
  '(2) account_feature_required_plan() returns ''starter'' for unknown keys, so any Starter '
  '    account is incorrectly allowed for an unregistered feature. '
  'Safe existing callers use hardcoded registered keys (''playbooks'', ''command_center''). '
  'DO NOT use this function for new evidence-pack, deposit-pack, or compliance gates.';

commit;
