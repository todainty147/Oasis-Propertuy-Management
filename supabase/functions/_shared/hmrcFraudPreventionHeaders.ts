const SENSITIVE_KEY_PATTERN = /(authorization|token|secret|password|payload|nino|business.?id)/i;

export const HMRC_FRAUD_PREVENTION_HEADER_NAMES = Object.freeze([
  "Gov-Client-Connection-Method",
  "Gov-Client-Device-ID",
  "Gov-Client-Timezone",
  "Gov-Client-User-IDs",
  "Gov-Client-Public-IP",
  "Gov-Client-Public-IP-Timestamp",
  "Gov-Client-Public-Port",
  "Gov-Vendor-License-IDs",
  "Gov-Vendor-Product-Name",
  "Gov-Vendor-Version",
]);

function clean(value: unknown) {
  return String(value || "").trim().replace(/[\r\n]/g, "");
}

function encodePair(name: string, value: unknown) {
  const safeName = clean(name);
  const safeValue = clean(value);
  if (!safeName || !safeValue) return "";
  return `${encodeURIComponent(safeName)}=${encodeURIComponent(safeValue)}`;
}

function normalizedTimestamp(value: unknown, now: Date) {
  const parsed = value ? new Date(String(value)) : now;
  return Number.isNaN(parsed.getTime()) ? now.toISOString() : parsed.toISOString();
}

export function buildHmrcFraudPreventionHeaders({
  accountId,
  userId,
  deviceId,
  timezone = "UTC+00:00",
  publicIp,
  publicPort = "443",
  publicIpTimestamp,
  licenseId,
  productName = "Tenaqo",
  productVersion = "unknown",
  now = new Date(),
}: {
  accountId?: string;
  userId?: string;
  deviceId?: string;
  timezone?: string;
  publicIp?: string;
  publicPort?: string | number;
  publicIpTimestamp?: string;
  licenseId?: string;
  productName?: string;
  productVersion?: string;
  now?: Date;
} = {}): { headers: Record<string, string>; missingContext: string[] } {
  const headers: Record<string, string> = {
    "Gov-Client-Connection-Method": "OTHER_DIRECT",
    "Gov-Client-Timezone": clean(timezone) || "UTC+00:00",
    "Gov-Vendor-Product-Name": clean(productName) || "Tenaqo",
    "Gov-Vendor-Version": encodePair(clean(productName) || "Tenaqo", productVersion || "unknown"),
  };

  const resolvedDeviceId = clean(deviceId || accountId);
  const userIds = encodePair("tenaqo", userId);
  const resolvedPublicIp = clean(publicIp);
  const resolvedPublicPort = clean(publicPort);
  const resolvedLicense = encodePair("tenaqo", licenseId || accountId);

  if (resolvedDeviceId) headers["Gov-Client-Device-ID"] = resolvedDeviceId;
  if (userIds) headers["Gov-Client-User-IDs"] = userIds;
  if (resolvedPublicIp) {
    headers["Gov-Client-Public-IP"] = resolvedPublicIp;
    headers["Gov-Client-Public-IP-Timestamp"] = normalizedTimestamp(publicIpTimestamp, now);
  }
  if (resolvedPublicPort) headers["Gov-Client-Public-Port"] = resolvedPublicPort;
  if (resolvedLicense) headers["Gov-Vendor-License-IDs"] = resolvedLicense;

  const missingContext: string[] = [
    ["accountId", accountId],
    ["userId", userId],
    ["publicIp", publicIp],
  ].filter(([, value]) => !clean(value)).map(([name]) => String(name));

  return { headers, missingContext };
}

export function safeHmrcFraudHeaderEvidence(
  headers: Record<string, unknown> = {},
  missingContext: string[] = [],
) {
  const presentHeaders = Object.keys(headers)
    .filter((name) => HMRC_FRAUD_PREVENTION_HEADER_NAMES.includes(name))
    .sort();
  return {
    connectionMethod: clean(headers["Gov-Client-Connection-Method"]) || null,
    presentHeaders,
    missingContext: missingContext.filter((name) => !SENSITIVE_KEY_PATTERN.test(name)),
    valuesRecorded: false,
  };
}

export function sanitizeHmrcDiagnosticValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeHmrcDiagnosticValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, next]) => [key, sanitizeHmrcDiagnosticValue(next)]),
  );
}
