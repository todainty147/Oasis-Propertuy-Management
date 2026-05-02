import {
  inferMarketplaceProviderFromCountry,
  listMarketplaceProviders,
  marketplaceProviders,
} from "../config/marketplaceProviders";
import { supabase } from "../lib/supabase";
import { buildEdgeFunctionFailure } from "./edgeFunctionFailure";
import {
  firstRpcRow,
  parseMarketplaceIntegrationSettingRow,
  parseMarketplaceJobRow,
  parseMarketplaceRouteRow,
  parseRpcRows,
} from "./rpcContracts";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

const JOBS_KEY = "oasis_marketplace_jobs_v1";
const ROUTES_KEY = "oasis_marketplace_routes_v1";

function readJson(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function buildStorageId(prefix = "mkp") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function friendly(error, fallback) {
  return new Error(error?.message ?? fallback);
}

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isLocalMarketplaceId(id) {
  return String(id || "").startsWith("mkp_");
}

function normalizeRoute(value) {
  const next = String(value || "").trim().toLowerCase();
  return ["internal", "marketplace", "hybrid", "undecided"].includes(next) ? next : "internal";
}

function shouldFallbackToLocal(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("function") && message.includes("does not exist") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch")
  );
}

function getLocalFulfilmentRoute({ accountId, workOrderId }) {
  const routes = readJson(ROUTES_KEY, {});
  return routes?.[accountId]?.[workOrderId] || "internal";
}

function setLocalFulfilmentRoute({ accountId, workOrderId, route }) {
  const routes = readJson(ROUTES_KEY, {});
  const next = { ...routes };
  next[accountId] = { ...(next[accountId] || {}), [workOrderId]: route };
  writeJson(ROUTES_KEY, next);
  return route;
}

function createLocalMarketplaceJob(input) {
  const jobs = readJson(JOBS_KEY, []);
  const provider = marketplaceProviders[input.providerKey];
  if (!provider) throw new Error("Unknown marketplace provider");

  const job = {
    id: buildStorageId(),
    accountId: input.accountId,
    workOrderId: input.workOrderId,
    providerKey: input.providerKey,
    countryCode: input.countryCode || provider.countryCode,
    tradeCategory: input.tradeCategory || "",
    externalJobId: "",
    externalReference: "",
    externalUrl: "",
    status: input.consentConfirmed ? "ready_to_submit" : "draft",
    submissionMode: input.submissionMode || provider.mode,
    title: input.title || `Work order ${input.workOrderId}`,
    description: input.description || "",
    urgency: input.urgency || "",
    postcode: input.postcode || "",
    city: input.city || "",
    propertyLabel: input.propertyLabel || "",
    contactName: input.consentConfirmed ? input.contactName || "" : "",
    contactEmail: input.consentConfirmed ? input.contactEmail || "" : "",
    contactPhone: input.consentConfirmed ? input.contactPhone || "" : "",
    consentConfirmedAt: input.consentConfirmed ? nowIso() : null,
    submittedAt: null,
    lastSyncedAt: null,
    lastError: "",
    requestPayload: input.requestPayload || {},
    responsePayload: {},
    metadata: input.metadata || {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  jobs.unshift(job);
  writeJson(JOBS_KEY, jobs);
  return job;
}

function getLocalMarketplaceJobsForWorkOrder({ accountId, workOrderId }) {
  const jobs = readJson(JOBS_KEY, []);
  return jobs.filter((job) => job.accountId === accountId && job.workOrderId === workOrderId);
}

function markLocalMarketplaceJobSubmitted({
  accountId,
  marketplaceJobId,
  externalJobId,
  externalReference,
  externalUrl,
  responsePayload,
}) {
  const jobs = readJson(JOBS_KEY, []);
  writeJson(
    JOBS_KEY,
    jobs.map((job) =>
      job.accountId === accountId && job.id === marketplaceJobId
        ? {
            ...job,
            status: "submitted",
            submittedAt: nowIso(),
            updatedAt: nowIso(),
            externalJobId: externalJobId || job.externalJobId || "",
            externalReference: externalReference || job.externalReference || "",
            externalUrl: externalUrl || job.externalUrl || "",
            responsePayload: responsePayload || job.responsePayload || {},
          }
        : job,
    ),
  );
}

function updateLocalMarketplaceJobStatus({ accountId, marketplaceJobId, status, payload }) {
  const jobs = readJson(JOBS_KEY, []);
  writeJson(
    JOBS_KEY,
    jobs.map((job) =>
      job.accountId === accountId && job.id === marketplaceJobId
        ? {
            ...job,
            status,
            updatedAt: nowIso(),
            lastSyncedAt: nowIso(),
            responsePayload: payload || job.responsePayload || {},
          }
        : job,
    ),
  );
}

function mergeJobs(primaryJobs = [], secondaryJobs = []) {
  const merged = new Map();
  [...primaryJobs, ...secondaryJobs].forEach((job) => {
    if (!job?.id || merged.has(job.id)) return;
    merged.set(job.id, job);
  });
  return Array.from(merged.values()).sort((left, right) =>
    String(right.createdAt || "").localeCompare(String(left.createdAt || "")),
  );
}

export function getMarketplaceProviders() {
  return listMarketplaceProviders();
}

export async function getMarketplaceSettings({ accountId } = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase.rpc("list_marketplace_integration_settings", {
    p_account_id: accountId,
  });

  if (error) {
    if (shouldFallbackToLocal(error)) return [];
    throw friendly(error, "Failed to load marketplace settings");
  }

  return parseRpcRows(
    data || [],
    parseMarketplaceIntegrationSettingRow,
    "marketplace integration setting rows",
  );
}

export async function upsertMarketplaceIntegrationSetting({
  accountId,
  providerKey,
  enabled = false,
  configuration = {},
} = {}) {
  if (!accountId || !providerKey) {
    throw new Error("accountId and providerKey are required");
  }

  const { data, error } = await supabase.rpc("upsert_marketplace_integration_setting", {
    p_account_id: accountId,
    p_provider_key: providerKey,
    p_enabled: Boolean(enabled),
    p_configuration: isRecord(configuration) ? configuration : {},
  });

  if (error) throw friendly(error, "Failed to save marketplace integration setting");
  return parseMarketplaceIntegrationSettingRow(firstRpcRow(data));
}

export async function getFulfilmentRoute({ accountId, workOrderId }) {
  const localRoute = getLocalFulfilmentRoute({ accountId, workOrderId });

  const { data, error } = await supabase.rpc("get_work_order_fulfilment_route", {
    p_account_id: accountId,
    p_work_order_id: workOrderId,
  });

  if (error) {
    if (shouldFallbackToLocal(error)) return normalizeRoute(localRoute);
    throw friendly(error, "Failed to load fulfilment route");
  }

  const row = parseMarketplaceRouteRow(firstRpcRow(data));
  if (!row.isPersisted && localRoute && localRoute !== "internal") {
    return normalizeRoute(localRoute);
  }

  return normalizeRoute(row.route);
}

export async function setFulfilmentRoute({ accountId, workOrderId, route }) {
  const normalizedRoute = normalizeRoute(route);

  const { data, error } = await supabase.rpc("set_work_order_fulfilment_route", {
    p_account_id: accountId,
    p_work_order_id: workOrderId,
    p_route: normalizedRoute,
  });

  if (error) {
    if (shouldFallbackToLocal(error)) {
      return setLocalFulfilmentRoute({ accountId, workOrderId, route: normalizedRoute });
    }
    throw friendly(error, "Failed to save fulfilment route");
  }

  const row = parseMarketplaceRouteRow(firstRpcRow(data));
  return normalizeRoute(row.route);
}

export async function createMarketplaceJob(input) {
  const provider = marketplaceProviders[input.providerKey];
  if (!provider) throw new Error("Unknown marketplace provider");

  const { data, error } = await supabase.rpc("create_marketplace_job", {
    p_account_id: input.accountId,
    p_work_order_id: input.workOrderId,
    p_provider_key: input.providerKey,
    p_trade_category: input.tradeCategory || "",
    p_contact_name: input.contactName || "",
    p_contact_email: input.contactEmail || "",
    p_contact_phone: input.contactPhone || "",
    p_consent_confirmed: Boolean(input.consentConfirmed),
    p_title: input.title || `Work order ${input.workOrderId}`,
    p_description: input.description || "",
    p_urgency: input.urgency || "",
    p_postcode: input.postcode || "",
    p_city: input.city || "",
    p_property_label: input.propertyLabel || "",
    p_request_payload: isRecord(input.requestPayload) ? input.requestPayload : {},
    p_metadata: isRecord(input.metadata) ? input.metadata : {},
  });

  if (error) {
    if (shouldFallbackToLocal(error)) {
      return createLocalMarketplaceJob({
        ...input,
        countryCode: provider.countryCode,
        submissionMode: provider.mode,
      });
    }
    throw friendly(error, "Failed to create marketplace handoff");
  }

  const row = firstRpcRow(data);
  if (!row) throw new Error("create_marketplace_job returned no data");
  return parseMarketplaceJobRow(row);
}

export async function getMarketplaceJobsForWorkOrder({ accountId, workOrderId }) {
  const localJobs = getLocalMarketplaceJobsForWorkOrder({ accountId, workOrderId });

  const { data, error } = await supabase.rpc("list_marketplace_jobs", {
    p_account_id: accountId,
    p_work_order_id: workOrderId,
  });

  if (error) {
    if (shouldFallbackToLocal(error)) return localJobs;
    throw friendly(error, "Failed to load marketplace handoffs");
  }

  const backendJobs = parseRpcRows(data || [], parseMarketplaceJobRow, "marketplace job rows");
  return mergeJobs(backendJobs, localJobs);
}

export async function markMarketplaceJobSubmitted({
  accountId,
  marketplaceJobId,
  externalJobId,
  externalReference,
  externalUrl,
  responsePayload,
}) {
  if (isLocalMarketplaceId(marketplaceJobId)) {
    markLocalMarketplaceJobSubmitted({
      accountId,
      marketplaceJobId,
      externalJobId,
      externalReference,
      externalUrl,
      responsePayload,
    });
    return;
  }

  const { error } = await supabase.rpc("mark_marketplace_job_submitted", {
    p_account_id: accountId,
    p_marketplace_job_id: marketplaceJobId,
    p_external_job_id: externalJobId || "",
    p_external_reference: externalReference || "",
    p_external_url: externalUrl || "",
    p_response_payload: isRecord(responsePayload) ? responsePayload : {},
  });

  if (error) throw friendly(error, "Failed to mark marketplace handoff as submitted");
}

export async function updateMarketplaceJobStatus({ accountId, marketplaceJobId, status, payload }) {
  if (isLocalMarketplaceId(marketplaceJobId)) {
    updateLocalMarketplaceJobStatus({ accountId, marketplaceJobId, status, payload });
    return;
  }

  const { error } = await supabase.rpc("update_marketplace_job_status", {
    p_account_id: accountId,
    p_marketplace_job_id: marketplaceJobId,
    p_status: status,
    p_payload: isRecord(payload) ? payload : {},
  });

  if (error) throw friendly(error, "Failed to update marketplace handoff status");
}

export async function submitMarketplaceJobToProvider({ accountId, marketplaceJobId } = {}) {
  if (!accountId || !marketplaceJobId) {
    throw new Error("accountId and marketplaceJobId are required");
  }

  if (isLocalMarketplaceId(marketplaceJobId)) {
    throw new Error("API submission is only available for persisted marketplace handoffs");
  }

  const { data, error } = await supabase.functions.invoke("submit-marketplace-handoff", {
    body: {
      accountId,
      marketplaceJobId,
    },
  });

  if (error) {
    const wrapped = buildEdgeFunctionFailure({
      payload: data,
      status: error?.context?.status || null,
      surface: "submit_marketplace_handoff",
      fallback: error.message || "Could not submit marketplace handoff",
      entityType: "external_marketplace_job",
      entityId: marketplaceJobId,
      accountId,
    });
    logSecurityRelevantFailure("submit_marketplace_handoff", {
      error: wrapped,
      context: {
        accountId,
        marketplaceJobId,
        surface: "marketplace_handoff",
      },
    });
    throw wrapped;
  }

  return {
    ok: data?.ok !== false,
    providerKey: String(data?.providerKey || ""),
    marketplaceJobId: String(data?.marketplaceJobId || marketplaceJobId),
    status: String(data?.status || ""),
    message: String(data?.message || "").trim(),
    liveSubmissionAvailable: data?.liveSubmissionAvailable === true,
    manualFallbackRecommended: data?.manualFallbackRecommended !== false,
    retryable: data?.retryable === true,
    attemptCount: Number.isFinite(Number(data?.attemptCount)) ? Number(data.attemptCount) : null,
    maxAttempts: Number.isFinite(Number(data?.maxAttempts)) ? Number(data.maxAttempts) : null,
    externalJobId: typeof data?.externalJobId === "string" ? data.externalJobId.trim() : "",
    externalReference: typeof data?.externalReference === "string" ? data.externalReference.trim() : "",
    externalUrl: typeof data?.externalUrl === "string" ? data.externalUrl.trim() : "",
    externalSubmissionUrl:
      typeof data?.externalSubmissionUrl === "string" && data.externalSubmissionUrl.trim()
        ? data.externalSubmissionUrl.trim()
        : null,
    preparedPayload: isRecord(data?.preparedPayload) ? data.preparedPayload : {},
  };
}

export function getMarketplaceSuggestion(countryCode) {
  return inferMarketplaceProviderFromCountry(countryCode);
}
