import { shortenId } from "./utils";

export function anomalySeverityTone(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "urgent") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200";
  }
  if (normalized === "action") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
  }
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

export function alertStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "resolved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  if (normalized === "acknowledged") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200";
  }
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
}

export function hostedEventKindTone(kind) {
  const normalized = String(kind || "").toLowerCase();
  if (normalized === "authorization_denied") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200";
  }
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
}

function humanizeIdentifier(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function startCase(value) {
  return humanizeIdentifier(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeSecurityKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function describeHostedEventSurface(surface, t) {
  const normalized = normalizeSecurityKey(surface);

  if (!normalized) {
    return t("securityAudit.hostedEvents.summary.unknownSurface");
  }
  if (normalized.includes("command_center")) {
    return t("securityAudit.hostedEvents.surface.commandCenter");
  }
  if (normalized.includes("attention_center")) {
    return t("securityAudit.hostedEvents.surface.attentionCenter");
  }
  if (normalized.includes("portfolio")) {
    return t("securityAudit.hostedEvents.surface.portfolioHealth");
  }
  if (normalized.includes("dashboard")) {
    return t("securityAudit.hostedEvents.surface.dashboard");
  }
  if (normalized.includes("finance") || normalized.includes("payment")) {
    return t("securityAudit.hostedEvents.surface.finance");
  }
  if (normalized.includes("document") || normalized.includes("storage")) {
    return t("securityAudit.hostedEvents.surface.documents");
  }
  if (normalized.includes("invite")) {
    return t("securityAudit.hostedEvents.surface.invitations");
  }
  if (normalized.includes("maintenance")) {
    return t("securityAudit.hostedEvents.surface.maintenance");
  }
  if (normalized.includes("work_order")) {
    return t("securityAudit.hostedEvents.surface.workOrders");
  }
  if (normalized.includes("contractor")) {
    return t("securityAudit.hostedEvents.surface.contractorPortal");
  }
  if (normalized.includes("tenant")) {
    return t("securityAudit.hostedEvents.surface.tenantPortal");
  }
  if (normalized.includes("notification")) {
    return t("securityAudit.hostedEvents.surface.notifications");
  }
  if (normalized.includes("security_audit")) {
    return t("securityAudit.hostedEvents.surface.securityAudit");
  }

  return startCase(surface);
}

export function describeHostedEventReason(reason, t) {
  const normalized = normalizeSecurityKey(reason);

  if (!normalized) {
    return "—";
  }
  if (normalized.includes("guard") || normalized.includes("denied")) {
    return t("securityAudit.hostedEvents.reason.guardDenied");
  }
  if (normalized.includes("rls") || normalized.includes("policy")) {
    return t("securityAudit.hostedEvents.reason.rlsDenied");
  }
  if (normalized.includes("scope")) {
    return t("securityAudit.hostedEvents.reason.scopeMismatch");
  }
  if (normalized.includes("auth")) {
    return t("securityAudit.hostedEvents.reason.authRequired");
  }
  if (normalized.includes("not_found") || normalized.includes("missing")) {
    return t("securityAudit.hostedEvents.reason.recordUnavailable");
  }
  if (normalized.includes("timeout")) {
    return t("securityAudit.hostedEvents.reason.timeout");
  }
  if (normalized.includes("invalid") || normalized.includes("validation")) {
    return t("securityAudit.hostedEvents.reason.invalidRequest");
  }
  if (normalized.includes("error") || normalized.includes("unexpected")) {
    return t("securityAudit.hostedEvents.reason.unexpectedFailure");
  }

  return startCase(reason);
}

export function describeHostedEventKind(kind, t) {
  const normalized = normalizeSecurityKey(kind);
  if (normalized === "authorization_denied") {
    return t("securityAudit.hostedEvents.kind.authorizationDenied");
  }
  if (normalized === "unexpected_security_failure") {
    return t("securityAudit.hostedEvents.kind.unexpectedFailure");
  }
  return startCase(kind) || "—";
}

export function hostedEventSeverity(row) {
  const normalizedKind = normalizeSecurityKey(row?.kind);
  if (row?.guard_denied || normalizedKind === "authorization_denied") {
    return "urgent";
  }
  if (normalizedKind === "unexpected_security_failure") {
    return "action";
  }
  return "info";
}

export function hostedEventSeverityTone(level) {
  if (level === "urgent") {
    return anomalySeverityTone("urgent");
  }
  if (level === "action") {
    return anomalySeverityTone("action");
  }
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

export function describeHostedEventSeverity(level, t) {
  if (level === "urgent") return t("securityAudit.severity.urgent");
  if (level === "action") return t("securityAudit.severity.action");
  return t("securityAudit.severity.info");
}

export function hostedEventRecommendationTone(kind) {
  const normalized = normalizeSecurityKey(kind);
  if (normalized === "authorization_denied") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200";
  }
  return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200";
}

export function describeHostedEventRecommendation(row, t) {
  const normalizedKind = normalizeSecurityKey(row?.kind);
  if (normalizedKind === "authorization_denied") {
    return t("securityAudit.hostedEvents.recommendation.verifyScope");
  }
  return t("securityAudit.hostedEvents.recommendation.traceFailure");
}

export function buildHostedEventSummary(row, t) {
  const kind = String(row?.kind || "").trim().toLowerCase();
  const surface = describeHostedEventSurface(row?.surface, t);
  const entityType = startCase(row?.entity_type) || t("securityAudit.hostedEvents.summary.unknownEntity");

  if (kind === "authorization_denied") {
    return t("securityAudit.hostedEvents.summary.authorizationDenied", {
      surface,
      entityType,
    });
  }

  return t("securityAudit.hostedEvents.summary.unexpectedFailure", {
    surface,
    entityType,
  });
}

export function buildHostedEventContext(row, t) {
  const parts = [];

  if (row?.guard_denied) {
    parts.push(t("securityAudit.hostedEvents.context.guardDenied"));
  }
  if (row?.reason) {
    parts.push(t("securityAudit.hostedEvents.context.reason", { reason: describeHostedEventReason(row.reason, t) }));
  }
  if (row?.entity_type || row?.entity_id) {
    parts.push(
      t("securityAudit.hostedEvents.context.entity", {
        entityType: startCase(row?.entity_type) || t("securityAudit.hostedEvents.summary.unknownEntity"),
        entityId: shortenId(row?.entity_id),
      }),
    );
  }
  if (row?.correlation_id) {
    parts.push(
      t("securityAudit.hostedEvents.context.correlation", {
        correlationId: shortenId(row.correlation_id),
      }),
    );
  }

  return parts.filter(Boolean).join(" • ") || t("securityAudit.metadata.empty");
}

export function summarizeHostedEvents(rows) {
  const summary = {
    total: rows.length,
    denied: 0,
    unexpected: 0,
    guardDenied: 0,
    topSurface: "",
  };

  const surfaceCounts = new Map();
  for (const row of rows) {
    const kind = String(row?.kind || "").trim().toLowerCase();
    const surface = String(row?.surface || "").trim();
    if (kind === "authorization_denied") summary.denied += 1;
    if (kind === "unexpected_security_failure") summary.unexpected += 1;
    if (row?.guard_denied) summary.guardDenied += 1;
    if (surface) {
      surfaceCounts.set(surface, (surfaceCounts.get(surface) || 0) + 1);
    }
  }

  summary.topSurface =
    Array.from(surfaceCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  return summary;
}

export function buildHostedEventRecommendedAction(row, t) {
  const kind = String(row?.kind || "").trim().toLowerCase();
  const surface = describeHostedEventSurface(row?.surface, t);

  if (kind === "authorization_denied") {
    return t("securityAudit.hostedEvents.recommendedAction.authorizationDenied", {
      surface: surface || t("securityAudit.hostedEvents.summary.unknownSurface"),
    });
  }

  return t("securityAudit.hostedEvents.recommendedAction.unexpectedFailure", {
    surface: surface || t("securityAudit.hostedEvents.summary.unknownSurface"),
  });
}

export function buildAnomalyRecommendedAction(alert, t) {
  const severity = String(alert?.severity || "").trim().toLowerCase();
  const classification = String(alert?.classification || "").trim().toLowerCase();

  if (severity === "urgent") {
    return t("securityAudit.anomaly.recommendedAction.urgent");
  }
  if (classification === "suspicious") {
    return t("securityAudit.anomaly.recommendedAction.suspicious");
  }
  if (classification === "false_positive") {
    return t("securityAudit.anomaly.recommendedAction.falsePositive");
  }
  return t("securityAudit.anomaly.recommendedAction.default");
}

export function groupHostedEventCorrelations(rows, limit = 4) {
  const groups = new Map();

  for (const row of rows) {
    const surface = String(row?.surface || "").trim().toLowerCase();
    const entityType = String(row?.entity_type || "").trim().toLowerCase();
    const reason = String(row?.reason || "").trim().toLowerCase();
    const key = `${surface}::${entityType}::${reason}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        surface,
        entityType,
        reason,
        count: 0,
        latestAt: "",
        latestRow: null,
      });
    }

    const group = groups.get(key);
    group.count += 1;
    if (!group.latestAt || String(row?.created_at || "") > group.latestAt) {
      group.latestAt = String(row?.created_at || "");
      group.latestRow = row;
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return String(b.latestAt).localeCompare(String(a.latestAt));
    })
    .slice(0, limit);
}

export function findRelatedAnomalyAlertForHostedEvent(row, alerts) {
  const entityType = normalizeSecurityKey(row?.entity_type);
  const entityId = String(row?.entity_id || "").trim();
  const eventId = String(row?.id || "").trim();

  return (
    alerts.find((alert) => {
      const recommended = alert?.metadata?.recommended_filters || {};
      const alertEntityType = normalizeSecurityKey(alert?.entityType || recommended.entityType);
      const alertEntityId = String(recommended.entityId || "").trim();
      const latestEventId = String(alert?.metadata?.latest_event_id || "").trim();

      if (eventId && latestEventId && eventId === latestEventId) return true;
      return Boolean(entityType && entityId && alertEntityType === entityType && alertEntityId === entityId);
    }) || null
  );
}

export function findRelatedHostedEventForAnomalyAlert(alert, rows) {
  const recommended = alert?.metadata?.recommended_filters || {};
  const entityType = normalizeSecurityKey(alert?.entityType || recommended.entityType);
  const entityId = String(recommended.entityId || "").trim();
  const latestEventId = String(alert?.metadata?.latest_event_id || "").trim();

  return (
    rows.find((row) => {
      const rowId = String(row?.id || "").trim();
      if (latestEventId && rowId && latestEventId === rowId) return true;

      const rowEntityType = normalizeSecurityKey(row?.entity_type);
      const rowEntityId = String(row?.entity_id || "").trim();
      return Boolean(entityType && entityId && rowEntityType === entityType && rowEntityId === entityId);
    }) || null
  );
}
