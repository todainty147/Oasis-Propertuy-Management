export const HMRC_ACCEPT_HEADERS = Object.freeze({
  businessDetails: "application/vnd.hmrc.2.0+json",
  obligations: "application/vnd.hmrc.3.0+json",
  propertyBusiness: "application/vnd.hmrc.6.0+json",
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
  if (status === 400) return { safeCode: "missing_test_identifier", hmrcCode: code || "BAD_REQUEST", message: "Add or check the sandbox test identifier for this HMRC check." };
  if (status === 401) return { safeCode: "token_expired", hmrcCode: code || "UNAUTHORIZED", message: "The HMRC sandbox token is expired or invalid. Refresh or reconnect HMRC." };
  if (status === 403) return { safeCode: "insufficient_scope", hmrcCode: code || "FORBIDDEN", message: "The OAuth token does not include the required scope or API authorisation for this read-only check." };
  if (status === 404) return { safeCode: "connected_but_no_data", hmrcCode: code || "MATCHING_RESOURCE_NOT_FOUND", message: "HMRC responded successfully but no matching sandbox data was found." };
  if (status >= 500) return { safeCode: "hmrc_unavailable", hmrcCode: code || "HMRC_UNAVAILABLE", message: "HMRC sandbox is unavailable or returned an upstream error." };
  return { safeCode: "hmrc_error", hmrcCode: code || "HMRC_ERROR", message: message || "HMRC returned an error for this read-only check." };
}

export function summarizeBusinessDetails(body: Record<string, unknown>) {
  const businesses = Array.isArray(body.businesses) ? body.businesses : [];
  const propertyBusinesses = businesses.filter((business) => {
    const text = JSON.stringify(business).toLowerCase();
    return text.includes("property");
  });
  const ukProperty = propertyBusinesses.filter((business) => JSON.stringify(business).toLowerCase().includes("uk"));
  const foreignProperty = propertyBusinesses.filter((business) => JSON.stringify(business).toLowerCase().includes("foreign"));
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
