export const ENTITLEMENT_FEATURES = Object.freeze({
  TENANTS: "tenants",
  PROPERTIES: "properties",
  MAINTENANCE: "maintenance",
  FINANCE: "finance",
  DOCUMENTS: "documents",
  COMMAND_CENTER: "command_center",
  PORTFOLIO_HEALTH: "portfolio_health",
  MAINTENANCE_KPI: "maintenance_kpi",
  SECURITY_AUDIT: "security_audit",
  ROOT_TELEMETRY: "root_telemetry",
  SUPPORT_TOOLING: "support_tooling",
  PLAYBOOKS: "playbooks",
  ADVANCED_AUTOMATION: "advanced_automation",
});

export const PLAN_RANKS = Object.freeze({
  starter: 1,
  growth: 2,
  pro: 3,
});

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
];

const PRO_FEATURES = [
  ...GROWTH_FEATURES,
  ENTITLEMENT_FEATURES.SECURITY_AUDIT,
  ENTITLEMENT_FEATURES.ROOT_TELEMETRY,
  ENTITLEMENT_FEATURES.SUPPORT_TOOLING,
  ENTITLEMENT_FEATURES.PLAYBOOKS,
  ENTITLEMENT_FEATURES.ADVANCED_AUTOMATION,
];

export const PLAN_ENTITLEMENTS = Object.freeze({
  starter: STARTER_FEATURES,
  growth: GROWTH_FEATURES,
  pro: PRO_FEATURES,
});

export const PLAN_USAGE_LIMITS = Object.freeze({
  starter: Object.freeze({
    properties: 10,
  }),
  growth: Object.freeze({
    properties: 50,
  }),
  pro: Object.freeze({
    properties: null,
  }),
});

export function normalizePlan(plan) {
  const normalized = String(plan || "").trim().toLowerCase();
  return normalized in PLAN_RANKS ? normalized : "starter";
}

export function getPlanRank(plan) {
  return PLAN_RANKS[normalizePlan(plan)] || 0;
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
  for (const planKey of Object.keys(PLAN_ENTITLEMENTS)) {
    if (PLAN_ENTITLEMENTS[planKey].includes(target)) {
      return planKey;
    }
  }
  return "starter";
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
