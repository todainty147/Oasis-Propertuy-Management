import {
  buildHmrcFraudPreventionHeaders,
  safeHmrcFraudHeaderEvidence,
} from "./hmrcFraudPreventionHeaders.ts";

const DEFINITE_CONNECTION_FAILURE = /dns|enotfound|econnrefused|connection refused|failed to resolve|name or service not known/i;
const POSSIBLY_DELIVERED_FAILURE = /econnreset|connection reset|socket hang up|networkerror|fetch failed|connection closed/i;

function envValue(name: string) {
  const deno = (globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno;
  return deno?.env?.get?.(name) || "";
}

export type HmrcLiveNetworkOutcome =
  | "accepted"
  | "validation_failed"
  | "rejected"
  | "hmrc_unavailable"
  | "timeout"
  | "network_error"
  | "unknown_acceptance_state";

export type HmrcLiveNetworkResult = {
  ok: boolean;
  outcome: HmrcLiveNetworkOutcome;
  status: number;
  body: Record<string, unknown>;
  correlationId: string | null;
  errorCode: string | null;
  message: string;
  acceptanceState: "accepted" | "rejected" | "not_sent" | "unknown";
  fraudPreventionHeaders: ReturnType<typeof safeHmrcFraudHeaderEvidence>;
};

export function normalizeHmrcLiveNetworkError(error: unknown, timedOut = false) {
  const message = error instanceof Error ? error.message : String(error || "");
  const errorName = error instanceof Error ? error.name : "";
  if (timedOut || errorName === "AbortError" || /timeout|timed out|aborted/i.test(message)) {
    return {
      outcome: "timeout" as const,
      acceptanceState: "unknown" as const,
      errorCode: "LIVE_NETWORK_TIMEOUT",
      message: "The HMRC request timed out and acceptance cannot be confirmed. Do not retry blindly; reconcile the attempt and read-back state first.",
    };
  }
  if (DEFINITE_CONNECTION_FAILURE.test(message)) {
    return {
      outcome: "network_error" as const,
      acceptanceState: "not_sent" as const,
      errorCode: "LIVE_NETWORK_CONNECTION_FAILED",
      message: "Tenaqo could not establish a connection to HMRC. The failed attempt was closed safely.",
    };
  }
  if (POSSIBLY_DELIVERED_FAILURE.test(message) || message) {
    return {
      outcome: "unknown_acceptance_state" as const,
      acceptanceState: "unknown" as const,
      errorCode: "UNKNOWN_ACCEPTANCE_STATE",
      message: "The HMRC connection ended before acceptance could be confirmed. Do not retry blindly; reconcile the attempt and read-back state first.",
    };
  }
  return {
    outcome: "network_error" as const,
    acceptanceState: "not_sent" as const,
    errorCode: "LIVE_NETWORK_ERROR",
    message: "Tenaqo could not complete the HMRC network request. The failed attempt was closed safely.",
  };
}

function httpOutcome(status: number): HmrcLiveNetworkOutcome {
  if (status >= 200 && status < 300) return "accepted";
  if ([400, 422].includes(status)) return "validation_failed";
  if (status >= 500) return "hmrc_unavailable";
  return "rejected";
}

export async function performHmrcLiveNetworkRequest({
  url,
  accessToken,
  accept,
  payload,
  accountId,
  userId,
  timeoutMs = 30_000,
  fetchImpl = fetch,
  now = new Date(),
}: {
  url: string;
  accessToken: string;
  accept: string;
  payload: Record<string, unknown>;
  accountId: string;
  userId: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<HmrcLiveNetworkResult> {
  const fraud = buildHmrcFraudPreventionHeaders({
    accountId,
    userId,
    publicIp: envValue("HMRC_SERVER_PUBLIC_IP"),
    publicPort: envValue("HMRC_SERVER_PUBLIC_PORT") || "443",
    licenseId: envValue("HMRC_VENDOR_LICENSE_ID") || accountId,
    productVersion: envValue("HMRC_VENDOR_VERSION") || "web",
    now,
  });
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, timeoutMs));

  try {
    const response = await fetchImpl(url, {
      method: "PUT",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: accept,
        "Content-Type": "application/json",
        ...fraud.headers,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const outcome = httpOutcome(response.status);
    return {
      ok: response.ok,
      outcome,
      status: response.status,
      body,
      correlationId: response.headers.get("x-correlation-id") || response.headers.get("X-Correlation-ID") || null,
      errorCode: typeof body.code === "string" ? body.code : null,
      message: outcome === "accepted"
        ? "Accepted"
        : outcome === "hmrc_unavailable"
          ? "HMRC is unavailable. The attempt was closed and may be retried after service recovery."
          : outcome === "validation_failed"
            ? "HMRC rejected the live pilot request because validation or a business rule failed."
            : "HMRC rejected the live pilot request.",
      acceptanceState: response.ok ? "accepted" : "rejected",
      fraudPreventionHeaders: safeHmrcFraudHeaderEvidence(fraud.headers, fraud.missingContext),
    };
  } catch (error) {
    const normalized = normalizeHmrcLiveNetworkError(error, timedOut);
    return {
      ok: false,
      ...normalized,
      status: 0,
      body: {},
      correlationId: null,
      fraudPreventionHeaders: safeHmrcFraudHeaderEvidence(fraud.headers, fraud.missingContext),
    };
  } finally {
    clearTimeout(timeout);
  }
}
