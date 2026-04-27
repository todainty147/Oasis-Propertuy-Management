import {
  inferMarketplaceProviderFromCountry,
  listMarketplaceProviders,
  marketplaceProviders,
} from "../config/marketplaceProviders";

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

export function getMarketplaceProviders() {
  return listMarketplaceProviders();
}

export function getMarketplaceSettings() {
  return {};
}

export function getFulfilmentRoute({ accountId, workOrderId }) {
  const routes = readJson(ROUTES_KEY, {});
  return routes?.[accountId]?.[workOrderId] || "internal";
}

export function setFulfilmentRoute({ accountId, workOrderId, route }) {
  const routes = readJson(ROUTES_KEY, {});
  const next = { ...routes };
  next[accountId] = { ...(next[accountId] || {}), [workOrderId]: route };
  writeJson(ROUTES_KEY, next);
  return route;
}

export function createMarketplaceJob(input) {
  const jobs = readJson(JOBS_KEY, []);
  const provider = marketplaceProviders[input.providerKey];
  if (!provider) throw new Error("Unknown marketplace provider");

  const job = {
    id: buildStorageId(),
    accountId: input.accountId,
    workOrderId: input.workOrderId,
    providerKey: input.providerKey,
    countryCode: provider.countryCode,
    tradeCategory: input.tradeCategory || "",
    externalJobId: "",
    externalReference: "",
    externalUrl: "",
    status: input.consentConfirmed ? "ready_to_submit" : "draft",
    submissionMode: provider.mode,
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
    requestPayload: {},
    responsePayload: {},
    metadata: input.metadata || {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  jobs.unshift(job);
  writeJson(JOBS_KEY, jobs);
  return job;
}

export function getMarketplaceJobsForWorkOrder({ accountId, workOrderId }) {
  const jobs = readJson(JOBS_KEY, []);
  return jobs.filter((job) => job.accountId === accountId && job.workOrderId === workOrderId);
}

export function markMarketplaceJobSubmitted({
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

export function updateMarketplaceJobStatus({ accountId, marketplaceJobId, status, payload }) {
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

export function getMarketplaceSuggestion(countryCode) {
  return inferMarketplaceProviderFromCountry(countryCode);
}
