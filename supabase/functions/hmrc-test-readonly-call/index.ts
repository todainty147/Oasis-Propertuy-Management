import {
  assertHmrcAccountAccess,
  auditHmrcEvent,
  decryptConnectionAccessToken,
  ensureSandboxOnly,
  getConnection,
  handleOptions,
  HMRC_BASE_URL,
  json,
  methodNotAllowed,
  requireUser,
  safeHmrcError,
} from "../_shared/hmrcEdge.ts";
import { safeHmrcConnectionPayload } from "../_shared/hmrcMtd.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return methodNotAllowed(req);

  try {
    ensureSandboxOnly();
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || body.accountId || "").trim();
    await assertHmrcAccountAccess(accountId, user.id, "hmrc_mtd_connection");
    await assertHmrcAccountAccess(accountId, user.id, "hmrc_mtd_read_only");
    const connection = await getConnection(accountId);
    if (!connection || connection.connection_status !== "connected") {
      return json(req, {
        result: { status: "blocked", message: "Connect HMRC sandbox before running a read-only test." },
        connection: safeHmrcConnectionPayload(connection),
      }, 400);
    }

    const accessToken = await decryptConnectionAccessToken(connection);
    const endpoint = "/hello/user";
    const response = await fetch(`${HMRC_BASE_URL}${endpoint}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.hmrc.1.0+json",
      },
    });
    const responseJson = await response.json().catch(() => ({}));
    const ok = response.ok;

    await auditHmrcEvent({
      accountId,
      userId: user.id,
      action: "hmrc.test_readonly_call",
      endpoint,
      method: "GET",
      status: ok ? "success" : "failed",
      httpStatus: response.status,
      responseSummary: { ok, status: response.status },
      errorMessage: ok ? null : "HMRC sandbox read-only test failed",
    });

    return json(req, {
      result: {
        status: ok ? "success" : "failed",
        httpStatus: response.status,
        message: ok ? "HMRC sandbox read-only test completed." : "HMRC sandbox responded but the read-only test did not complete.",
        responseSummary: ok ? { application: responseJson?.application || null } : { ok: false },
      },
      connection: safeHmrcConnectionPayload(connection),
    }, ok ? 200 : 400);
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not run HMRC sandbox read-only test", {
      functionName: "hmrc-test-readonly-call",
    });
  }
});
