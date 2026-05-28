import {
  admin,
  assertHmrcAccountAccess,
  auditHmrcEvent,
  encryptedTokenRow,
  ensureHmrcConfig,
  ensureSandboxOnly,
  getConnection,
  handleOptions,
  HMRC_BASE_URL,
  HMRC_CLIENT_ID,
  HMRC_CLIENT_SECRET,
  HMRC_TOKEN_ENCRYPTION_KEY,
  json,
  methodNotAllowed,
  requireUser,
  safeHmrcError,
} from "../_shared/hmrcEdge.ts";
import { decryptToken, safeHmrcConnectionPayload } from "../_shared/hmrcMtd.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return methodNotAllowed(req);

  try {
    ensureSandboxOnly();
    ensureHmrcConfig();
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || body.accountId || "").trim();
    await assertHmrcAccountAccess(accountId, user.id, "hmrc_mtd_connection");
    const connection = await getConnection(accountId);
    if (!connection?.refresh_token_ciphertext) {
      throw new Error("No refresh token is available for this HMRC connection");
    }
    const refreshToken = await decryptToken(String(connection.refresh_token_ciphertext), HMRC_TOKEN_ENCRYPTION_KEY);
    const tokenResponse = await fetch(`${HMRC_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: HMRC_CLIENT_ID,
        client_secret: HMRC_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    });
    const tokenJson = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok) {
      await auditHmrcEvent({
        accountId,
        userId: user.id,
        action: "hmrc.refresh_token",
        endpoint: "/oauth/token",
        method: "POST",
        status: "failed",
        httpStatus: tokenResponse.status,
        errorMessage: "HMRC token refresh failed",
      });
      return json(req, { error: "Could not refresh HMRC sandbox connection" }, 400);
    }

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("hmrc_connections")
      .update({
        ...(await encryptedTokenRow(tokenJson, connection.scopes || [])),
        connection_status: "connected",
        last_refreshed_at: now,
        updated_at: now,
      })
      .eq("id", connection.id)
      .select("connection_status, environment, scopes, last_connected_at, last_refreshed_at, hmrc_display_label")
      .single();
    if (error) throw error;

    await auditHmrcEvent({
      accountId,
      userId: user.id,
      action: "hmrc.refresh_token",
      endpoint: "/oauth/token",
      method: "POST",
      status: "success",
      httpStatus: tokenResponse.status,
      responseSummary: { token_type: tokenJson.token_type || "bearer" },
    });

    return json(req, { connection: safeHmrcConnectionPayload(data) });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not refresh HMRC sandbox connection", {
      functionName: "hmrc-refresh-token",
    });
  }
});
