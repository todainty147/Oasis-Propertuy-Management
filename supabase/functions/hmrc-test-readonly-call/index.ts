import {
  assertHmrcAccountFeatures,
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

const HELLO_ACCEPT_HEADER = "application/vnd.hmrc.1.0+json";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return methodNotAllowed(req);

  try {
    ensureSandboxOnly();
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || body.accountId || "").trim();
    await assertHmrcAccountFeatures(accountId, user.id, ["hmrc_mtd_connection", "hmrc_mtd_read_only"]);
    const connection = await getConnection(accountId);
    if (!connection || connection.connection_status !== "connected") {
      return json(req, {
        result: { status: "blocked", message: "Connect HMRC sandbox before running a read-only test." },
        connection: safeHmrcConnectionPayload(connection),
      }, 400);
    }

    const scopes = Array.isArray(connection.scopes) ? connection.scopes.map((scope) => String(scope)) : [];
    if (!scopes.includes("hello")) {
      return json(req, {
        result: {
          status: "needs_reconnect",
          message: "HMRC is connected. Reconnect the sandbox account to grant the harmless Hello API scope used by this test.",
          responseSummary: { required_scope: "hello", granted_scopes: scopes },
        },
        connection: safeHmrcConnectionPayload(connection),
      });
    }

    const accessToken = await decryptConnectionAccessToken(connection);
    const userHello = await callHmrcJson("/hello/user", accessToken);
    const sandboxUserHello = userHello.ok ? null : await callHmrcJson("/sandbox/hello/user", accessToken);
    const selectedUserHello = userHello.ok ? userHello : sandboxUserHello;
    const openHello = selectedUserHello?.ok ? null : await callHmrcJson("/hello/world");
    const ok = Boolean(selectedUserHello?.ok || openHello?.ok);
    const endpoint = selectedUserHello?.ok ? selectedUserHello.endpoint : openHello?.endpoint || userHello.endpoint;
    const userRestrictedOk = Boolean(selectedUserHello?.ok);
    const failure = userRestrictedOk ? null : selectedUserHello || userHello;

    await auditHmrcEvent({
      accountId,
      userId: user.id,
      action: "hmrc.test_readonly_call",
      endpoint,
      method: "GET",
      status: ok ? "success" : "failed",
      httpStatus: selectedUserHello?.status || openHello?.status || userHello.status,
      responseSummary: {
        ok,
        user_restricted_ok: userRestrictedOk,
        fallback_open_ok: Boolean(openHello?.ok),
        hmrc_code: failure?.body?.code || null,
      },
      errorMessage: ok ? null : "HMRC sandbox read-only test failed",
    });

    return json(req, {
      result: {
        status: userRestrictedOk ? "success" : openHello?.ok ? "sandbox_reachable" : "failed",
        httpStatus: selectedUserHello?.status || openHello?.status || userHello.status,
        message: userRestrictedOk
          ? "HMRC sandbox user-restricted read-only test completed."
          : openHello?.ok
            ? "HMRC sandbox is reachable, but the user-restricted Hello API returned 403. Check the sandbox app API subscription and test-user authorisation."
            : "HMRC sandbox responded but the read-only test did not complete.",
        responseSummary: userRestrictedOk
          ? { message: selectedUserHello?.body?.message || null, endpoint }
          : {
              user_restricted_status: selectedUserHello?.status || userHello.status,
              user_restricted_code: failure?.body?.code || null,
              user_restricted_message: failure?.body?.message || null,
              fallback_open_status: openHello?.status || null,
              fallback_open_message: openHello?.body?.message || null,
            },
      },
      connection: safeHmrcConnectionPayload(connection),
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not run HMRC sandbox read-only test", {
      functionName: "hmrc-test-readonly-call",
    });
  }
});

async function callHmrcJson(endpoint: string, accessToken = "") {
  const headers: Record<string, string> = {
    Accept: HELLO_ACCEPT_HEADER,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${HMRC_BASE_URL}${endpoint}`, {
    method: "GET",
    headers,
  });
  const body = await response.json().catch(() => ({}));
  return {
    endpoint,
    ok: response.ok,
    status: response.status,
    body,
  };
}
