import { supabase } from "../lib/supabase";

const blockedKeys = new Set([
  "token",
  "inviteToken",
  "email",
  "body",
  "fileName",
  "filename",
  "metadata",
  "originalFilename",
  "rawPayload",
  "accessToken",
  "address",
  "password",
  "phone",
  "phoneNumber",
  "phone_number",
  "contactPhone",
  "contact_phone",
  "firstName",
  "lastName",
  "first_name",
  "last_name",
  "propertyAddress",
  "property_address",
  "path",
  "signedUrl",
  "storagePath",
]);

const authFailurePatterns = [
  "access denied",
  "not authenticated",
  "not allowed",
  "not permitted",
  "unauthorized",
  "insufficient",
  "forbidden",
  "expired",
  "revoked",
  "email mismatch",
  "invite not found",
];

let deniedEventRpcUnavailable = false;
let hostedSinkUnavailable = false;
let hostedSinkEnabledOverride = null;
const operationalTelemetryThrottle = new Map();
const operationalLatencySampleThrottle = new Map();

function pickSafeContext(context = {}) {
  return Object.fromEntries(
    Object.entries(context).filter(([key, value]) => {
      if (blockedKeys.has(key)) return false;
      if (value === undefined || value === null || value === "") return false;
      return true;
    }),
  );
}

function normalizeError(error) {
  return {
    message: error?.message || "Unknown error",
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
  };
}

function tryParseJson(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeText(value) {
  const text = String(value || "").trim().toLowerCase();
  return text || null;
}

function readHeader(headers, name) {
  if (!headers || !name) return null;
  const lowerName = String(name).toLowerCase();
  if (typeof headers.get === "function") {
    return headers.get(name) || headers.get(lowerName) || null;
  }
  if (typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (String(key).toLowerCase() === lowerName) return value;
    }
  }
  return null;
}

function extractProviderCorrelation(error) {
  const headers = error?.response?.headers || error?.headers || null;
  const providerRequestId =
    error?.requestId ||
    readHeader(headers, "x-request-id") ||
    readHeader(headers, "x-amz-request-id") ||
    null;
  const providerTraceId =
    error?.traceId ||
    readHeader(headers, "x-sb-trace") ||
    readHeader(headers, "x-supabase-trace") ||
    null;
  const providerStatus =
    error?.statusCode ||
    error?.status ||
    error?.cause?.statusCode ||
    error?.cause?.status ||
    null;
  const providerName = error?.name || error?.cause?.name || null;
  const providerCode = error?.error || error?.cause?.error || null;

  return {
    providerRequestId,
    providerTraceId,
    providerStatus,
    providerName,
    providerCode,
  };
}

function enrichSafeContext(error, context = {}) {
  const providerCorrelation = extractProviderCorrelation(error);
  return {
    ...providerCorrelation,
    ...context,
  };
}

function randomCorrelationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sec-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function monotonicNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function resolveCorrelationId(detailPayload = null, safeContext = {}) {
  const explicit =
    safeContext.correlationId ||
    safeContext.correlation_id ||
    detailPayload?.correlation_id ||
    detailPayload?.correlationId ||
    null;
  return explicit ? String(explicit) : randomCorrelationId();
}

function shouldUseHostedSink() {
  if (hostedSinkEnabledOverride === true) return true;
  if (hostedSinkEnabledOverride === false) return false;
  const override = globalThis.__OASIS_ENABLE_HOSTED_SECURITY_LOG_SINK__;
  if (override === true) return true;
  if (override === false) return false;
  return String(import.meta.env.VITE_ENABLE_HOSTED_SECURITY_LOG_SINK || "").toLowerCase() === "true";
}

function hostedSinkFunctionName() {
  return import.meta.env.VITE_HOSTED_SECURITY_LOG_FUNCTION || "ingest-security-observability";
}

export async function invokeHostedSecurityLogSink(body) {
  if (!supabase?.functions || typeof supabase.functions.invoke !== "function") {
    return {
      data: null,
      error: {
        code: "FunctionsUnavailable",
        message: "Supabase edge functions client is unavailable",
      },
    };
  }
  return supabase.functions.invoke(hostedSinkFunctionName(), { body });
}

export function setHostedSecurityLogSinkOverrideForTests(enabled) {
  hostedSinkEnabledOverride = typeof enabled === "boolean" ? enabled : null;
  hostedSinkUnavailable = false;
}

export function buildHostedSecurityLogPayload(classification) {
  return {
    category: classification.category,
    kind: classification.kind,
    surface: classification.surface,
    reason: classification.reason,
    outcome: classification.kind === "authorization_denied" ? "denied" : "error",
    code: classification.code,
    hint: classification.hint,
    accountId: classification.accountId,
    entityType: classification.entityType,
    entityId: classification.entityId,
    correlationId: classification.correlationId,
    source: "app_client",
    guardDenied: classification.guardDenied,
    context: classification.safeContext,
  };
}

function inferEntity(context = {}, detailPayload = null) {
  if (detailPayload?.entity_type || detailPayload?.entity_id) {
    return {
      entityType: detailPayload?.entity_type || null,
      entityId: detailPayload?.entity_id || null,
    };
  }

  if (context.workOrderId) return { entityType: "work_order", entityId: context.workOrderId };
  if (context.invitationId) return { entityType: "account_invitation", entityId: context.invitationId };
  if (context.alertId) return { entityType: "security_alert", entityId: context.alertId };
  if (context.documentId) return { entityType: "document", entityId: context.documentId };
  if (context.tenantId) return { entityType: "tenant", entityId: context.tenantId };
  if (context.propertyId) return { entityType: "property", entityId: context.propertyId };
  if (context.paymentId) return { entityType: "payment", entityId: context.paymentId };

  return { entityType: null, entityId: null };
}

function inferReason(error, detailPayload = null) {
  if (typeof detailPayload?.reason === "string" && detailPayload.reason.trim()) {
    return detailPayload.reason.trim().toLowerCase();
  }

  const message = String(error?.message || "").trim().toLowerCase();
  if (!message) return null;
  return message.replace(/\s+/g, "_");
}

export function classifySecurityRelevantFailure(event, error, context = {}) {
  const normalizedError = normalizeError(error);
  const detailPayload = tryParseJson(normalizedError.details);
  const safeContext = pickSafeContext(enrichSafeContext(error, context));
  const correlationId = resolveCorrelationId(detailPayload, safeContext);
  const { entityType, entityId } = inferEntity(safeContext, detailPayload);
  const reason = inferReason(normalizedError, detailPayload);
  const message = normalizeText(normalizedError.message);
  const code = String(normalizedError.code || "");
  const surface = normalizeText(detailPayload?.event) || normalizeText(event) || "unknown";
  const accountId = detailPayload?.account_id || safeContext.accountId || safeContext.account_id || null;
  const guardDenied =
    surface === "assert_manage_account_access" ||
    surface === "assert_tenant_scope_access";
  const denied =
    guardDenied ||
    !!detailPayload?.reason ||
    ["42501", "28000", "PGRST116", "P0002"].includes(code) ||
    authFailurePatterns.some((pattern) => message?.includes(pattern));

  return {
    kind: denied ? "authorization_denied" : "unexpected_security_failure",
    category: inferCategory(surface, detailPayload?.event || event),
    surface,
    reason,
    accountId,
    entityType,
    entityId,
    code: normalizedError.code || null,
    hint: normalizedError.hint || null,
    guardDenied,
    detailPayload,
    correlationId,
    safeContext,
    normalizedError,
  };
}

function inferCategory(surface, event) {
  const value = normalizeText(surface) || normalizeText(event) || "unknown";

  if (value.includes("invite")) return "invite_security";
  if (
    value.includes("wo_fin") ||
    value.includes("contractor_update_work_order") ||
    value.includes("contractor_update_work_order_status")
  ) {
    return "contractor_workflow";
  }
  if (value.includes("document") || value.includes("storage")) return "document_storage";
  if (value.includes("notification")) return "notification_workflow";
  if (value.includes("dashboard") || value.includes("finance") || value.includes("command_center") || value.includes("attention_center") || value.includes("tenant_activity_feed") || value.includes("portfolio")) {
    return "rpc_security";
  }
  if (value.includes("work_order")) return "work_order_workflow";
  return "security_workflow";
}

function isMissingDeniedEventRpc(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("record_security_denied_event")
  );
}

function shouldPersistDeniedEvent(error, detailPayload = null) {
  if (!error) return false;
  if (detailPayload?.event || detailPayload?.reason) return true;

  const message = String(error?.message || "").toLowerCase();
  if (["42501", "28000", "PGRST116", "P0002"].includes(String(error?.code || ""))) return true;
  return authFailurePatterns.some((pattern) => message.includes(pattern));
}

async function persistDeniedEvent(event, { error, context } = {}) {
  if (deniedEventRpcUnavailable) return;

  const detailPayload = tryParseJson(error?.details);
  if (!shouldPersistDeniedEvent(error, detailPayload)) return;

  const safeContext = pickSafeContext(context);
  const correlationId = resolveCorrelationId(detailPayload, safeContext);
  const { entityType, entityId } = inferEntity(safeContext, detailPayload);
  const accountId = detailPayload?.account_id || safeContext.accountId || safeContext.account_id || null;
  const reason = inferReason(error, detailPayload);

  if (!reason) return;

  const metadata = {
    code: error?.code || null,
    hint: error?.hint || null,
    correlationId,
    source_event: event,
    ...safeContext,
  };

  const { error: persistError } = await supabase.rpc("record_security_denied_event", {
    p_event: detailPayload?.event || event,
    p_account_id: accountId,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_reason: reason,
    p_metadata: metadata,
  });

  if (!persistError) return;
  if (isMissingDeniedEventRpc(persistError)) {
    deniedEventRpcUnavailable = true;
    return;
  }

  console.warn("[security-observe] denied_event_persist_failed", {
    event,
    error: normalizeError(persistError),
  });
}

function isMissingHostedSink(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "FunctionsUnavailable" ||
    error?.code === "FunctionsHttpError" ||
    message.includes("edge functions client is unavailable") ||
    message.includes("function not found") ||
    message.includes("failed to send a request to the edge function") ||
    message.includes("ingest-security-observability")
  );
}

function shouldThrottleOperationalTelemetry(key, intervalMs = 60000) {
  const now = Date.now();
  const lastAt = operationalTelemetryThrottle.get(key) || 0;
  if (now - lastAt < intervalMs) return true;
  operationalTelemetryThrottle.set(key, now);
  return false;
}

function shouldThrottleOperationalLatencySample(key, intervalMs = 15000) {
  const now = Date.now();
  const lastAt = operationalLatencySampleThrottle.get(key) || 0;
  if (now - lastAt < intervalMs) return true;
  operationalLatencySampleThrottle.set(key, now);
  return false;
}

async function pushHostedOperationalTelemetry(payload) {
  if (hostedSinkUnavailable || !shouldUseHostedSink()) return;

  const { error } = await invokeHostedSecurityLogSink(payload);
  if (!error) return;
  if (isMissingHostedSink(error)) {
    hostedSinkUnavailable = true;
    return;
  }

  console.warn("[security-observe] hosted_operational_telemetry_failed", {
    surface: payload.surface,
    error: normalizeError(error),
  });
}

async function pushHostedSecurityLog(classification) {
  if (hostedSinkUnavailable || !shouldUseHostedSink()) return;

  const { error } = await invokeHostedSecurityLogSink(buildHostedSecurityLogPayload(classification));

  if (!error) return;
  if (isMissingHostedSink(error)) {
    hostedSinkUnavailable = true;
    return;
  }

  console.warn("[security-observe] hosted_sink_failed", {
    surface: classification.surface,
    error: normalizeError(error),
  });
}

export function logSecurityRelevantFailure(event, { error, context } = {}) {
  if (!error) return;
  const classification = classifySecurityRelevantFailure(event, error, context);

  console.error(`[security-observe] ${event}`, {
    error: classification.normalizedError,
    classification: {
      kind: classification.kind,
      category: classification.category,
      surface: classification.surface,
      reason: classification.reason,
      accountId: classification.accountId,
      entityType: classification.entityType,
      entityId: classification.entityId,
      guardDenied: classification.guardDenied,
      correlationId: classification.correlationId,
    },
    context: classification.safeContext,
  });

  void persistDeniedEvent(event, {
    error: classification.normalizedError,
    context: classification.safeContext,
  });
  void pushHostedSecurityLog(classification);
}

export function startOperationalTimer() {
  return monotonicNow();
}

export function logOperationalLatencySample(
  event,
  {
    accountId,
    surface,
    durationMs,
    targetMs,
    entityType = null,
    entityId = null,
    context = {},
  } = {},
) {
  const duration = Number(durationMs);
  const target = Number(targetMs);
  if (!accountId || !surface) return;
  if (!Number.isFinite(duration)) return;

  const safeContext = pickSafeContext({
    ...context,
    duration_ms: Math.round(duration),
    target_ms: Number.isFinite(target) ? Math.round(target) : null,
    operation: event,
  });

  const throttleKey = `${accountId}:${String(surface).trim().toLowerCase()}:${event}`;
  if (shouldThrottleOperationalLatencySample(throttleKey)) return;

  const payload = {
    category: "root_telemetry",
    kind: "latency_sample",
    surface: String(surface).trim().toLowerCase(),
    reason: "operational_latency",
    outcome: Number.isFinite(target) && duration > target ? "degraded" : "ok",
    code: null,
    hint: null,
    accountId,
    entityType,
    entityId,
    correlationId: randomCorrelationId(),
    source: "app_client_telemetry",
    guardDenied: false,
    context: safeContext,
  };

  void pushHostedOperationalTelemetry(payload);
}

export function logSlowOperationalTelemetry(
  event,
  {
    accountId,
    surface,
    durationMs,
    thresholdMs,
    entityType = null,
    entityId = null,
    context = {},
  } = {},
) {
  const duration = Number(durationMs);
  const threshold = Number(thresholdMs);
  if (!accountId || !surface) return;
  if (!Number.isFinite(duration) || !Number.isFinite(threshold)) return;
  if (duration < threshold) return;

  const safeContext = pickSafeContext({
    ...context,
    duration_ms: Math.round(duration),
    threshold_ms: Math.round(threshold),
    operation: event,
  });

  const throttleKey = `${accountId}:${String(surface).trim().toLowerCase()}:${event}`;
  if (shouldThrottleOperationalTelemetry(throttleKey)) return;

  const payload = {
    category: "root_telemetry",
    kind: "latency_threshold_exceeded",
    surface: String(surface).trim().toLowerCase(),
    reason: "slow_response",
    outcome: "slow",
    code: null,
    hint: null,
    accountId,
    entityType,
    entityId,
    correlationId: randomCorrelationId(),
    source: "app_client_telemetry",
    guardDenied: false,
    context: safeContext,
  };

  console.warn("[security-observe] slow_operational_telemetry", {
    event,
    surface: payload.surface,
    accountId,
    durationMs: Math.round(duration),
    thresholdMs: Math.round(threshold),
  });

  void pushHostedOperationalTelemetry(payload);
}
