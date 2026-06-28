type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
};

export type RegulatorySourceForCheck = {
  id: string;
  source_url: string;
  source_title?: string | null;
  account_id?: string | null;
  status?: string | null;
};

type PerformRegulatorySourceCheckOptions = {
  client: RpcClient;
  source: RegulatorySourceForCheck;
  resultRpc: string;
  failureRpc: string;
  runId?: string | null;
  triggerType: "operator" | "scheduled";
};

export type RegulatorySourceCheckOutcome = {
  sourceId: string;
  status: "success" | "error";
  checked: boolean;
  baseline?: boolean;
  changed?: boolean;
  candidateCreated: boolean;
  candidateId?: string | null;
  lastKnownHash?: string | null;
  lastCheckStatus?: string | null;
  lastCheckedAt?: string | null;
  lastSuccessfulCheckAt?: string | null;
  demoMode?: boolean;
  errorCode?: string | null;
};

const REGULATORY_SOURCE_ALLOWED_HOSTS = (
  Deno.env.get("REGULATORY_SOURCE_ALLOWED_HOSTS") || "www.gov.uk,gov.uk,legislation.gov.uk"
)
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);
const REGULATORY_SOURCE_FETCH_TIMEOUT_MS = clampNumber(
  Number(Deno.env.get("REGULATORY_SOURCE_FETCH_TIMEOUT_MS") || "10000"),
  1000,
  30000,
);
const REGULATORY_SOURCE_MAX_BYTES = clampNumber(
  Number(Deno.env.get("REGULATORY_SOURCE_MAX_BYTES") || "1048576"),
  32768,
  2097152,
);
const MAX_REDIRECTS = 5;

export async function performRegulatorySourceCheck({
  client,
  source,
  resultRpc,
  failureRpc,
  runId = null,
  triggerType,
}: PerformRegulatorySourceCheckOptions): Promise<RegulatorySourceCheckOutcome> {
  if (!source?.id || !source.source_url) {
    throw new Error("regulatory source is missing source_url");
  }

  let fetched: FetchedSource;
  try {
    fetched = await fetchRegulatorySource(source.source_url);
  } catch (error) {
    const errorCode = classifyFetchError(error);
    const failed = await client.rpc(failureRpc, {
      p_source_id: source.id,
      p_error_code: errorCode,
      p_error_message: error instanceof Error ? error.message : "source check failed",
      p_scheduled_run_id: runId,
      p_trigger_type: triggerType,
      p_demo_mode: true,
    });
    if (failed.error) throw new Error(failed.error.message || "Could not record source check failure");
    return {
      sourceId: source.id,
      status: "error",
      checked: false,
      candidateCreated: false,
      errorCode,
    };
  }

  const normalizedContent = normalizeFetchedContent(fetched.text);
  if (!normalizedContent) {
    const failed = await client.rpc(failureRpc, {
      p_source_id: source.id,
      p_error_code: "empty_normalized_content",
      p_error_message: "Fetched source normalized to empty content",
      p_scheduled_run_id: runId,
      p_trigger_type: triggerType,
      p_demo_mode: true,
    });
    if (failed.error) throw new Error(failed.error.message || "Could not record empty source check failure");
    return {
      sourceId: source.id,
      status: "error",
      checked: false,
      candidateCreated: false,
      errorCode: "empty_normalized_content",
    };
  }

  const snapshotExcerpt = normalizedContent.slice(0, 4000);
  const recorded = await client.rpc(resultRpc, {
    p_source_id: source.id,
    p_normalized_content: normalizedContent,
    p_snapshot_excerpt: snapshotExcerpt,
    p_snapshot_ref: null,
    p_retrieved_at: fetched.retrievedAt,
    p_scheduled_run_id: runId,
    p_trigger_type: triggerType,
    p_demo_mode: true,
  });

  if (recorded.error) {
    throw new Error(recorded.error.message || "Could not record source check");
  }

  return {
    sourceId: source.id,
    status: "success",
    checked: true,
    ...normalizeRecordResult(recorded.data),
  };
}

type FetchedSource = {
  text: string;
  retrievedAt: string;
};

async function fetchRegulatorySource(initialUrl: string): Promise<FetchedSource> {
  let currentUrl = validateAllowedUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await rejectPrivateAddressHost(currentUrl.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("source_fetch_timeout"), REGULATORY_SOURCE_FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.1",
          "User-Agent": "Tenaqo-Regulatory-Monitoring/VS2",
        },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (isRedirect(response.status)) {
      const location = response.headers.get("Location");
      if (!location) throw new Error("redirect_without_location");
      currentUrl = validateAllowedUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(`source_http_${response.status}`);
    }

    const contentType = response.headers.get("Content-Type") || "";
    if (!isAllowedContentType(contentType)) {
      throw new Error("source_content_type_rejected");
    }

    return {
      text: await readBoundedText(response),
      retrievedAt: new Date().toISOString(),
    };
  }

  throw new Error("too_many_redirects");
}

function validateAllowedUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid_source_url");
  }

  if (url.protocol !== "https:") {
    throw new Error("source_url_must_use_https");
  }

  const host = url.hostname.toLowerCase();
  if (!REGULATORY_SOURCE_ALLOWED_HOSTS.includes(host)) {
    throw new Error("source_host_not_allowlisted");
  }

  return url;
}

async function rejectPrivateAddressHost(hostname: string) {
  if (isLocalHostname(hostname) || isIpAddressBlocked(hostname)) {
    throw new Error("source_private_host_rejected");
  }

  const [ipv4Addresses, ipv6Addresses] = await Promise.all([
    resolveDnsRecords(hostname, "A"),
    resolveDnsRecords(hostname, "AAAA"),
  ]);
  const addresses = [...ipv4Addresses, ...ipv6Addresses];

  if (addresses.length === 0) {
    throw new Error("source_dns_resolution_failed");
  }

  if (addresses.some(isIpAddressBlocked)) {
    throw new Error("source_private_ip_rejected");
  }
}

async function resolveDnsRecords(hostname: string, recordType: "A" | "AAAA") {
  try {
    return await Deno.resolveDns(hostname, recordType);
  } catch {
    return [];
  }
}

function normalizeFetchedContent(input: string) {
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readBoundedText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return await response.text();

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > REGULATORY_SOURCE_MAX_BYTES) {
      await reader.cancel();
      throw new Error("source_response_too_large");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isAllowedContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  return normalized.includes("text/html")
    || normalized.includes("text/plain")
    || normalized.includes("application/xhtml+xml")
    || normalized.includes("application/xml")
    || normalized.includes("text/xml");
}

function isLocalHostname(hostname: string) {
  const value = hostname.toLowerCase();
  return value === "localhost" || value.endsWith(".localhost");
}

function isIpAddressBlocked(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/%.+$/, "");

  if (normalized.includes(".")) {
    const mappedIpv4 = normalized.slice(normalized.lastIndexOf(":") + 1);
    return isIpv4AddressBlocked(mappedIpv4);
  }

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fe80:")) return true;

  const firstHextet = Number.parseInt(normalized.split(":")[0] || "0", 16);
  if (Number.isFinite(firstHextet)) {
    if ((firstHextet & 0xfe00) === 0xfc00) return true;
    if ((firstHextet & 0xff00) === 0xff00) return true;
  }

  const mappedV4 = extractHexMappedIpv4(normalized);
  if (mappedV4) return isIpv4AddressBlocked(mappedV4);

  return false;
}

function extractHexMappedIpv4(ipv6: string): string | null {
  const dci = ipv6.indexOf("::");
  let segments: string[];
  if (dci >= 0) {
    const left = ipv6.slice(0, dci).split(":").filter(Boolean);
    const right = ipv6.slice(dci + 2).split(":").filter(Boolean);
    const pad = 8 - left.length - right.length;
    if (pad < 0) return null;
    segments = [...left, ...Array(pad).fill("0"), ...right];
  } else {
    segments = ipv6.split(":");
  }
  if (segments.length !== 8) return null;

  for (let i = 0; i < 5; i++) {
    if (Number.parseInt(segments[i], 16) !== 0) return null;
  }
  if (Number.parseInt(segments[5], 16) !== 0xffff) return null;

  const hi = Number.parseInt(segments[6], 16);
  const lo = Number.parseInt(segments[7], 16);
  if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi > 0xffff || lo > 0xffff) return null;

  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

function isIpv4AddressBlocked(value: string) {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a === 0;
}

function classifyFetchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "source_check_failed");
  if (message.includes("timeout") || message.includes("Abort")) return "source_fetch_timeout";
  if (message.includes("https")) return "source_url_must_use_https";
  if (message.includes("allowlisted")) return "source_host_not_allowlisted";
  if (message.includes("private")) return "source_private_address_rejected";
  if (message.includes("too_large")) return "source_response_too_large";
  if (message.includes("content_type")) return "source_content_type_rejected";
  if (message.includes("dns")) return "source_dns_resolution_failed";
  return "source_check_failed";
}

function normalizeRecordResult(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    baseline: Boolean(record.baseline),
    changed: Boolean(record.changed),
    candidateCreated: Boolean(record.candidate_created),
    candidateId: typeof record.candidate_id === "string" ? record.candidate_id : null,
    lastKnownHash: typeof record.last_known_hash === "string" ? record.last_known_hash : null,
    lastCheckStatus: typeof record.last_check_status === "string" ? record.last_check_status : null,
    lastCheckedAt: typeof record.last_checked_at === "string" ? record.last_checked_at : null,
    lastSuccessfulCheckAt: typeof record.last_successful_check_at === "string"
      ? record.last_successful_check_at
      : null,
    demoMode: record.demo_mode === true,
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
