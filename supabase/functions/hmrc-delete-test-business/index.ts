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
  getSandboxProfile,
  HMRC_ACCEPT_HEADERS,
  hmrcRequest,
  requireConnectedHmrcConnection,
  safeSandboxProfile,
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
    const businessId = String(body.businessId || body.business_id || profile.testBusinessId || profile.incomeSourceId || "").trim();
    if (!profile.nino || !businessId) {
      return json(req, {
        status: "blocked",
        message: "Save a sandbox NINO and create a test business before deleting it.",
        safeCode: "missing_test_identifier",
      }, 400);
    }

    const response = await hmrcRequest({
      accountId,
      connection,
      path: `/individuals/self-assessment-test-support/business/${encodeURIComponent(profile.nino)}/${encodeURIComponent(businessId)}`,
      accept: HMRC_ACCEPT_HEADERS.testSupport,
      action: "hmrc.delete_test_business",
      userId: user.id,
      method: "DELETE",
      testScenario: null,
    });

    if (!response.ok && response.status !== 404) {
      return json(req, {
        status: "failed",
        message: response.normalized?.message || "HMRC sandbox test business could not be deleted.",
        hmrcStatusCode: response.status,
        hmrcCode: response.normalized?.hmrcCode || null,
        safeCode: response.normalized?.safeCode || "hmrc_error",
      }, response.status >= 400 && response.status < 500 ? 400 : 502);
    }

    const updated = await updateSandboxProfile(connection, {
      income_source_id: "",
      test_business_id: "",
      test_business_type: "",
      test_data_updated_at: new Date().toISOString(),
    });

    return json(req, {
      status: response.status === 404 ? "no_data" : "success",
      message: response.status === 404
        ? "HMRC did not find that sandbox test business. Tenaqo cleared the stored test business identifier."
        : "HMRC sandbox test business deleted.",
      sandboxProfile: safeSandboxProfile(updated || connection),
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not delete HMRC sandbox test business", {
      functionName: "hmrc-delete-test-business",
    });
  }
});
