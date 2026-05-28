import {
  assertHmrcAccountAccess,
  ensureSandboxOnly,
  handleOptions,
  json,
  methodNotAllowed,
  requireUser,
  safeHmrcError,
} from "../_shared/hmrcEdge.ts";
import {
  getSandboxProfile,
  HMRC_ACCEPT_HEADERS,
  hmrcRequest,
  requireConnectedHmrcConnection,
  safeObligationsBusinessType,
  summarizeObligations,
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
    await assertHmrcAccountAccess(accountId, user.id, "hmrc_mtd_connection");
    await assertHmrcAccountAccess(accountId, user.id, "hmrc_mtd_sandbox");
    await assertHmrcAccountAccess(accountId, user.id, "hmrc_mtd_read_only");

    const connection = await requireConnectedHmrcConnection(accountId);
    const profile = getSandboxProfile(connection);
    if (!profile.nino) {
      await writeHmrcReadinessCheck({
        accountId,
        connectionId: String(connection.id || ""),
        checkType: "obligations_income_and_expenditure",
        status: "blocked",
        summary: { safe_code: "missing_test_identifier" },
        checkedBy: user.id,
      });
      return json(req, obligationsResult("blocked", "Add the sandbox test user NINO supplied by HMRC to run Obligations.", { safe_code: "missing_test_identifier" }));
    }

    const businessId = String(body.businessId || body.business_id || profile.incomeSourceId || profile.testBusinessId || "").trim();
    const period = taxYearAccountingPeriod(body.taxYear || body.tax_year || profile.testTaxYear || "2026-27");
    const fromDate = String(body.fromDate || "").trim() || period.startDate;
    const toDate = String(body.toDate || "").trim() || period.endDate;
    const response = await hmrcRequest({
      accountId,
      connection,
      path: `/obligations/details/${encodeURIComponent(profile.nino)}/income-and-expenditure`,
      accept: HMRC_ACCEPT_HEADERS.obligations,
      action: "hmrc.read_obligations",
      userId: user.id,
      query: {
        fromDate,
        toDate,
        typeOfBusiness: businessId ? safeObligationsBusinessType(body.typeOfBusiness || body.type_of_business || profile.testBusinessType) : undefined,
        businessId: businessId || undefined,
      },
      testScenario: null,
    });

    const summary = response.ok ? summarizeObligations(response.body) : { safe_code: response.normalized?.safeCode || "hmrc_error" };
    const status = response.ok && Number(summary.obligationCount || 0) === 0 ? "no_data" : response.ok ? "success" : response.status === 404 ? "no_data" : "failed";
    await writeHmrcReadinessCheck({
      accountId,
      connectionId: String(connection.id || ""),
      checkType: "obligations_income_and_expenditure",
      status,
      hmrcStatusCode: response.status,
      hmrcCode: response.normalized?.hmrcCode || null,
      summary,
      checkedBy: user.id,
    });

    return json(req, obligationsResult(
      status,
      response.ok
        ? Number(summary.obligationCount || 0) > 0
          ? "Obligations read-only sandbox check completed."
          : "HMRC responded successfully, but no obligations were found for this sandbox test profile."
        : response.normalized?.message || "Obligations read-only check failed.",
      summary,
      response.status,
      response.normalized?.hmrcCode,
    ));
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not run Obligations read-only check", {
      functionName: "hmrc-read-obligations",
    });
  }
});

function obligationsResult(status: string, message: string, summary: Record<string, unknown>, hmrcStatusCode: number | null = null, hmrcCode: string | null = null) {
  return {
    status,
    checkType: "obligations_income_and_expenditure",
    message,
    hmrcStatusCode,
    hmrcCode,
    summary: {
      obligationCount: Number(summary.obligationCount || 0),
      openCount: Number(summary.openCount || 0),
      fulfilledCount: Number(summary.fulfilledCount || 0),
      nextDueDate: summary.nextDueDate || null,
      safeCode: summary.safe_code || null,
    },
  };
}
