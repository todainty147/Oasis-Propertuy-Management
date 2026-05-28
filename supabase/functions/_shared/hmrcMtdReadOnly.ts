import {
  admin,
  auditHmrcEvent,
  decryptConnectionAccessToken,
  getConnection,
  HMRC_BASE_URL,
  HMRC_ENVIRONMENT,
  HttpError,
} from "./hmrcEdge.ts";
export {
  HMRC_ACCEPT_HEADERS,
  maskNino,
  normalizeHmrcError,
  normalizeSandboxNino,
  summarizeBusinessDetails,
  summarizeObligations,
} from "./hmrcMtdReadOnlyHelpers.ts";
import {
  maskNino,
  normalizeHmrcError,
  normalizeSandboxNino,
} from "./hmrcMtdReadOnlyHelpers.ts";

export type HmrcCheckType =
  | "business_details"
  | "obligations_income_and_expenditure"
  | "property_business_read";

export function getSandboxProfile(connection: Record<string, unknown> | null | undefined) {
  const metadata = connection?.metadata && typeof connection.metadata === "object"
    ? connection.metadata as Record<string, unknown>
    : {};
  const profile = metadata.sandbox_profile && typeof metadata.sandbox_profile === "object"
    ? metadata.sandbox_profile as Record<string, unknown>
    : {};
  return {
    nino: normalizeSandboxNino(profile.nino),
    incomeSourceId: String(profile.income_source_id || "").trim(),
    mtditid: String(profile.mtditid || "").trim(),
    updatedAt: profile.updated_at || null,
  };
}

export function safeSandboxProfile(connection: Record<string, unknown> | null | undefined) {
  const profile = getSandboxProfile(connection);
  return {
    hasNino: Boolean(profile.nino),
    ninoMasked: maskNino(profile.nino),
    hasIncomeSourceId: Boolean(profile.incomeSourceId),
    incomeSourceIdMasked: profile.incomeSourceId ? maskIdentifier(profile.incomeSourceId) : "",
    updatedAt: profile.updatedAt,
  };
}

export async function persistDiscoveredIncomeSourceId(connection: Record<string, unknown>, incomeSourceId: string) {
  const id = String(incomeSourceId || "").trim();
  if (!id || !connection?.id) return;
  const metadata = connection.metadata && typeof connection.metadata === "object"
    ? connection.metadata as Record<string, unknown>
    : {};
  const profile = metadata.sandbox_profile && typeof metadata.sandbox_profile === "object"
    ? metadata.sandbox_profile as Record<string, unknown>
    : {};
  if (profile.income_source_id) return;
  await admin
    .from("hmrc_connections")
    .update({
      metadata: {
        ...metadata,
        sandbox_profile: {
          ...profile,
          income_source_id: id,
          updated_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", connection.id);
}

export function maskIdentifier(value: unknown) {
  const id = String(value || "").trim();
  if (id.length <= 6) return id ? "configured" : "";
  return `${id.slice(0, 3)}...${id.slice(-3)}`;
}

export async function requireConnectedHmrcConnection(accountId: string) {
  const connection = await getConnection(accountId);
  if (!connection || connection.connection_status !== "connected") {
    throw new HttpError("Connect HMRC sandbox before running read-only verification.", 400);
  }
  return connection as Record<string, unknown>;
}

export async function hmrcRequest({
  accountId,
  connection,
  path,
  accept,
  action,
  userId,
  query = {},
}: {
  accountId: string;
  connection: Record<string, unknown>;
  path: string;
  accept: string;
  action: string;
  userId: string;
  query?: Record<string, string | undefined>;
}) {
  const accessToken = await decryptConnectionAccessToken(connection);
  const url = new URL(path, HMRC_BASE_URL);
  Object.entries(query).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: accept,
    },
  });
  const body = await response.json().catch(() => ({}));
  const normalized = response.ok ? null : normalizeHmrcError(response.status, body);

  await auditHmrcEvent({
    accountId,
    userId,
    action,
    endpoint: path,
    method: "GET",
    status: response.ok ? "success" : response.status === 404 ? "success" : "failed",
    httpStatus: response.status,
    responseSummary: {
      ok: response.ok,
      status: response.status,
      hmrc_code: normalized?.hmrcCode || null,
      safe_code: normalized?.safeCode || null,
    },
    errorMessage: response.ok || response.status === 404 ? null : normalized?.message || "HMRC read-only check failed",
  });

  return {
    ok: response.ok,
    status: response.status,
    body: body as Record<string, unknown>,
    normalized,
  };
}

export async function writeHmrcReadinessCheck({
  accountId,
  connectionId,
  checkType,
  status,
  hmrcStatusCode = null,
  hmrcCode = null,
  summary = {},
  checkedBy,
}: {
  accountId: string;
  connectionId?: string | null;
  checkType: HmrcCheckType;
  status: "success" | "no_data" | "failed" | "blocked" | "not_run";
  hmrcStatusCode?: number | null;
  hmrcCode?: string | null;
  summary?: Record<string, unknown>;
  checkedBy: string;
}) {
  await admin.from("hmrc_readiness_checks").insert({
    account_id: accountId,
    connection_id: connectionId || null,
    environment: HMRC_ENVIRONMENT,
    check_type: checkType,
    status,
    hmrc_status_code: hmrcStatusCode,
    hmrc_code: hmrcCode,
    summary,
    checked_by: checkedBy,
  });
}
