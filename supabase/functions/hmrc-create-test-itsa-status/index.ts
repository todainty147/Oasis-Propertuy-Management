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
  buildTestItsaStatusBody,
  getSandboxProfile,
  HMRC_ACCEPT_HEADERS,
  hmrcRequest,
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
        message: "Save a sandbox NINO before creating HMRC sandbox ITSA status.",
        safeCode: "missing_test_identifier",
      }, 400);
    }

    const taxYear = safeTaxYear(body.taxYear || body.tax_year || profile.testTaxYear || "2026-27");
    const response = await hmrcRequest({
      accountId,
      connection,
      path: `/individuals/self-assessment-test-support/itsa-status/${encodeURIComponent(profile.nino)}/${encodeURIComponent(taxYear)}`,
      accept: HMRC_ACCEPT_HEADERS.testSupport,
      action: "hmrc.create_test_itsa_status",
      userId: user.id,
      method: "POST",
      body: buildTestItsaStatusBody(),
      testScenario: null,
    });

    if (!response.ok) {
      return json(req, {
        status: "failed",
        message: response.normalized?.message || "HMRC sandbox ITSA status could not be created.",
        hmrcStatusCode: response.status,
        hmrcCode: response.normalized?.hmrcCode || null,
        safeCode: response.normalized?.safeCode || "hmrc_error",
      }, response.status >= 400 && response.status < 500 ? 400 : 502);
    }

    const updated = await updateSandboxProfile(connection, {
      test_tax_year: taxYear,
      test_itsa_status: "MTD Mandated",
      test_data_updated_at: new Date().toISOString(),
    });

    return json(req, {
      status: "success",
      message: "HMRC sandbox ITSA status created for this test profile.",
      sandboxProfile: safeSandboxProfile(updated || connection),
      summary: {
        taxYear,
        status: "MTD Mandated",
      },
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not create HMRC sandbox ITSA status", {
      functionName: "hmrc-create-test-itsa-status",
    });
  }
});
