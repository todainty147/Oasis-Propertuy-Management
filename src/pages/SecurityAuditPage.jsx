import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Shield,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";

import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { usePageTitle } from "../layout/PageTitleContext";
import {
  applySecurityAlertWorkflow,
  getSecurityAuditEvent,
  getSecurityAuditExportDownloadUrl,
  listSecurityAnomalyAlerts,
  listSecurityAlertAssignees,
  listSecurityAlertHistory,
  listSecurityAuditEvents,
  listSecurityAuditExportJobs,
  listSecurityAuditEventsForExport,
  listSecurityAuditFilterOptions,
  requestSecurityAuditBackendExport,
  runSecurityAuditExportJob,
  SECURITY_AUDIT_BACKEND_EXPORT_THRESHOLD,
} from "../services/securityAuditService";
import {
  getAccountSecuritySettings,
  upsertAccountSecuritySettings,
} from "../services/securitySettingsService";
import { listSecurityObservabilityEvents } from "../services/securityObservabilityService";
import { downloadTextFile, buildCsv } from "../utils/export";
import { isManageRole } from "../utils/permissions";
import OnboardingHintCard from "../components/OnboardingHintCard";

const DEFAULT_FILTERS = {
  dateFrom: "",
  dateTo: "",
  action: "",
  actorUserId: "",
  entityType: "",
  entityId: "",
};

const ALERT_CLASSIFICATIONS = ["suspicious", "expected", "false_positive", "informational"];
const HIDDEN_EXPORT_JOBS_STORAGE_KEY = "securityAuditHiddenExportJobs";
const HOSTED_EVENT_KINDS = ["authorization_denied", "unexpected_security_failure"];

const DEFAULT_HOSTED_EVENT_FILTERS = {
  category: "",
  kind: "",
  surface: "",
  limit: 25,
};

function filtersFromSearchParams(searchParams) {
  return {
    dateFrom: searchParams.get("from") || "",
    dateTo: searchParams.get("to") || "",
    action: searchParams.get("action") || "",
    actorUserId: searchParams.get("actor") || "",
    entityType: searchParams.get("entityType") || "",
    entityId: searchParams.get("entityId") || "",
  };
}

function pageFromSearchParams(searchParams) {
  return Math.max(Number(searchParams.get("page")) || 1, 1);
}

function alertStatusFromSearchParams(searchParams) {
  const value = String(searchParams.get("alertStatus") || "active").trim().toLowerCase();
  return ["active", "open", "acknowledged", "resolved"].includes(value) ? value : "active";
}

function focusedAlertIdFromSearchParams(searchParams) {
  return searchParams.get("alert") || "";
}

function focusedHostedEventIdFromSearchParams(searchParams) {
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

function sanitizeFilePart(value, fallback) {
  const cleaned = String(value || fallback || "export")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "_");
  return cleaned || fallback;
}

function escapeSqlLiteral(value) {
  return String(value || "").replaceAll("'", "''");
}

function formatDateTime(value) {
  const next = value ? new Date(value) : null;
  if (!next || Number.isNaN(next.getTime())) return "—";
  return next.toLocaleString();
}

function formatBytes(value) {
  const next = Number(value || 0);
  if (!Number.isFinite(next) || next <= 0) return "—";
  if (next < 1024) return `${next} B`;
  if (next < 1024 * 1024) return `${(next / 1024).toFixed(1)} KB`;
  return `${(next / (1024 * 1024)).toFixed(1)} MB`;
}

function clampInt(value, fallback, min, max) {
  const next = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(next, min), max);
}

function shortenId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  if (raw.length <= 14) return raw;
  return `${raw.slice(0, 8)}…${raw.slice(-4)}`;
}

function summarizeMetadata(metadata, t) {
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

function hiddenExportJobsKey(accountId) {
  return `${HIDDEN_EXPORT_JOBS_STORAGE_KEY}:${accountId || "unknown"}`;
}

function AuditRow({ row, expanded, onToggle, onReview, t }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="grid gap-3 px-4 py-3 md:grid-cols-[1.3fr_1fr_1fr_1.2fr_auto] md:items-start">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.columns.timestamp")}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            {formatDateTime(row.created_at)}
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.columns.action")}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{row.action}</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.columns.actor")}
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            {row.actor_user_id ? row.actorLabel || shortenId(row.actor_user_id) : t("securityAudit.systemActor")}
          </p>
          {row.actor_user_id && row.actorLabel ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{shortenId(row.actor_user_id)}</p>
          ) : null}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.columns.entity")}
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            {row.entityLabel || row.entity_type || "—"}
          </p>
          {row.entity_id ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{shortenId(row.entity_id)}</p>
          ) : null}
        </div>

        <div className="flex md:justify-end">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => onReview(row.id)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {t("securityAudit.review")}
            </button>
            <button
              type="button"
              onClick={() => onToggle(row.id)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span>{expanded ? t("securityAudit.hideDetails") : t("securityAudit.showDetails")}</span>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
        <p>{summarizeMetadata(row.metadata, t)}</p>
      </div>

      {expanded ? (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-200">
            {JSON.stringify(row.metadata || {}, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 break-all text-sm text-slate-900 dark:text-slate-100">{value || "—"}</p>
    </div>
  );
}

export function InvestigationContextStrip({
  summary,
  focusedHostedEvent,
  focusedAnomalyAlert,
  selectedEvent,
  onClear,
  onAcknowledgeAlert,
  onResolveAlert,
  onShowWorkflow,
  busyAlertAction,
  t,
}) {
  const alertStatus = String(focusedAnomalyAlert?.status || "").toLowerCase();
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/60 dark:bg-blue-950/30">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-200">
            {t("securityAudit.investigationContext.title")}
          </p>
          <p className="mt-1 text-sm text-blue-900 dark:text-blue-100">
            {summary || t("securityAudit.investigationContext.empty")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {focusedHostedEvent ? (
              <span
                className={`rounded-full border px-2 py-1 text-xs ${hostedEventSeverityTone(
                  hostedEventSeverity(focusedHostedEvent),
                )}`}
              >
                {describeHostedEventSeverity(hostedEventSeverity(focusedHostedEvent), t)}
              </span>
            ) : null}
            {focusedAnomalyAlert ? (
              <span className={`rounded-full border px-2 py-1 text-xs ${anomalySeverityTone(focusedAnomalyAlert.severity)}`}>
                {t("securityAudit.investigationContext.badgeAnomaly", {
                  severity: String(focusedAnomalyAlert.severity || "info"),
                })}
              </span>
            ) : null}
            {selectedEvent ? (
              <span className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                {t("securityAudit.investigationContext.badgeLedger")}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {focusedAnomalyAlert ? (
            <>
              <button
                type="button"
                onClick={onShowWorkflow}
                className="rounded-lg border border-blue-300 bg-white/70 px-3 py-2 text-sm text-blue-700 transition hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-100 dark:hover:bg-blue-900/60"
              >
                {t("securityAudit.investigationContext.showAlertWorkflow")}
              </button>
              <button
                type="button"
                onClick={onAcknowledgeAlert}
                disabled={!onAcknowledgeAlert || busyAlertAction === "acknowledge" || alertStatus !== "open"}
                className="rounded-lg border border-blue-300 bg-white/70 px-3 py-2 text-sm text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-100 dark:hover:bg-blue-900/60"
              >
                {t("securityAudit.alert.actions.acknowledge")}
              </button>
              <button
                type="button"
                onClick={onResolveAlert}
                disabled={!onResolveAlert || busyAlertAction === "resolve" || alertStatus === "resolved"}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
              >
                {t("securityAudit.alert.actions.resolve")}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-blue-300 bg-white/70 px-3 py-2 text-sm text-blue-700 transition hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-100 dark:hover:bg-blue-900/60"
          >
            {t("securityAudit.investigationContext.clear")}
          </button>
        </div>
      </div>
    </div>
  );
}

function buildTimelineDetail(parts) {
  return parts.filter(Boolean).join(" • ");
}

function hasActiveHostedEventFilters(filters) {
  return Boolean(filters?.category || filters?.kind || filters?.surface);
}

export function buildHostedEventsEmptyGuidance(filters, t) {
  if (hasActiveHostedEventFilters(filters)) {
    return {
      title: t("securityAudit.hostedEvents.emptyGuidance.filteredTitle"),
      body: t("securityAudit.hostedEvents.emptyGuidance.filteredBody"),
      checks: [
        t("securityAudit.hostedEvents.emptyGuidance.checkFilters"),
        t("securityAudit.hostedEvents.emptyGuidance.checkLimit"),
      ],
    };
  }

  return {
    title: t("securityAudit.hostedEvents.emptyGuidance.quietTitle"),
    body: t("securityAudit.hostedEvents.emptyGuidance.quietBody"),
    checks: [
      t("securityAudit.hostedEvents.emptyGuidance.tryNotificationDenial"),
      t("securityAudit.hostedEvents.emptyGuidance.tryStorageDenial"),
      t("securityAudit.hostedEvents.emptyGuidance.tryScopeDenial"),
    ],
  };
}

export function buildAnomalyEmptyGuidance(t) {
  return {
    title: t("securityAudit.anomaliesEmptyGuidance.title"),
    body: t("securityAudit.anomaliesEmptyGuidance.body"),
    checks: [
      t("securityAudit.anomaliesEmptyGuidance.checkThresholds"),
      t("securityAudit.anomaliesEmptyGuidance.tryDeletePattern"),
      t("securityAudit.anomaliesEmptyGuidance.tryRolePattern"),
    ],
  };
}

export function buildAnomalyFlagContext(alert, t) {
  const recommended = alert?.metadata?.recommended_filters || {};
  const entityType = startCase(alert?.entityType || recommended.entityType);
  const entityId = String(alert?.entityId || recommended.entityId || "").trim();
  const actorUserId = String(alert?.actorUserId || recommended.actorUserId || "").trim();
  const actorLabel = String(alert?.actorLabel || "").trim();
  const action = String(recommended.action || "").trim();
  const parts = [];

  if (entityType) {
    parts.push(
      t("securityAudit.anomaly.flagContext.entity", {
        entityType,
        entityId: entityId ? shortenId(entityId) : "—",
      }),
    );
  }
  if (alert?.alertCount > 1) {
    parts.push(t("securityAudit.anomaly.flagContext.repeatCount", { count: String(alert.alertCount) }));
  }
  if (action) {
    parts.push(t("securityAudit.anomaly.flagContext.action", { action }));
  }
  if (actorLabel || actorUserId) {
    parts.push(
      t("securityAudit.anomaly.flagContext.actor", {
        actor: actorLabel || shortenId(actorUserId),
      }),
    );
  }
  if (alert?.lastSeenAt) {
    parts.push(
      t("securityAudit.anomaly.flagContext.lastSeen", {
        timestamp: formatDateTime(alert.lastSeenAt),
      }),
    );
  }

  return parts.filter(Boolean).join(" • ");
}

function buildAlertWorkflowSummary(alert, t) {
  const parts = [];
  if (alert?.status) {
    parts.push(t("securityAudit.alert.workflowSummary.status", { status: String(alert.status) }));
  }
  if (alert?.assignedToLabel || alert?.assignedToUserId) {
    parts.push(
      t("securityAudit.alert.workflowSummary.assignee", {
        assignee: alert.assignedToLabel || shortenId(alert.assignedToUserId),
      }),
    );
  }
  if (alert?.classification) {
    parts.push(
      t("securityAudit.alert.workflowSummary.classification", {
        classification: String(alert.classification),
      }),
    );
  }
  return parts.filter(Boolean).join(" • ");
}

export function buildInvestigationEntityContext({ hostedEvent, anomalyAlert, selectedEvent, t }) {
  const recommended = anomalyAlert?.metadata?.recommended_filters || {};
  const entityType =
    hostedEvent?.entity_type ||
    anomalyAlert?.entityType ||
    selectedEvent?.entity_type ||
    recommended.entityType ||
    "";
  const entityId =
    hostedEvent?.entity_id ||
    anomalyAlert?.entityId ||
    selectedEvent?.entity_id ||
    recommended.entityId ||
    "";
  const entityLabel =
    anomalyAlert?.entityLabel ||
    selectedEvent?.entityLabel ||
    "";
  const actor =
    anomalyAlert?.actorLabel ||
    anomalyAlert?.actorUserId ||
    selectedEvent?.actorLabel ||
    selectedEvent?.actor_user_id ||
    "";
  const correlationId =
    hostedEvent?.correlation_id ||
    selectedEvent?.metadata?.correlation_id ||
    "";
  const reason =
    hostedEvent?.reason ||
    selectedEvent?.metadata?.reason ||
    selectedEvent?.metadata?.code ||
    "";
  const surface = hostedEvent?.surface || "";
  const details = [
    {
      label: t("securityAudit.entityContext.entity"),
      value: entityType ? `${startCase(entityType)}${entityId ? ` (${shortenId(entityId)})` : ""}` : "—",
    },
    {
      label: t("securityAudit.entityContext.label"),
      value: entityLabel || "—",
    },
    {
      label: t("securityAudit.columns.actor"),
      value: actor || t("securityAudit.systemActor"),
    },
    {
      label: t("securityAudit.entityContext.surface"),
      value: surface ? describeHostedEventSurface(surface, t) : "—",
    },
    {
      label: t("securityAudit.detail.reason"),
      value: reason ? describeHostedEventReason(reason, t) : "—",
    },
    {
      label: t("securityAudit.entityContext.correlation"),
      value: correlationId ? shortenId(correlationId) : "—",
    },
  ];

  if (anomalyAlert) {
    details.push({
      label: t("securityAudit.entityContext.alertStatus"),
      value: anomalyAlert.status || "—",
    });
    details.push({
      label: t("securityAudit.alert.classification"),
      value: anomalyAlert.classification || "—",
    });
  }

  if (selectedEvent?.action) {
    details.push({
      label: t("securityAudit.entityContext.latestLedgerAction"),
      value: selectedEvent.action,
    });
  }

  return details;
}

function pushUniqueLink(links, seen, item) {
  if (!item?.to || !item?.label) return;
  const key = `${item.to}:${item.label}`;
  if (seen.has(key)) return;
  seen.add(key);
  links.push(item);
}

function withLinkDetail(label, detail, t) {
  const nextDetail = String(detail || "").trim();
  if (!nextDetail) return label;
  return t("securityAudit.relatedLinks.named", { label, detail: nextDetail });
}

export function buildInvestigationEntityLinks({ hostedEvent, anomalyAlert, selectedEvent, t }) {
  const recommended = anomalyAlert?.metadata?.recommended_filters || {};
  const eventMetadata = selectedEvent?.metadata || {};
  const links = [];
  const seen = new Set();
  const entityType = String(
    hostedEvent?.entity_type ||
      anomalyAlert?.entityType ||
      selectedEvent?.entity_type ||
      recommended.entityType ||
      "",
  )
    .trim()
    .toLowerCase();
  const entityId = String(
    hostedEvent?.entity_id ||
      anomalyAlert?.entityId ||
      selectedEvent?.entity_id ||
      recommended.entityId ||
      "",
  ).trim();
  const entityLabel = String(anomalyAlert?.entityLabel || selectedEvent?.entityLabel || "").trim();
  const propertyLabel = String(eventMetadata.property_label || eventMetadata.property_address || "").trim();
  const tenantLabel = String(eventMetadata.tenant_label || "").trim();
  const workOrderLabel = String(eventMetadata.work_order_label || eventMetadata.contractor_name || "").trim();
  const documentLabel = String(eventMetadata.document_name || "").trim();

  if (entityType === "property" && entityId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.property"), entityLabel, t),
      to: `/properties/${entityId}`,
    });
  }
  if (entityType === "tenant" && entityId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.tenant"), entityLabel, t),
      to: `/tenants/${entityId}`,
    });
  }
  if (entityType === "work_order" && entityId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.workOrder"), entityLabel, t),
      to: `/work-orders/${entityId}`,
    });
  }
  if (entityType === "document" && entityId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.document"), entityLabel, t),
      to: `/documents?doc=${entityId}`,
    });
  }
  if (entityType === "account_invitation" || entityType === "account_member") {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.invitations"),
      to: "/invitations",
    });
  }
  if (entityType === "payment") {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.finance"),
      to: "/finance",
    });
  }
  if (entityType === "maintenance_request") {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.maintenance"),
      to: "/maintenance-inbox",
    });
  }

  const propertyId = String(eventMetadata.property_id || "").trim();
  if (propertyId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.property"), propertyLabel, t),
      to: `/properties/${propertyId}`,
    });
  }
  const tenantId = String(eventMetadata.tenant_id || "").trim();
  if (tenantId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.tenant"), tenantLabel, t),
      to: `/tenants/${tenantId}`,
    });
  }
  const workOrderId = String(eventMetadata.work_order_id || eventMetadata.entity_work_order_id || "").trim();
  if (workOrderId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.workOrder"), workOrderLabel, t),
      to: `/work-orders/${workOrderId}`,
    });
  }
  const documentId = String(eventMetadata.document_id || "").trim();
  if (documentId) {
    pushUniqueLink(links, seen, {
      label: withLinkDetail(t("securityAudit.relatedLinks.document"), documentLabel, t),
      to: `/documents?doc=${documentId}`,
    });
  }
  const maintenanceRequestId = String(eventMetadata.maintenance_request_id || "").trim();
  if (maintenanceRequestId) {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.maintenance"),
      to: "/maintenance-inbox",
    });
  }

  const surface = String(hostedEvent?.surface || "").trim().toLowerCase();
  if (surface === "finance") {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.finance"),
      to: "/finance",
    });
  }
  if (["maintenance", "command_center", "attention_center"].includes(surface)) {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.maintenance"),
      to: "/maintenance-inbox",
    });
  }
  if (surface === "documents") {
    pushUniqueLink(links, seen, {
      label: t("securityAudit.relatedLinks.documents"),
      to: "/documents",
    });
  }

  return links.slice(0, 6);
}

export function buildInvestigationTimelineItems({ hostedEvent, anomalyAlert, selectedEvent, t }) {
  const items = [];

  if (hostedEvent?.created_at) {
    items.push({
      id: `hosted:${hostedEvent.id || hostedEvent.created_at}`,
      type: "hosted",
      timestamp: hostedEvent.created_at,
      title: t("securityAudit.timeline.hostedEvent"),
      badge: describeHostedEventSeverity(hostedEventSeverity(hostedEvent), t),
      detail: buildTimelineDetail([
        describeHostedEventKind(hostedEvent.kind, t),
        describeHostedEventSurface(hostedEvent.surface, t),
        describeHostedEventReason(hostedEvent.reason, t),
      ]),
    });
  }

  if (anomalyAlert?.createdAt) {
    items.push({
      id: `anomaly-opened:${anomalyAlert.id || anomalyAlert.createdAt}`,
      type: "anomaly",
      timestamp: anomalyAlert.createdAt,
      title: t("securityAudit.timeline.anomalyOpened"),
      badge: t(`securityAudit.severity.${String(anomalyAlert.severity || "info").toLowerCase()}`),
      detail: buildTimelineDetail([anomalyAlert.title, anomalyAlert.summary]),
    });
  }

  if (anomalyAlert?.lastSeenAt) {
    items.push({
      id: `anomaly-last-seen:${anomalyAlert.id || anomalyAlert.lastSeenAt}`,
      type: "anomaly",
      timestamp: anomalyAlert.lastSeenAt,
      title: t("securityAudit.timeline.anomalyLastSeen"),
      badge: t(`securityAudit.alertStatus.${String(anomalyAlert.status || "open").toLowerCase()}`),
      detail: buildAnomalyFlagContext(anomalyAlert, t),
    });
  }

  if (selectedEvent?.created_at) {
    items.push({
      id: `ledger:${selectedEvent.id || selectedEvent.created_at}`,
      type: "ledger",
      timestamp: selectedEvent.created_at,
      title: t("securityAudit.timeline.ledgerEvent"),
      badge: t("securityAudit.investigationContext.badgeLedger"),
      detail: buildTimelineDetail([
        selectedEvent.action || "—",
        startCase(selectedEvent.entity_type) || "",
        selectedEvent.entity_id ? shortenId(selectedEvent.entity_id) : "",
      ]),
    });
  }

  return items
    .filter((item) => item.timestamp)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

function timelineTone(type) {
  if (type === "hosted") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
  }
  if (type === "anomaly") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

function InvestigationTimeline({ items, t }) {
  if (!items.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("securityAudit.timeline.title")}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("securityAudit.timeline.subtitle")}
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/40"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.detail || "—"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {item.badge ? (
                  <span className={`rounded-full border px-2 py-1 text-xs ${timelineTone(item.type)}`}>
                    {item.badge}
                  </span>
                ) : null}
                <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(item.timestamp)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvestigationEntityPanel({ details, t }) {
  if (!details.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t("securityAudit.entityContext.title")}
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("securityAudit.entityContext.subtitle")}
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {details.map((item) => (
          <DetailField key={`${item.label}:${item.value}`} label={item.label} value={item.value} />
        ))}
      </div>
    </div>
  );
}

function InvestigationRelatedLinks({ links, t }) {
  if (!links.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t("securityAudit.relatedLinks.title")}
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("securityAudit.relatedLinks.subtitle")}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((item) => (
          <Link
            key={`${item.to}:${item.label}`}
            to={item.to}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function anomalySeverityTone(severity) {
  const normalized = String(severity || "").toLowerCase();
  if (normalized === "urgent") {
    return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200";
  }
  if (normalized === "action") {
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
  }
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function alertStatusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "resolved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  if (normalized === "acknowledged") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200";
  }
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200";
}

function hostedEventKindTone(kind) {
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

function startCase(value) {
  return humanizeIdentifier(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeSecurityKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function describeHostedEventSurface(surface, t) {
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

function describeHostedEventReason(reason, t) {
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

function describeHostedEventKind(kind, t) {
  const normalized = normalizeSecurityKey(kind);
  if (normalized === "authorization_denied") {
    return t("securityAudit.hostedEvents.kind.authorizationDenied");
  }
  if (normalized === "unexpected_security_failure") {
    return t("securityAudit.hostedEvents.kind.unexpectedFailure");
  }
  return startCase(kind) || "—";
}

function hostedEventSeverity(row) {
  const normalizedKind = normalizeSecurityKey(row?.kind);
  if (row?.guard_denied || normalizedKind === "authorization_denied") {
    return "urgent";
  }
  if (normalizedKind === "unexpected_security_failure") {
    return "action";
  }
  return "info";
}

function hostedEventSeverityTone(level) {
  if (level === "urgent") {
    return anomalySeverityTone("urgent");
  }
  if (level === "action") {
    return anomalySeverityTone("action");
  }
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function describeHostedEventSeverity(level, t) {
  if (level === "urgent") return t("securityAudit.severity.urgent");
  if (level === "action") return t("securityAudit.severity.action");
  return t("securityAudit.severity.info");
}

function hostedEventRecommendationTone(kind) {
  const normalized = normalizeSecurityKey(kind);
  if (normalized === "authorization_denied") {
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200";
  }
  return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-200";
}

function describeHostedEventRecommendation(row, t) {
  const normalizedKind = normalizeSecurityKey(row?.kind);
  if (normalizedKind === "authorization_denied") {
    return t("securityAudit.hostedEvents.recommendation.verifyScope");
  }
  return t("securityAudit.hostedEvents.recommendation.traceFailure");
}

function buildHostedEventSummary(row, t) {
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

function buildHostedEventContext(row, t) {
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

function summarizeHostedEvents(rows) {
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

function buildHostedEventRecommendedAction(row, t) {
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

function buildAnomalyRecommendedAction(alert, t) {
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

function groupHostedEventCorrelations(rows, limit = 4) {
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

function buildInvestigationContextSummary({
  hostedEvent,
  anomalyAlert,
  selectedEvent,
  filters,
  t,
}) {
  const entityType =
    hostedEvent?.entity_type ||
    anomalyAlert?.entityType ||
    selectedEvent?.entity_type ||
    filters.entityType ||
    "";
  const entityId =
    hostedEvent?.entity_id ||
    anomalyAlert?.metadata?.recommended_filters?.entityId ||
    selectedEvent?.entity_id ||
    filters.entityId ||
    "";

  const parts = [];

  if (entityType) {
    parts.push(
      t("securityAudit.investigationContext.entity", {
        entityType: startCase(entityType),
        entityId: entityId ? shortenId(entityId) : "—",
      }),
    );
  }
  if (hostedEvent) {
    parts.push(
      t("securityAudit.investigationContext.hostedEvent", {
        kind: describeHostedEventKind(hostedEvent.kind, t),
      }),
    );
  }
  if (anomalyAlert) {
    parts.push(
      t("securityAudit.investigationContext.anomaly", {
        title: anomalyAlert.title || t("securityAudit.anomaliesTitle"),
      }),
    );
  }
  if (selectedEvent) {
    parts.push(
      t("securityAudit.investigationContext.ledgerEvent", {
        action: selectedEvent.action || "—",
      }),
    );
  }

  return parts.join(" • ");
}

export default function SecurityAuditPage() {
  const { setTitle } = usePageTitle();
  const { t } = useI18n();
  const { activeAccountId, activeAccount, activeRole, isRootOperator } = useAccount();
  const [searchParams, setSearchParams] = useSearchParams();

  const role = useMemo(() => String(activeRole || "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => isManageRole(role, { isRootOperator }), [isRootOperator, role]);

  const [filters, setFilters] = useState(() => filtersFromSearchParams(searchParams));
  const [page, setPage] = useState(() => pageFromSearchParams(searchParams));
  const [alertStatus, setAlertStatus] = useState(() => alertStatusFromSearchParams(searchParams));
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(25);
  const [facets, setFacets] = useState({ actions: [], actorUserIds: [], entityTypes: [], entities: [] });
  const [expandedRows, setExpandedRows] = useState({});
  const [anomalyAlerts, setAnomalyAlerts] = useState([]);
  const [alertAssignees, setAlertAssignees] = useState([]);
  const [expandedAlerts, setExpandedAlerts] = useState({});
  const [alertHistoryById, setAlertHistoryById] = useState({});
  const [alertDrafts, setAlertDrafts] = useState({});
  const [alertBusyKey, setAlertBusyKey] = useState("");
  const [exportJobs, setExportJobs] = useState([]);
  const [anomalyAlertsTotal, setAnomalyAlertsTotal] = useState(0);
  const [anomalyAlertsPage, setAnomalyAlertsPage] = useState(1);
  const [anomalyAlertsPageSize, setAnomalyAlertsPageSize] = useState(5);
  const [focusedAlertId, setFocusedAlertId] = useState(() => focusedAlertIdFromSearchParams(searchParams));
  const [focusedHostedEventId, setFocusedHostedEventId] = useState(() => focusedHostedEventIdFromSearchParams(searchParams));
  const [exportJobsTotal, setExportJobsTotal] = useState(0);
  const [exportJobsPage, setExportJobsPage] = useState(1);
  const [exportJobsPageSize, setExportJobsPageSize] = useState(5);
  const [hiddenExportJobIds, setHiddenExportJobIds] = useState([]);
  const [backendExportLabel, setBackendExportLabel] = useState("");
  const [securitySettings, setSecuritySettings] = useState(null);
  const [securitySettingsDraft, setSecuritySettingsDraft] = useState(null);
  const [hostedEventFilters, setHostedEventFilters] = useState(DEFAULT_HOSTED_EVENT_FILTERS);
  const [hostedEvents, setHostedEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(() => searchParams.get("event") || "");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hostedExporting, setHostedExporting] = useState(false);
  const [backendExporting, setBackendExporting] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [downloadingJobId, setDownloadingJobId] = useState("");
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    setTitle(t("securityAudit.pageTitle"));
  }, [setTitle, t]);

  useEffect(() => {
    setSearchParams(
      buildSearchParams(
        filters,
        page,
        selectedEventId,
        alertStatus,
        focusedAlertId,
        focusedHostedEventId,
      ),
      { replace: true },
    );
  }, [alertStatus, filters, focusedAlertId, focusedHostedEventId, page, selectedEventId, setSearchParams]);

  async function load() {
    if (!activeAccountId || !canManage) return;

    setLoading(true);
    setError("");

    try {
      const [events, nextFacets, nextAlerts, nextJobs, nextAssignees, nextSecuritySettings, nextHostedEvents] = await Promise.all([
        listSecurityAuditEvents(activeAccountId, { ...filters, page, pageSize }),
        listSecurityAuditFilterOptions(activeAccountId),
        listSecurityAnomalyAlerts(activeAccountId, {
          status: alertStatus,
          page: anomalyAlertsPage,
          pageSize: anomalyAlertsPageSize,
        }),
        listSecurityAuditExportJobs(activeAccountId, {
          page: exportJobsPage,
          pageSize: exportJobsPageSize,
        }),
        listSecurityAlertAssignees(activeAccountId),
        getAccountSecuritySettings(activeAccountId),
        listSecurityObservabilityEvents(activeAccountId, hostedEventFilters),
      ]);

      setRows(events.rows);
      setTotal(events.total);
      setFacets(nextFacets);
      setAnomalyAlerts(nextAlerts.rows);
      setAnomalyAlertsTotal(nextAlerts.total);
      setExportJobs(nextJobs.rows);
      setExportJobsTotal(nextJobs.total);
      setAlertAssignees(nextAssignees);
      setSecuritySettings(nextSecuritySettings);
      setHostedEvents(
        isRootOperator
          ? nextHostedEvents
          : nextHostedEvents.filter((row) => String(row?.category || "").trim().toLowerCase() !== "root_telemetry"),
      );
      setSecuritySettingsDraft((prev) => {
        if (!nextSecuritySettings) return prev;
        if (!prev || prev.account_id !== nextSecuritySettings.account_id) {
          return nextSecuritySettings;
        }
        return prev;
      });
    } catch (e) {
      setRows([]);
      setTotal(0);
      setAnomalyAlerts([]);
      setAnomalyAlertsTotal(0);
      setExportJobs([]);
      setExportJobsTotal(0);
      setAlertAssignees([]);
      setSecuritySettings(null);
      setSecuritySettingsDraft(null);
      setHostedEvents([]);
      setError(e?.message || t("securityAudit.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeAccountId || !canManage) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeAccountId,
    alertStatus,
    anomalyAlertsPage,
    anomalyAlertsPageSize,
    canManage,
    exportJobsPage,
    exportJobsPageSize,
    page,
    pageSize,
    filters,
    hostedEventFilters,
  ]);

  useEffect(() => {
    setSecuritySettings(null);
    setSecuritySettingsDraft(null);
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeAccountId) {
      setHiddenExportJobIds([]);
      return;
    }

    try {
      const raw = localStorage.getItem(hiddenExportJobsKey(activeAccountId));
      const parsed = raw ? JSON.parse(raw) : [];
      setHiddenExportJobIds(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
    } catch {
      setHiddenExportJobIds([]);
    }
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeAccountId) return;
    try {
      localStorage.setItem(hiddenExportJobsKey(activeAccountId), JSON.stringify(hiddenExportJobIds));
    } catch {
      // ignore localStorage failures
    }
  }, [activeAccountId, hiddenExportJobIds]);

  useRealtimeTables({
    enabled: !!activeAccountId && canManage,
    subscriptions: [
      {
        channel: `security-audit:${activeAccountId}`,
        table: "security_audit_ledger",
        filter: `account_id=eq.${activeAccountId}`,
      },
      {
        channel: `security-anomaly-alerts:${activeAccountId}`,
        table: "security_anomaly_alerts",
        filter: `account_id=eq.${activeAccountId}`,
      },
      {
        channel: `security-audit-export-jobs:${activeAccountId}`,
        table: "security_audit_export_jobs",
        filter: `account_id=eq.${activeAccountId}`,
      },
      {
        channel: `security-audit-settings:${activeAccountId}`,
        table: "account_security_settings",
        filter: `account_id=eq.${activeAccountId}`,
      },
    ],
    onChange: load,
  });

  useEffect(() => {
    if (!selectedEventId || !activeAccountId || !canManage) {
      setSelectedEvent(null);
      setDetailLoading(false);
      return;
    }

    const inlineRow = rows.find((row) => row.id === selectedEventId);
    if (inlineRow) {
      setSelectedEvent(inlineRow);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;

    async function loadSelectedEvent() {
      setDetailLoading(true);
      try {
        const row = await getSecurityAuditEvent(activeAccountId, selectedEventId);
        if (!cancelled) {
          setSelectedEvent(row);
        }
      } catch (e) {
        if (!cancelled) {
          setSelectedEvent(null);
          setError(e?.message || t("securityAudit.detailLoadError"));
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    loadSelectedEvent();

    return () => {
      cancelled = true;
    };
  }, [activeAccountId, canManage, rows, selectedEventId, t]);

  function updateFilter(key, value) {
    setPage(1);
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setExpandedRows({});
    setPage(1);
    setInfo("");
  }

  function setAlertStatusFilter(nextStatus) {
    setAnomalyAlertsPage(1);
    setAlertStatus(nextStatus);
  }

  function toggleExpanded(id) {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function applyDatePreset(days) {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days + 1);
    updateFilter("dateFrom", from.toISOString().slice(0, 10));
    updateFilter("dateTo", to.toISOString().slice(0, 10));
  }

  function openReview(id) {
    setSelectedEventId(id);
  }

  function closeReview() {
    setSelectedEventId("");
    setSelectedEvent(null);
  }

  function clearInvestigationContext() {
    setFocusedAlertId("");
    setFocusedHostedEventId("");
    setSelectedEventId("");
    setSelectedEvent(null);
    setInfo("");
  }

  function openFocusedAlertWorkflow() {
    if (!focusedAnomalyAlert?.id) return;
    setExpandedAlerts((prev) => ({
      ...prev,
      [focusedAnomalyAlert.id]: true,
    }));
    if (!alertHistoryById[focusedAnomalyAlert.id]) {
      loadAlertHistory(focusedAnomalyAlert.id);
    }
  }

  useEffect(() => {
    setAlertDrafts((prev) => {
      const next = { ...prev };
      for (const alert of anomalyAlerts) {
        next[alert.id] = {
          classification: prev[alert.id]?.classification ?? alert.classification ?? "",
          assignedToUserId: prev[alert.id]?.assignedToUserId ?? alert.assignedToUserId ?? "",
          resolutionNote: prev[alert.id]?.resolutionNote ?? "",
        };
      }
      return next;
    });
  }, [anomalyAlerts]);

  function updateAlertDraft(alertId, patch) {
    setAlertDrafts((prev) => ({
      ...prev,
      [alertId]: {
        classification: "",
        assignedToUserId: "",
        resolutionNote: "",
        ...(prev[alertId] || {}),
        ...patch,
      },
    }));
  }

  function toggleAlertExpanded(alertId) {
    setExpandedAlerts((prev) => {
      const nextOpen = !prev[alertId];
      if (nextOpen && !alertHistoryById[alertId]) {
        loadAlertHistory(alertId);
      }
      return {
        ...prev,
        [alertId]: nextOpen,
      };
    });
  }

  async function loadAlertHistory(alertId) {
    if (!activeAccountId || !alertId) return;
    try {
      const rows = await listSecurityAlertHistory(activeAccountId, alertId, { limit: 12 });
      setAlertHistoryById((prev) => ({
        ...prev,
        [alertId]: rows,
      }));
    } catch (e) {
      setError(e?.message || t("securityAudit.alertWorkflowError"));
    }
  }

  async function handleAlertAction(alert, operation) {
    if (!activeAccountId || !alert?.id) return;

    const draft = alertDrafts[alert.id] || {};
    const busyKey = `${alert.id}:${operation}`;

    try {
      setAlertBusyKey(busyKey);
      setError("");
      setInfo("");
      await applySecurityAlertWorkflow({
        alertId: alert.id,
        operation,
        classification: operation === "classify" ? draft.classification : null,
        assignedToUserId:
          operation === "assign"
            ? draft.assignedToUserId || null
            : null,
        resolutionNote: operation === "resolve" ? draft.resolutionNote || null : null,
      });
      await Promise.all([load(), loadAlertHistory(alert.id)]);
      setInfo(t(`securityAudit.alertAction.${operation}.success`));
      if (operation === "resolve") {
        setExpandedAlerts((prev) => ({
          ...prev,
          [alert.id]: true,
        }));
      }
    } catch (e) {
      setError(e?.message || t("securityAudit.alertWorkflowError"));
    } finally {
      setAlertBusyKey("");
    }
  }

  async function handleCopyJson() {
    if (!selectedEvent) return;
    try {
      setCopying(true);
      if (!navigator.clipboard?.writeText) {
        throw new Error(t("securityAudit.copyUnsupported"));
      }
      await navigator.clipboard.writeText(JSON.stringify(selectedEvent.metadata || {}, null, 2));
      setInfo(t("securityAudit.copySuccess"));
    } catch (e) {
      setError(e?.message || t("securityAudit.copyError"));
    } finally {
      setCopying(false);
    }
  }

  async function handleCopyHostedEventsSql() {
    if (!activeAccountId) return;

    const category = hostedEventFilters.category ? `'${escapeSqlLiteral(hostedEventFilters.category)}'` : "null";
    const kind = hostedEventFilters.kind ? `'${escapeSqlLiteral(hostedEventFilters.kind)}'` : "null";
    const surface = hostedEventFilters.surface ? `'${escapeSqlLiteral(hostedEventFilters.surface)}'` : "null";
    const limit = Number(hostedEventFilters.limit) || 25;

    const sql = `select *
from public.security_observability_event_feed(
  '${activeAccountId}'::uuid,
  ${category},
  ${kind},
  ${surface},
  ${limit}
);`;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error(t("securityAudit.copyUnsupported"));
      }
      await navigator.clipboard.writeText(sql);
      setInfo(t("securityAudit.hostedEvents.copySqlSuccess"));
    } catch (e) {
      setError(e?.message || t("securityAudit.hostedEvents.copySqlError"));
    }
  }

  async function handleCopyInvestigationLink() {
    try {
      if (!navigator.clipboard?.writeText || !window?.location) {
        throw new Error(t("securityAudit.copyUnsupported"));
      }

      const params = buildSearchParams(
        filters,
        page,
        selectedEventId,
        alertStatus,
        focusedAlertId,
        focusedHostedEventId,
      );
      const search = params.toString();
      const link = `${window.location.origin}${window.location.pathname}${search ? `?${search}` : ""}`;

      await navigator.clipboard.writeText(link);
      setInfo(t("securityAudit.investigationContext.copyLinkSuccess"));
      setError("");
    } catch (e) {
      setError(e?.message || t("securityAudit.investigationContext.copyLinkError"));
    }
  }

  async function handleExport() {
    if (!activeAccountId) return;
    try {
      setExporting(true);
      setError("");
      setInfo("");
      const result = await listSecurityAuditEventsForExport(activeAccountId, filters);
      const csv = buildCsv(result.rows, [
        { header: "created_at", getValue: (row) => row.created_at },
        { header: "account_id", getValue: () => activeAccountId },
        { header: "action", getValue: (row) => row.action },
        { header: "actor_label", getValue: (row) => row.actorLabel || "" },
        { header: "actor_user_id", getValue: (row) => row.actor_user_id || "" },
        { header: "entity_type", getValue: (row) => row.entity_type || "" },
        { header: "entity_label", getValue: (row) => row.entityLabel || "" },
        { header: "entity_id", getValue: (row) => row.entity_id || "" },
        { header: "metadata", getValue: (row) => row.metadata || {} },
      ]);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const accountLabel = sanitizeFilePart(activeAccount?.name, "account");
      downloadTextFile(
        `security-audit-${accountLabel}-${timestamp}.csv`,
        csv,
        "text/csv;charset=utf-8",
      );
      setInfo(
        result.truncated
          ? t("securityAudit.exportTruncated", { count: result.maxRows, total: result.total })
          : t("securityAudit.exportSuccess", { count: result.rows.length }),
      );
    } catch (e) {
      setError(e?.message || t("securityAudit.exportError"));
    } finally {
      setExporting(false);
    }
  }

  async function handleBackendExport() {
    if (!activeAccountId) return;
    try {
      setBackendExporting(true);
      setError("");
      setInfo("");
      const job = await requestSecurityAuditBackendExport(activeAccountId, filters, {
        requestedLabel: backendExportLabel,
      });
      await runSecurityAuditExportJob(job);
      await load();
      setBackendExportLabel("");
      setInfo(t("securityAudit.backendExportRequested"));
    } catch (e) {
      setError(e?.message || t("securityAudit.backendExportError"));
    } finally {
      setBackendExporting(false);
    }
  }

  function handleHostedEventsExport() {
    if (!hostedEvents.length) return;

    try {
      setHostedExporting(true);
      setError("");
      setInfo("");

      const csv = buildCsv(hostedEvents, [
        { header: "created_at", getValue: (row) => row.created_at || "" },
        { header: "account_id", getValue: (row) => row.account_id || "" },
        { header: "actor_user_id", getValue: (row) => row.actor_user_id || "" },
        { header: "actor_role", getValue: (row) => row.actor_role || "" },
        { header: "category", getValue: (row) => row.category || "" },
        { header: "kind", getValue: (row) => row.kind || "" },
        { header: "surface", getValue: (row) => row.surface || "" },
        { header: "reason", getValue: (row) => row.reason || "" },
        { header: "outcome", getValue: (row) => row.outcome || "" },
        { header: "code", getValue: (row) => row.code || "" },
        { header: "guard_denied", getValue: (row) => row.guard_denied || false },
        { header: "entity_type", getValue: (row) => row.entity_type || "" },
        { header: "entity_id", getValue: (row) => row.entity_id || "" },
        { header: "correlation_id", getValue: (row) => row.correlation_id || "" },
        { header: "source", getValue: (row) => row.source || "" },
        { header: "metadata", getValue: (row) => row.metadata || {} },
      ]);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const accountLabel = sanitizeFilePart(activeAccount?.name, "account");
      downloadTextFile(
        `security-observability-${accountLabel}-${timestamp}.csv`,
        csv,
        "text/csv;charset=utf-8",
      );
      setInfo(t("securityAudit.hostedEvents.exportSuccess", { count: hostedEvents.length }));
    } catch (e) {
      setError(e?.message || t("securityAudit.hostedEvents.exportError"));
    } finally {
      setHostedExporting(false);
    }
  }

  function focusHostedEventInvestigation(row) {
    const relatedAlert = findRelatedAnomalyAlertForHostedEvent(row, anomalyAlerts);

    setPage(1);
    setAnomalyAlertsPage(1);
    setSelectedEventId("");
    setSelectedEvent(null);
    setFocusedHostedEventId(String(row?.id || ""));
    setFocusedAlertId(relatedAlert?.id || "");
    setFilters((prev) => ({
      ...prev,
      entityType: row?.entity_type || "",
      entityId: row?.entity_id || "",
    }));
    if (relatedAlert) {
      setAlertStatus(String(relatedAlert.status || "active").toLowerCase());
      setExpandedAlerts((prev) => ({
        ...prev,
        [relatedAlert.id]: true,
      }));
      if (!alertHistoryById[relatedAlert.id]) {
        loadAlertHistory(relatedAlert.id);
      }
    }
    setInfo(
      t(
        relatedAlert
          ? "securityAudit.hostedEvents.focusAppliedWithAlert"
          : "securityAudit.hostedEvents.focusApplied",
        {
          entityType: startCase(row?.entity_type) || t("securityAudit.hostedEvents.summary.unknownEntity"),
        },
      ),
    );
  }

  async function handleDownloadBackendExport(job) {
    try {
      setDownloadingJobId(job.id);
      setError("");
      const signedUrl = await getSecurityAuditExportDownloadUrl(job);
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e?.message || t("securityAudit.backendExportDownloadError"));
    } finally {
      setDownloadingJobId("");
    }
  }

  function dismissBackendExportJob(jobId) {
    setHiddenExportJobIds((prev) => (prev.includes(jobId) ? prev : [...prev, jobId]));
  }

  function restoreHiddenBackendExports() {
    setHiddenExportJobIds([]);
  }

  function updateSecuritySetting(key, value) {
    setSecuritySettingsDraft((prev) => ({
      ...(prev || securitySettings || { account_id: activeAccountId }),
      [key]: value,
    }));
  }

  async function handleSaveSecuritySettings() {
    if (!activeAccountId || !securitySettingsDraft) return;

    const payload = {
      role_change_target_threshold: clampInt(
        securitySettingsDraft.role_change_target_threshold,
        3,
        2,
        20,
      ),
      role_change_account_threshold: clampInt(
        securitySettingsDraft.role_change_account_threshold,
        5,
        3,
        50,
      ),
      role_change_window_minutes: clampInt(
        securitySettingsDraft.role_change_window_minutes,
        30,
        5,
        240,
      ),
      document_delete_actor_threshold: clampInt(
        securitySettingsDraft.document_delete_actor_threshold,
        5,
        2,
        50,
      ),
      document_delete_account_threshold: clampInt(
        securitySettingsDraft.document_delete_account_threshold,
        10,
        3,
        100,
      ),
      document_delete_window_minutes: clampInt(
        securitySettingsDraft.document_delete_window_minutes,
        15,
        5,
        240,
      ),
      export_retention_days: clampInt(securitySettingsDraft.export_retention_days, 14, 1, 90),
      surface_security_alerts_in_command_center: Boolean(
        securitySettingsDraft.surface_security_alerts_in_command_center,
      ),
      security_command_center_min_severity:
        String(securitySettingsDraft.security_command_center_min_severity || "urgent").toLowerCase() ===
        "action"
          ? "action"
          : "urgent",
      security_command_center_include_suspicious: Boolean(
        securitySettingsDraft.security_command_center_include_suspicious,
      ),
    };

    try {
      setSettingsSaving(true);
      setError("");
      setInfo("");
      const saved = await upsertAccountSecuritySettings(activeAccountId, payload);
      setSecuritySettings(saved);
      setSecuritySettingsDraft(saved);
      setInfo(t("securityAudit.settings.saveSuccess"));
    } catch (e) {
      setError(e?.message || t("securityAudit.settings.saveError"));
    } finally {
      setSettingsSaving(false);
    }
  }

  function focusAnomalyAlert(alert) {
    const recommended = alert?.metadata?.recommended_filters || {};
    const relatedHostedEvent = findRelatedHostedEventForAnomalyAlert(alert, hostedEvents);

    setFilters({
      dateFrom: "",
      dateTo: "",
      action: recommended.action || "",
      actorUserId: recommended.actorUserId || "",
      entityType: recommended.entityType || "",
      entityId: recommended.entityId || "",
    });
    setPage(1);
    setFocusedAlertId(alert?.id || "");
    setFocusedHostedEventId(relatedHostedEvent?.id || "");
    setExpandedAlerts((prev) => ({
      ...prev,
      [alert.id]: true,
    }));
    if (!alertHistoryById[alert.id]) {
      loadAlertHistory(alert.id);
    }
    if (alert?.metadata?.latest_event_id) {
      setSelectedEventId(String(alert.metadata.latest_event_id));
    }
    setInfo(
      t(
        relatedHostedEvent
          ? "securityAudit.anomaly.focusAppliedWithHosted"
          : "securityAudit.anomaly.focusApplied",
        {
          entityType:
            startCase(alert?.entityType || recommended.entityType) ||
            t("securityAudit.hostedEvents.summary.unknownEntity"),
        },
      ),
    );
  }

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const shouldRecommendBackendExport = total > SECURITY_AUDIT_BACKEND_EXPORT_THRESHOLD;
  const visibleExportJobs = exportJobs.filter((job) => !hiddenExportJobIds.includes(job.id));
  const anomalyAlertPages = Math.max(Math.ceil(anomalyAlertsTotal / anomalyAlertsPageSize), 1);
  const exportJobPages = Math.max(Math.ceil(exportJobsTotal / exportJobsPageSize), 1);
  const hostedEventSummary = useMemo(() => summarizeHostedEvents(hostedEvents), [hostedEvents]);
  const hostedEventCorrelations = useMemo(
    () => groupHostedEventCorrelations(hostedEvents),
    [hostedEvents],
  );
  const focusedHostedEvent = useMemo(
    () => hostedEvents.find((row) => row.id === focusedHostedEventId) || null,
    [focusedHostedEventId, hostedEvents],
  );
  const focusedAnomalyAlert = useMemo(
    () => anomalyAlerts.find((alert) => alert.id === focusedAlertId) || null,
    [anomalyAlerts, focusedAlertId],
  );
  const investigationContextSummary = useMemo(
    () =>
      buildInvestigationContextSummary({
        hostedEvent: focusedHostedEvent,
        anomalyAlert: focusedAnomalyAlert,
        selectedEvent,
        filters,
        t,
      }),
    [filters, focusedAnomalyAlert, focusedHostedEvent, selectedEvent, t],
  );
  const investigationTimelineItems = useMemo(
    () =>
      buildInvestigationTimelineItems({
        hostedEvent: focusedHostedEvent,
        anomalyAlert: focusedAnomalyAlert,
        selectedEvent,
        t,
      }),
    [focusedAnomalyAlert, focusedHostedEvent, selectedEvent, t],
  );
  const investigationEntityContext = useMemo(
    () =>
      buildInvestigationEntityContext({
        hostedEvent: focusedHostedEvent,
        anomalyAlert: focusedAnomalyAlert,
        selectedEvent,
        t,
      }),
    [focusedAnomalyAlert, focusedHostedEvent, selectedEvent, t],
  );
  const investigationEntityLinks = useMemo(
    () =>
      buildInvestigationEntityLinks({
        hostedEvent: focusedHostedEvent,
        anomalyAlert: focusedAnomalyAlert,
        selectedEvent,
        t,
      }),
    [focusedAnomalyAlert, focusedHostedEvent, selectedEvent, t],
  );
  const hostedEventCategories = useMemo(
    () => Array.from(new Set(hostedEvents.map((row) => String(row.category || "").trim()).filter(Boolean))).sort(),
    [hostedEvents],
  );
  const hostedEventSurfaces = useMemo(
    () => Array.from(new Set(hostedEvents.map((row) => String(row.surface || "").trim()).filter(Boolean))).sort(),
    [hostedEvents],
  );
  const hostedEventsEmptyGuidance = useMemo(
    () => buildHostedEventsEmptyGuidance(hostedEventFilters, t),
    [hostedEventFilters, t],
  );
  const anomalyEmptyGuidance = useMemo(() => buildAnomalyEmptyGuidance(t), [t]);

  if (!canManage) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t("securityAudit.accessDenied")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{t("securityAudit.title")}</h2>
            <p className="mt-1 text-sm text-slate-200">{t("securityAudit.subtitle")}</p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-100">
            <Shield size={16} />
            <span>{t("securityAudit.accountScoped")}</span>
          </div>
        </div>
      </div>

      <OnboardingHintCard
        title={t("pageHints.securityAudit.title")}
        body={t("pageHints.securityAudit.body")}
      />

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-start justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="rounded-lg border border-rose-300 bg-white/70 px-2 py-1 text-xs transition hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-100 dark:hover:bg-rose-900/60"
              aria-label={t("common.close")}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {info ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          <div className="flex items-start justify-between gap-3">
            <span>{info}</span>
            <button
              type="button"
              onClick={() => setInfo("")}
              className="rounded-lg border border-emerald-300 bg-white/70 px-2 py-1 text-xs transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-100 dark:hover:bg-emerald-900/60"
              aria-label={t("securityAudit.dismissNotice")}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {focusedAlertId || focusedHostedEventId || selectedEventId ? (
        <InvestigationContextStrip
          summary={investigationContextSummary}
          focusedHostedEvent={focusedHostedEvent}
          focusedAnomalyAlert={focusedAnomalyAlert}
          selectedEvent={selectedEvent}
          onClear={clearInvestigationContext}
          onShowWorkflow={focusedAnomalyAlert ? openFocusedAlertWorkflow : null}
          onAcknowledgeAlert={
            focusedAnomalyAlert ? () => handleAlertAction(focusedAnomalyAlert, "acknowledge") : null
          }
          onResolveAlert={focusedAnomalyAlert ? () => handleAlertAction(focusedAnomalyAlert, "resolve") : null}
          busyAlertAction={focusedAnomalyAlert ? alertBusyKey.split(":")[1] || "" : ""}
          t={t}
        />
      ) : null}

      {focusedAlertId || focusedHostedEventId || selectedEventId ? (
        <InvestigationTimeline items={investigationTimelineItems} t={t} />
      ) : null}

      {focusedAlertId || focusedHostedEventId || selectedEventId ? (
        <InvestigationEntityPanel details={investigationEntityContext} t={t} />
      ) : null}

      {focusedAlertId || focusedHostedEventId || selectedEventId ? (
        <InvestigationRelatedLinks links={investigationEntityLinks} t={t} />
      ) : null}

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("securityAudit.settings.title")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("securityAudit.settings.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveSecuritySettings}
            disabled={settingsSaving || !securitySettingsDraft}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {settingsSaving ? t("common.saving") : t("common.save")}
          </button>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("securityAudit.settings.roleChanges.title")}
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("securityAudit.settings.roleChanges.subtitle")}
            </p>
            <div className="mt-3 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("securityAudit.settings.roleChanges.targetThreshold")}
                </span>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={securitySettingsDraft?.role_change_target_threshold ?? ""}
                  onChange={(e) => updateSecuritySetting("role_change_target_threshold", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("securityAudit.settings.roleChanges.accountThreshold")}
                </span>
                <input
                  type="number"
                  min="3"
                  max="50"
                  value={securitySettingsDraft?.role_change_account_threshold ?? ""}
                  onChange={(e) => updateSecuritySetting("role_change_account_threshold", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("securityAudit.settings.roleChanges.window")}
                </span>
                <input
                  type="number"
                  min="5"
                  max="240"
                  value={securitySettingsDraft?.role_change_window_minutes ?? ""}
                  onChange={(e) => updateSecuritySetting("role_change_window_minutes", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("securityAudit.settings.documentDeletes.title")}
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("securityAudit.settings.documentDeletes.subtitle")}
            </p>
            <div className="mt-3 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("securityAudit.settings.documentDeletes.actorThreshold")}
                </span>
                <input
                  type="number"
                  min="2"
                  max="50"
                  value={securitySettingsDraft?.document_delete_actor_threshold ?? ""}
                  onChange={(e) => updateSecuritySetting("document_delete_actor_threshold", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("securityAudit.settings.documentDeletes.accountThreshold")}
                </span>
                <input
                  type="number"
                  min="3"
                  max="100"
                  value={securitySettingsDraft?.document_delete_account_threshold ?? ""}
                  onChange={(e) => updateSecuritySetting("document_delete_account_threshold", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("securityAudit.settings.documentDeletes.window")}
                </span>
                <input
                  type="number"
                  min="5"
                  max="240"
                  value={securitySettingsDraft?.document_delete_window_minutes ?? ""}
                  onChange={(e) => updateSecuritySetting("document_delete_window_minutes", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("securityAudit.settings.exports.title")}
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("securityAudit.settings.exports.subtitle")}
            </p>
            <div className="mt-3 grid gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("securityAudit.settings.exports.retention")}
                </span>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={securitySettingsDraft?.export_retention_days ?? ""}
                  onChange={(e) => updateSecuritySetting("export_retention_days", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
                />
              </label>

              <label className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/50">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("securityAudit.settings.commandCenter.surface")}
                </span>
                <div className="mt-2">
                  <input
                    type="checkbox"
                    checked={Boolean(securitySettingsDraft?.surface_security_alerts_in_command_center)}
                    onChange={(e) =>
                      updateSecuritySetting("surface_security_alerts_in_command_center", e.target.checked)
                    }
                  />
                </div>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("securityAudit.settings.commandCenter.minSeverity")}
                </span>
                <select
                  value={String(securitySettingsDraft?.security_command_center_min_severity || "urgent")}
                  onChange={(e) => updateSecuritySetting("security_command_center_min_severity", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="urgent">{t("securityAudit.settings.commandCenter.severity.urgent")}</option>
                  <option value="action">{t("securityAudit.settings.commandCenter.severity.action")}</option>
                </select>
              </label>

              <label className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/50">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("securityAudit.settings.commandCenter.includeSuspicious")}
                </span>
                <div className="mt-2">
                  <input
                    type="checkbox"
                    checked={Boolean(securitySettingsDraft?.security_command_center_include_suspicious)}
                    onChange={(e) =>
                      updateSecuritySetting("security_command_center_include_suspicious", e.target.checked)
                    }
                  />
                </div>
              </label>
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {t("securityAudit.settings.note")}
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("securityAudit.hostedEvents.title")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("securityAudit.hostedEvents.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("securityAudit.hostedEvents.retentionNote")}
            </p>
            <div className="inline-flex flex-wrap items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
              <button
                type="button"
                onClick={handleCopyHostedEventsSql}
                className="inline-flex items-center gap-2 border-r border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-50 dark:hover:bg-slate-700"
              >
                <Copy size={16} />
                {t("securityAudit.hostedEvents.copySql")}
              </button>
              <button
                type="button"
                onClick={handleCopyInvestigationLink}
                className="inline-flex items-center gap-2 border-r border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-50 dark:hover:bg-slate-700"
              >
                <Copy size={16} />
                {t("securityAudit.investigationContext.copyLink")}
              </button>
              <button
                type="button"
                onClick={handleHostedEventsExport}
                disabled={hostedExporting || hostedEvents.length === 0}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-50 dark:hover:bg-slate-700"
              >
                <Download size={16} />
                {hostedExporting ? t("securityAudit.exporting") : t("securityAudit.hostedEvents.export")}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.hostedEvents.filters.category")}
            </span>
            <select
              value={hostedEventFilters.category}
              onChange={(e) =>
                setHostedEventFilters((prev) => ({
                  ...prev,
                  category: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">{t("securityAudit.hostedEvents.filters.allCategories")}</option>
              {hostedEventCategories.map((value) => (
                <option key={value} value={value}>
                  {startCase(value)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.hostedEvents.filters.kind")}
            </span>
            <select
              value={hostedEventFilters.kind}
              onChange={(e) =>
                setHostedEventFilters((prev) => ({
                  ...prev,
                  kind: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">{t("securityAudit.hostedEvents.filters.allKinds")}</option>
              {HOSTED_EVENT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {describeHostedEventKind(value, t)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.hostedEvents.filters.surface")}
            </span>
            <select
              value={hostedEventFilters.surface}
              onChange={(e) =>
                setHostedEventFilters((prev) => ({
                  ...prev,
                  surface: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">{t("securityAudit.hostedEvents.filters.allSurfaces")}</option>
              {hostedEventSurfaces.map((value) => (
                <option key={value} value={value}>
                  {describeHostedEventSurface(value, t)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.hostedEvents.filters.limit")}
            </span>
            <select
              value={String(hostedEventFilters.limit)}
              onChange={(e) =>
                setHostedEventFilters((prev) => ({
                  ...prev,
                  limit: Number(e.target.value) || 25,
                }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {[10, 25, 50, 100].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.hostedEvents.summary.total")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {hostedEventSummary.total}
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/60 dark:bg-rose-950/30">
            <p className="text-xs uppercase tracking-wide text-rose-600 dark:text-rose-200">
              {t("securityAudit.hostedEvents.summary.denied")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-rose-700 dark:text-rose-100">
              {hostedEventSummary.denied}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-200">
              {t("securityAudit.hostedEvents.summary.unexpected")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-amber-700 dark:text-amber-100">
              {hostedEventSummary.unexpected}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.hostedEvents.summary.topSurface")}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {hostedEventSummary.topSurface
                ? describeHostedEventSurface(hostedEventSummary.topSurface, t)
                : t("securityAudit.hostedEvents.summary.none")}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("securityAudit.hostedEvents.summary.guardDenied", {
                count: hostedEventSummary.guardDenied,
              })}
            </p>
          </div>
        </div>

        {hostedEvents.length > 0 ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
            <p className="font-medium">{t("securityAudit.hostedEvents.recommendedAction.title")}</p>
            <p className="mt-1">
              {buildHostedEventRecommendedAction(hostedEvents[0], t)}
            </p>
          </div>
        ) : null}

        {hostedEventCorrelations.length > 0 ? (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t("securityAudit.hostedEvents.correlations.title")}
                </h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("securityAudit.hostedEvents.correlations.subtitle")}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {hostedEventCorrelations.map((group) => (
                <div
                  key={group.key}
                  className={`rounded-xl border bg-white p-4 dark:bg-slate-950/40 ${
                    focusedAlertId &&
                    group.latestRow &&
                    findRelatedAnomalyAlertForHostedEvent(group.latestRow, anomalyAlerts)?.id === focusedAlertId
                      ? "border-blue-300 ring-2 ring-blue-200 dark:border-blue-700 dark:ring-blue-900/50"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {t("securityAudit.hostedEvents.correlations.pattern", {
                          surface:
                            describeHostedEventSurface(group.surface, t) ||
                            t("securityAudit.hostedEvents.summary.unknownSurface"),
                          entityType:
                            startCase(group.entityType) || t("securityAudit.hostedEvents.summary.unknownEntity"),
                        })}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t("securityAudit.hostedEvents.correlations.reason", {
                          reason: describeHostedEventReason(group.reason, t),
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <span className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        {t("securityAudit.hostedEvents.correlations.count", { count: group.count })}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-1 text-xs ${hostedEventSeverityTone(
                          hostedEventSeverity(group.latestRow),
                        )}`}
                      >
                        {describeHostedEventSeverity(hostedEventSeverity(group.latestRow), t)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    {t("securityAudit.hostedEvents.correlations.latestSeen", {
                      timestamp: formatDateTime(group.latestAt),
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className={`rounded-lg border px-2 py-2 text-xs ${hostedEventRecommendationTone(
                        group.latestRow?.kind,
                      )}`}
                    >
                      {describeHostedEventRecommendation(group.latestRow, t)}
                    </span>
                    <button
                      type="button"
                      onClick={() => focusHostedEventInvestigation(group.latestRow)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {t("securityAudit.hostedEvents.focusLedger")}
                    </button>
                    {group.latestRow?.correlation_id ? (
                      <span className="rounded-lg bg-slate-100 px-2 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {t("securityAudit.hostedEvents.correlations.correlation", {
                          correlationId: shortenId(group.latestRow.correlation_id),
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {hostedEvents.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
            <p className="font-medium text-slate-900 dark:text-slate-100">{t("securityAudit.hostedEvents.empty")}</p>
            <p className="mt-2">{hostedEventsEmptyGuidance.title}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hostedEventsEmptyGuidance.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {hostedEventsEmptyGuidance.checks.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900/70">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2">{t("securityAudit.columns.timestamp")}</th>
                  <th className="px-3 py-2">{t("securityAudit.hostedEvents.columns.summary")}</th>
                  <th className="px-3 py-2">{t("securityAudit.hostedEvents.columns.surface")}</th>
                  <th className="px-3 py-2">{t("securityAudit.hostedEvents.columns.role")}</th>
                  <th className="px-3 py-2">{t("securityAudit.hostedEvents.columns.context")}</th>
                  <th className="px-3 py-2">{t("securityAudit.hostedEvents.columns.outcome")}</th>
                  <th className="px-3 py-2">{t("securityAudit.hostedEvents.columns.investigate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                {hostedEvents.map((row) => (
                  <tr
                    key={row.id}
                    className={`align-top ${
                      focusedHostedEventId && focusedHostedEventId === row.id
                        ? "bg-blue-50/70 dark:bg-blue-950/20"
                        : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{formatDateTime(row.created_at)}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-1 text-xs ${hostedEventKindTone(row.kind)}`}>
                            {describeHostedEventKind(row.kind, t)}
                          </span>
                          <span
                            className={`rounded-full border px-2 py-1 text-xs ${hostedEventSeverityTone(
                              hostedEventSeverity(row),
                            )}`}
                          >
                            {describeHostedEventSeverity(hostedEventSeverity(row), t)}
                          </span>
                          {row.category ? (
                            <span className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                              {startCase(row.category)}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {buildHostedEventSummary(row, t)}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      <div className="space-y-1">
                        <p>{describeHostedEventSurface(row.surface, t) || "—"}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {describeHostedEventReason(row.reason, t)}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.actor_role || "—"}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{buildHostedEventContext(row, t)}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.outcome || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-xs ${hostedEventRecommendationTone(
                            row.kind,
                          )}`}
                        >
                          {describeHostedEventRecommendation(row, t)}
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {buildHostedEventRecommendedAction(row, t)}
                        </p>
                        <button
                          type="button"
                          onClick={() => focusHostedEventInvestigation(row)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {t("securityAudit.hostedEvents.focusLedger")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("securityAudit.backendExportsTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {shouldRecommendBackendExport
                ? t("securityAudit.backendExportsRecommended")
                : t("securityAudit.backendExportsSubtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={String(exportJobsPageSize)}
              onChange={(e) => {
                setExportJobsPageSize(Number(e.target.value));
                setExportJobsPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
            >
              {[5, 10].map((value) => (
                <option key={value} value={value}>
                  {t("securityAudit.pageSize", { count: value })}
                </option>
              ))}
            </select>
            {hiddenExportJobIds.length > 0 ? (
              <button
                type="button"
                onClick={restoreHiddenBackendExports}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
              >
                {t("securityAudit.backendExportsShowHidden", { count: hiddenExportJobIds.length })}
              </button>
            ) : null}
            <input
              type="text"
              value={backendExportLabel}
              onChange={(e) => setBackendExportLabel(e.target.value)}
              placeholder={t("securityAudit.backendExportLabelPlaceholder")}
              maxLength={80}
              className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-300"
            />
            <button
              type="button"
              onClick={handleBackendExport}
              disabled={backendExporting || loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
            >
              <Download size={16} />
              {backendExporting ? t("securityAudit.backendExportRunning") : t("securityAudit.backendExport")}
            </button>
          </div>
        </div>

        {exportJobs.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
            {t("securityAudit.backendExportsEmpty")}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {visibleExportJobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
                {t("securityAudit.backendExportsPageHidden")}
              </div>
            ) : null}
            {visibleExportJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {job.displayLabel || t("securityAudit.backendExportJobLabel", { id: shortenId(job.id) })}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("securityAudit.backendExportJobMeta", {
                        status: job.status,
                        createdAt: formatDateTime(job.createdAt),
                      })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => dismissBackendExportJob(job.id)}
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      aria-label={t("securityAudit.backendExportDismiss")}
                      title={t("securityAudit.backendExportDismiss")}
                    >
                      <X size={14} />
                    </button>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                      {job.status}
                    </span>
                    {job.status === "completed" && job.artifactPath ? (
                      <button
                        type="button"
                        onClick={() => handleDownloadBackendExport(job)}
                        disabled={downloadingJobId === job.id}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                      >
                        {downloadingJobId === job.id
                          ? t("securityAudit.backendExportDownloading")
                          : t("securityAudit.backendExportDownload")}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-4">
                  <DetailField
                    label={t("securityAudit.columns.actor")}
                    value={job.requestedByLabel || job.requestedByUserId || t("securityAudit.systemActor")}
                  />
                  <DetailField
                    label={t("securityAudit.backendExportRows")}
                    value={job.rowCount > 0 ? String(job.rowCount) : "—"}
                  />
                  <DetailField
                    label={t("securityAudit.backendExportSize")}
                    value={formatBytes(job.fileSizeBytes)}
                  />
                  <DetailField
                    label={t("securityAudit.backendExportExpires")}
                    value={formatDateTime(job.expiresAt)}
                  />
                </div>

                {job.errorSummary ? (
                  <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{job.errorSummary}</p>
                ) : null}
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("securityAudit.pagination", {
                  from: exportJobsTotal === 0 ? 0 : (exportJobsPage - 1) * exportJobsPageSize + 1,
                  to: exportJobsTotal === 0 ? 0 : Math.min(exportJobsPage * exportJobsPageSize, exportJobsTotal),
                  total: exportJobsTotal,
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExportJobsPage((prev) => Math.max(prev - 1, 1))}
                  disabled={exportJobsPage <= 1}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
                >
                  {t("common.prev")}
                </button>
                <button
                  type="button"
                  onClick={() => setExportJobsPage((prev) => Math.min(prev + 1, exportJobPages))}
                  disabled={exportJobsPage >= exportJobPages}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
                >
                  {t("common.next")}
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("securityAudit.anomaliesTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("securityAudit.anomaliesSubtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={String(anomalyAlertsPageSize)}
              onChange={(e) => {
                setAnomalyAlertsPageSize(Number(e.target.value));
                setAnomalyAlertsPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
            >
              {[5, 10].map((value) => (
                <option key={value} value={value}>
                  {t("securityAudit.pageSize", { count: value })}
                </option>
              ))}
            </select>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
              {t("securityAudit.anomaliesOpenCount", { count: anomalyAlertsTotal })}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {["active", "open", "acknowledged", "resolved"].map((value) => {
            const active = alertStatus === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setAlertStatusFilter(value)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {t(`securityAudit.alertStatus.${value}`)}
              </button>
            );
          })}
        </div>

        {anomalyAlerts.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
            <p className="font-medium text-slate-900 dark:text-slate-100">{t("securityAudit.anomaliesEmpty")}</p>
            <p className="mt-2">{anomalyEmptyGuidance.title}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{anomalyEmptyGuidance.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {anomalyEmptyGuidance.checks.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {anomalyAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-xl border bg-white p-4 dark:bg-slate-900 ${
                    focusedAlertId && focusedAlertId === alert.id
                      ? "border-blue-300 ring-2 ring-blue-200 dark:border-blue-700 dark:ring-blue-900/50"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{alert.title}</p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{alert.summary}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-1 text-xs ${alertStatusTone(alert.status)}`}>
                        {alert.status}
                      </span>
                      <span className={`rounded-full border px-2 py-1 text-xs ${anomalySeverityTone(alert.severity)}`}>
                        {alert.severity}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <DetailField
                      label={t("securityAudit.columns.actor")}
                      value={alert.actorLabel || alert.actorUserId || t("securityAudit.systemActor")}
                    />
                    <DetailField
                      label={t("securityAudit.columns.entity")}
                      value={alert.entityLabel || alert.entityType || "—"}
                    />
                    <DetailField label={t("securityAudit.anomaly.count")} value={String(alert.alertCount)} />
                    <DetailField label={t("securityAudit.anomaly.lastSeen")} value={formatDateTime(alert.lastSeenAt)} />
                    <DetailField
                      label={t("securityAudit.alert.assignee")}
                      value={alert.assignedToLabel || alert.assignedToUserId || "—"}
                    />
                    <DetailField
                      label={t("securityAudit.alert.classification")}
                      value={alert.classification || "—"}
                    />
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t("securityAudit.anomaly.flagContext.title")}
                    </p>
                    <p className="mt-1">
                      {buildAnomalyFlagContext(alert, t) || t("securityAudit.anomaly.flagContext.empty")}
                    </p>
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t("securityAudit.alert.workflowSummary.title")}
                    </p>
                    <p className="mt-1">
                      {buildAlertWorkflowSummary(alert, t) || t("securityAudit.alert.workflowSummary.empty")}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                      <div className="mb-2 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2 py-1 text-[11px] ${anomalySeverityTone(alert.severity)}`}>
                          {t("securityAudit.anomaly.recommendedAction.badge", {
                            severity: String(alert.severity || "info"),
                          })}
                        </span>
                      </div>
                      {buildAnomalyRecommendedAction(alert, t)}
                    </div>
                    <button
                      type="button"
                      onClick={() => focusAnomalyAlert(alert)}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      {t("securityAudit.anomaly.focus")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAlertAction(alert, "acknowledge")}
                      disabled={alertBusyKey === `${alert.id}:acknowledge` || String(alert.status || "").toLowerCase() !== "open"}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/60"
                    >
                      {t("securityAudit.alert.actions.acknowledge")}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleAlertExpanded(alert.id)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
                    >
                      {expandedAlerts[alert.id]
                        ? t("securityAudit.alert.hideWorkflow")
                        : t("securityAudit.alert.showWorkflow")}
                    </button>
                  </div>

                  {expandedAlerts[alert.id] ? (
                    <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
                      <div className="grid gap-3 md:grid-cols-2">
                        <DetailField
                          label={t("securityAudit.alert.acknowledgedAt")}
                          value={formatDateTime(alert.acknowledgedAt)}
                        />
                        <DetailField
                          label={t("securityAudit.alert.acknowledgedBy")}
                          value={alert.acknowledgedByLabel || alert.acknowledgedByUserId || "—"}
                        />
                        <DetailField
                          label={t("securityAudit.alert.resolvedAt")}
                          value={formatDateTime(alert.resolvedAt)}
                        />
                        <DetailField
                          label={t("securityAudit.alert.resolvedBy")}
                          value={alert.resolvedByLabel || alert.resolvedByUserId || "—"}
                        />
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t("securityAudit.alert.classification")}
                          </span>
                          <select
                            value={alertDrafts[alert.id]?.classification || ""}
                            onChange={(e) => updateAlertDraft(alert.id, { classification: e.target.value })}
                            disabled={String(alert.status || "").toLowerCase() === "resolved"}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          >
                            <option value="">{t("securityAudit.alert.classificationPlaceholder")}</option>
                            {ALERT_CLASSIFICATIONS.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {t("securityAudit.alert.assignee")}
                          </span>
                          <select
                            value={alertDrafts[alert.id]?.assignedToUserId || ""}
                            onChange={(e) => updateAlertDraft(alert.id, { assignedToUserId: e.target.value })}
                            disabled={String(alert.status || "").toLowerCase() === "resolved"}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                          >
                            <option value="">{t("securityAudit.alert.unassigned")}</option>
                            {alertAssignees.map((option) => (
                              <option key={option.userId} value={option.userId}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label className="space-y-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("securityAudit.alert.resolutionNote")}
                        </span>
                        <textarea
                          rows={3}
                          value={alertDrafts[alert.id]?.resolutionNote || ""}
                          onChange={(e) => updateAlertDraft(alert.id, { resolutionNote: e.target.value })}
                          placeholder={t("securityAudit.alert.resolutionNotePlaceholder")}
                          disabled={String(alert.status || "").toLowerCase() === "resolved"}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleAlertAction(alert, "acknowledge")}
                          disabled={alertBusyKey === `${alert.id}:acknowledge` || String(alert.status || "").toLowerCase() !== "open"}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                        >
                          {t("securityAudit.alert.actions.acknowledge")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAlertAction(alert, "classify")}
                          disabled={
                            alertBusyKey === `${alert.id}:classify` ||
                            !alertDrafts[alert.id]?.classification ||
                            String(alert.status || "").toLowerCase() === "resolved"
                          }
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
                        >
                          {t("securityAudit.alert.actions.classify")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAlertAction(alert, "assign")}
                          disabled={alertBusyKey === `${alert.id}:assign` || String(alert.status || "").toLowerCase() === "resolved"}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
                        >
                          {t("securityAudit.alert.actions.assign")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAlertAction(alert, "resolve")}
                          disabled={alertBusyKey === `${alert.id}:resolve` || String(alert.status || "").toLowerCase() === "resolved"}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
                        >
                          {t("securityAudit.alert.actions.resolve")}
                        </button>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("securityAudit.alert.history")}
                        </p>
                        {(alertHistoryById[alert.id] || []).length === 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t("securityAudit.alert.historyEmpty")}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {alertHistoryById[alert.id].map((entry) => (
                              <div
                                key={entry.id}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{entry.action}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(entry.created_at)}</p>
                                </div>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {entry.actorLabel || entry.actor_user_id || t("securityAudit.systemActor")}
                                </p>
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                  {summarizeMetadata(entry.metadata, t)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("securityAudit.pagination", {
                  from: anomalyAlertsTotal === 0 ? 0 : (anomalyAlertsPage - 1) * anomalyAlertsPageSize + 1,
                  to:
                    anomalyAlertsTotal === 0
                      ? 0
                      : Math.min(anomalyAlertsPage * anomalyAlertsPageSize, anomalyAlertsTotal),
                  total: anomalyAlertsTotal,
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAnomalyAlertsPage((prev) => Math.max(prev - 1, 1))}
                  disabled={anomalyAlertsPage <= 1}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {t("common.prev")}
                </button>
                <button
                  type="button"
                  onClick={() => setAnomalyAlertsPage((prev) => Math.min(prev + 1, anomalyAlertPages))}
                  disabled={anomalyAlertsPage >= anomalyAlertPages}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {t("common.next")}
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("securityAudit.filtersTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("securityAudit.filtersSubtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
          >
            {t("common.clear")}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applyDatePreset(7)}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t("securityAudit.presets.last7Days")}
          </button>
          <button
            type="button"
            onClick={() => applyDatePreset(30)}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t("securityAudit.presets.last30Days")}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.filters.dateFrom")}
            </span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => updateFilter("dateFrom", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.filters.dateTo")}
            </span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => updateFilter("dateTo", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.filters.action")}
            </span>
            <select
              value={filters.action}
              onChange={(e) => updateFilter("action", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">{t("securityAudit.filters.allActions")}</option>
              {facets.actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.filters.actor")}
            </span>
            <select
              value={filters.actorUserId}
              onChange={(e) => updateFilter("actorUserId", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">{t("securityAudit.filters.allActors")}</option>
              {facets.actorUserIds.map((actorUserId) => (
                <option key={actorUserId} value={actorUserId}>
                  {actorUserId}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.filters.entityType")}
            </span>
            <select
              value={filters.entityType}
              onChange={(e) => updateFilter("entityType", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">{t("securityAudit.filters.allEntityTypes")}</option>
              {facets.entityTypes.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityType}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.filters.entity")}
            </span>
            <select
              value={filters.entityId}
              onChange={(e) => updateFilter("entityId", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">{t("securityAudit.filters.allEntities")}</option>
              {facets.entities
                .filter((entity) => !filters.entityType || entity.type === filters.entityType)
                .map((entity) => (
                  <option key={`${entity.type}:${entity.id}`} value={entity.id}>
                    {entity.label}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("securityAudit.summary.totalEvents")}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("securityAudit.summary.page")}</p>
          <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-300">
            {page}/{totalPages}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("securityAudit.summary.actions")}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{facets.actions.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("securityAudit.summary.entityTypes")}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{facets.entityTypes.length}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("securityAudit.resultsTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("securityAudit.resultsSubtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {t("securityAudit.pageSize", { count: pageSize })}
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || loading || total === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={16} />
              {exporting ? t("securityAudit.exporting") : t("securityAudit.export")}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-950/50">
            <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <ShieldAlert size={18} />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
              {t("securityAudit.emptyTitle")}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {t("securityAudit.emptyBody")}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {rows.map((row) => (
              <AuditRow
                key={row.id}
                row={{
                  ...row,
                  entityLabel:
                    row.entity_type === "account" && row.entity_id === activeAccountId
                      ? activeAccount?.name || row.entityLabel
                      : row.entityLabel,
                }}
                expanded={!!expandedRows[row.id]}
                onToggle={toggleExpanded}
                onReview={openReview}
                t={t}
              />
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("securityAudit.pagination", {
              from: rows.length === 0 ? 0 : (page - 1) * pageSize + 1,
              to: rows.length === 0 ? 0 : Math.min(page * pageSize, total),
              total,
            })}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page <= 1 || loading}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
            >
              {t("common.prev")}
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page >= totalPages || loading}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
            >
              {t("common.next")}
            </button>
          </div>
        </div>
      </Card>

      {selectedEventId ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeReview} />
          <aside
            role="dialog"
            aria-modal="true"
            className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t("securityAudit.investigationTitle")}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {selectedEvent?.action || t("securityAudit.detailLoading")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeReview}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label={t("common.close")}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-4 p-5">
              {detailLoading || !selectedEvent ? (
                detailLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                    <Skeleton className="h-40" />
                  </div>
                ) : (
                  <Card className="p-4">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {t("securityAudit.detailNotFound")}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {t("securityAudit.detailNotFoundBody")}
                    </p>
                  </Card>
                )
              ) : (
                <>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("securityAudit.investigationSummary")}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {selectedEvent.action}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleCopyJson}
                          disabled={copying}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Copy size={16} />
                          {copying ? t("securityAudit.copying") : t("securityAudit.copyJson")}
                        </button>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <DetailField label={t("securityAudit.columns.timestamp")} value={formatDateTime(selectedEvent.created_at)} />
                      <DetailField label={t("securityAudit.columns.action")} value={selectedEvent.action} />
                      <DetailField
                        label={t("securityAudit.columns.actor")}
                        value={selectedEvent.actorLabel || selectedEvent.actor_user_id || t("securityAudit.systemActor")}
                      />
                      <DetailField label={t("securityAudit.detail.actorId")} value={selectedEvent.actor_user_id} />
                      <DetailField label={t("securityAudit.detail.account")} value={activeAccount?.name || activeAccountId} />
                      <DetailField label={t("securityAudit.detail.accountId")} value={activeAccountId} />
                      <DetailField label={t("securityAudit.detail.entityType")} value={selectedEvent.entity_type} />
                      <DetailField label={t("securityAudit.detail.entity")} value={selectedEvent.entityLabel || selectedEvent.entity_id} />
                      <DetailField label={t("securityAudit.detail.entityId")} value={selectedEvent.entity_id} />
                      <DetailField label={t("securityAudit.detail.eventId")} value={selectedEvent.id} />
                      <DetailField
                        label={t("securityAudit.detail.reason")}
                        value={describeHostedEventReason(selectedEvent.metadata?.reason || selectedEvent.metadata?.code, t)}
                      />
                      <DetailField
                        label={t("securityAudit.detail.correlationId")}
                        value={selectedEvent.metadata?.correlation_id || "—"}
                      />
                    </div>
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {t("securityAudit.metadataTitle")}
                        </h4>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {t("securityAudit.metadataSubtitle")}
                        </p>
                      </div>
                    </div>
                    <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                      {JSON.stringify(selectedEvent.metadata || {}, null, 2)}
                    </pre>
                  </Card>
                </>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
