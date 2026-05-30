import {
  admin,
  assertHmrcAccountFeatures,
  ensureSandboxOnly,
  getConnection,
  handleOptions,
  json,
  methodNotAllowed,
  requireUser,
  safeHmrcError,
} from "../_shared/hmrcEdge.ts";
import { normalizeSandboxNino, safeSandboxProfile } from "../_shared/hmrcMtdReadOnly.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return methodNotAllowed(req);

  try {
    ensureSandboxOnly();
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || body.accountId || "").trim();
    await assertHmrcAccountFeatures(accountId, user.id, ["hmrc_mtd_connection", "hmrc_mtd_sandbox"]);

    const connection = await getConnection(accountId);
    if (!connection) {
      return json(req, { error: "Connect HMRC sandbox before saving a sandbox test identifier." }, 400);
    }

    const metadata = connection.metadata && typeof connection.metadata === "object"
      ? connection.metadata as Record<string, unknown>
      : {};
    const sandboxProfile = {
      nino: normalizeSandboxNino(body.nino),
      income_source_id: String(body.income_source_id || body.incomeSourceId || "").trim(),
      mtditid: String(body.mtditid || "").trim(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("hmrc_connections")
      .update({ metadata: { ...metadata, sandbox_profile: sandboxProfile } })
      .eq("id", connection.id)
      .select("id, account_id, environment, connection_status, scopes, metadata, last_connected_at, last_refreshed_at, hmrc_display_label")
      .single();
    if (error) throw error;

    return json(req, { sandboxProfile: safeSandboxProfile(data) });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, "Could not save HMRC sandbox test identifier", {
      functionName: "hmrc-save-sandbox-profile",
    });
  }
});
