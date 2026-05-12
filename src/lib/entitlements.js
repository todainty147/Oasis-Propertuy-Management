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

  // ── Compliance & Risk Suite: Pro tier ─────────────────────────────────────
  AI_LEASE_AUDITOR: "ai_lease_auditor",

  // ── Poland Compliance: Growth tier ────────────────────────────────────────
  POLAND_COMPLIANCE: "poland_compliance",

  // ── Poland Advanced Market Features ───────────────────────────────────────
  PL_OPEN_BANKING_READINESS: "pl_open_banking_readiness",  // Pro — rent match suggestions
  PL_STR_COMPLIANCE:         "pl_str_compliance",          // Growth — short-term rental mode
  PL_TEMPLATE_LIBRARY:       "pl_template_library",        // Pro — legal template readiness
  PL_PARTNER_DIRECTORY:      "pl_partner_directory",       // Pro — notary/legal partner directory
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
];

const OPERATOR_AGENCY_FEATURES = [
  ...PRO_FEATURES,
  ENTITLEMENT_FEATURES.AI_SECURITY_COPILOT,
  ENTITLEMENT_FEATURES.AI_NATURAL_LANGUAGE_QUERY,
  ENTITLEMENT_FEATURES.AI_ADVANCED_AUDIT_SUMMARIES,
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
