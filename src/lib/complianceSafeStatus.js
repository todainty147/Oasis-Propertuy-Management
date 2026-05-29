export const COMPLIANCE_SAFE_STATUSES = [
  "missing",
  "logged",
  "acknowledged",
  "expiring_soon",
  "expired",
  "needs_review",
  "not_applicable",
];

export const COMPLIANCE_SAFE_STATUS_LABELS = {
  missing: "Missing",
  logged: "Evidence logged",
  acknowledged: "Tenant acknowledged",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  needs_review: "Needs review",
  not_applicable: "Not applicable",
};

const COMPLETE_STATUSES = new Set(["logged", "acknowledged", "expiring_soon"]);
const WARNING_STATUSES = new Set(["expiring_soon"]);
const INCOMPLETE_STATUSES = new Set(["missing", "expired", "needs_review"]);

function toDateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeComplianceStatus(status) {
  const next = String(status || "missing").trim().toLowerCase();
  if (next === "evidence_logged") return "logged";
  return COMPLIANCE_SAFE_STATUSES.includes(next) ? next : "needs_review";
}

export function isExpiringSoon(item, currentDate = new Date()) {
  const expiry = toDateOnly(item?.expires_at);
  if (!expiry) return false;
  const today = toDateOnly(currentDate) || new Date();
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
  const reminderDays = Number.isFinite(Number(item?.reminder_days_before))
    ? Number(item.reminder_days_before)
    : 30;
  return days >= 0 && days <= reminderDays;
}

export function deriveComplianceItemStatus(item, currentDate = new Date()) {
  const status = normalizeComplianceStatus(item?.status);
  if (status === "not_applicable") return "not_applicable";
  if (status === "needs_review") return "needs_review";

  const expiry = toDateOnly(item?.expires_at);
  if (expiry) {
    const today = toDateOnly(currentDate) || new Date();
    const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
    if (days < 0) return "expired";
    if (isExpiringSoon(item, today)) return "expiring_soon";
  }

  return status;
}

export function getComplianceSummary(items = [], currentDate = new Date()) {
  const counts = {
    missing: 0,
    logged: 0,
    acknowledged: 0,
    expiring_soon: 0,
    expired: 0,
    needs_review: 0,
    not_applicable: 0,
  };

  for (const item of items) {
    const status = deriveComplianceItemStatus(item, currentDate);
    counts[status] = (counts[status] || 0) + 1;
  }

  const relevant = items.filter((item) => deriveComplianceItemStatus(item, currentDate) !== "not_applicable");
  const complete = relevant.filter((item) => COMPLETE_STATUSES.has(deriveComplianceItemStatus(item, currentDate))).length;
  const warnings = relevant.filter((item) => WARNING_STATUSES.has(deriveComplianceItemStatus(item, currentDate))).length;
  const incomplete = relevant.filter((item) => INCOMPLETE_STATUSES.has(deriveComplianceItemStatus(item, currentDate))).length;

  return {
    total: relevant.length,
    complete,
    warnings,
    incomplete,
    counts,
    rating: relevant.length === 0 ? 0 : Math.round((complete / relevant.length) * 100),
  };
}

export function calculateComplianceRating(items = [], currentDate = new Date()) {
  return getComplianceSummary(items, currentDate);
}

