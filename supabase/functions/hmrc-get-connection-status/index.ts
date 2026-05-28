import {
  admin,
  assertHmrcAccountAccess,
  getConnection,
  getSafeConnectionStatus,
  handleOptions,
  json,
  methodNotAllowed,
  requireUser,
  safeHmrcError,
} from "../_shared/hmrcEdge.ts";
import { safeSandboxProfile } from "../_shared/hmrcMtdReadOnly.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return methodNotAllowed(req);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || body.accountId || "").trim();
    await assertHmrcAccountAccess(accountId, user.id, "hmrc_mtd_connection");

    const { data: auditRows, error: auditError } = await admin
      .from("hmrc_api_audit_log")
      .select("id, action, status, http_status, error_message, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (auditError) throw auditError;
    const { data: readinessRows, error: readinessError } = await admin
      .from("hmrc_readiness_checks")
      .select("id, check_type, status, hmrc_status_code, hmrc_code, summary, checked_at")
      .eq("account_id", accountId)
      .order("checked_at", { ascending: false })
      .limit(10);
    if (readinessError) throw readinessError;

    const rawConnection = await getConnection(accountId);

    return json(req, {
      connection: await getSafeConnectionStatus(accountId),
      sandboxProfile: safeSandboxProfile(rawConnection),
      auditEvents: auditRows || [],
      readinessChecks: readinessRows || [],
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not load HMRC sandbox connection status", {
      functionName: "hmrc-get-connection-status",
    });
  }
});
