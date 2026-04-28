import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shield, Trash2, X } from "lucide-react";

import Card from "../components/Card";
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
import {
  DEFAULT_FILTERS,
  DEFAULT_HOSTED_EVENT_FILTERS,
  filtersFromSearchParams,
  pageFromSearchParams,
  alertStatusFromSearchParams,
  focusedAlertIdFromSearchParams,
  focusedHostedEventIdFromSearchParams,
  buildSearchParams,
  sanitizeFilePart,
  escapeSqlLiteral,
  clampInt,
  hiddenExportJobsKey,
} from "./security-audit/utils";
import {
  startCase,
  summarizeHostedEvents,
  groupHostedEventCorrelations,
  findRelatedAnomalyAlertForHostedEvent,
  findRelatedHostedEventForAnomalyAlert,
} from "./security-audit/hostedEventHelpers";
import {
  buildHostedEventsEmptyGuidance,
  buildAnomalyEmptyGuidance,
  buildInvestigationEntityContext,
  buildInvestigationEntityLinks,
  buildInvestigationTimelineItems,
  buildInvestigationContextSummary,
} from "./security-audit/investigationHelpers";
import {
  InvestigationContextStrip,
  InvestigationTimeline,
  InvestigationEntityPanel,
  InvestigationRelatedLinks,
} from "./security-audit/InvestigationPanel";
import AuditSettingsCard from "./security-audit/AuditSettingsCard";
import HostedEventsCard from "./security-audit/HostedEventsCard";
import ExportJobsCard from "./security-audit/ExportJobsCard";
import AnomalyAlertsCard from "./security-audit/AnomalyAlertsCard";
import AuditLedgerCard from "./security-audit/AuditLedgerCard";
import AuditEventDrawer from "./security-audit/AuditEventDrawer";

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

      <AuditSettingsCard
        securitySettingsDraft={securitySettingsDraft}
        settingsSaving={settingsSaving}
        onSave={handleSaveSecuritySettings}
        onChangeSetting={updateSecuritySetting}
        t={t}
      />

      <HostedEventsCard
        hostedEventFilters={hostedEventFilters}
        setHostedEventFilters={setHostedEventFilters}
        hostedEventCategories={hostedEventCategories}
        hostedEventSurfaces={hostedEventSurfaces}
        hostedEventSummary={hostedEventSummary}
        hostedEventsEmptyGuidance={hostedEventsEmptyGuidance}
        hostedEventCorrelations={hostedEventCorrelations}
        hostedEvents={hostedEvents}
        hostedExporting={hostedExporting}
        focusedAlertId={focusedAlertId}
        focusedHostedEventId={focusedHostedEventId}
        anomalyAlerts={anomalyAlerts}
        onCopySql={handleCopyHostedEventsSql}
        onCopyInvestigationLink={handleCopyInvestigationLink}
        onExport={handleHostedEventsExport}
        onFocusRow={focusHostedEventInvestigation}
        t={t}
      />

      <ExportJobsCard
        shouldRecommendBackendExport={shouldRecommendBackendExport}
        exportJobsPageSize={exportJobsPageSize}
        setExportJobsPageSize={setExportJobsPageSize}
        exportJobsPage={exportJobsPage}
        setExportJobsPage={setExportJobsPage}
        exportJobsTotal={exportJobsTotal}
        exportJobPages={exportJobPages}
        hiddenExportJobIds={hiddenExportJobIds}
        onRestoreHidden={restoreHiddenBackendExports}
        backendExportLabel={backendExportLabel}
        onChangeExportLabel={setBackendExportLabel}
        onBackendExport={handleBackendExport}
        backendExporting={backendExporting}
        loading={loading}
        exportJobs={exportJobs}
        visibleExportJobs={visibleExportJobs}
        onDismissJob={dismissBackendExportJob}
        onDownloadJob={handleDownloadBackendExport}
        downloadingJobId={downloadingJobId}
        t={t}
      />

      <AnomalyAlertsCard
        anomalyAlertsPageSize={anomalyAlertsPageSize}
        setAnomalyAlertsPageSize={setAnomalyAlertsPageSize}
        anomalyAlertsPage={anomalyAlertsPage}
        setAnomalyAlertsPage={setAnomalyAlertsPage}
        anomalyAlertsTotal={anomalyAlertsTotal}
        anomalyAlertPages={anomalyAlertPages}
        alertStatus={alertStatus}
        onSetAlertStatusFilter={setAlertStatusFilter}
        anomalyAlerts={anomalyAlerts}
        anomalyEmptyGuidance={anomalyEmptyGuidance}
        focusedAlertId={focusedAlertId}
        alertDrafts={alertDrafts}
        alertAssignees={alertAssignees}
        alertHistoryById={alertHistoryById}
        alertBusyKey={alertBusyKey}
        expandedAlerts={expandedAlerts}
        onAlertAction={handleAlertAction}
        onFocusAlert={focusAnomalyAlert}
        onToggleExpanded={toggleAlertExpanded}
        onUpdateDraft={updateAlertDraft}
        t={t}
      />

      <AuditLedgerCard
        filters={filters}
        onUpdateFilter={updateFilter}
        onClearFilters={clearFilters}
        onApplyDatePreset={applyDatePreset}
        facets={facets}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        setPage={setPage}
        loading={loading}
        rows={rows}
        exporting={exporting}
        expandedRows={expandedRows}
        onToggleExpanded={toggleExpanded}
        onReview={openReview}
        onExport={handleExport}
        activeAccountId={activeAccountId}
        activeAccount={activeAccount}
        t={t}
      />

      {selectedEventId ? (
        <AuditEventDrawer
          selectedEvent={selectedEvent}
          detailLoading={detailLoading}
          onClose={closeReview}
          onCopyJson={handleCopyJson}
          copying={copying}
          activeAccountId={activeAccountId}
          activeAccount={activeAccount}
          t={t}
        />
      ) : null}
    </div>
  );
}
