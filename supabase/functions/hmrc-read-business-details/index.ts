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
  HMRC_ACCEPT_HEADERS,
  hmrcRequest,
  persistDiscoveredIncomeSourceId,
  requireConnectedHmrcConnection,
  summarizeBusinessDetails,
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
      await writeHmrcReadinessCheck({
        accountId,
        connectionId: String(connection.id || ""),
        checkType: "business_details",
        status: "blocked",
        summary: { safe_code: "missing_test_identifier" },
        checkedBy: user.id,
      });
      return json(req, businessDetailsResult("blocked", "Add the sandbox test user NINO supplied by HMRC to run Business Details.", { safeCode: "missing_test_identifier" }));
    }

    const response = await hmrcRequest({
      accountId,
      connection,
      path: `/individuals/business/details/${encodeURIComponent(profile.nino)}/list`,
      accept: HMRC_ACCEPT_HEADERS.businessDetails,
      action: "hmrc.read_business_details",
      userId: user.id,
    });

    const summary = response.ok ? summarizeBusinessDetails(response.body) : { safe_code: response.normalized?.safeCode || "hmrc_error" };
    if (response.ok && summary.firstIncomeSourceId) {
      await persistDiscoveredIncomeSourceId(connection, String(summary.firstIncomeSourceId), accountId);
    }
    const status = response.ok ? "success" : response.status === 404 ? "no_data" : "failed";
    await writeHmrcReadinessCheck({
      accountId,
      connectionId: String(connection.id || ""),
      checkType: "business_details",
      status,
      hmrcStatusCode: response.status,
      hmrcCode: response.normalized?.hmrcCode || null,
      summary,
      checkedBy: user.id,
    });

    return json(req, businessDetailsResult(
      status,
      response.ok ? "Business Details read-only sandbox check completed." : response.normalized?.message || "Business Details read-only check failed.",
      summary,
      response.status,
      response.normalized?.hmrcCode,
    ));
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not run Business Details read-only check", {
      functionName: "hmrc-read-business-details",
    });
  }
});

function businessDetailsResult(status: string, message: string, summary: Record<string, unknown>, hmrcStatusCode: number | null = null, hmrcCode: string | null = null) {
  return {
    status,
    checkType: "business_details",
    message,
    hmrcStatusCode,
    hmrcCode,
    summary: {
      businessCount: Number(summary.businessCount || 0),
      hasUkProperty: Boolean(summary.hasUkProperty),
      hasForeignProperty: Boolean(summary.hasForeignProperty),
      discoveredIncomeSourceIdsCount: Number(summary.discoveredIncomeSourceIdsCount || 0),
      safeCode: summary.safe_code || null,
    },
  };
}
