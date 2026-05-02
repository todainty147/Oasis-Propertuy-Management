import { supabase } from "../lib/supabase";
import { listSecurityObservabilityEvents } from "./securityObservabilityService";
import { listSecurityAnomalyAlerts } from "./securityAuditService";
import { parseRpcRows, parseSecurityAnomalyAlertRow } from "./rpcContracts";

const DEFAULT_LIMIT = 200;
const WINDOW_MINUTES = {
  "15m": 15,
  "1h": 60,
  "24h": 24 * 60,
};

function clampLimit(value) {
  return Math.min(Math.max(Number(value) || DEFAULT_LIMIT, 25), DEFAULT_LIMIT);
}

function resolveWindowMinutes(value) {
  return WINDOW_MINUTES[value] || WINDOW_MINUTES["1h"];
}

function resolveBucketMinutes(windowKey) {
  switch (windowKey) {
    case "15m":
      return 3;
    case "24h":
      return 60;
    default:
      return 10;
  }
}

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("schema cache")
  );
}

function normalizeLatencyRollupRows(rows = []) {
  return rows.map((row) => ({
    key: String(row?.surface || "").trim().toLowerCase(),
    label: String(row?.surface || "").trim(),
    sampleCount: Number(row?.sample_count || 0),
    slowCount: Number(row?.slow_count || 0),
    p50DurationMs: Number(row?.p50_duration_ms || 0) || null,
    p95DurationMs: Number(row?.p95_duration_ms || 0) || null,
    maxDurationMs: Number(row?.max_duration_ms || 0) || 0,
    targetMs: Number(row?.target_ms || 0) || null,
    latestSeenAt: row?.latest_seen_at || "",
  }));
}

function normalizeBurstRollupRows(rows = []) {
  return rows.map((row) => ({
    key: `${String(row?.surface || "").trim().toLowerCase()}:${String(row?.reason || "").trim().toLowerCase()}`,
    surface: String(row?.surface || "").trim().toLowerCase(),
    reason: String(row?.reason || "").trim().toLowerCase(),
    burstCount: Number(row?.burst_count || 0),
    denials: Number(row?.denials || 0),
    failures: Number(row?.failures || 0),
    slowCount: Number(row?.slow_count || 0),
    latestSeenAt: row?.latest_seen_at || "",
  }));
}

function normalizeTrendSeriesRows(rows = []) {
  return rows.map((row) => ({
    bucketStart: row?.bucket_start || "",
    totalSignals: Number(row?.total_signals || 0),
    denials: Number(row?.denials || 0),
    failures: Number(row?.failures || 0),
    slowCount: Number(row?.slow_count || 0),
  }));
}

function normalizeTelemetryAlertRows(rows = []) {
  const parsedRows = parseRpcRows(
    rows.map((row) => ({
      id: row?.id,
      accountId: row?.account_id,
      alertType: row?.alert_type,
      severity: row?.severity,
      status: row?.status,
      actorUserId: row?.actor_user_id,
      actorLabel: "",
      entityType: row?.entity_type,
      entityId: row?.entity_id,
      entityLabel: "",
      title: row?.title,
      summary: row?.summary,
      metadata: row?.metadata || {},
      alertCount: Number(row?.alert_count || 1),
      classification: "",
      classifiedByUserId: "",
      classifiedByLabel: "",
      classifiedAt: null,
      assignedToUserId: "",
      assignedToLabel: "",
      assignedByUserId: "",
      assignedAt: null,
      acknowledgedByUserId: "",
      acknowledgedByLabel: "",
      acknowledgedAt: null,
      resolvedByUserId: "",
      resolvedByLabel: "",
      resolvedAt: null,
      resolutionNote: "",
      createdAt: row?.created_at,
      lastSeenAt: row?.last_seen_at,
      updatedAt: row?.last_seen_at,
    })),
    parseSecurityAnomalyAlertRow,
    "security_root_telemetry_active_alerts rows",
  );

  return {
    rows: parsedRows,
    total: Number(rows[0]?.total_count || 0),
  };
}

async function listRootTelemetryLatencyRollup(accountId, { since, until, surface = null } = {}) {
  const { data, error } = await supabase.rpc("security_observability_latency_rollup", {
    p_account_id: accountId,
    p_since: since?.toISOString?.() || since || null,
    p_until: until?.toISOString?.() || until || null,
    p_surface: surface,
  });
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw new Error(error.message || "Failed to load telemetry latency rollup");
  }
  return normalizeLatencyRollupRows(Array.isArray(data) ? data : []);
}

async function listRootTelemetryBurstRollup(accountId, { since, until, surface = null } = {}) {
  const { data, error } = await supabase.rpc("security_observability_burst_rollup", {
    p_account_id: accountId,
    p_since: since?.toISOString?.() || since || null,
    p_until: until?.toISOString?.() || until || null,
    p_surface: surface,
  });
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw new Error(error.message || "Failed to load telemetry burst rollup");
  }
  return normalizeBurstRollupRows(Array.isArray(data) ? data : []);
}

async function listRootTelemetryTrendSeries(accountId, { since, until, bucketMinutes } = {}) {
  const { data, error } = await supabase.rpc("security_observability_trend_series", {
    p_account_id: accountId,
    p_since: since?.toISOString?.() || since || null,
    p_until: until?.toISOString?.() || until || null,
    p_bucket_minutes: Number(bucketMinutes || 10),
  });
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw new Error(error.message || "Failed to load telemetry trend series");
  }
  return normalizeTrendSeriesRows(Array.isArray(data) ? data : []);
}

async function listRootTelemetryActiveAlerts(accountId, { status = "active", limit = 5, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc("security_root_telemetry_active_alerts", {
    p_account_id: accountId,
    p_status: status,
    p_limit: Math.min(Math.max(Number(limit) || 5, 1), 25),
    p_offset: Math.max(Number(offset) || 0, 0),
  });
  if (error) {
    if (isMissingBackendObject(error)) {
      const pageSize = Math.min(Math.max(Number(limit) || 5, 1), 25);
      const page = Math.floor(Math.max(Number(offset) || 0, 0) / pageSize) + 1;
      return listSecurityAnomalyAlerts(accountId, { status, page, pageSize });
    }
    throw new Error(error.message || "Failed to load root telemetry active alerts");
  }
  return normalizeTelemetryAlertRows(Array.isArray(data) ? data : []);
}

export async function loadRootTelemetryBundle(accountId, { limit = DEFAULT_LIMIT, windowKey = "1h", now = new Date() } = {}) {
  if (!accountId) {
    return {
      events: [],
      previousEvents: [],
      activeAlerts: [],
      activeAlertsTotal: 0,
      limit: clampLimit(limit),
      windowKey,
    };
  }

  const safeLimit = clampLimit(limit);
  const current = now instanceof Date ? now : new Date(now);
  const safeNow = Number.isNaN(current.getTime()) ? new Date() : current;
  const windowMinutes = resolveWindowMinutes(windowKey);
  const bucketMinutes = resolveBucketMinutes(windowKey);
  const currentStart = new Date(safeNow.getTime() - windowMinutes * 60 * 1000);
  const previousStart = new Date(currentStart.getTime() - windowMinutes * 60 * 1000);

  const [events, previousEvents, activeAlerts, latencyRollups, burstRollups, trendSeries] = await Promise.all([
    listSecurityObservabilityEvents(accountId, { limit: safeLimit, since: currentStart, until: safeNow }),
    listSecurityObservabilityEvents(accountId, { limit: safeLimit, since: previousStart, until: currentStart }),
    listRootTelemetryActiveAlerts(accountId, { status: "active", limit: 5, offset: 0 }),
    listRootTelemetryLatencyRollup(accountId, { since: currentStart, until: safeNow }),
    listRootTelemetryBurstRollup(accountId, { since: currentStart, until: safeNow }),
    listRootTelemetryTrendSeries(accountId, { since: currentStart, until: safeNow, bucketMinutes }),
  ]);

  return {
    events: Array.isArray(events) ? events : [],
    previousEvents: Array.isArray(previousEvents) ? previousEvents : [],
    latencyRollups: Array.isArray(latencyRollups) ? latencyRollups : [],
    burstRollups: Array.isArray(burstRollups) ? burstRollups : [],
    trendSeries: Array.isArray(trendSeries) ? trendSeries : [],
    activeAlerts: Array.isArray(activeAlerts?.rows) ? activeAlerts.rows : [],
    activeAlertsTotal: Number(activeAlerts?.total || 0),
    limit: safeLimit,
    windowKey,
  };
}
