export const PRODUCT_ANALYTICS_EVENTS = Object.freeze({
  SIGNUP_STARTED: "signup_started",
  SIGNUP_SUBMITTED: "signup_submitted",
  ACCOUNT_CREATED: "account_created",
  DEMO_SEED_COMPLETED: "demo_seed_completed",
  DEMO_RESET_COMPLETED: "demo_reset_completed",
  ONBOARDING_OPENED: "onboarding_opened",
  FIRST_PROPERTY_CREATED: "first_property_created",
  FIRST_TENANT_CREATED: "first_tenant_created",
  TENANT_INVITE_SENT: "tenant_invite_sent",
  STAFF_OR_CONTRACTOR_INVITE_SENT: "staff_or_contractor_invite_sent",
  INVITE_ACCEPTED: "invite_accepted",
  FIRST_PAYMENT_ADDED: "first_payment_added",
  FINANCE_REVIEWED: "finance_reviewed",
  FIRST_MAINTENANCE_REQUEST_CREATED: "first_maintenance_request_created",
  FIRST_WORK_ORDER_CREATED: "first_work_order_created",
  WORK_ORDER_ASSIGNED: "work_order_assigned",
  CONTRACTOR_UPDATE_SUBMITTED: "contractor_update_submitted",
  DOCUMENT_REQUEST_CREATED: "document_request_created",
  DOCUMENT_UPLOADED: "document_uploaded",
  COMMAND_CENTER_USED: "command_center_used",
  COMMAND_CENTER_ACTION_CLICKED: "command_center_action_clicked",
  PORTFOLIO_HEALTH_USED: "portfolio_health_used",
  MAINTENANCE_INBOX_USED: "maintenance_inbox_used",
  BILLING_INTENT_STARTED: "billing_intent_started",
  SUBSCRIPTION_STATE_CHANGED: "subscription_state_changed",
});

const KNOWN_EVENTS = new Set(Object.values(PRODUCT_ANALYTICS_EVENTS));

const ALLOWED_PROPERTY_KEYS = new Set([
  "accepted_user_id",
  "account_id",
  "document_type",
  "has_contractor",
  "has_due_soon_payment",
  "has_open_maintenance",
  "has_overdue_payment",
  "has_urgent_item",
  "high_risk_count",
  "invite_role",
  "is_demo",
  "item_count",
  "item_type",
  "locale",
  "maintenance_request_count",
  "open_request_count",
  "payment_count",
  "property_count",
  "request_count",
  "role",
  "sandbox_mode",
  "seeded_fixture_version",
  "source",
  "status",
  "subscription_plan",
  "subscription_status",
  "surface",
  "tenant_count",
  "user_id",
  "work_order_count",
]);

const SENSITIVE_KEY_PATTERN =
  /(email|phone|name|address|token|password|secret|api[_-]?key|filename|file_name|storage|signed[_-]?url|url|message|note|body|card|bank)/i;
const SENSITIVE_STRING_VALUE_PATTERN = /(@|https?:\/\/|token|password|secret|bearer\s+)/i;

function getProductAnalyticsEnabled() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  return String(env?.VITE_PRODUCT_ANALYTICS_ENABLED || "").toLowerCase() === "true";
}

function normalizeAnalyticsValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    if (SENSITIVE_STRING_VALUE_PATTERN.test(value)) return null;
    return value.slice(0, 120);
  }
  return null;
}

export function isAllowedProductAnalyticsProperty(key) {
  if (!ALLOWED_PROPERTY_KEYS.has(key)) return false;
  return !SENSITIVE_KEY_PATTERN.test(key);
}

export function sanitizeProductAnalyticsProperties(properties = {}) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return {};
  }

  return Object.entries(properties).reduce((safe, [key, value]) => {
    if (!isAllowedProductAnalyticsProperty(key)) return safe;

    const normalized = normalizeAnalyticsValue(value);
    if (normalized === null) return safe;

    safe[key] = normalized;
    return safe;
  }, {});
}

export function buildProductAnalyticsEvent(eventName, properties = {}, now = new Date()) {
  if (!KNOWN_EVENTS.has(eventName)) return null;

  return {
    event_name: eventName,
    properties: sanitizeProductAnalyticsProperties(properties),
    occurred_at: now.toISOString(),
  };
}

export async function trackProductAnalyticsEvent(eventName, properties = {}, options = {}) {
  const enabled = options.enabled ?? getProductAnalyticsEnabled();
  const sink = options.sink;

  if (!enabled || typeof sink !== "function") return { queued: false, reason: "disabled" };

  const event = buildProductAnalyticsEvent(eventName, properties, options.now || new Date());
  if (!event) return { queued: false, reason: "unknown_event" };

  try {
    await sink(event);
    return { queued: true, event };
  } catch (error) {
    console.warn("Product analytics event dropped:", error);
    return { queued: false, reason: "sink_error" };
  }
}
