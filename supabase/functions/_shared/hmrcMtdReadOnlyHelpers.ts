export const HMRC_ACCEPT_HEADERS = Object.freeze({
  businessDetails: "application/vnd.hmrc.2.0+json",
  obligations: "application/vnd.hmrc.3.0+json",
  propertyBusiness: "application/vnd.hmrc.6.0+json",
  testSupport: "application/vnd.hmrc.1.0+json",
});

export function normalizeSandboxNino(value: unknown) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

export function maskNino(value: unknown) {
  const nino = normalizeSandboxNino(value);
  if (nino.length < 4) return "";
  return `${nino.slice(0, 2)}****${nino.slice(-1)}`;
}

export function normalizeHmrcError(status: number, body: Record<string, unknown> = {}) {
  const code = String(body.code || body.errorCode || "").trim();
  const message = String(body.message || body.error_description || "").trim();
  if (status === 400) {
    const safeCode = code
      ? code.toLowerCase()
      : "bad_request";
    return {
      safeCode,
      hmrcCode: code || "BAD_REQUEST",
      message: message
        ? `HMRC rejected the sandbox request: ${message}`
        : "HMRC rejected the sandbox request. Check the identifier, business ID, business type and date range.",
    };
  }
  if (status === 401) return { safeCode: "token_expired", hmrcCode: code || "UNAUTHORIZED", message: "The HMRC sandbox token is expired or invalid. Refresh or reconnect HMRC." };
  if (status === 403) return { safeCode: "insufficient_scope", hmrcCode: code || "FORBIDDEN", message: "The OAuth token does not include the required scope or API authorisation for this read-only check." };
  if (status === 404) return { safeCode: "connected_but_no_data", hmrcCode: code || "MATCHING_RESOURCE_NOT_FOUND", message: "HMRC responded successfully but no matching sandbox data was found." };
  if (status >= 500) return { safeCode: "hmrc_unavailable", hmrcCode: code || "HMRC_UNAVAILABLE", message: "HMRC sandbox is unavailable or returned an upstream error." };
  return { safeCode: "hmrc_error", hmrcCode: code || "HMRC_ERROR", message: message || "HMRC returned an error for this read-only check." };
}

export function summarizeBusinessDetails(body: Record<string, unknown>) {
  const businesses = Array.isArray(body.listOfBusinesses)
    ? body.listOfBusinesses
    : Array.isArray(body.businesses)
      ? body.businesses
      : [];
  const propertyBusinesses = businesses.filter((business) => {
    const type = businessType(business);
    return type.includes("PROPERTY");
  });
  const ukProperty = propertyBusinesses.filter((business) => businessType(business).startsWith("UK_PROPERTY"));
  const foreignProperty = propertyBusinesses.filter((business) => businessType(business).startsWith("FOREIGN_PROPERTY"));
  const incomeSourceIds = businesses
    .map((business) => {
      if (!business || typeof business !== "object") return "";
      const row = business as Record<string, unknown>;
      return String(row.businessId || row.incomeSourceId || "").trim();
    })
    .filter(Boolean);
  return {
    businessCount: businesses.length,
    hasUkProperty: ukProperty.length > 0,
    hasForeignProperty: foreignProperty.length > 0,
    discoveredIncomeSourceIdsCount: incomeSourceIds.length,
    firstIncomeSourceId: incomeSourceIds[0] || "",
  };
}

function businessType(business: unknown) {
  if (!business || typeof business !== "object") return "";
  return String((business as Record<string, unknown>).typeOfBusiness || "")
    .trim()
    .replace(/-/g, "_")
    .toUpperCase();
}

export function summarizeObligations(body: Record<string, unknown>) {
  const obligations = Array.isArray(body.obligations) ? body.obligations : [];
  const open = obligations.filter((item) => JSON.stringify(item).toLowerCase().includes('"status":"o"') || JSON.stringify(item).toLowerCase().includes('"status":"open"'));
  const fulfilled = obligations.filter((item) => JSON.stringify(item).toLowerCase().includes('"status":"f"') || JSON.stringify(item).toLowerCase().includes('"status":"fulfilled"'));
  const dueDates = obligations
    .map((item) => item && typeof item === "object" ? String((item as Record<string, unknown>).dueDate || "") : "")
    .filter(Boolean)
    .sort();
  return {
    obligationCount: obligations.length,
    openCount: open.length,
    fulfilledCount: fulfilled.length,
    nextDueDate: dueDates[0] || null,
  };
}

export function safeTaxYear(value: unknown, fallback = "2026-27") {
  const taxYear = String(value || "").trim();
  return /^20\d{2}-\d{2}$/.test(taxYear) ? taxYear : fallback;
}

export function taxYearAccountingPeriod(taxYear: string) {
  const normalized = safeTaxYear(taxYear);
  const startYear = Number(normalized.slice(0, 4));
  return {
    taxYear: normalized,
    startDate: `${startYear}-04-06`,
    endDate: `${startYear + 1}-04-05`,
  };
}

export function isTaxYearFrom2025(taxYear: string) {
  const normalized = safeTaxYear(taxYear);
  return Number(normalized.slice(0, 4)) >= 2025;
}

export function buildPropertyBusinessReadPath(nino: string, businessId: string, taxYear: string, typeOfBusiness = "uk-property") {
  const scope = typeOfBusiness === "foreign-property" ? "foreign" : "uk";
  if (isTaxYearFrom2025(taxYear)) {
    return `/individuals/business/property/${scope}/${encodeURIComponent(nino)}/${encodeURIComponent(businessId)}/cumulative/${encodeURIComponent(taxYear)}`;
  }
  return `/individuals/business/property/${encodeURIComponent(nino)}/${encodeURIComponent(businessId)}/period/${encodeURIComponent(taxYear)}`;
}

export function summarizePropertyBusiness(body: Record<string, unknown>, taxYear: string, typeOfBusiness = "uk-property") {
  const submissions = Array.isArray(body.submissions) ? body.submissions : [];
  const hasCumulativeSummary = Boolean(body.ukProperty || body.foreignProperty || body.foreignPropertyFhlEea);
  return {
    periodSummaryCount: submissions.length || (hasCumulativeSummary ? 1 : 0),
    annualSubmissionFound: Boolean(body.annualSubmission),
    ukPropertyFound: typeOfBusiness !== "foreign-property" && (hasCumulativeSummary || submissions.length > 0),
    foreignPropertyFound: typeOfBusiness === "foreign-property" && (hasCumulativeSummary || submissions.length > 0),
    endpointMode: isTaxYearFrom2025(taxYear) ? "cumulative" : "period_list",
  };
}

export function safeObligationsBusinessType(value: unknown) {
  const type = normalizeTestBusinessType(value);
  if (type === "foreign-property") return "foreign-property";
  if (type === "self-employment") return "self-employment";
  return "uk-property";
}

export function normalizeTestBusinessType(value: unknown) {
  const type = String(value || "").trim();
  return ["uk-property", "foreign-property", "property-unspecified", "self-employment"].includes(type)
    ? type
    : "uk-property";
}
