import { createHash, createHmac } from "node:crypto";

export type MarketplacePreparedPayload = {
  marketplaceJobId: string;
  workOrderId: string;
  providerKey: string;
  title: string;
  description: string;
  urgency: string;
  postcode: string;
  city: string;
  propertyLabel: string;
  tradeCategory: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  requestPayload: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type MarketplaceSubmissionConfig = {
  endpointUrl: string;
  apiKey: string;
  apiSecret?: string;
  requestDate?: string;
  timeoutMs: number;
  authHeaderName?: string | null;
  authScheme?: string | null;
  staticHeaders?: Record<string, string>;
  idempotencyKey: string;
  providerAccountReference?: string | null;
  providerConfiguration?: Record<string, unknown>;
  signatureBody?: string;
};

export type MarketplaceTradeItem = {
  id: string;
  name: string;
  profileURL: string;
};

export type MarketplaceSubmissionTransportResult = {
  ok: boolean;
  httpStatus: number | null;
  responseBody: unknown;
  responseText: string;
  externalJobId: string;
  externalReference: string;
  externalUrl: string;
  trades: MarketplaceTradeItem[];
};

function trim(value: unknown) {
  return String(value || "").trim();
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeStringHeaders(value: unknown) {
  return Object.fromEntries(
    Object.entries(toRecord(value))
      .map(([key, headerValue]) => [trim(key), trim(headerValue)])
      .filter(([key, headerValue]) => key && headerValue),
  );
}

function toInteger(value: unknown) {
  const next = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(next) ? next : null;
}

function splitContactName(contactName: string) {
  const raw = trim(contactName);
  if (!raw) return { firstName: "", lastName: "" };
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function normalizeTradeCategoryKey(value: string) {
  return trim(value).toLowerCase().replace(/\s+/g, "_");
}

function resolveCheckatradeCategoryId(
  preparedPayload: MarketplacePreparedPayload,
  providerConfiguration: Record<string, unknown>,
) {
  const requestPayload = toRecord(preparedPayload.requestPayload);
  const categoryMap = toRecord(providerConfiguration.trade_category_map);
  const requestOverride = toInteger(requestPayload.categoryId ?? requestPayload.category_id);
  if (requestOverride !== null) return requestOverride;

  const tradeKey = normalizeTradeCategoryKey(preparedPayload.tradeCategory);
  const mapped = toInteger(categoryMap[tradeKey] ?? categoryMap[trim(preparedPayload.tradeCategory)]);
  if (mapped !== null) return mapped;

  return toInteger(providerConfiguration.default_category_id);
}

function resolveCheckatradePreferredStart(
  preparedPayload: MarketplacePreparedPayload,
  providerConfiguration: Record<string, unknown>,
) {
  const requestPayload = toRecord(preparedPayload.requestPayload);
  const preferred = toRecord(requestPayload.preferredStart ?? requestPayload.preferred_start);
  const preferredId = trim(preferred.id);
  if (preferredId) {
    const result: Record<string, unknown> = { id: preferredId };
    const preferredDate = trim(preferred.date);
    if (preferredDate) result.date = preferredDate;
    return result;
  }

  const urgencyMap = toRecord(providerConfiguration.urgency_to_preferred_start_map);
  const urgencyKey = normalizeTradeCategoryKey(preparedPayload.urgency);
  const mapped = trim(urgencyMap[urgencyKey] ?? urgencyMap[trim(preparedPayload.urgency)]);
  if (mapped) return { id: mapped };

  const defaultId = trim(providerConfiguration.default_preferred_start_id);
  return defaultId ? { id: defaultId } : null;
}

function buildCheckatradeAddress(
  preparedPayload: MarketplacePreparedPayload,
) {
  if (!trim(preparedPayload.postcode)) return null;
  if (!trim(preparedPayload.propertyLabel) || !trim(preparedPayload.city)) return null;

  return {
    line1: trim(preparedPayload.propertyLabel),
    city: trim(preparedPayload.city),
    postcode: trim(preparedPayload.postcode),
  };
}

export function validateMarketplaceSubmissionReadiness(
  config: MarketplaceSubmissionConfig,
  preparedPayload: MarketplacePreparedPayload,
) {
  if (preparedPayload.providerKey !== "checkatrade") return [];

  const providerConfiguration = toRecord(config.providerConfiguration);
  const categoryId = resolveCheckatradeCategoryId(preparedPayload, providerConfiguration);
  const { firstName, lastName } = splitContactName(preparedPayload.contactName);
  const errors: string[] = [];

  if (categoryId === null) {
    errors.push("Checkatrade categoryId is missing. Configure a trade_category_map/default_category_id or pass categoryId in the marketplace request payload.");
  }
  if (!trim(preparedPayload.description) || trim(preparedPayload.description).length < 10) {
    errors.push("Checkatrade requires a description of at least 10 characters.");
  }
  if (!trim(preparedPayload.contactEmail)) {
    errors.push("Checkatrade requires a contact email.");
  }
  if (!trim(preparedPayload.contactPhone)) {
    errors.push("Checkatrade requires a contact phone number.");
  }
  if (!trim(firstName) || !trim(lastName)) {
    errors.push("Checkatrade requires a contact first and last name.");
  }
  if (!trim(preparedPayload.postcode)) {
    errors.push("Checkatrade requires a postcode.");
  }

  return errors;
}

export function buildMarketplaceRequestDate(now = new Date()) {
  return now.toISOString();
}

export function normalizeMarketplaceTransportUrl(value: string | null | undefined) {
  const raw = trim(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (!/^https?:$/i.test(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function buildMarketplaceSubmissionBody(
  preparedPayload: MarketplacePreparedPayload,
  providerAccountReference?: string | null,
  providerConfiguration?: Record<string, unknown>,
) {
  if (preparedPayload.providerKey === "checkatrade") {
    const configuration = toRecord(providerConfiguration);
    const categoryId = resolveCheckatradeCategoryId(preparedPayload, configuration);
    const preferredStart = resolveCheckatradePreferredStart(preparedPayload, configuration);
    const { firstName, lastName } = splitContactName(preparedPayload.contactName);
    const requestPayload = toRecord(preparedPayload.requestPayload);
    const address = buildCheckatradeAddress(preparedPayload);

    const body: Record<string, unknown> = {
      categoryId,
      description: trim(preparedPayload.description),
      email: trim(preparedPayload.contactEmail),
      phone: trim(preparedPayload.contactPhone),
      firstName,
      lastName,
      postcode: trim(preparedPayload.postcode),
    };

    if (preferredStart) body.preferredStart = preferredStart;
    if (address) body.address = address;
    if (providerAccountReference) body.accountReference = providerAccountReference;

    const passthroughKeys = ["line2", "line3"];
    if (address) {
      for (const key of passthroughKeys) {
        const next = trim(requestPayload[key]);
        if (next) {
          (body.address as Record<string, unknown>)[key] = next;
        }
      }
    }

    return body;
  }

  return {
    provider: preparedPayload.providerKey,
    handoff: {
      marketplace_job_id: preparedPayload.marketplaceJobId,
      work_order_id: preparedPayload.workOrderId,
      title: preparedPayload.title,
      description: preparedPayload.description,
      urgency: preparedPayload.urgency,
      trade_category: preparedPayload.tradeCategory,
      location: {
        postcode: preparedPayload.postcode,
        city: preparedPayload.city,
        property_label: preparedPayload.propertyLabel,
      },
      contact: {
        name: preparedPayload.contactName,
        email: preparedPayload.contactEmail,
        phone: preparedPayload.contactPhone,
      },
      request_payload: preparedPayload.requestPayload,
      metadata: preparedPayload.metadata,
    },
    account_context: providerAccountReference ? {
      provider_account_reference: providerAccountReference,
    } : undefined,
  };
}

function buildMarketplaceRequestTarget(endpointUrl: string) {
  try {
    const url = new URL(endpointUrl);
    return `post ${url.pathname || "/"}${url.search}`;
  } catch {
    return "post /";
  }
}

export function buildMarketplaceTransportHeaders(config: MarketplaceSubmissionConfig) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": config.idempotencyKey,
    "X-OASIS-Marketplace-Job-Id": config.idempotencyKey,
    ...normalizeStringHeaders(config.staticHeaders),
  };

  if (trim(config.apiSecret)) {
    const requestDate = trim(config.requestDate) || buildMarketplaceRequestDate();
    const digest = createHash("sha256")
      .update(config.signatureBody || "")
      .digest("base64");
    const digestHeader = `SHA-256=${digest}`;
    const requestTarget = buildMarketplaceRequestTarget(config.endpointUrl);
    const signingString = [
      `(request-target): ${requestTarget}`,
      `date: ${requestDate}`,
      `content-type: ${headers["Content-Type"]}`,
      `digest: ${digestHeader}`,
    ].join("\n");
    const signature = createHmac("sha256", trim(config.apiSecret))
      .update(signingString)
      .digest("base64");

    headers.Date = requestDate;
    headers.Digest = digestHeader;
    headers.Authorization =
      `Signature keyId="${trim(config.apiKey)}",algorithm="hmac-sha256",headers="(request-target) date content-type digest",signature="${signature}"`;
    return headers;
  }

  const authHeaderName = trim(config.authHeaderName) || "Authorization";
  const authScheme = trim(config.authScheme);
  headers[authHeaderName] = authScheme ? `${authScheme} ${config.apiKey}` : config.apiKey;
  return headers;
}

export async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function firstNonEmpty(values: unknown[]) {
  for (const value of values) {
    const next = trim(value);
    if (next) return next;
  }
  return "";
}

const CHECKATRADE_ALLOWED_HOSTNAMES = new Set([
  "www.checkatrade.com",
  "checkatrade.com",
]);

function safeCheckatradeProfileUrl(raw: unknown): string {
  const value = trim(raw);
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    if (!CHECKATRADE_ALLOWED_HOSTNAMES.has(url.hostname.toLowerCase())) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function extractCheckatradeTrades(payload: unknown): MarketplaceTradeItem[] {
  const body = toRecord(payload);
  const data = toRecord(body.data);
  const raw = body.trades ?? data.trades;

  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const entry = toRecord(item);
      return {
        id: trim(entry.id),
        name: trim(entry.name),
        profileURL: safeCheckatradeProfileUrl(entry.profileURL ?? entry.profile_url ?? entry.profileUrl),
      };
    })
    .filter((t) => t.id || t.name);
}

export function extractMarketplaceExternalFields(payload: unknown, response: Response) {
  const body = toRecord(payload);
  const data = toRecord(body.data);
  const result = toRecord(body.result);

  const candidates = [body, data, result];
  const pick = (...keys: string[]) =>
    firstNonEmpty(
      candidates.flatMap((candidate) => keys.map((key) => candidate[key])),
    );

  return {
    externalJobId: firstNonEmpty([
      pick("job_id", "jobId", "external_job_id", "externalJobId", "id"),
      response.headers.get("x-provider-job-id"),
    ]),
    externalReference: firstNonEmpty([
      pick("reference", "external_reference", "externalReference", "job_reference", "jobReference"),
      response.headers.get("x-provider-reference"),
    ]),
    externalUrl: firstNonEmpty([
      pick("url", "external_url", "externalUrl", "job_url", "jobUrl"),
      response.headers.get("location"),
      response.headers.get("content-location"),
    ]),
    trades: extractCheckatradeTrades(payload),
  };
}

export function classifyMarketplaceSubmissionFailure({
  httpStatus,
  attemptCount,
  maxAttempts,
}: {
  httpStatus: number | null;
  attemptCount: number;
  maxAttempts: number;
}) {
  const retryable = httpStatus === null ||
    httpStatus === 408 ||
    httpStatus === 409 ||
    httpStatus === 425 ||
    httpStatus === 429 ||
    (typeof httpStatus === "number" && httpStatus >= 500);

  const exhausted = attemptCount >= maxAttempts;
  return {
    retryable,
    nextStatus: retryable && !exhausted ? "failed" : "manual_follow_up",
  };
}

export async function submitMarketplaceTransport(
  config: MarketplaceSubmissionConfig,
  preparedPayload: MarketplacePreparedPayload,
): Promise<MarketplaceSubmissionTransportResult> {
  const timeoutMs = Number.isFinite(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("marketplace_timeout"), timeoutMs);
  const requestBody = JSON.stringify(
    buildMarketplaceSubmissionBody(
      preparedPayload,
      config.providerAccountReference,
      config.providerConfiguration,
    ),
  );

  try {
    const response = await fetch(config.endpointUrl, {
      method: "POST",
      headers: buildMarketplaceTransportHeaders({ ...config, signatureBody: requestBody }),
      body: requestBody,
      signal: controller.signal,
    });

    const responseBody = await safeJson(response);
    const responseText =
      typeof responseBody === "string"
        ? responseBody
        : JSON.stringify(responseBody || {});
    const externalFields = extractMarketplaceExternalFields(responseBody, response);

    return {
      ok: response.ok,
      httpStatus: response.status,
      responseBody,
      responseText,
      externalJobId: externalFields.externalJobId,
      externalReference: externalFields.externalReference,
      externalUrl: externalFields.externalUrl,
      trades: externalFields.trades,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
