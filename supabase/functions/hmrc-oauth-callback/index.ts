import {
  admin,
  appRedirectUrl,
  auditHmrcEvent,
  encryptedTokenRow,
  ensureHmrcConfig,
  ensureSandboxOnly,
  HMRC_CLIENT_ID,
  HMRC_CLIENT_SECRET,
  HMRC_ENVIRONMENT,
  HMRC_REDIRECT_URI,
  HMRC_BASE_URL,
  HMRC_TOKEN_ENCRYPTION_KEY,
  safeHmrcError,
} from "../_shared/hmrcEdge.ts";
import { createPkceCodeChallenge, decryptToken, isOauthStateExpired } from "../_shared/hmrcMtd.ts";

Deno.serve(async (req) => {
  try {
    ensureSandboxOnly();
    ensureHmrcConfig();
    const url = new URL(req.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const errorCode = url.searchParams.get("error") || "";

    if (errorCode) {
      return Response.redirect(appRedirectUrl("/compliance/hmrc-connection", { hmrc: "failed" }), 302);
    }
    if (!code || !state) {
      return Response.redirect(appRedirectUrl("/compliance/hmrc-connection", { hmrc: "invalid_callback" }), 302);
    }

    const { data: oauthState, error: stateError } = await admin
      .from("hmrc_oauth_states")
      .select("*")
      .eq("state_token", state)
      .eq("environment", HMRC_ENVIRONMENT)
      .maybeSingle();
    if (stateError) throw stateError;
    if (!oauthState || oauthState.consumed_at || isOauthStateExpired(oauthState.expires_at)) {
      if (oauthState?.account_id) {
        await auditHmrcEvent({
          accountId: oauthState.account_id,
          userId: oauthState.user_id,
          action: "hmrc.oauth_callback",
          endpoint: "/oauth/token",
          method: "POST",
          status: "blocked",
          errorMessage: "OAuth state invalid, expired, or already consumed",
        });
      }
      return Response.redirect(appRedirectUrl("/compliance/hmrc-connection", { hmrc: "state_rejected" }), 302);
    }

    const codeVerifier = String(oauthState.code_verifier_ciphertext || "")
      ? await decryptToken(String(oauthState.code_verifier_ciphertext), HMRC_TOKEN_ENCRYPTION_KEY)
      : "";
    if (!codeVerifier || await createPkceCodeChallenge(codeVerifier) !== oauthState.code_verifier_hash) {
      await auditHmrcEvent({
        accountId: oauthState.account_id,
        userId: oauthState.user_id,
        action: "hmrc.oauth_callback",
        endpoint: "/oauth/token",
        method: "POST",
        status: "blocked",
        errorMessage: "OAuth PKCE verifier missing or invalid",
      });
      return Response.redirect(appRedirectUrl("/compliance/hmrc-connection", { hmrc: "pkce_rejected" }), 302);
    }

    const tokenResponse = await fetch(`${HMRC_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: HMRC_CLIENT_ID,
        client_secret: HMRC_CLIENT_SECRET,
        redirect_uri: HMRC_REDIRECT_URI,
        code,
        code_verifier: codeVerifier,
      }),
    });
    const tokenJson = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok) {
      await auditHmrcEvent({
        accountId: oauthState.account_id,
        userId: oauthState.user_id,
        action: "hmrc.oauth_callback",
        endpoint: "/oauth/token",
        method: "POST",
        status: "failed",
        httpStatus: tokenResponse.status,
        responseSummary: { ok: false },
        errorMessage: "HMRC token exchange failed",
      });
      return Response.redirect(appRedirectUrl("/compliance/hmrc-connection", { hmrc: "exchange_failed" }), 302);
    }

    const tokenRow = await encryptedTokenRow(tokenJson, oauthState.requested_scopes || []);
    const now = new Date().toISOString();
    const existingConnection = await getExistingConnectionMetadata(oauthState.account_id);
    const { error: upsertError } = await admin.from("hmrc_connections").upsert({
      account_id: oauthState.account_id,
      created_by: oauthState.user_id,
      environment: HMRC_ENVIRONMENT,
      connection_status: "connected",
      hmrc_subject_type: "sandbox_user",
      hmrc_display_label: "HMRC sandbox connection",
      ...tokenRow,
      last_connected_at: now,
      last_refreshed_at: now,
      disconnected_at: null,
      metadata: { ...existingConnection, token_type: tokenJson.token_type || "bearer" },
      updated_at: now,
    }, { onConflict: "account_id,environment" });
    if (upsertError) throw upsertError;

    await admin
      .from("hmrc_oauth_states")
      .update({ consumed_at: now })
      .eq("id", oauthState.id);

    await auditHmrcEvent({
      accountId: oauthState.account_id,
      userId: oauthState.user_id,
      action: "hmrc.oauth_callback",
      endpoint: "/oauth/token",
      method: "POST",
      status: "success",
      httpStatus: tokenResponse.status,
      responseSummary: { token_type: tokenJson.token_type || "bearer", scope_count: (oauthState.requested_scopes || []).length },
    });

    return Response.redirect(appRedirectUrl("/compliance/hmrc-connection", { hmrc: "connected" }), 302);
  } catch (error) {
    return safeHmrcError(req, error, 500, "Could not complete HMRC sandbox connection", {
      functionName: "hmrc-oauth-callback",
    });
  }
});

async function getExistingConnectionMetadata(accountId: string) {
  const { data, error } = await admin
    .from("hmrc_connections")
    .select("metadata")
    .eq("account_id", accountId)
    .eq("environment", HMRC_ENVIRONMENT)
    .maybeSingle();
  if (error) throw error;
  return data?.metadata && typeof data.metadata === "object"
    ? data.metadata as Record<string, unknown>
    : {};
}
