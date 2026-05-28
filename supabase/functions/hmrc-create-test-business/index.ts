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
  assertWriteSelfAssessmentScope,
  buildTestBusinessBody,
  getSandboxProfile,
  HMRC_ACCEPT_HEADERS,
  hmrcRequest,
  normalizeTestBusinessType,
  requireConnectedHmrcConnection,
  safeSandboxProfile,
  safeTaxYear,
  updateSandboxProfile,
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
    await assertHmrcAccountAccess(accountId, user.id, "hmrc_mtd_sandbox_test_data");

    const connection = await requireConnectedHmrcConnection(accountId);
    assertWriteSelfAssessmentScope(connection);

    const profile = getSandboxProfile(connection);
    if (!profile.nino) {
      return json(req, {
        status: "blocked",
        message: "Save a sandbox NINO before creating HMRC sandbox test data.",
        safeCode: "missing_test_identifier",
      });
    }

    const taxYear = safeTaxYear(body.taxYear || body.tax_year || profile.testTaxYear || "2026-27");
    const typeOfBusiness = normalizeTestBusinessType(body.typeOfBusiness || body.type_of_business || "uk-property");
    const response = await hmrcRequest({
      accountId,
      connection,
      path: `/individuals/self-assessment-test-support/business/${encodeURIComponent(profile.nino)}`,
      accept: HMRC_ACCEPT_HEADERS.testSupport,
      action: "hmrc.create_test_business",
      userId: user.id,
      method: "POST",
      body: buildTestBusinessBody(typeOfBusiness, taxYear),
      testScenario: null,
    });

    if (!response.ok) {
      return json(req, {
        status: "failed",
        message: response.normalized?.message || "HMRC sandbox test business could not be created.",
        hmrcStatusCode: response.status,
        hmrcCode: response.normalized?.hmrcCode || null,
        safeCode: response.normalized?.safeCode || "hmrc_error",
      });
    }

    const businessId = String(response.body.businessId || "").trim();
    const updated = await updateSandboxProfile(connection, {
      income_source_id: businessId,
      test_business_id: businessId,
      test_business_type: typeOfBusiness,
      test_tax_year: taxYear,
      test_data_updated_at: new Date().toISOString(),
    });

    return json(req, {
      status: "success",
      message: "HMRC sandbox test business created. Run Business Details next to verify it appears in read-only MTD data.",
      sandboxProfile: safeSandboxProfile(updated || connection),
      summary: {
        businessIdMasked: businessId ? "stored" : "",
        typeOfBusiness,
        taxYear,
      },
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not create HMRC sandbox test business", {
      functionName: "hmrc-create-test-business",
    });
  }
});
