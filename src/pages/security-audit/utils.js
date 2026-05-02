export const DEFAULT_FILTERS = {
  dateFrom: "",
  dateTo: "",
  action: "",
  actorUserId: "",
  entityType: "",
  entityId: "",
};

export const ALERT_CLASSIFICATIONS = ["suspicious", "expected", "false_positive", "informational"];
export const HIDDEN_EXPORT_JOBS_STORAGE_KEY = "securityAuditHiddenExportJobs";
export const HOSTED_EVENT_KINDS = ["authorization_denied", "unexpected_security_failure"];

export const DEFAULT_HOSTED_EVENT_FILTERS = {
  category: "",
  kind: "",
  surface: "",
  limit: 25,
};

export function filtersFromSearchParams(searchParams) {
  return {
    dateFrom: searchParams.get("from") || "",
    dateTo: searchParams.get("to") || "",
    action: searchParams.get("action") || "",
    actorUserId: searchParams.get("actor") || "",
    entityType: searchParams.get("entityType") || "",
    entityId: searchParams.get("entityId") || "",
  };
}

export function pageFromSearchParams(searchParams) {
  return Math.max(Number(searchParams.get("page")) || 1, 1);
}

export function alertStatusFromSearchParams(searchParams) {
  const value = String(searchParams.get("alertStatus") || "active").trim().toLowerCase();
  return ["active", "open", "acknowledged", "resolved"].includes(value) ? value : "active";
}

export function focusedAlertIdFromSearchParams(searchParams) {
  return searchParams.get("alert") || "";
}

export function focusedHostedEventIdFromSearchParams(searchParams) {
  return searchParams.get("hosted") || "";
}

export function buildSearchParams(filters, page, selectedEventId, alertStatus, focusedAlertId, focusedHostedEventId) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
  if (filters.action) params.set("action", filters.action);
  if (filters.actorUserId) params.set("actor", filters.actorUserId);
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.entityId) params.set("entityId", filters.entityId);
  if (alertStatus && alertStatus !== "active") params.set("alertStatus", alertStatus);
  if (page > 1) params.set("page", String(page));
  if (selectedEventId) params.set("event", selectedEventId);
  if (focusedAlertId) params.set("alert", focusedAlertId);
  if (focusedHostedEventId) params.set("hosted", focusedHostedEventId);
  return params;
}

export function sanitizeFilePart(value, fallback) {
  const cleaned = String(value || fallback || "export")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "_");
  return cleaned || fallback;
}

export function escapeSqlLiteral(value) {
  return String(value || "").replaceAll("'", "''");
}

export function formatDateTime(value) {
  const next = value ? new Date(value) : null;
  if (!next || Number.isNaN(next.getTime())) return "—";
  return next.toLocaleString();
}

export function formatBytes(value) {
  const next = Number(value || 0);
  if (!Number.isFinite(next) || next <= 0) return "—";
  if (next < 1024) return `${next} B`;
  if (next < 1024 * 1024) return `${(next / 1024).toFixed(1)} KB`;
  return `${(next / (1024 * 1024)).toFixed(1)} MB`;
}

export function clampInt(value, fallback, min, max) {
  const next = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(next, min), max);
}

export function shortenId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  if (raw.length <= 14) return raw;
  return `${raw.slice(0, 8)}…${raw.slice(-4)}`;
}

export function summarizeMetadata(metadata, t) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return t("securityAudit.metadata.empty");
  }

  const prioritizedKeys = [
    "old_role",
    "new_role",
    "target_user_id",
    "accepted_user_id",
    "contractor_user_id",
    "document_id",
    "stripe_subscription_id",
    "old_plan",
    "new_plan",
  ];

  const parts = [];

  for (const key of prioritizedKeys) {
    const value = metadata[key];
    if (value === null || value === undefined || value === "") continue;
    parts.push(`${key}: ${String(value)}`);
    if (parts.length >= 3) break;
  }

  if (parts.length === 0) {
    const entries = Object.entries(metadata).slice(0, 3);
    for (const [key, value] of entries) {
      parts.push(`${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
    }
  }

  return parts.length > 0 ? parts.join(" • ") : t("securityAudit.metadata.empty");
}

export function hiddenExportJobsKey(accountId) {
  return `${HIDDEN_EXPORT_JOBS_STORAGE_KEY}:${accountId || "unknown"}`;
}
