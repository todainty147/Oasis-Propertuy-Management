// Epic A1+A2 (frontend mirror): operator_agency plan + AI feature keys.
// This mirrors the SQL in ai_cost_controls.sql — keep in sync.

export const ENTITLEMENT_FEATURES = Object.freeze({
  // ── Core features (all plans) ──────────────────────────────────────────────
  TENANTS: "tenants",
  PROPERTIES: "properties",
  MAINTENANCE: "maintenance",
  FINANCE: "finance",
  DOCUMENTS: "documents",

  // ── Growth features ────────────────────────────────────────────────────────
  COMMAND_CENTER: "command_center",
  PORTFOLIO_HEALTH: "portfolio_health",
  MAINTENANCE_KPI: "maintenance_kpi",

  // ── AI features: Growth tier ───────────────────────────────────────────────
  AI_MAINTENANCE_TRIAGE: "ai_maintenance_triage",
  AI_ATTENTION_INSIGHT: "ai_attention_insight",
  AI_PROPERTY_HEALTH: "ai_property_health",

  // ── Pro features ───────────────────────────────────────────────────────────
  SECURITY_AUDIT: "security_audit",
  ROOT_TELEMETRY: "root_telemetry",
  SUPPORT_TOOLING: "support_tooling",
  PLAYBOOKS: "playbooks",
  ADVANCED_AUTOMATION: "advanced_automation",

  // ── AI features: Pro tier ──────────────────────────────────────────────────
  AI_CONTRACTOR_RECOMMENDATION: "ai_contractor_recommendation",
  AI_WEEKLY_PORTFOLIO_SUMMARY: "ai_weekly_portfolio_summary",
  AI_MESSAGE_DRAFTS: "ai_message_drafts",
  AI_DOCUMENT_SUMMARIES: "ai_document_summaries",

  // ── AI features: Operator/Agency tier ─────────────────────────────────────
  AI_SECURITY_COPILOT: "ai_security_copilot",
  AI_NATURAL_LANGUAGE_QUERY: "ai_natural_language_query",
  AI_ADVANCED_AUDIT_SUMMARIES: "ai_advanced_audit_summaries",

  // ── Compliance & Risk Suite: Growth tier ──────────────────────────────────
  TAX_READINESS_DASHBOARD: "tax_readiness_dashboard",
  RENT_SHIELD: "rent_shield",
  AI_RENT_SHIELD_EXPLAINER: "ai_rent_shield_explainer",
  RENTERS_RIGHTS_READINESS: "renters_rights_readiness",
  TAX_TOOLS_IN_APP: "tax_tools_in_app",
  MTD_EXPENSE_TRACKER: "mtd_expense_tracker",
  MTD_PROPERTY_FINANCE_SYNC: "mtd_property_finance_sync",
  SECTION24_FINANCE_COST_TRACKER: "section24_finance_cost_tracker",
  CARRIED_FORWARD_FINANCE_COST_TRACKER: "carried_forward_finance_cost_tracker",
  HMRC_MTD_CONNECTION: "hmrc_mtd_connection",
  HMRC_MTD_SANDBOX: "hmrc_mtd_sandbox",
  HMRC_MTD_READ_ONLY: "hmrc_mtd_read_only",
  HMRC_MTD_SANDBOX_TEST_DATA: "hmrc_mtd_sandbox_test_data",
  HMRC_MTD_QUARTERLY_DRAFT_BUILDER: "hmrc_mtd_quarterly_draft_builder",
  HMRC_MTD_SANDBOX_SUBMISSION: "hmrc_mtd_sandbox_submission",
  HMRC_MTD_LIVE_SUBMISSION: "hmrc_mtd_live_submission",
  HMRC_MTD_LIVE_SUBMISSION_PILOT: "hmrc_mtd_live_submission_pilot",
  HMRC_MTD_LIVE_SUBMISSION_DRY_RUN: "hmrc_mtd_live_submission_dry_run",
  HMRC_MTD_LIVE_SUBMISSION_NETWORK_ENABLED: "hmrc_mtd_live_submission_network_enabled",
  HMRC_MTD_LIVE_SUBMISSION_ALLOWLIST: "hmrc_mtd_live_submission_allowlist",
  HMRC_MTD_LIVE_SUBMISSION_OPERATOR_CONTROLS: "hmrc_mtd_live_submission_operator_controls",
  COMPLIANCE_SAFE: "compliance_safe",
  COMPLIANCE_SAFE_UK: "compliance_safe_uk",
  COMPLIANCE_SAFE_PL: "compliance_safe_pl",
  COMPLIANCE_SAFE_TENANT_ACKNOWLEDGEMENT: "compliance_safe_tenant_acknowledgement",
  COMPLIANCE_SAFE_EXPIRY_REMINDERS: "compliance_safe_expiry_reminders",
  RISK_PROTECTION_SUITE: "risk_protection_suite",
  EVIDENCE_VAULT: "evidence_vault",
  EVIDENCE_VAULT_PDF_EXPORT: "evidence_vault_pdf_export",
  EVIDENCE_VAULT_TENANT_SHARING: "evidence_vault_tenant_sharing",
  EVIDENCE_VAULT_DISPUTE_PACK: "evidence_vault_dispute_pack",
  DEPOSIT_DEDUCTIONS_LOG: "deposit_deductions_log",
  DEPOSIT_SETTLEMENT_STATEMENT: "deposit_settlement_statement",
  ECO_UPGRADE_PLANNER: "eco_upgrade_planner",
  PORTFOLIO_HEALTH_ECO_COMPLIANCE: "portfolio_health_eco_compliance",
  MAINTENANCE_DIAGNOSTICS: "maintenance_diagnostics",
  MAINTENANCE_SMART_DIAGNOSTICS: "maintenance_smart_diagnostics",
  TENANT_MAINTENANCE_DIAGNOSTICS: "tenant_maintenance_diagnostics",
  MAINTENANCE_DEPOSIT_EVIDENCE_LINKING: "maintenance_deposit_evidence_linking",
  MAINTENANCE_ECO_UPGRADE_LINKING: "maintenance_eco_upgrade_linking",
  TENANT_APPLICATION_LINKS: "tenant_application_links",
  APPLICANT_PRESCREENING_DASHBOARD: "applicant_prescreening_dashboard",

  // ── Compliance & Risk Suite: Pro tier ─────────────────────────────────────
  AI_LEASE_AUDITOR: "ai_lease_auditor",

  // ── Poland Compliance: Growth tier ────────────────────────────────────────
  POLAND_COMPLIANCE: "poland_compliance",

  // ── Poland Advanced Market Features ───────────────────────────────────────
  PL_OPEN_BANKING_READINESS: "pl_open_banking_readiness",  // Pro — rent match suggestions
  PL_STR_COMPLIANCE:         "pl_str_compliance",          // Growth — short-term rental mode
  PL_TEMPLATE_LIBRARY:       "pl_template_library",        // Pro — legal template readiness
  PL_PARTNER_DIRECTORY:      "pl_partner_directory",       // Pro — notary/legal partner directory

  // ── Rent Rules Engine: Core (all active plans) ────────────────────────────
  RENT_RULES_CORE:        "rent_rules_core",
  EXPECTED_CHARGES_CORE:  "expected_charges_core",

  // ── Rent Rules Engine: Premium automation (future) ────────────────────────
  RENT_RULES_BULK_AUTOMATION:    "rent_rules_bulk_automation",
  RENT_AI_FINANCE_INSIGHTS:      "rent_ai_finance_insights",
  OPEN_BANKING_RENT_MATCHING:    "open_banking_rent_matching",
  PORTFOLIO_FINANCE_FORECASTING: "portfolio_finance_forecasting",
});

export const PLAN_RANKS = Object.freeze({
  starter: 1,
  growth: 2,
  pro: 3,
  operator_agency: 4,
  // Sentinel values: rank 0 — deny all paid feature gates
  trial_expired:           0,
  operator_agency_pending: 0,
  oa_contract_expired:     0,
  billing_past_due_locked: 0,
  billing_locked:          0,
});

// Sentinel plan values that indicate a locked/restricted account state.
// These pass through normalizePlan() rather than falling back to 'starter'.
export const LOCKED_PLAN_SENTINELS = Object.freeze(new Set([
  "trial_expired",
  "operator_agency_pending",
  "oa_contract_expired",
  "billing_past_due_locked",
  "billing_locked",
]));

const STARTER_FEATURES = [
  ENTITLEMENT_FEATURES.TENANTS,
  ENTITLEMENT_FEATURES.PROPERTIES,
  ENTITLEMENT_FEATURES.MAINTENANCE,
  ENTITLEMENT_FEATURES.FINANCE,
  ENTITLEMENT_FEATURES.DOCUMENTS,
  // Rent Rules Engine is core infrastructure — available to all active plans
  ENTITLEMENT_FEATURES.RENT_RULES_CORE,
  ENTITLEMENT_FEATURES.EXPECTED_CHARGES_CORE,
];

const GROWTH_FEATURES = [
  ...STARTER_FEATURES,
  ENTITLEMENT_FEATURES.COMMAND_CENTER,
  ENTITLEMENT_FEATURES.PORTFOLIO_HEALTH,
  ENTITLEMENT_FEATURES.MAINTENANCE_KPI,
  ENTITLEMENT_FEATURES.AI_MAINTENANCE_TRIAGE,
  ENTITLEMENT_FEATURES.AI_ATTENTION_INSIGHT,
  ENTITLEMENT_FEATURES.AI_PROPERTY_HEALTH,
  ENTITLEMENT_FEATURES.TAX_READINESS_DASHBOARD,
  ENTITLEMENT_FEATURES.RENT_SHIELD,
  ENTITLEMENT_FEATURES.AI_RENT_SHIELD_EXPLAINER,
  ENTITLEMENT_FEATURES.RENTERS_RIGHTS_READINESS,
  ENTITLEMENT_FEATURES.TAX_TOOLS_IN_APP,
  ENTITLEMENT_FEATURES.MTD_EXPENSE_TRACKER,
  ENTITLEMENT_FEATURES.SECTION24_FINANCE_COST_TRACKER,
  ENTITLEMENT_FEATURES.CARRIED_FORWARD_FINANCE_COST_TRACKER,
  ENTITLEMENT_FEATURES.COMPLIANCE_SAFE,
  ENTITLEMENT_FEATURES.COMPLIANCE_SAFE_UK,
  ENTITLEMENT_FEATURES.RISK_PROTECTION_SUITE,
  ENTITLEMENT_FEATURES.EVIDENCE_VAULT,
  ENTITLEMENT_FEATURES.DEPOSIT_DEDUCTIONS_LOG,
  ENTITLEMENT_FEATURES.DEPOSIT_SETTLEMENT_STATEMENT,
  ENTITLEMENT_FEATURES.ECO_UPGRADE_PLANNER,
  ENTITLEMENT_FEATURES.PORTFOLIO_HEALTH_ECO_COMPLIANCE,
  ENTITLEMENT_FEATURES.MAINTENANCE_DIAGNOSTICS,
  ENTITLEMENT_FEATURES.TENANT_APPLICATION_LINKS,
  ENTITLEMENT_FEATURES.APPLICANT_PRESCREENING_DASHBOARD,
  ENTITLEMENT_FEATURES.POLAND_COMPLIANCE,
  ENTITLEMENT_FEATURES.PL_STR_COMPLIANCE,
];

const PRO_FEATURES = [
  ...GROWTH_FEATURES,
  ENTITLEMENT_FEATURES.SECURITY_AUDIT,
  ENTITLEMENT_FEATURES.ROOT_TELEMETRY,
  ENTITLEMENT_FEATURES.SUPPORT_TOOLING,
  ENTITLEMENT_FEATURES.PLAYBOOKS,
  ENTITLEMENT_FEATURES.ADVANCED_AUTOMATION,
  ENTITLEMENT_FEATURES.AI_CONTRACTOR_RECOMMENDATION,
  ENTITLEMENT_FEATURES.AI_WEEKLY_PORTFOLIO_SUMMARY,
  ENTITLEMENT_FEATURES.AI_MESSAGE_DRAFTS,
  ENTITLEMENT_FEATURES.AI_DOCUMENT_SUMMARIES,
  ENTITLEMENT_FEATURES.AI_LEASE_AUDITOR,
  ENTITLEMENT_FEATURES.PL_OPEN_BANKING_READINESS,
  ENTITLEMENT_FEATURES.PL_TEMPLATE_LIBRARY,
  ENTITLEMENT_FEATURES.PL_PARTNER_DIRECTORY,
  ENTITLEMENT_FEATURES.COMPLIANCE_SAFE_PL,
  ENTITLEMENT_FEATURES.EVIDENCE_VAULT_PDF_EXPORT,
];

const OPERATOR_AGENCY_FEATURES = [
  ...PRO_FEATURES,
  ENTITLEMENT_FEATURES.AI_SECURITY_COPILOT,
  ENTITLEMENT_FEATURES.AI_NATURAL_LANGUAGE_QUERY,
  ENTITLEMENT_FEATURES.AI_ADVANCED_AUDIT_SUMMARIES,
  // Premium rent automation (bulk, AI finance, open banking, forecasting)
  ENTITLEMENT_FEATURES.RENT_RULES_BULK_AUTOMATION,
  ENTITLEMENT_FEATURES.RENT_AI_FINANCE_INSIGHTS,
  ENTITLEMENT_FEATURES.OPEN_BANKING_RENT_MATCHING,
  ENTITLEMENT_FEATURES.PORTFOLIO_FINANCE_FORECASTING,
];

export const PLAN_ENTITLEMENTS = Object.freeze({
  starter: STARTER_FEATURES,
  growth: GROWTH_FEATURES,
  pro: PRO_FEATURES,
  operator_agency: OPERATOR_AGENCY_FEATURES,
});

// Monthly AI call quotas per plan (null = unlimited)
export const AI_MONTHLY_LIMITS = Object.freeze({
  starter: 0,
  growth: 500,
  pro: 3_000,
  operator_agency: null,
});

// Daily AI call quotas per plan (null = unlimited)
export const AI_DAILY_LIMITS = Object.freeze({
  starter: 0,
  growth: 50,
  pro: 200,
  operator_agency: null,
});

export const PLAN_USAGE_LIMITS = Object.freeze({
  starter: Object.freeze({ properties: 10 }),
  growth: Object.freeze({ properties: 50 }),
  pro: Object.freeze({ properties: null }),
  operator_agency: Object.freeze({ properties: null }),
});

export function normalizePlan(plan) {
  const normalized = String(plan || "").trim().toLowerCase();
  // Pass through sentinel values unchanged so UI can display the correct wall
  if (LOCKED_PLAN_SENTINELS.has(normalized)) return normalized;
  return normalized in PLAN_RANKS ? normalized : "starter";
}

export function isLockedPlan(plan) {
  return LOCKED_PLAN_SENTINELS.has(normalizePlan(plan));
}

export function getPlanRank(plan) {
  const p = normalizePlan(plan);
  return Object.prototype.hasOwnProperty.call(PLAN_RANKS, p) ? PLAN_RANKS[p] : 1;
}

export function getPlanFeatures(plan) {
  return PLAN_ENTITLEMENTS[normalizePlan(plan)] || STARTER_FEATURES;
}

export function getPlanUsageLimit(plan, resource) {
  const normalizedResource = String(resource || "").trim().toLowerCase();
  const limits = PLAN_USAGE_LIMITS[normalizePlan(plan)] || PLAN_USAGE_LIMITS.starter;
  return Object.prototype.hasOwnProperty.call(limits, normalizedResource) ? limits[normalizedResource] : null;
}

export function getFeatureMinimumPlan(feature) {
  const target = String(feature || "").trim().toLowerCase();
  for (const planKey of ["starter", "growth", "pro", "operator_agency"]) {
    if (PLAN_ENTITLEMENTS[planKey].includes(target)) {
      return planKey;
    }
  }
  return "starter";
}

// Returns human-readable label key for a plan (including sentinels).
export function getPlanLabelKey(plan) {
  const p = normalizePlan(plan);
  const MAP = {
    starter:                 "billing.plan.starter",
    growth:                  "billing.plan.growth",
    pro:                     "billing.plan.pro",
    operator_agency:         "billing.plan.operatorAgency",
    trial_expired:           "billing.planLabel.trial_expired",
    operator_agency_pending: "billing.planLabel.operator_agency_pending",
    oa_contract_expired:     "billing.planLabel.oa_contract_expired",
    billing_past_due_locked: "billing.planLabel.billing_past_due_locked",
    billing_locked:          "billing.planLabel.billing_locked",
  };
  return MAP[p] || "billing.plan.starter";
}

export function hasFeature(plan, feature) {
  return getPlanFeatures(plan).includes(String(feature || "").trim().toLowerCase());
}

export function assertFeature(plan, feature) {
  if (hasFeature(plan, feature)) return true;
  const requiredPlan = getFeatureMinimumPlan(feature);
  throw new Error(`Feature "${feature}" requires ${requiredPlan} plan or higher.`);
}

export function hasUsageCapacity(plan, resource, currentCount) {
  const limit = getPlanUsageLimit(plan, resource);
  if (limit == null) return true;
  return Number(currentCount || 0) < Number(limit);
}

export function assertUsageCapacity(plan, resource, currentCount) {
  if (hasUsageCapacity(plan, resource, currentCount)) return true;
  const limit = getPlanUsageLimit(plan, resource);
  throw new Error(`Plan "${normalizePlan(plan)}" allows up to ${limit} ${resource}.`);
}
