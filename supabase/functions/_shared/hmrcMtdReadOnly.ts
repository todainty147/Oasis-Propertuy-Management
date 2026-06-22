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
  buildPropertyBusinessReadPath,
  isTaxYearFrom2025,
  maskNino,
  normalizeHmrcError,
  normalizeHmrcNetworkError,
  normalizeSandboxNino,
  normalizeTestBusinessType,
  safeObligationsBusinessType,
  safeTaxYear,
  summarizeBusinessDetails,
  summarizeObligations,
  summarizePropertyBusiness,
  taxYearAccountingPeriod,
} from "./hmrcMtdReadOnlyHelpers.ts";
import {
  maskNino,
  normalizeHmrcError,
  normalizeHmrcNetworkError,
  normalizeSandboxNino,
  normalizeTestBusinessType,
  safeObligationsBusinessType,
  taxYearAccountingPeriod,
} from "./hmrcMtdReadOnlyHelpers.ts";
import {
  buildHmrcFraudPreventionHeaders,
  safeHmrcFraudHeaderEvidence,
} from "./hmrcFraudPreventionHeaders.ts";

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
    accountingType: String(profile.accounting_type || "").trim() || null,
    accountingTypeBusinessId: String(profile.accounting_type_business_id || "").trim() || null,
    accountingTypeRefreshedAt: profile.accounting_type_refreshed_at || null,
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
    accountingType: profile.accountingType || null,
    accountingTypeKnown: ["CASH", "ACCRUALS"].includes(String(profile.accountingType || "")),
    accountingTypeRefreshedAt: profile.accountingTypeRefreshedAt,
    updatedAt: profile.updatedAt,
  };
}

export async function persistDiscoveredBusinessMetadata(
  connection: Record<string, unknown>,
  {
    incomeSourceId,
    accountingType,
    accountingTypeBusinessId,
  }: {
    incomeSourceId?: string;
    accountingType?: string | null;
    accountingTypeBusinessId?: string | null;
  },
  accountId: string,
  userId = "",
) {
  const id = String(incomeSourceId || "").trim();
  const normalizedAccountingType = ["CASH", "ACCRUALS"].includes(String(accountingType || ""))
    ? String(accountingType)
    : null;
  if ((!id && !normalizedAccountingType) || !connection?.id || !accountId) return;
  const metadata = connection.metadata && typeof connection.metadata === "object"
    ? connection.metadata as Record<string, unknown>
    : {};
  const profile = metadata.sandbox_profile && typeof metadata.sandbox_profile === "object"
    ? metadata.sandbox_profile as Record<string, unknown>
    : {};
  const accountingTypeChanged = Boolean(
    normalizedAccountingType
      && profile.accounting_type
      && profile.accounting_type !== normalizedAccountingType,
  );
  if (
    (!id || profile.income_source_id === id)
    && (!normalizedAccountingType || profile.accounting_type === normalizedAccountingType)
  ) return;
  const refreshedAt = new Date().toISOString();
  const { error } = await admin
    .from("hmrc_connections")
    .update({
      metadata: {
        ...metadata,
        sandbox_profile: {
          ...profile,
          ...(id ? { income_source_id: id } : {}),
          ...(normalizedAccountingType ? {
            accounting_type: normalizedAccountingType,
            accounting_type_business_id: String(accountingTypeBusinessId || id || "").trim(),
            accounting_type_refreshed_at: refreshedAt,
          } : {}),
          updated_at: refreshedAt,
        },
      },
    })
    .eq("id", connection.id)
    .eq("account_id", accountId);
  if (error) {
    console.error("[hmrc] income source profile update failed", {
      accountId,
      connectionId: String(connection.id || ""),
      message: error.message,
    });
    return;
  }
  if (normalizedAccountingType) {
    if (accountingTypeChanged) {
      const { error: reviewError } = await admin.rpc("mark_mtd_drafts_for_accounting_type_review", {
        p_account_id: accountId,
        p_accounting_type: normalizedAccountingType,
      });
      if (reviewError) {
        console.warn("[hmrc] accounting type draft review marking failed", {
          accountId,
          message: reviewError.message,
        });
      }
    }
    await auditHmrcEvent({
      accountId,
      userId,
      action: "hmrc.accounting_type_refreshed",
      status: "success",
      responseSummary: {
        accounting_type: normalizedAccountingType,
        changed: accountingTypeChanged,
        business_id_present: Boolean(accountingTypeBusinessId || id),
      },
    });
  }
}

export async function persistDiscoveredIncomeSourceId(connection: Record<string, unknown>, incomeSourceId: string, accountId: string) {
  return persistDiscoveredBusinessMetadata(connection, { incomeSourceId }, accountId);
}

export async function updateSandboxProfile(connection: Record<string, unknown>, patch: Record<string, unknown>, accountId: string) {
  if (!connection?.id || !accountId) return null;
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
    .eq("account_id", accountId)
    .select("id, account_id, environment, connection_status, scopes, metadata, last_connected_at, last_refreshed_at, hmrc_display_label")
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
  fraudContext = {},
}: {
  accountId: string;
  connection: Record<string, unknown>;
  path: string;
  accept: string;
  action: string;
  userId: string;
  query?: Record<string, string | undefined>;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown> | null;
  testScenario?: string | null;
  fraudContext?: {
    deviceId?: string;
    timezone?: string;
    publicIp?: string;
    publicPort?: string | number;
    publicIpTimestamp?: string;
  };
}) {
  const accessToken = await decryptConnectionAccessToken(connection);
  const fraud = buildHmrcFraudPreventionHeaders({
    accountId,
    userId,
    ...fraudContext,
    licenseId: Deno.env.get("HMRC_VENDOR_LICENSE_ID") || accountId,
    productName: Deno.env.get("HMRC_VENDOR_PRODUCT_NAME") || "Tenaqo",
    productVersion: Deno.env.get("HMRC_VENDOR_VERSION") || "web",
    publicIp: fraudContext.publicIp || Deno.env.get("HMRC_SERVER_PUBLIC_IP") || "",
    publicPort: fraudContext.publicPort || Deno.env.get("HMRC_SERVER_PUBLIC_PORT") || "443",
  });
  const url = new URL(path, HMRC_BASE_URL);
  Object.entries(query).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: accept,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(testScenario ? { "Gov-Test-Scenario": testScenario } : {}),
        ...fraud.headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    const normalized = normalizeHmrcNetworkError(error);
    await auditHmrcEvent({
      accountId,
      userId,
      action,
      endpoint: path,
      method,
      status: "failed",
      responseSummary: {
        ok: false,
        status: 0,
        safe_code: normalized.safeCode,
        fraud_prevention_headers: safeHmrcFraudHeaderEvidence(fraud.headers, fraud.missingContext),
      },
      errorMessage: normalized.message,
    });
    return { ok: false, status: 0, body: {}, correlationId: null, normalized };
  }
  const responseBody = await response.json().catch(() => ({}));
  const normalized = response.ok ? null : normalizeHmrcError(response.status, responseBody);
  const correlationId = response.headers.get("X-CorrelationId")
    || response.headers.get("x-correlation-id")
    || response.headers.get("CorrelationId")
    || null;

  await auditHmrcEvent({
    accountId,
    userId,
    action,
    endpoint: path,
    method,
    status: response.ok || response.status === 404 ? "success" : "failed",
    httpStatus: response.status,
    responseSummary: {
      ok: response.ok,
      status: response.status,
      hmrc_code: normalized?.hmrcCode || null,
      safe_code: normalized?.safeCode || null,
      hmrc_correlation_id: correlationId,
      fraud_prevention_headers: safeHmrcFraudHeaderEvidence(fraud.headers, fraud.missingContext),
    },
    errorMessage: response.ok || response.status === 404 ? null : normalized?.message || "HMRC read-only check failed",
  });

  return {
    ok: response.ok,
    status: response.status,
    body: responseBody as Record<string, unknown>,
    correlationId,
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
  const { error } = await admin.from("hmrc_readiness_checks").insert({
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
  if (error) {
    console.error("[hmrc] readiness check insert failed", {
      accountId,
      connectionId,
      checkType,
      message: error.message,
    });
  }
}
