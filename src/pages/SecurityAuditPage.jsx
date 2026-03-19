import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Shield,
  ShieldAlert,
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
import { downloadTextFile, buildCsv } from "../utils/export";
import { isManageRole } from "../utils/permissions";

const DEFAULT_FILTERS = {
  dateFrom: "",
  dateTo: "",
  action: "",
  actorUserId: "",
  entityType: "",
  entityId: "",
};

const ALERT_CLASSIFICATIONS = ["suspicious", "expected", "false_positive", "informational"];

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

function buildSearchParams(filters, page, selectedEventId, alertStatus) {
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
  return params;
}

function sanitizeFilePart(value, fallback) {
  const cleaned = String(value || fallback || "export")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]/g, "_");
  return cleaned || fallback;
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
  const [facets, setFacets] = useState({ actions: [], actorUserIds: [], entityTypes: [] });
  const [expandedRows, setExpandedRows] = useState({});
  const [anomalyAlerts, setAnomalyAlerts] = useState([]);
  const [alertAssignees, setAlertAssignees] = useState([]);
  const [expandedAlerts, setExpandedAlerts] = useState({});
  const [alertHistoryById, setAlertHistoryById] = useState({});
  const [alertDrafts, setAlertDrafts] = useState({});
  const [alertBusyKey, setAlertBusyKey] = useState("");
  const [exportJobs, setExportJobs] = useState([]);
  const [securitySettings, setSecuritySettings] = useState(null);
  const [securitySettingsDraft, setSecuritySettingsDraft] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(() => searchParams.get("event") || "");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
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
    setSearchParams(buildSearchParams(filters, page, selectedEventId, alertStatus), { replace: true });
  }, [alertStatus, filters, page, selectedEventId, setSearchParams]);

  async function load() {
    if (!activeAccountId || !canManage) return;

    setLoading(true);
    setError("");

    try {
      const [events, nextFacets, nextAlerts, nextJobs, nextAssignees, nextSecuritySettings] = await Promise.all([
        listSecurityAuditEvents(activeAccountId, { ...filters, page, pageSize }),
        listSecurityAuditFilterOptions(activeAccountId),
        listSecurityAnomalyAlerts(activeAccountId, { status: alertStatus, limit: 8 }),
        listSecurityAuditExportJobs(activeAccountId, { limit: 8 }),
        listSecurityAlertAssignees(activeAccountId),
        getAccountSecuritySettings(activeAccountId),
      ]);

      setRows(events.rows);
      setTotal(events.total);
      setFacets(nextFacets);
      setAnomalyAlerts(nextAlerts);
      setExportJobs(nextJobs);
      setAlertAssignees(nextAssignees);
      setSecuritySettings(nextSecuritySettings);
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
      setExportJobs([]);
      setAlertAssignees([]);
      setSecuritySettings(null);
      setSecuritySettingsDraft(null);
      setError(e?.message || t("securityAudit.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeAccountId || !canManage) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, alertStatus, canManage, page, pageSize, filters]);

  useEffect(() => {
    setSecuritySettings(null);
    setSecuritySettingsDraft(null);
  }, [activeAccountId]);

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
      const job = await requestSecurityAuditBackendExport(activeAccountId, filters);
      await runSecurityAuditExportJob(job.id);
      await load();
      setInfo(t("securityAudit.backendExportRequested"));
    } catch (e) {
      setError(e?.message || t("securityAudit.backendExportError"));
    } finally {
      setBackendExporting(false);
    }
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
    setFilters({
      dateFrom: "",
      dateTo: "",
      action: recommended.action || "",
      actorUserId: recommended.actorUserId || "",
      entityType: recommended.entityType || "",
      entityId: recommended.entityId || "",
    });
    setPage(1);
    if (alert?.metadata?.latest_event_id) {
      setSelectedEventId(String(alert.metadata.latest_event_id));
    }
  }

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const shouldRecommendBackendExport = total > SECURITY_AUDIT_BACKEND_EXPORT_THRESHOLD;

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

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {info ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {info}
        </div>
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
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
              {t("securityAudit.backendExportsTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {shouldRecommendBackendExport
                ? t("securityAudit.backendExportsRecommended")
                : t("securityAudit.backendExportsSubtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleBackendExport}
            disabled={backendExporting || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download size={16} />
            {backendExporting ? t("securityAudit.backendExportRunning") : t("securityAudit.backendExport")}
          </button>
        </div>

        {exportJobs.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
            {t("securityAudit.backendExportsEmpty")}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {exportJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t("securityAudit.backendExportJobLabel", { id: shortenId(job.id) })}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("securityAudit.backendExportJobMeta", {
                        status: job.status,
                        createdAt: formatDateTime(job.createdAt),
                      })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
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
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {t("securityAudit.anomaliesOpenCount", { count: anomalyAlerts.length })}
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
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {t(`securityAudit.alertStatus.${value}`)}
              </button>
            );
          })}
        </div>

        {anomalyAlerts.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
            {t("securityAudit.anomaliesEmpty")}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {anomalyAlerts.map((alert) => (
              <div key={alert.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
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

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => focusAnomalyAlert(alert)}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    {t("securityAudit.anomaly.focus")}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleAlertExpanded(alert.id)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
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
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {t("securityAudit.alert.actions.classify")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAlertAction(alert, "assign")}
                        disabled={alertBusyKey === `${alert.id}:assign` || String(alert.status || "").toLowerCase() === "resolved"}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
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
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
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
              {t("securityAudit.filters.entityId")}
            </span>
            <input
              type="text"
              value={filters.entityId}
              onChange={(e) => updateFilter("entityId", e.target.value)}
              placeholder={t("securityAudit.filters.entityIdPlaceholder")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
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
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t("common.prev")}
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page >= totalPages || loading}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
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
