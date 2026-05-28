import {
  admin,
  assertHmrcAccountAccess,
  auditHmrcEvent,
  ensureHmrcConfig,
  ensureSandboxOnly,
  handleOptions,
  HMRC_AUTH_BASE_URL,
  HMRC_CLIENT_ID,
  HMRC_ENVIRONMENT,
  HMRC_REDIRECT_URI,
  json,
  methodNotAllowed,
  requireUser,
  safeHmrcError,
} from "../_shared/hmrcEdge.ts";
import {
  createOauthStateExpiry,
  ensureSandboxProbeScope,
  generateOauthStateToken,
  validateHmrcScopes,
} from "../_shared/hmrcMtd.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return methodNotAllowed(req);

  try {
    ensureSandboxOnly();
    ensureHmrcConfig();
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.account_id || body.accountId || "").trim();
    const requestedScopes = ensureSandboxProbeScope(validateHmrcScopes(body.requested_scopes || body.requestedScopes));
    await assertHmrcAccountAccess(accountId, user.id, "hmrc_mtd_connection");
    await assertHmrcAccountAccess(accountId, user.id, "hmrc_mtd_sandbox");

    const stateToken = generateOauthStateToken();
    const expiresAt = createOauthStateExpiry();
    const { error: stateError } = await admin.from("hmrc_oauth_states").insert({
      account_id: accountId,
      user_id: user.id,
      state_token: stateToken,
      redirect_uri: HMRC_REDIRECT_URI,
      requested_scopes: requestedScopes,
      environment: HMRC_ENVIRONMENT,
      expires_at: expiresAt,
    });
    if (stateError) throw stateError;

    const authUrl = new URL("/oauth/authorize", HMRC_AUTH_BASE_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", HMRC_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", HMRC_REDIRECT_URI);
    authUrl.searchParams.set("scope", requestedScopes.join(" "));
    authUrl.searchParams.set("state", stateToken);

    await auditHmrcEvent({
      accountId,
      userId: user.id,
      action: "hmrc.oauth_start",
      endpoint: "/oauth/authorize",
      method: "GET",
      status: "success",
      requestSummary: { scope_count: requestedScopes.length, environment: HMRC_ENVIRONMENT },
    });

    return json(req, { redirectUrl: authUrl.toString(), expiresAt });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status?: unknown }).status) : 500;
    return safeHmrcError(req, error, status, status === 403 ? "HMRC connection is not enabled for this account" : "Could not start HMRC sandbox connection", {
      functionName: "hmrc-start-oauth",
    });
  }
});
