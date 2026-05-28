import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  buildJsonHeaders,
  resolveTrustedAppOrigin,
} from "./trustedOrigin.ts";
import { safeErrorResponse } from "./safeErrorResponse.ts";
import {
  decryptToken,
  encryptToken,
  safeHmrcConnectionPayload,
} from "./hmrcMtd.ts";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
export const ALLOWED_APP_ORIGINS = Deno.env.get("ALLOWED_APP_ORIGINS") || "";
export const APP_URL = Deno.env.get("APP_URL") || "";
export const HMRC_CORS_ALLOWED_ORIGINS = [APP_URL, ALLOWED_APP_ORIGINS].filter(Boolean).join(",");

export const HMRC_ENVIRONMENT = Deno.env.get("HMRC_ENVIRONMENT") || "sandbox";
export const HMRC_CLIENT_ID = Deno.env.get("HMRC_CLIENT_ID") || "";
export const HMRC_CLIENT_SECRET = Deno.env.get("HMRC_CLIENT_SECRET") || "";
export const HMRC_REDIRECT_URI = Deno.env.get("HMRC_REDIRECT_URI") || "";
export const HMRC_BASE_URL = Deno.env.get("HMRC_BASE_URL") || "https://test-api.service.hmrc.gov.uk";
export const HMRC_AUTH_BASE_URL = Deno.env.get("HMRC_AUTH_BASE_URL") || "https://test-www.tax.service.gov.uk";
export const HMRC_TOKEN_ENCRYPTION_KEY = Deno.env.get("HMRC_TOKEN_ENCRYPTION_KEY") || "";
export const HMRC_LIVE_SUBMISSION_ENV = Deno.env.get("HMRC_LIVE_SUBMISSION_ENABLED") || "false";

export const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: buildJsonHeaders(req, HMRC_CORS_ALLOWED_ORIGINS),
  });
}

export function methodNotAllowed(req: Request) {
  return json(req, { error: "Method not allowed" }, 405);
}

export function handleOptions(req: Request) {
  return new Response("ok", { headers: buildCorsHeaders(req, HMRC_CORS_ALLOWED_ORIGINS) });
}

export function safeHmrcError(req: Request, error: unknown, status = 500, message = "HMRC operation failed", context: Record<string, unknown> = {}) {
  return safeErrorResponse(req, {
    allowedOrigins: HMRC_CORS_ALLOWED_ORIGINS,
    context,
    error,
    functionName: context.functionName ? String(context.functionName) : "hmrc-mtd",
    message,
    status,
  });
}

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError("Missing Authorization header", 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) throw new HttpError("Unauthorized", 401);
  return data.user;
}

export async function assertHmrcAccountAccess(accountId: string, userId: string, feature = "hmrc_mtd_connection") {
  if (!accountId) throw new HttpError("Missing account id", 400);
  const { data: member, error: memberError } = await admin
    .from("account_members")
    .select("role")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError) throw memberError;
  if (!member || !["owner", "admin", "staff"].includes(String(member.role || "").toLowerCase())) {
    throw new HttpError("No permission for this account", 403);
  }

  const { data: hasFeature, error: featureError } = await admin.rpc("account_has_feature", {
    p_account_id: accountId,
    p_feature: feature,
  });
  if (featureError) throw featureError;
  if (!hasFeature) throw new HttpError("HMRC connection feature is disabled for this account", 403);
}

export async function auditHmrcEvent({
  accountId,
  userId = null,
  action,
  endpoint = null,
  method = null,
  status,
  httpStatus = null,
  requestSummary = {},
  responseSummary = {},
  errorMessage = null,
  correlationId = crypto.randomUUID(),
}: {
  accountId: string;
  userId?: string | null;
  action: string;
  endpoint?: string | null;
  method?: string | null;
  status: "started" | "success" | "failed" | "blocked";
  httpStatus?: number | null;
  requestSummary?: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;
  errorMessage?: string | null;
  correlationId?: string | null;
}) {
  await admin.from("hmrc_api_audit_log").insert({
    account_id: accountId,
    user_id: userId,
    environment: HMRC_ENVIRONMENT,
    action,
    endpoint,
    method,
    status,
    http_status: httpStatus,
    request_summary: requestSummary,
    response_summary: responseSummary,
    error_message: errorMessage ? String(errorMessage).slice(0, 500) : null,
    correlation_id: correlationId,
  });
}

export function ensureSandboxOnly() {
  if (HMRC_ENVIRONMENT !== "sandbox" || HMRC_LIVE_SUBMISSION_ENV === "true") {
    throw new HttpError("HMRC live submission is disabled for this phase", 403);
  }
}

export function ensureHmrcConfig() {
  if (!HMRC_CLIENT_ID || !HMRC_CLIENT_SECRET || !HMRC_REDIRECT_URI || !HMRC_TOKEN_ENCRYPTION_KEY) {
    throw new HttpError("HMRC sandbox credentials are not configured", 500);
  }
}

export async function getConnection(accountId: string) {
  const { data, error } = await admin
    .from("hmrc_connections")
    .select("*")
    .eq("account_id", accountId)
    .eq("environment", HMRC_ENVIRONMENT)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSafeConnectionStatus(accountId: string) {
  return safeHmrcConnectionPayload(await getConnection(accountId));
}

export async function decryptConnectionAccessToken(connection: Record<string, unknown>) {
  const ciphertext = String(connection?.access_token_ciphertext || "");
  if (!ciphertext) throw new HttpError("HMRC connection has no access token", 400);
  return decryptToken(ciphertext, HMRC_TOKEN_ENCRYPTION_KEY);
}

export async function encryptedTokenRow(tokenResponse: Record<string, unknown>, scopes: string[]) {
  const expiresIn = Number(tokenResponse.expires_in || 0);
  const refreshExpiresIn = Number(tokenResponse.refresh_token_expires_in || 0);
  const now = Date.now();
  return {
    scopes,
    access_token_ciphertext: tokenResponse.access_token
      ? await encryptToken(String(tokenResponse.access_token), HMRC_TOKEN_ENCRYPTION_KEY)
      : null,
    refresh_token_ciphertext: tokenResponse.refresh_token
      ? await encryptToken(String(tokenResponse.refresh_token), HMRC_TOKEN_ENCRYPTION_KEY)
      : null,
    access_token_expires_at: expiresIn > 0 ? new Date(now + expiresIn * 1000).toISOString() : null,
    refresh_token_expires_at: refreshExpiresIn > 0 ? new Date(now + refreshExpiresIn * 1000).toISOString() : null,
  };
}

export function appRedirectUrl(path: string, params: Record<string, string> = {}) {
  const resolved = resolveTrustedAppOrigin({ appUrl: APP_URL, allowedOrigins: ALLOWED_APP_ORIGINS });
  if (!resolved.origin) {
    throw new HttpError("Trusted app redirect origin is not configured", 500);
  }
  const url = new URL(path, resolved.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

export class HttpError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
