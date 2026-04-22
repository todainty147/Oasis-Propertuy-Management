export function tenantTimelineCategoryForType(type) {
  const value = String(type || "").trim().toLowerCase();
  if (value.startsWith("payment_")) return "payments";
  if (
    value.includes("maintenance") ||
    value.includes("request_status") ||
    value.includes("contractor_assigned") ||
    value.includes("work_order")
  ) {
    return "maintenance";
  }
  if (value.startsWith("document_")) return "documents";
  if (value.startsWith("lease_") || value === "tenant_created") return "lease";
  return "general";
}

export function tenantTimelineGroupKeyForDate(value, now = new Date()) {
  if (!value) return "earlier";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "earlier";

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const lastWeek = new Date(startOfToday);
  lastWeek.setDate(lastWeek.getDate() - 7);

  if (d >= startOfToday) return "today";
  if (d >= startOfYesterday) return "yesterday";
  if (d >= lastWeek) return "last7";
  return "earlier";
}

export function filterTenantTimelineItems(items, filter) {
  if (filter === "all") return items;
  return items.filter((item) => tenantTimelineCategoryForType(item?.type) === filter);
}

export function groupTenantTimelineItems(items, now = new Date()) {
  const groups = {
    today: [],
    yesterday: [],
    last7: [],
    earlier: [],
  };

  items.forEach((item) => {
    groups[tenantTimelineGroupKeyForDate(item?.at, now)].push(item);
  });

  return groups;
}
