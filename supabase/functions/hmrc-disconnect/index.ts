import {
  admin,
  assertHmrcAccountAccess,
  auditHmrcEvent,
  ensureSandboxOnly,
  getSafeConnectionStatus,
  handleOptions,
  json,
  methodNotAllowed,
  requireUser,
  safeHmrcError,
} from "../_shared/hmrcEdge.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return methodNotAllowed(req);

  try {
    ensureSandboxOnly();
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || body.accountId || "").trim();
    await assertHmrcAccountAccess(accountId, user.id, "hmrc_mtd_connection");

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
      .eq("environment", "sandbox");
    if (error) throw error;

    await auditHmrcEvent({
      accountId,
      userId: user.id,
      action: "hmrc.disconnect",
      status: "success",
      requestSummary: { revoke_endpoint_called: false },
    });

    return json(req, { connection: await getSafeConnectionStatus(accountId) });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not disconnect HMRC sandbox connection", {
      functionName: "hmrc-disconnect",
    });
  }
});
