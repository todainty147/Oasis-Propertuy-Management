-- supabase/renters_rights_entitlement.sql
--
-- Adds 'renters_rights_readiness' to the canonical feature plan mapping.
-- Must be applied after account_entitlements.sql.
--
-- This is a complete replacement of account_feature_required_plan — the
-- single source of truth for all feature tier requirements.

create or replace function public.account_feature_required_plan(
  p_feature text
)
returns text
language sql
stable
set search_path = public
as $$
  select case lower(trim(coalesce(p_feature, '')))
    -- ── Core features ─────────────────────────────────────────────────────────
    when 'command_center'               then 'growth'
    when 'portfolio_health'             then 'growth'
    when 'maintenance_kpi'              then 'growth'
    when 'playbooks'                    then 'pro'
    when 'advanced_automation'          then 'pro'
    when 'security_audit'               then 'pro'
    when 'root_telemetry'               then 'pro'
    when 'support_tooling'              then 'pro'

    -- ── AI features: Growth tier ──────────────────────────────────────────────
    when 'ai_maintenance_triage'        then 'growth'
    when 'ai_attention_insight'         then 'growth'
    when 'ai_property_health'           then 'growth'

    -- ── AI features: Pro tier ─────────────────────────────────────────────────
    when 'ai_contractor_recommendation' then 'pro'
    when 'ai_weekly_portfolio_summary'  then 'pro'
    when 'ai_message_drafts'            then 'pro'
    when 'ai_document_summaries'        then 'pro'

    -- ── AI features: Operator/Agency tier ─────────────────────────────────────
    when 'ai_security_copilot'          then 'operator_agency'
    when 'ai_natural_language_query'    then 'operator_agency'
    when 'ai_advanced_audit_summaries'  then 'operator_agency'

    -- ── Compliance & Risk Suite: Growth tier ──────────────────────────────────
    when 'tax_readiness_dashboard'      then 'growth'
    when 'rent_shield'                  then 'growth'
    when 'ai_rent_shield_explainer'     then 'growth'
    when 'renters_rights_readiness'     then 'growth'   -- England RR Act 2025

    -- ── Compliance & Risk Suite: Pro tier ─────────────────────────────────────
    when 'ai_lease_auditor'             then 'pro'

    -- ── Document Intelligence: Growth tier ────────────────────────────────────
    when 'document_extraction'          then 'growth'

    else 'starter'
  end;
$$;

comment on function public.account_feature_required_plan(text) is
  'Canonical definition — single source of truth for all feature plan requirements. '
  'renters_rights_readiness (Growth) added for Renters'' Rights Act 2025 compliance module. '
  'WARNING: this overlay REPLACES account_entitlements.sql. Any feature key added to '
  'account_entitlements.sql after this file was written must also be added here, or it will '
  'be silently dropped at overlay apply time. Keep both files in sync.';

revoke all  on function public.account_feature_required_plan(text) from public;
grant execute on function public.account_feature_required_plan(text) to authenticated;
