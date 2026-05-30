import {
  admin,
  assertHmrcAccountAccess,
  auditHmrcEvent,
  ensureHmrcBaseUrl,
  ensureSandboxOnly,
  getConnection,
  getSafeConnectionStatus,
  handleOptions,
  HMRC_BASE_URL,
  HMRC_CLIENT_ID,
  HMRC_CLIENT_SECRET,
  HMRC_ENVIRONMENT,
  HMRC_TOKEN_ENCRYPTION_KEY,
  json,
  methodNotAllowed,
  requireUser,
  safeHmrcError,
} from "../_shared/hmrcEdge.ts";
import { decryptToken } from "../_shared/hmrcMtd.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return methodNotAllowed(req);

  try {
    ensureSandboxOnly();
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || body.accountId || "").trim();
    await assertHmrcAccountAccess(accountId, user.id, "hmrc_mtd_connection");

    const connection = await getConnection(accountId);
    const revokeSummary = await revokeRefreshTokenBestEffort(connection);
    const now = new Date().toISOString();
    const { error } = await admin
      .from("hmrc_connections")
      .update({
        connection_status: "disconnected",
        access_token_ciphertext: null,
        refresh_token_ciphertext: null,
        access_token_expires_at: null,
        refresh_token_expires_at: null,
        disconnected_at: now,
        updated_at: now,
      })
      .eq("account_id", accountId)
      .eq("environment", HMRC_ENVIRONMENT);
    if (error) throw error;

    await auditHmrcEvent({
      accountId,
      userId: user.id,
      action: "hmrc.disconnect",
      status: "success",
      requestSummary: revokeSummary,
    });

    return json(req, { connection: await getSafeConnectionStatus(accountId) });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not disconnect HMRC sandbox connection", {
      functionName: "hmrc-disconnect",
    });
  }
});

async function revokeRefreshTokenBestEffort(connection: Record<string, unknown> | null | undefined) {
  const timestamp = new Date().toISOString();
  if (!connection?.refresh_token_ciphertext) {
    return {
      revocationAttempted: false,
      revocationStatus: "skipped",
      environment: HMRC_ENVIRONMENT,
      reason: "no_refresh_token",
      timestamp,
    };
  }
  try {
    ensureHmrcBaseUrl();
    const refreshToken = await decryptToken(String(connection.refresh_token_ciphertext), HMRC_TOKEN_ENCRYPTION_KEY);
    const response = await fetch(`${HMRC_BASE_URL}/oauth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: HMRC_CLIENT_ID,
        client_secret: HMRC_CLIENT_SECRET,
        token: refreshToken,
        token_type_hint: "refresh_token",
      }),
    });
    if (!response.ok) {
      console.error("[hmrc] token revoke failed", {
        connectionId: String(connection.id || ""),
        httpStatus: response.status,
      });
    }
    return {
      revocationAttempted: true,
      revocationStatus: response.ok ? "succeeded" : "failed",
      environment: HMRC_ENVIRONMENT,
      httpStatus: response.status,
      reason: response.ok ? null : "hmrc_revoke_rejected",
      timestamp,
    };
  } catch (error) {
    console.error("[hmrc] token revoke failed", {
      connectionId: String(connection.id || ""),
      message: error instanceof Error ? error.message : "Unknown revoke error",
    });
    return {
      revocationAttempted: true,
      revocationStatus: "failed",
      environment: HMRC_ENVIRONMENT,
      reason: error instanceof Error ? error.message : "Unknown revoke error",
      timestamp,
    };
  }
}
