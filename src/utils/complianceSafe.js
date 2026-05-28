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

const COMPLETE_STATUSES = new Set(["logged", "acknowledged", "not_applicable"]);

export function deriveComplianceSafeStatus(item, today = new Date()) {
  const status = String(item?.status || "missing").toLowerCase();
  if (status === "not_applicable") return "not_applicable";
  if (item?.expires_at) {
    const expiry = new Date(`${String(item.expires_at).slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(expiry.getTime())) {
      const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
      if (days < 0) return "expired";
      if (days <= 30) return "expiring_soon";
    }
  }
  return COMPLIANCE_SAFE_STATUSES.includes(status) ? status : "needs_review";
}

export function calculateComplianceRating(items = [], today = new Date()) {
  const relevant = items.filter((item) => deriveComplianceSafeStatus(item, today) !== "not_applicable");
  const total = relevant.length;
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
    const status = deriveComplianceSafeStatus(item, today);
    counts[status] = (counts[status] || 0) + 1;
  }

  const complete = relevant.filter((item) => COMPLETE_STATUSES.has(deriveComplianceSafeStatus(item, today))).length;
  return {
    rating: total === 0 ? 0 : Math.round((complete / total) * 100),
    total,
    complete,
    counts,
  };
}

export function groupComplianceItemsByTenancy(items = []) {
  return items.reduce((groups, item) => {
    const key = item.tenancy_id || item.tenant_id || "unassigned";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}
