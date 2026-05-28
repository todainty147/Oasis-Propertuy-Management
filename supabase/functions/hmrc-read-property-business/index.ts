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
  buildPropertyBusinessReadPath,
  HMRC_ACCEPT_HEADERS,
  hmrcRequest,
  requireConnectedHmrcConnection,
  safeTaxYear,
  summarizePropertyBusiness,
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
    const incomeSourceId = String(body.income_source_id || body.incomeSourceId || profile.incomeSourceId || "").trim();
    if (!profile.nino || !incomeSourceId) {
      const summary = { safe_code: "missing_test_identifier", has_nino: Boolean(profile.nino), has_income_source_id: Boolean(incomeSourceId) };
      await writeHmrcReadinessCheck({
        accountId,
        connectionId: String(connection.id || ""),
        checkType: "property_business_read",
        status: "blocked",
        summary,
        checkedBy: user.id,
      });
      return json(req, propertyResult("blocked", "Property Business read-only check needs a sandbox NINO and income source ID. Run Business Details first.", summary));
    }

    const taxYear = safeTaxYear(body.taxYear || body.tax_year || profile.testTaxYear || "2026-27");
    const typeOfBusiness = String(body.typeOfBusiness || body.type_of_business || profile.testBusinessType || "uk-property").trim();
    const response = await hmrcRequest({
      accountId,
      connection,
      path: buildPropertyBusinessReadPath(profile.nino, incomeSourceId, taxYear, typeOfBusiness),
      accept: HMRC_ACCEPT_HEADERS.propertyBusiness,
      action: "hmrc.read_property_business",
      userId: user.id,
    });

    const summary = response.ok
      ? summarizePropertyBusiness(response.body, taxYear, typeOfBusiness)
      : { safe_code: response.normalized?.safeCode || "hmrc_error" };
    const status = response.ok ? "success" : response.status === 404 ? "no_data" : "failed";
    await writeHmrcReadinessCheck({
      accountId,
      connectionId: String(connection.id || ""),
      checkType: "property_business_read",
      status,
      hmrcStatusCode: response.status,
      hmrcCode: response.normalized?.hmrcCode || null,
      summary,
      checkedBy: user.id,
    });

    return json(req, propertyResult(
      status,
      response.ok
        ? "Property Business read-only sandbox check completed."
        : response.normalized?.message || "Property Business read-only check failed.",
      summary,
      response.status,
      response.normalized?.hmrcCode,
    ));
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not run Property Business read-only check", {
      functionName: "hmrc-read-property-business",
    });
  }
});

function propertyResult(status: string, message: string, summary: Record<string, unknown>, hmrcStatusCode: number | null = null, hmrcCode: string | null = null) {
  return {
    status,
    checkType: "property_business_read",
    message,
    hmrcStatusCode,
    hmrcCode,
    summary: {
      periodSummaryCount: Number(summary.periodSummaryCount || 0),
      annualSubmissionFound: Boolean(summary.annualSubmissionFound),
      ukPropertyFound: Boolean(summary.ukPropertyFound),
      foreignPropertyFound: Boolean(summary.foreignPropertyFound),
      safeCode: summary.safe_code || null,
    },
  };
}
