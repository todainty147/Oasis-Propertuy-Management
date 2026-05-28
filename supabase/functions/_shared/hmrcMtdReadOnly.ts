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
  normalizeTestBusinessType,
  safeObligationsBusinessType,
  safeTaxYear,
  summarizeBusinessDetails,
  summarizeObligations,
  taxYearAccountingPeriod,
} from "./hmrcMtdReadOnlyHelpers.ts";
import {
  maskNino,
  normalizeHmrcError,
  normalizeSandboxNino,
  normalizeTestBusinessType,
  safeObligationsBusinessType,
  taxYearAccountingPeriod,
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
    testBusinessId: String(profile.test_business_id || "").trim(),
    testBusinessType: String(profile.test_business_type || "").trim(),
    testTaxYear: String(profile.test_tax_year || "").trim(),
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
    hasTestBusinessId: Boolean(profile.testBusinessId),
    testBusinessIdMasked: profile.testBusinessId ? maskIdentifier(profile.testBusinessId) : "",
    testBusinessType: profile.testBusinessType || "",
    testTaxYear: profile.testTaxYear || "",
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
  if (profile.income_source_id === id) return;
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

export async function updateSandboxProfile(connection: Record<string, unknown>, patch: Record<string, unknown>) {
  if (!connection?.id) return null;
  const metadata = connection.metadata && typeof connection.metadata === "object"
    ? connection.metadata as Record<string, unknown>
    : {};
  const profile = metadata.sandbox_profile && typeof metadata.sandbox_profile === "object"
    ? metadata.sandbox_profile as Record<string, unknown>
    : {};
  const { data, error } = await admin
    .from("hmrc_connections")
    .update({
      metadata: {
        ...metadata,
        sandbox_profile: {
          ...profile,
          ...patch,
          updated_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", connection.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
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
  method = "GET",
  body = null,
  testScenario = "STATEFUL",
}: {
  accountId: string;
  connection: Record<string, unknown>;
  path: string;
  accept: string;
  action: string;
  userId: string;
  query?: Record<string, string | undefined>;
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown> | null;
  testScenario?: string | null;
}) {
  const accessToken = await decryptConnectionAccessToken(connection);
  const url = new URL(path, HMRC_BASE_URL);
  Object.entries(query).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: accept,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(testScenario ? { "Gov-Test-Scenario": testScenario } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseBody = await response.json().catch(() => ({}));
  const normalized = response.ok ? null : normalizeHmrcError(response.status, responseBody);

  await auditHmrcEvent({
    accountId,
    userId,
    action,
    endpoint: path,
    method,
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
    body: responseBody as Record<string, unknown>,
    normalized,
  };
}

export function assertWriteSelfAssessmentScope(connection: Record<string, unknown>) {
  const scopes = Array.isArray(connection.scopes) ? connection.scopes.map((scope) => String(scope)) : [];
  if (!scopes.includes("write:self-assessment")) {
    throw new HttpError("Reconnect HMRC sandbox with the test-data scope before creating sandbox MTD test data.", 400);
  }
}

export function buildTestItsaStatusBody() {
  return {
    itsaStatusDetails: [
      {
        submittedOn: new Date().toISOString(),
        status: "MTD Mandated",
        statusReason: "Sign up - return available",
        businessIncome2YearsPrior: 60000,
      },
    ],
  };
}

export function buildTestBusinessBody(typeOfBusiness: string, taxYear: string) {
  const type = normalizeTestBusinessType(typeOfBusiness);
  const period = taxYearAccountingPeriod(taxYear);
  const base = {
    typeOfBusiness: type,
    firstAccountingPeriodStartDate: period.startDate,
    firstAccountingPeriodEndDate: period.endDate,
    accountingType: "CASH",
    commencementDate: period.startDate,
  };
  if (type !== "self-employment") return base;
  return {
    ...base,
    tradingName: "Tenaqo Sandbox Test Business",
    businessAddressLineOne: "1 Test Street",
    businessAddressCountryCode: "GB",
    businessAddressPostcode: "AA1 1AA",
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
