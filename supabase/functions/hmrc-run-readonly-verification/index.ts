import {
  assertHmrcAccountFeatures,
  ensureSandboxOnly,
  handleOptions,
  json,
  methodNotAllowed,
  requireUser,
  safeHmrcError,
} from "../_shared/hmrcEdge.ts";
import {
  getSandboxProfile,
  buildPropertyBusinessReadPath,
  HMRC_ACCEPT_HEADERS,
  hmrcRequest,
  persistDiscoveredIncomeSourceId,
  requireConnectedHmrcConnection,
  safeObligationsBusinessType,
  summarizeBusinessDetails,
  summarizeObligations,
  summarizePropertyBusiness,
  taxYearAccountingPeriod,
  writeHmrcReadinessCheck,
} from "../_shared/hmrcMtdReadOnly.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return methodNotAllowed(req);

  try {
    ensureSandboxOnly();
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || body.accountId || "").trim();
    await assertHmrcAccountFeatures(accountId, user.id, ["hmrc_mtd_connection", "hmrc_mtd_sandbox", "hmrc_mtd_read_only"]);

    const connection = await requireConnectedHmrcConnection(accountId);
    const profile = getSandboxProfile(connection);
    if (!profile.nino) {
      return json(req, {
        overallStatus: "needs_identifier",
        message: "Add the sandbox test user identifier supplied by HMRC to run read-only MTD verification.",
        checks: [],
      });
    }

    const checks = [];
    const business = await hmrcRequest({
      accountId,
      connection,
      path: `/individuals/business/details/${encodeURIComponent(profile.nino)}/list`,
      accept: HMRC_ACCEPT_HEADERS.businessDetails,
      action: "hmrc.read_business_details",
      userId: user.id,
    });
    const businessSummary: Record<string, unknown> = business.ok
      ? summarizeBusinessDetails(business.body)
      : { safe_code: business.normalized?.safeCode || "hmrc_error" };
    if (business.ok && businessSummary.firstIncomeSourceId) {
      await persistDiscoveredIncomeSourceId(connection, String(businessSummary.firstIncomeSourceId), accountId);
    }
    const businessStatus = business.ok ? "success" : business.status === 404 ? "no_data" : "failed";
    await writeHmrcReadinessCheck({
      accountId,
      connectionId: String(connection.id || ""),
      checkType: "business_details",
      status: businessStatus,
      hmrcStatusCode: business.status,
      hmrcCode: business.normalized?.hmrcCode || null,
      summary: businessSummary,
      checkedBy: user.id,
    });
    checks.push({
      checkType: "business_details",
      status: businessStatus,
      message: business.ok ? "Business Details checked." : business.normalized?.message,
      summary: publicBusinessSummary(businessSummary),
    });

    const obligationsBusinessId = String(businessSummary.firstIncomeSourceId || profile.incomeSourceId || profile.testBusinessId || "").trim();
    const obligationsBusinessType = safeObligationsBusinessType(profile.testBusinessType || "");
    const obligationsPeriod = taxYearAccountingPeriod(profile.testTaxYear || "2026-27");
    const obligations = await hmrcRequest({
      accountId,
      connection,
      path: `/obligations/details/${encodeURIComponent(profile.nino)}/income-and-expenditure`,
      accept: HMRC_ACCEPT_HEADERS.obligations,
      action: "hmrc.read_obligations",
      userId: user.id,
      query: {
        fromDate: obligationsPeriod.startDate,
        toDate: obligationsPeriod.endDate,
        typeOfBusiness: obligationsBusinessId ? obligationsBusinessType : undefined,
        businessId: obligationsBusinessId || undefined,
      },
      testScenario: null,
    });
    const obligationsSummary: Record<string, unknown> = obligations.ok
      ? summarizeObligations(obligations.body)
      : { safe_code: obligations.normalized?.safeCode || "hmrc_error" };
    const obligationsStatus = obligations.ok && Number(obligationsSummary.obligationCount || 0) === 0 ? "no_data" : obligations.ok ? "success" : obligations.status === 404 ? "no_data" : "failed";
    await writeHmrcReadinessCheck({
      accountId,
      connectionId: String(connection.id || ""),
      checkType: "obligations_income_and_expenditure",
      status: obligationsStatus,
      hmrcStatusCode: obligations.status,
      hmrcCode: obligations.normalized?.hmrcCode || null,
      summary: obligationsSummary,
      checkedBy: user.id,
    });
    checks.push({
      checkType: "obligations_income_and_expenditure",
      status: obligationsStatus,
      message: obligations.ok
        ? Number(obligationsSummary.obligationCount || 0) > 0
          ? "Obligations checked."
          : "HMRC responded successfully, but no obligations were found for this sandbox test profile."
        : obligations.normalized?.message,
      summary: publicObligationsSummary(obligationsSummary),
    });

    const discoveredIncomeSourceId = String(businessSummary.firstIncomeSourceId || profile.incomeSourceId || "").trim();
    if (!discoveredIncomeSourceId) {
      await writeHmrcReadinessCheck({
        accountId,
        connectionId: String(connection.id || ""),
        checkType: "property_business_read",
        status: "blocked",
        hmrcStatusCode: null,
        hmrcCode: "MISSING_TEST_IDENTIFIER",
        summary: { safeCode: "missing_test_identifier" },
        checkedBy: user.id,
      });
      checks.push({
        checkType: "property_business_read",
        status: "blocked",
        message: "Property Business skipped until Business Details returns or stores an income source ID.",
        summary: { safeCode: "missing_test_identifier" },
      });
    } else {
      const propertyTaxYear = profile.testTaxYear || "2026-27";
      const propertyBusinessType = profile.testBusinessType || "uk-property";
      const property = await hmrcRequest({
        accountId,
        connection,
        path: buildPropertyBusinessReadPath(profile.nino, discoveredIncomeSourceId, propertyTaxYear, propertyBusinessType),
        accept: HMRC_ACCEPT_HEADERS.propertyBusiness,
        action: "hmrc.read_property_business",
        userId: user.id,
      });
      const propertySummary = property.ok
        ? summarizePropertyBusiness(property.body, propertyTaxYear, propertyBusinessType)
        : { safe_code: property.normalized?.safeCode || "hmrc_error" };
      const propertyStatus = property.ok ? "success" : property.status === 404 ? "no_data" : "failed";
      await writeHmrcReadinessCheck({
        accountId,
        connectionId: String(connection.id || ""),
        checkType: "property_business_read",
        status: propertyStatus,
        hmrcStatusCode: property.status,
        hmrcCode: property.normalized?.hmrcCode || null,
        summary: propertySummary,
        checkedBy: user.id,
      });
      checks.push({
        checkType: "property_business_read",
        status: propertyStatus,
        message: property.ok
          ? "Property Business read-only sandbox check completed."
          : propertyStatus === "no_data"
            ? "HMRC found the sandbox property business, but no read-only property summary exists for this tax year yet."
          : property.normalized?.message,
        summary: publicPropertySummary(propertySummary),
      });
    }

    const successCount = checks.filter((check) => check.status === "success").length;
    const failedCount = checks.filter((check) => check.status === "failed").length;
    const blockedCount = checks.filter((check) => check.status === "blocked").length;
    return json(req, {
      overallStatus: failedCount > 0 ? "failed" : blockedCount > 0 || successCount < 2 ? "partial" : "verified",
      message: failedCount > 0
        ? "One or more read-only MTD sandbox checks failed."
        : "Read-only MTD sandbox verification completed. Submissions remain disabled.",
      checks,
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not run read-only MTD sandbox verification", {
      functionName: "hmrc-run-readonly-verification",
    });
  }
});

function publicBusinessSummary(summary: Record<string, unknown>) {
  return {
    businessCount: Number(summary.businessCount || 0),
    hasUkProperty: Boolean(summary.hasUkProperty),
    hasForeignProperty: Boolean(summary.hasForeignProperty),
    discoveredIncomeSourceIdsCount: Number(summary.discoveredIncomeSourceIdsCount || 0),
    safeCode: summary.safe_code || null,
  };
}

function publicObligationsSummary(summary: Record<string, unknown>) {
  return {
    obligationCount: Number(summary.obligationCount || 0),
    openCount: Number(summary.openCount || 0),
    fulfilledCount: Number(summary.fulfilledCount || 0),
    nextDueDate: summary.nextDueDate || null,
    safeCode: summary.safe_code || null,
  };
}

function publicPropertySummary(summary: Record<string, unknown>) {
  return {
    periodSummaryCount: Number(summary.periodSummaryCount || 0),
    annualSubmissionFound: Boolean(summary.annualSubmissionFound),
    ukPropertyFound: Boolean(summary.ukPropertyFound),
    foreignPropertyFound: Boolean(summary.foreignPropertyFound),
    endpointMode: summary.endpointMode || null,
    safeCode: summary.safe_code || null,
  };
}
