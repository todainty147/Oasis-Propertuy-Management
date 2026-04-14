import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import Card from "../components/Card";
import FeatureAccessCard from "../components/FeatureAccessCard";
import OnboardingHintCard from "../components/OnboardingHintCard";
import Skeleton from "../components/ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { ENTITLEMENT_FEATURES, hasFeature, normalizePlan } from "../lib/entitlements";
import { loadRootTelemetryBundle } from "../services/rootTelemetryService";
import {
  grantRootTelemetrySupportAccess,
  listRootTelemetrySupportAccess,
  revokeRootTelemetrySupportAccess,
  searchRootTelemetrySupportOperators,
} from "../services/rootTelemetryAccessService";
import { canAccessRootTelemetry as canAccessRootTelemetryView } from "../utils/telemetryAccess";

const DEFAULT_SIGNAL_LIMIT = 200;
const STORAGE_SURFACES = new Set(["documents", "maintenance", "work_orders"]);
const STORAGE_REASONS = new Set([
  "rls_denied",
  "timeout",
  "invalid_request",
  "record_unavailable",
  "unexpected_failure",
]);
const LATENCY_SLO_TARGETS = {
  dashboard: 1200,
  finance: 1200,
  portfolio_health: 1500,
  maintenance: 1500,
  invitations: 1500,
};
const TELEMETRY_WINDOWS = [
  { key: "15m", minutes: 15 },
  { key: "1h", minutes: 60 },
  { key: "24h", minutes: 24 * 60 },
];

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function startCase(value) {
  return String(value || "")
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value) {
  const next = value ? new Date(value) : null;
  if (!next || Number.isNaN(next.getTime())) return "—";
  return next.toLocaleString();
}

function formatDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) return "—";
  return `${Math.round(duration)} ms`;
}

function percentile(values, ratio) {
  const numbers = (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!numbers.length) return null;
  const index = Math.min(numbers.length - 1, Math.max(0, Math.ceil(numbers.length * ratio) - 1));
  return numbers[index];
}

function safeDateValue(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date;
}

function describeSurface(surface, t) {
  const normalized = normalizeKey(surface);
  switch (normalized) {
    case "command_center":
      return t("securityAudit.hostedEvents.surface.commandCenter");
    case "attention_center":
      return t("securityAudit.hostedEvents.surface.attentionCenter");
    case "portfolio_health":
      return t("securityAudit.hostedEvents.surface.portfolioHealth");
    case "dashboard":
      return t("securityAudit.hostedEvents.surface.dashboard");
    case "finance":
      return t("securityAudit.hostedEvents.surface.finance");
    case "documents":
      return t("securityAudit.hostedEvents.surface.documents");
    case "invitations":
      return t("securityAudit.hostedEvents.surface.invitations");
    case "maintenance":
      return t("securityAudit.hostedEvents.surface.maintenance");
    case "work_orders":
      return t("securityAudit.hostedEvents.surface.workOrders");
    case "contractor_portal":
      return t("securityAudit.hostedEvents.surface.contractorPortal");
    case "tenant_portal":
      return t("securityAudit.hostedEvents.surface.tenantPortal");
    case "notifications":
      return t("securityAudit.hostedEvents.surface.notifications");
    case "security_audit":
      return t("securityAudit.hostedEvents.surface.securityAudit");
    default:
      return startCase(surface) || "—";
  }
}

function workflowDefinition(key, t) {
  switch (key) {
    case "uploads":
      return {
        label: t("rootTelemetry.workflows.uploads"),
        to: "/documents",
      };
    case "invites":
      return {
        label: t("rootTelemetry.workflows.invites"),
        to: "/invitations",
      };
    case "finance":
      return {
        label: t("rootTelemetry.workflows.finance"),
        to: "/finance",
      };
    case "maintenance":
      return {
        label: t("rootTelemetry.workflows.maintenance"),
        to: "/maintenance-inbox",
      };
    default:
      return {
        label: startCase(key),
        to: "",
      };
  }
}

function resolveTelemetryBucketMinutes(windowKey) {
  switch (windowKey) {
    case "15m":
      return 3;
    case "24h":
      return 60;
    default:
      return 10;
  }
}

function resolveWorkflowKey(surface) {
  const normalizedSurface = normalizeKey(surface);
  if (normalizedSurface === "invitations") return "invites";
  if (["finance", "dashboard", "portfolio_health"].includes(normalizedSurface)) return "finance";
  if (["maintenance", "command_center", "attention_center", "work_orders", "contractor_portal"].includes(normalizedSurface)) {
    return "maintenance";
  }
  if (normalizedSurface === "documents") return "uploads";
  return "";
}

export function buildRootTelemetrySummary(events, { activeAlertsTotal = 0 } = {}) {
  const rows = Array.isArray(events) ? events : [];
  let authorizationDenials = 0;
  let unexpectedFailures = 0;
  let storageFailures = 0;
  let inviteFailures = 0;
  let paymentsFailures = 0;
  let slowResponses = 0;

  for (const row of rows) {
    const kind = normalizeKey(row?.kind);
    const surface = normalizeKey(row?.surface);
    const reason = normalizeKey(row?.reason);

    if (kind === "authorization_denied") authorizationDenials += 1;
    if (kind === "unexpected_security_failure") unexpectedFailures += 1;
    if (kind === "latency_threshold_exceeded") slowResponses += 1;
    if (STORAGE_SURFACES.has(surface) && (kind === "unexpected_security_failure" || STORAGE_REASONS.has(reason))) {
      storageFailures += 1;
    }
    if (surface === "invitations") inviteFailures += 1;
    if (surface === "finance" || surface === "dashboard" || surface === "portfolio_health") {
      paymentsFailures += 1;
    }
  }

  return {
    signalVolume: rows.length,
    authorizationDenials,
    unexpectedFailures,
    storageFailures,
    inviteFailures,
    paymentsFailures,
    slowResponses,
    activeAlertsTotal: Number(activeAlertsTotal || 0),
  };
}

export function buildTrendDelta(currentValue, previousValue) {
  const current = Number(currentValue || 0);
  const previous = Number(previousValue || 0);
  return current - previous;
}

function formatTrend(delta, t) {
  const value = Number(delta || 0);
  if (value === 0) return t("rootTelemetry.trend.flat");
  if (value > 0) return t("rootTelemetry.trend.up", { count: value });
  return t("rootTelemetry.trend.down", { count: Math.abs(value) });
}

export function filterRootTelemetryEventsByWindow(events, windowKey, now = new Date()) {
  const selectedWindow = TELEMETRY_WINDOWS.find((window) => window.key === windowKey) || TELEMETRY_WINDOWS[1];
  const current = safeDateValue(now) || new Date();
  const threshold = current.getTime() - selectedWindow.minutes * 60 * 1000;
  return (Array.isArray(events) ? events : []).filter((row) => {
    const createdAt = safeDateValue(row?.created_at);
    if (!createdAt) return false;
    return createdAt.getTime() >= threshold;
  });
}

export function buildRootTelemetrySurfaceRows(events, t) {
  const grouped = new Map();

  for (const row of Array.isArray(events) ? events : []) {
    const surface = normalizeKey(row?.surface);
    if (!surface) continue;
    const current = grouped.get(surface) || {
      key: surface,
      count: 0,
      denials: 0,
      failures: 0,
      latestSeenAt: "",
      label: describeSurface(surface, t),
    };
    current.count += 1;
    if (normalizeKey(row?.kind) === "authorization_denied") current.denials += 1;
    if (normalizeKey(row?.kind) === "unexpected_security_failure") current.failures += 1;
    const createdAt = String(row?.created_at || "");
    if (!current.latestSeenAt || createdAt > current.latestSeenAt) current.latestSeenAt = createdAt;
    grouped.set(surface, current);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(b.latestSeenAt || "").localeCompare(String(a.latestSeenAt || ""));
  });
}

export function buildRootTelemetryWorkflowRows(events, t) {
  const workflows = new Map(
    ["uploads", "invites", "finance", "maintenance"].map((key) => [
      key,
      { key, count: 0, latestSeenAt: "", label: workflowDefinition(key, t).label, to: workflowDefinition(key, t).to },
    ]),
  );

  for (const row of Array.isArray(events) ? events : []) {
    const kind = normalizeKey(row?.kind);
    const workflowKey = resolveWorkflowKey(row?.surface);
    if (!workflowKey) continue;
    const current = workflows.get(workflowKey);
    current.count += 1;
    const createdAt = String(row?.created_at || "");
    if (!current.latestSeenAt || createdAt > current.latestSeenAt) current.latestSeenAt = createdAt;
    current.lastKind = kind || current.lastKind || "";
  }

  return Array.from(workflows.values()).sort((a, b) => b.count - a.count);
}

export function buildRootTelemetryBucketDrilldown(events, bucketStart, bucketMinutes, t) {
  const bucketDate = safeDateValue(bucketStart);
  const safeBucketMinutes = Number(bucketMinutes || 0);
  if (!bucketDate || !Number.isFinite(safeBucketMinutes) || safeBucketMinutes <= 0) {
    return [];
  }

  const bucketEnd = new Date(bucketDate.getTime() + safeBucketMinutes * 60 * 1000);
  const workflows = new Map();

  for (const row of Array.isArray(events) ? events : []) {
    const createdAt = safeDateValue(row?.created_at);
    if (!createdAt || createdAt < bucketDate || createdAt >= bucketEnd) continue;

    const workflowKey = resolveWorkflowKey(row?.surface);
    if (!workflowKey) continue;

    const current = workflows.get(workflowKey) || {
      key: workflowKey,
      ...workflowDefinition(workflowKey, t),
      count: 0,
      denials: 0,
      failures: 0,
      slowCount: 0,
      latestSeenAt: "",
      topSurface: "",
    };
    current.count += 1;

    const kind = normalizeKey(row?.kind);
    if (kind === "authorization_denied") current.denials += 1;
    if (kind === "unexpected_security_failure") current.failures += 1;
    if (kind === "latency_threshold_exceeded") current.slowCount += 1;

    const createdAtText = String(row?.created_at || "");
    if (!current.latestSeenAt || createdAtText > current.latestSeenAt) current.latestSeenAt = createdAtText;
    if (!current.topSurface) current.topSurface = describeSurface(row?.surface, t);
    workflows.set(workflowKey, current);
  }

  return Array.from(workflows.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(b.latestSeenAt || "").localeCompare(String(a.latestSeenAt || ""));
  });
}

export function buildRootTelemetryLatencyRows(events, t) {
  const grouped = new Map();

  for (const row of Array.isArray(events) ? events : []) {
    const kind = normalizeKey(row?.kind);
    if (kind !== "latency_threshold_exceeded" && kind !== "latency_sample") continue;
    const surface = normalizeKey(row?.surface);
    if (!surface) continue;
    const durationMs = Number(row?.metadata?.duration_ms || 0);
    const current = grouped.get(surface) || {
      key: surface,
      label: describeSurface(surface, t),
      sampleCount: 0,
      slowCount: 0,
      maxDurationMs: 0,
      latestSeenAt: "",
      targetMs: Number(row?.metadata?.target_ms || row?.metadata?.threshold_ms || LATENCY_SLO_TARGETS[surface] || 0) || null,
      durations: [],
    };
    if (kind === "latency_sample") {
      current.sampleCount += 1;
      if (Number.isFinite(durationMs) && durationMs > 0) current.durations.push(durationMs);
    }
    if (kind === "latency_threshold_exceeded") {
      current.slowCount += 1;
    }
    current.maxDurationMs = Math.max(current.maxDurationMs, Number.isFinite(durationMs) ? durationMs : 0);
    current.targetMs =
      current.targetMs || Number(row?.metadata?.target_ms || row?.metadata?.threshold_ms || LATENCY_SLO_TARGETS[surface] || 0) || null;
    const createdAt = String(row?.created_at || "");
    if (!current.latestSeenAt || createdAt > current.latestSeenAt) current.latestSeenAt = createdAt;
    grouped.set(surface, current);
  }

  return Array.from(grouped.values())
    .map((row) => {
      const p50DurationMs = percentile(row.durations, 0.5);
      const p95DurationMs = percentile(row.durations, 0.95);
      let status = "healthy";
      if (row.slowCount >= 2 || (row.targetMs && p95DurationMs && p95DurationMs > row.targetMs * 1.2)) {
        status = "breach";
      } else if (row.slowCount >= 1 || (row.targetMs && p95DurationMs && p95DurationMs > row.targetMs)) {
        status = "watch";
      }
      return {
        ...row,
        p50DurationMs,
        p95DurationMs,
        status,
      };
    })
    .sort((a, b) => {
      const statusRank = { breach: 3, watch: 2, healthy: 1 };
      if ((statusRank[b.status] || 0) !== (statusRank[a.status] || 0)) {
        return (statusRank[b.status] || 0) - (statusRank[a.status] || 0);
      }
      if (b.slowCount !== a.slowCount) return b.slowCount - a.slowCount;
      if ((b.p95DurationMs || 0) !== (a.p95DurationMs || 0)) return (b.p95DurationMs || 0) - (a.p95DurationMs || 0);
      return b.maxDurationMs - a.maxDurationMs;
    });
}

export function buildRootTelemetrySaturationRows(events, t) {
  const grouped = new Map();

  for (const row of Array.isArray(events) ? events : []) {
    const kind = normalizeKey(row?.kind);
    const surface = normalizeKey(row?.surface);
    const reason = normalizeKey(row?.reason);
    if (!surface) continue;
    if (!["authorization_denied", "unexpected_security_failure", "latency_threshold_exceeded"].includes(kind)) {
      continue;
    }

    const key = `${surface}:${reason || kind}`;
    const current = grouped.get(key) || {
      key,
      surface,
      label: describeSurface(surface, t),
      reason: reason || kind,
      burstCount: 0,
      denials: 0,
      failures: 0,
      slowCount: 0,
      latestSeenAt: "",
    };
    current.burstCount += 1;
    if (kind === "authorization_denied") current.denials += 1;
    if (kind === "unexpected_security_failure") current.failures += 1;
    if (kind === "latency_threshold_exceeded") current.slowCount += 1;
    const createdAt = String(row?.created_at || "");
    if (!current.latestSeenAt || createdAt > current.latestSeenAt) current.latestSeenAt = createdAt;
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .filter((row) => row.burstCount >= 2)
    .sort((a, b) => {
      if (b.burstCount !== a.burstCount) return b.burstCount - a.burstCount;
      return String(b.latestSeenAt || "").localeCompare(String(a.latestSeenAt || ""));
    });
}

function saturationStatusMeta(row, t) {
  if (row.burstCount >= 4 || row.failures >= 2 || row.slowCount >= 2) {
    return {
      label: t("rootTelemetry.saturation.status.burst"),
      className:
        "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-200",
    };
  }
  return {
    label: t("rootTelemetry.saturation.status.watch"),
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200",
  };
}

function latencyStatusMeta(status, t) {
  switch (status) {
    case "breach":
      return {
        label: t("rootTelemetry.latency.status.breach"),
        className:
          "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-200",
      };
    case "watch":
      return {
        label: t("rootTelemetry.latency.status.watch"),
        className:
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200",
      };
    default:
      return {
        label: t("rootTelemetry.latency.status.healthy"),
        className:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200",
      };
  }
}

function deriveLatencyStatus(row) {
  if (!row) return "healthy";
  if (Number(row.slowCount || 0) >= 2 || (row.targetMs && row.p95DurationMs && row.p95DurationMs > row.targetMs * 1.2)) {
    return "breach";
  }
  if (Number(row.slowCount || 0) >= 1 || (row.targetMs && row.p95DurationMs && row.p95DurationMs > row.targetMs)) {
    return "watch";
  }
  return "healthy";
}

function hydrateLatencyRollupRows(rows, t) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    label: describeSurface(row.label || row.key || row.surface, t),
    status: row.status || deriveLatencyStatus(row),
  }));
}

function hydrateBurstRollupRows(rows, t) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    label: describeSurface(row.label || row.surface, t),
  }));
}

export function buildRootTelemetryTrendBars(series = []) {
  const rows = Array.isArray(series) ? series : [];
  const maxSignals = rows.reduce((max, row) => Math.max(max, Number(row?.totalSignals || 0)), 0);
  return rows.map((row) => ({
    ...row,
    barHeight: maxSignals > 0 ? Math.max(10, Math.round((Number(row?.totalSignals || 0) / maxSignals) * 100)) : 10,
  }));
}

function StatCard({ title, value, hint = "", tone = "blue" }) {
  const tones = {
    blue: "border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20",
    amber: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20",
    rose: "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20",
    emerald: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20",
    violet: "border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/20",
  };

  return (
    <Card className={`p-4 border shadow-sm ${tones[tone] || tones.blue}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </Card>
  );
}

export default function RootTelemetryPage() {
  const { setTitle } = usePageTitle();
  const { t } = useI18n();
  const { activeAccountId, activeAccount, isRootOperator, activeRole, canAccessTelemetry, rootTelemetryAccessMode, isRootTelemetryAdmin } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [grantError, setGrantError] = useState("");
  const [grantInfo, setGrantInfo] = useState("");
  const [supportAccessRows, setSupportAccessRows] = useState([]);
  const [supportDirectoryRows, setSupportDirectoryRows] = useState([]);
  const [supportDirectoryLoading, setSupportDirectoryLoading] = useState(false);
  const [supportAccessLoading, setSupportAccessLoading] = useState(false);
  const [grantingSupportAccess, setGrantingSupportAccess] = useState(false);
  const [revokingSupportUserId, setRevokingSupportUserId] = useState("");
  const [supportGrantForm, setSupportGrantForm] = useState({
    userEmail: "",
    notes: "",
    expiresAt: "",
  });
  const [bundle, setBundle] = useState({
    events: [],
    previousEvents: [],
    latencyRollups: [],
    burstRollups: [],
    trendSeries: [],
    activeAlerts: [],
    activeAlertsTotal: 0,
    limit: DEFAULT_SIGNAL_LIMIT,
  });
  const [selectedWindowKey, setSelectedWindowKey] = useState("1h");
  const [selectedTrendBucketStart, setSelectedTrendBucketStart] = useState("");
  const activeAccountPlan = normalizePlan(activeAccount?.subscription_plan);
  const accountHasRootTelemetryEntitlement =
    isRootOperator ||
    !activeAccountId ||
    !activeAccount ||
    hasFeature(activeAccountPlan, ENTITLEMENT_FEATURES.ROOT_TELEMETRY);

  const canAccessTelemetryView = useMemo(
    () => canAccessRootTelemetryView({ isRootOperator, activeRole, user: null }) || canAccessTelemetry,
    [activeRole, canAccessTelemetry, isRootOperator],
  );

  useEffect(() => {
    setTitle(t("rootTelemetry.pageTitle"));
  }, [setTitle, t]);

  useEffect(() => {
    if (!activeAccountId || !canAccessTelemetryView || !accountHasRootTelemetryEntitlement) {
      setLoading(false);
      setError("");
      setBundle({
        events: [],
        previousEvents: [],
        latencyRollups: [],
        burstRollups: [],
        trendSeries: [],
        activeAlerts: [],
        activeAlertsTotal: 0,
        limit: DEFAULT_SIGNAL_LIMIT,
        windowKey: selectedWindowKey,
      });
      return;
    }
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const nextBundle = await loadRootTelemetryBundle(activeAccountId, {
          limit: DEFAULT_SIGNAL_LIMIT,
          windowKey: selectedWindowKey,
        });
        if (!cancelled) {
          setBundle(nextBundle);
        }
      } catch (nextError) {
        if (!cancelled) {
          setBundle({
            events: [],
            previousEvents: [],
            latencyRollups: [],
            burstRollups: [],
            trendSeries: [],
            activeAlerts: [],
            activeAlertsTotal: 0,
            limit: DEFAULT_SIGNAL_LIMIT,
            windowKey: selectedWindowKey,
          });
          setError(nextError?.message || t("rootTelemetry.loadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accountHasRootTelemetryEntitlement, activeAccountId, canAccessTelemetryView, selectedWindowKey, t]);

  useEffect(() => {
    if (!activeAccountId || !isRootTelemetryAdmin || !accountHasRootTelemetryEntitlement) {
      setSupportAccessRows([]);
      setSupportAccessLoading(false);
      return;
    }

    let cancelled = false;
    async function loadSupportAccess() {
      setSupportAccessLoading(true);
      try {
        const rows = await listRootTelemetrySupportAccess(activeAccountId);
        if (!cancelled) setSupportAccessRows(rows);
      } catch (nextError) {
        if (!cancelled) setGrantError(nextError?.message || t("rootTelemetry.supportAccess.loadError"));
      } finally {
        if (!cancelled) setSupportAccessLoading(false);
      }
    }

    loadSupportAccess();
    return () => {
      cancelled = true;
    };
  }, [accountHasRootTelemetryEntitlement, activeAccountId, isRootTelemetryAdmin, t]);

  useEffect(() => {
    if (!isRootTelemetryAdmin || !accountHasRootTelemetryEntitlement) {
      setSupportDirectoryRows([]);
      setSupportDirectoryLoading(false);
      return;
    }

    const query = String(supportGrantForm.userEmail || "").trim().toLowerCase();
    if (query.length < 2) {
      setSupportDirectoryRows([]);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      setSupportDirectoryLoading(true);
      try {
        const rows = await searchRootTelemetrySupportOperators({
          accountId: activeAccountId,
          query,
          limit: 8,
        });
        if (!cancelled) setSupportDirectoryRows(rows);
      } catch {
        if (!cancelled) setSupportDirectoryRows([]);
      } finally {
        if (!cancelled) setSupportDirectoryLoading(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [accountHasRootTelemetryEntitlement, activeAccountId, isRootTelemetryAdmin, supportGrantForm.userEmail]);

  const summary = useMemo(
    () => buildRootTelemetrySummary(bundle.events, { activeAlertsTotal: bundle.activeAlertsTotal }),
    [bundle.activeAlertsTotal, bundle.events],
  );
  const previousSummary = useMemo(
    () => buildRootTelemetrySummary(bundle.previousEvents, { activeAlertsTotal: 0 }),
    [bundle.previousEvents],
  );
  const surfaceRows = useMemo(() => buildRootTelemetrySurfaceRows(bundle.events, t).slice(0, 8), [bundle.events, t]);
  const workflowRows = useMemo(() => buildRootTelemetryWorkflowRows(bundle.events, t), [bundle.events, t]);
  const latencyRows = useMemo(() => {
    const rows = bundle.latencyRollups?.length
      ? hydrateLatencyRollupRows(bundle.latencyRollups, t)
      : buildRootTelemetryLatencyRows(bundle.events, t);
    return rows.slice(0, 6);
  }, [bundle.events, bundle.latencyRollups, t]);
  const previousLatencyRows = useMemo(() => buildRootTelemetryLatencyRows(bundle.previousEvents, t), [bundle.previousEvents, t]);
  const saturationRows = useMemo(() => {
    const rows = bundle.burstRollups?.length
      ? hydrateBurstRollupRows(bundle.burstRollups, t)
      : buildRootTelemetrySaturationRows(bundle.events, t);
    return rows.slice(0, 6);
  }, [bundle.burstRollups, bundle.events, t]);
  const previousSaturationRows = useMemo(() => buildRootTelemetrySaturationRows(bundle.previousEvents, t), [bundle.previousEvents, t]);
  const trendBars = useMemo(() => buildRootTelemetryTrendBars(bundle.trendSeries || []), [bundle.trendSeries]);
  const selectedBucketStart = useMemo(
    () => selectedTrendBucketStart || trendBars.at(-1)?.bucketStart || "",
    [selectedTrendBucketStart, trendBars],
  );
  const selectedBucketMinutes = useMemo(() => resolveTelemetryBucketMinutes(selectedWindowKey), [selectedWindowKey]);
  const drilldownRows = useMemo(
    () => buildRootTelemetryBucketDrilldown(bundle.events, selectedBucketStart, selectedBucketMinutes, t),
    [bundle.events, selectedBucketMinutes, selectedBucketStart, t],
  );
  const sloBreaches = useMemo(
    () => latencyRows.filter((row) => row.status === "watch" || row.status === "breach").length,
    [latencyRows],
  );
  const saturationBursts = useMemo(() => saturationRows.length, [saturationRows]);
  const previousSloBreaches = useMemo(
    () => previousLatencyRows.filter((row) => row.status === "watch" || row.status === "breach").length,
    [previousLatencyRows],
  );
  const previousSaturationBursts = useMemo(() => previousSaturationRows.length, [previousSaturationRows]);
  const latencyTrend = useMemo(() => buildTrendDelta(summary.slowResponses, previousSummary.slowResponses), [summary, previousSummary]);
  const sloTrend = useMemo(() => buildTrendDelta(sloBreaches, previousSloBreaches), [sloBreaches, previousSloBreaches]);
  const saturationTrend = useMemo(
    () => buildTrendDelta(saturationBursts, previousSaturationBursts),
    [saturationBursts, previousSaturationBursts],
  );

  useEffect(() => {
    if (!trendBars.length) {
      setSelectedTrendBucketStart("");
      return;
    }
    if (!selectedTrendBucketStart || !trendBars.some((bar) => bar.bucketStart === selectedTrendBucketStart)) {
      setSelectedTrendBucketStart(trendBars.at(-1)?.bucketStart || "");
    }
  }, [selectedTrendBucketStart, trendBars]);

  async function refreshSupportAccess() {
    if (!activeAccountId || !isRootTelemetryAdmin || !accountHasRootTelemetryEntitlement) return;
    const rows = await listRootTelemetrySupportAccess(activeAccountId);
    setSupportAccessRows(rows);
  }

  async function handleGrantSupportAccess(event) {
    event.preventDefault();
    if (!activeAccountId || !accountHasRootTelemetryEntitlement) return;

    setGrantError("");
    setGrantInfo("");
    setGrantingSupportAccess(true);
    try {
      await grantRootTelemetrySupportAccess({
        accountId: activeAccountId,
        userEmail: supportGrantForm.userEmail,
        notes: supportGrantForm.notes,
        expiresAt: supportGrantForm.expiresAt ? new Date(supportGrantForm.expiresAt).toISOString() : null,
      });
      await refreshSupportAccess();
      setSupportGrantForm({ userEmail: "", notes: "", expiresAt: "" });
      setSupportDirectoryRows([]);
      setGrantInfo(t("rootTelemetry.supportAccess.grantSuccess"));
    } catch (nextError) {
      setGrantError(nextError?.message || t("rootTelemetry.supportAccess.grantError"));
    } finally {
      setGrantingSupportAccess(false);
    }
  }

  async function handleRevokeSupportAccess(userId) {
    if (!activeAccountId || !userId || !accountHasRootTelemetryEntitlement) return;

    setGrantError("");
    setGrantInfo("");
    setRevokingSupportUserId(userId);
    try {
      await revokeRootTelemetrySupportAccess({
        accountId: activeAccountId,
        userId,
      });
      await refreshSupportAccess();
      setGrantInfo(t("rootTelemetry.supportAccess.revokeSuccess"));
    } catch (nextError) {
      setGrantError(nextError?.message || t("rootTelemetry.supportAccess.revokeError"));
    } finally {
      setRevokingSupportUserId("");
    }
  }

  if (!canAccessTelemetryView) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!accountHasRootTelemetryEntitlement) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("rootTelemetry.title")}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("rootTelemetry.subtitle")}</p>
          <p className="mt-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("rootTelemetry.accountScoped")} {activeAccount?.name || "—"}
          </p>
        </div>

        <OnboardingHintCard
          title={t("pageHints.rootTelemetry.title")}
          body={t("pageHints.rootTelemetry.body")}
        />

        <Card className="p-4 border border-blue-200 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/20">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("rootTelemetry.visibility.title")}</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t("rootTelemetry.visibility.body")}</p>
          </div>
        </Card>

        <FeatureAccessCard
          feature={ENTITLEMENT_FEATURES.ROOT_TELEMETRY}
          currentPlan={activeAccountPlan}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("rootTelemetry.title")}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t("rootTelemetry.subtitle")}</p>
        <p className="mt-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t("rootTelemetry.accountScoped")} {activeAccount?.name || "—"}
        </p>
      </div>

      <OnboardingHintCard
        title={t("pageHints.rootTelemetry.title")}
        body={t("pageHints.rootTelemetry.body")}
      />

      <Card className="p-4 border border-blue-200 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/20">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("rootTelemetry.visibility.title")}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t("rootTelemetry.visibility.body")}</p>
        </div>
      </Card>

      {isRootTelemetryAdmin ? (
        <Card className="p-4 border shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t("rootTelemetry.supportAccess.title")}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("rootTelemetry.supportAccess.subtitle")}
              </p>
            </div>
            <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {t("rootTelemetry.supportAccess.rootOnly")}
            </span>
          </div>

          {grantError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-200">
              {grantError}
            </div>
          ) : null}

          {grantInfo ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
              {grantInfo}
            </div>
          ) : null}

          <form onSubmit={handleGrantSupportAccess} className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr_0.9fr_auto]">
            <input
              type="email"
              value={supportGrantForm.userEmail}
              onChange={(event) =>
                setSupportGrantForm((current) => ({ ...current, userEmail: event.target.value }))
              }
              placeholder={t("rootTelemetry.supportAccess.emailPlaceholder")}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <input
              type="text"
              value={supportGrantForm.notes}
              onChange={(event) =>
                setSupportGrantForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder={t("rootTelemetry.supportAccess.notesPlaceholder")}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <input
              type="datetime-local"
              value={supportGrantForm.expiresAt}
              onChange={(event) =>
                setSupportGrantForm((current) => ({ ...current, expiresAt: event.target.value }))
              }
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={grantingSupportAccess}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {grantingSupportAccess ? t("rootTelemetry.supportAccess.granting") : t("rootTelemetry.supportAccess.grant")}
            </button>
          </form>

          {String(supportGrantForm.userEmail || "").trim().length >= 2 ? (
            <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="border-b border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {t("rootTelemetry.supportAccess.directoryTitle")}
              </div>
              {supportDirectoryLoading ? (
                <div className="space-y-2 px-4 py-3">
                  {Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-10 rounded-lg" />)}
                </div>
              ) : supportDirectoryRows.length ? (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {supportDirectoryRows.map((row) => (
                    <button
                      key={row.userId}
                      type="button"
                      onClick={() =>
                        setSupportGrantForm((current) => ({
                          ...current,
                          userEmail: row.userEmail,
                        }))
                      }
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{row.userEmail}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {t(`rootTelemetry.supportAccess.source.${row.source}`)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          {row.currentAccountGranted ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
                              {t("rootTelemetry.supportAccess.alreadyGranted")}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {row.currentExpiresAt
                              ? t("rootTelemetry.supportAccess.directoryExpiresAt", {
                                  timestamp: formatDateTime(row.currentExpiresAt),
                                })
                              : t("rootTelemetry.supportAccess.directoryNoExpiry")}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {row.lastTelemetryAccessAt
                              ? t("rootTelemetry.supportAccess.lastTelemetryAccessAt", {
                                  timestamp: formatDateTime(row.lastTelemetryAccessAt),
                                })
                              : t("rootTelemetry.supportAccess.noTelemetryAccess")}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {row.hasRootTelemetry ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
                            {t("rootTelemetry.supportAccess.active")}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                  {t("rootTelemetry.supportAccess.directoryEmpty")}
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {supportAccessLoading ? (
              Array.from({ length: 2 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)
            ) : supportAccessRows.length ? (
              supportAccessRows.map((row) => {
                const isRevoked = Boolean(row.revokedAt);
                return (
                  <div key={`${row.userId}:${row.createdAt}`} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{row.userEmail || row.userId}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            isRevoked
                              ? "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200"
                          }`}>
                            {isRevoked ? t("rootTelemetry.supportAccess.revoked") : t("rootTelemetry.supportAccess.active")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {t("rootTelemetry.supportAccess.grantedMeta", {
                            timestamp: formatDateTime(row.createdAt),
                            email: row.grantedByEmail || "—",
                          })}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {row.expiresAt
                            ? t("rootTelemetry.supportAccess.expiresAt", { timestamp: formatDateTime(row.expiresAt) })
                            : t("rootTelemetry.supportAccess.noExpiry")}
                        </p>
                        {row.notes ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.notes}</p>
                        ) : null}
                      </div>
                      {!isRevoked ? (
                        <button
                          type="button"
                          onClick={() => handleRevokeSupportAccess(row.userId)}
                          disabled={revokingSupportUserId === row.userId}
                          className="rounded-xl border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/20"
                        >
                          {revokingSupportUserId === row.userId ? t("rootTelemetry.supportAccess.revoking") : t("rootTelemetry.supportAccess.revoke")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {t("rootTelemetry.supportAccess.empty")}
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {error ? (
        <Card className="p-4 border border-rose-200 bg-rose-50/60 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-200">
          {error}
        </Card>
      ) : null}

      <Card className="p-4 border shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("rootTelemetry.window.title")}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("rootTelemetry.window.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {TELEMETRY_WINDOWS.map((window) => (
              <button
                key={window.key}
                type="button"
                onClick={() => setSelectedWindowKey(window.key)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                  selectedWindowKey === window.key
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-200"
                    : "border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                {t(`rootTelemetry.window.${window.key}`)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-4 border shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("rootTelemetry.history.title")}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("rootTelemetry.history.subtitle")}</p>
        <div className="mt-4">
          {loading ? (
            <Skeleton className="h-28 rounded-xl" />
          ) : trendBars.length ? (
            <div className="flex items-end gap-2 overflow-hidden rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
              {trendBars.map((bar) => (
                <div key={bar.bucketStart} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-24 w-full items-end">
                    <button
                      type="button"
                      onClick={() => setSelectedTrendBucketStart(bar.bucketStart)}
                      className={`w-full rounded-t-md transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        selectedBucketStart === bar.bucketStart
                          ? "bg-blue-600 dark:bg-blue-400"
                          : "bg-blue-500/80 dark:bg-blue-400/70"
                      }`}
                      style={{ height: `${bar.barHeight}%` }}
                      title={`${formatDateTime(bar.bucketStart)} • ${t("rootTelemetry.history.totalSignals", { count: bar.totalSignals })}`}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300">{bar.totalSignals}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {safeDateValue(bar.bucketStart)?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {t("rootTelemetry.history.empty")}
            </div>
          )}
        </div>
        {loading ? null : selectedBucketStart ? (
          <div className="mt-4 rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t("rootTelemetry.drilldown.title")}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("rootTelemetry.drilldown.subtitle", {
                    timestamp: formatDateTime(selectedBucketStart),
                    minutes: selectedBucketMinutes,
                  })}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {drilldownRows.length ? (
                drilldownRows.map((row) => (
                  <div key={row.key} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{row.label}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {row.topSurface || t("rootTelemetry.drilldown.surfaceUnknown")}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {t("rootTelemetry.workflows.latestSeen", { timestamp: formatDateTime(row.latestSeenAt) })}
                        </p>
                      </div>
                      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{row.count}</p>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-3 sm:gap-x-3">
                      <p>{t("rootTelemetry.saturation.denials", { count: row.denials })}</p>
                      <p>{t("rootTelemetry.saturation.failures", { count: row.failures })}</p>
                      <p>{t("rootTelemetry.saturation.slowCount", { count: row.slowCount })}</p>
                    </div>
                    {row.to ? (
                      <Link to={row.to} className="mt-3 inline-flex text-sm font-medium text-blue-600 hover:text-blue-700">
                        {t("rootTelemetry.drilldown.openWorkflow")}
                      </Link>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400 md:col-span-2 xl:col-span-4">
                  {t("rootTelemetry.drilldown.empty")}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)
        ) : (
          <>
            <StatCard
              title={t("rootTelemetry.cards.signals")}
              value={summary.signalVolume}
              hint={t("rootTelemetry.cards.signalsHint", { limit: bundle.limit })}
              tone="blue"
            />
            <StatCard
              title={t("rootTelemetry.cards.denials")}
              value={summary.authorizationDenials}
              hint={t("rootTelemetry.cards.denialsHint")}
              tone="amber"
            />
            <StatCard
              title={t("rootTelemetry.cards.failures")}
              value={summary.unexpectedFailures}
              hint={t("rootTelemetry.cards.failuresHint")}
              tone="rose"
            />
            <StatCard
              title={t("rootTelemetry.cards.storage")}
              value={summary.storageFailures}
              hint={t("rootTelemetry.cards.storageHint")}
              tone="violet"
            />
            <StatCard
              title={t("rootTelemetry.cards.invites")}
              value={summary.inviteFailures}
              hint={t("rootTelemetry.cards.invitesHint")}
              tone="emerald"
            />
            <StatCard
              title={t("rootTelemetry.cards.activeAlerts")}
              value={summary.activeAlertsTotal}
              hint={t("rootTelemetry.cards.activeAlertsHint")}
              tone="rose"
            />
            <StatCard
              title={t("rootTelemetry.cards.latency")}
              value={summary.slowResponses}
              hint={`${t("rootTelemetry.cards.latencyHint")} ${t("rootTelemetry.cards.vsPrevious", {
                delta: formatTrend(latencyTrend, t),
              })}`}
              tone="amber"
            />
            <StatCard
              title={t("rootTelemetry.cards.slo")}
              value={sloBreaches}
              hint={`${t("rootTelemetry.cards.sloHint")} ${t("rootTelemetry.cards.vsPrevious", {
                delta: formatTrend(sloTrend, t),
              })}`}
              tone="violet"
            />
            <StatCard
              title={t("rootTelemetry.cards.saturation")}
              value={saturationBursts}
              hint={`${t("rootTelemetry.cards.saturationHint")} ${t("rootTelemetry.cards.vsPrevious", {
                delta: formatTrend(saturationTrend, t),
              })}`}
              tone="rose"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-4 border shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t("rootTelemetry.surfaceRisk.title")}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("rootTelemetry.surfaceRisk.subtitle")}
              </p>
            </div>
            <Link to="/settings/security-audit" className="text-sm font-medium text-blue-600 hover:text-blue-700">
              {t("rootTelemetry.openAudit")}
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)
            ) : surfaceRows.length ? (
              surfaceRows.map((row) => (
                <div key={row.key} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{row.label}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t("rootTelemetry.surfaceRisk.latestSeen", { timestamp: formatDateTime(row.latestSeenAt) })}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{row.count}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t("rootTelemetry.surfaceRisk.breakdown", {
                          denials: row.denials,
                          failures: row.failures,
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {t("rootTelemetry.surfaceRisk.empty")}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4 border shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("rootTelemetry.coverage.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("rootTelemetry.coverage.subtitle")}</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <p className="font-medium text-slate-900 dark:text-slate-100">{t("rootTelemetry.coverage.errorsTitle")}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("rootTelemetry.coverage.errorsBody")}</p>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <p className="font-medium text-slate-900 dark:text-slate-100">{t("rootTelemetry.coverage.latencyTitle")}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("rootTelemetry.coverage.latencyBody")}</p>
            </div>
            <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <p className="font-medium text-slate-900 dark:text-slate-100">{t("rootTelemetry.coverage.saturationTitle")}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("rootTelemetry.coverage.saturationBody")}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4 border shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t("rootTelemetry.latency.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("rootTelemetry.latency.subtitle")} {t("rootTelemetry.cards.vsPrevious", { delta: formatTrend(latencyTrend, t) })}
        </p>
        <div className="mt-4 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)
          ) : latencyRows.length ? (
            latencyRows.map((row) => {
              const status = latencyStatusMeta(row.status, t);
              return (
              <div key={row.key} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{row.label}</p>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}
                        >
                        {status.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("rootTelemetry.latency.latestSeen", { timestamp: formatDateTime(row.latestSeenAt) })}
                    </p>
                  </div>
                  <div className="grid gap-1 text-right text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2 sm:gap-x-4">
                    <p>{t("rootTelemetry.latency.samples", { count: row.sampleCount })}</p>
                    <p>{t("rootTelemetry.latency.slowCount", { count: row.slowCount })}</p>
                    <p>{t("rootTelemetry.latency.p50", { duration: formatDuration(row.p50DurationMs) })}</p>
                    <p>{t("rootTelemetry.latency.p95", { duration: formatDuration(row.p95DurationMs) })}</p>
                    <p>{t("rootTelemetry.latency.target", { duration: formatDuration(row.targetMs) })}</p>
                    <p>{t("rootTelemetry.latency.maxDuration", { duration: formatDuration(row.maxDurationMs) })}</p>
                  </div>
                </div>
              </div>
            )})
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {t("rootTelemetry.latency.empty")}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 border shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t("rootTelemetry.saturation.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("rootTelemetry.saturation.subtitle")} {t("rootTelemetry.cards.vsPrevious", { delta: formatTrend(saturationTrend, t) })}
        </p>
        <div className="mt-4 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-xl" />)
          ) : saturationRows.length ? (
            saturationRows.map((row) => {
              const status = saturationStatusMeta(row, t);
              return (
                <div key={row.key} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{row.label}</p>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t("rootTelemetry.saturation.latestSeen", { timestamp: formatDateTime(row.latestSeenAt) })}
                      </p>
                    </div>
                    <div className="grid gap-1 text-right text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2 sm:gap-x-4">
                      <p>{t("rootTelemetry.saturation.burstCount", { count: row.burstCount })}</p>
                      <p>{t("rootTelemetry.saturation.denials", { count: row.denials })}</p>
                      <p>{t("rootTelemetry.saturation.failures", { count: row.failures })}</p>
                      <p>{t("rootTelemetry.saturation.slowCount", { count: row.slowCount })}</p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {t("rootTelemetry.saturation.empty")}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 border shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t("rootTelemetry.workflows.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("rootTelemetry.workflows.subtitle")}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)
          ) : workflowRows.map((row) => (
            <div key={row.key} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{row.label}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {row.latestSeenAt
                      ? t("rootTelemetry.workflows.latestSeen", { timestamp: formatDateTime(row.latestSeenAt) })
                      : t("rootTelemetry.workflows.noSignals")}
                  </p>
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{row.count}</p>
              </div>
              {row.to ? (
                <Link to={row.to} className="mt-3 inline-flex text-sm font-medium text-blue-600 hover:text-blue-700">
                  {t("rootTelemetry.workflows.openSurface")}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
