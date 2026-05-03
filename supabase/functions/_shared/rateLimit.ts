type RateLimitRpcClient = {
  rpc: (
    functionName: string,
    params: Record<string, unknown>,
  ) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
};

export type RateLimitResult = {
  allowed: boolean;
  attemptCount: number;
  maxAttempts: number;
  retryAfterSeconds: number;
  surface: string;
  windowSeconds: number;
};

type RateLimitParams = {
  surface: string;
  accountId?: string | null;
  actorUserId?: string | null;
  identifier?: string | null;
  identifierHash?: string | null;
  windowSeconds: number;
  maxAttempts: number;
  metadata?: Record<string, unknown>;
};

export async function hashRateLimitIdentifier(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function recordRateLimitAttempt(
  admin: RateLimitRpcClient,
  {
    surface,
    accountId = null,
    actorUserId = null,
    identifier = null,
    identifierHash = null,
    windowSeconds,
    maxAttempts,
    metadata = {},
  }: RateLimitParams,
): Promise<RateLimitResult> {
  const hashedIdentifier = identifierHash || await hashRateLimitIdentifier(identifier);
  const { data, error } = await admin.rpc("record_api_rate_limit_attempt", {
    p_surface: surface,
    p_account_id: accountId,
    p_actor_user_id: actorUserId,
    p_identifier_hash: hashedIdentifier,
    p_window_seconds: windowSeconds,
    p_max_attempts: maxAttempts,
    p_metadata: metadata,
  });

  if (error) {
    throw new Error(error.message || "Rate limit check failed");
  }

  const row = (data || {}) as Record<string, unknown>;
  return {
    allowed: row.allowed === true,
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || maxAttempts),
    retryAfterSeconds: Number(row.retry_after_seconds || 0),
    surface: String(row.surface || surface),
    windowSeconds: Number(row.window_seconds || windowSeconds),
  };
}

export function buildRateLimitBody(result: RateLimitResult) {
  return {
    ok: false,
    error: "Too many attempts. Please try again later.",
    code: "rate_limit_exceeded",
    retryAfterSeconds: result.retryAfterSeconds,
  };
}
