// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_AI_STRING_LENGTH = 1_200;
const MAX_AI_ARRAY_LENGTH = 24;
const MAX_AI_OBJECT_KEYS = 64;
const MAX_AI_PAYLOAD_BYTES = 32_000;

// ─── Types ────────────────────────────────────────────────────────────────────

type RpcResult = { data?: unknown; error?: unknown };

type SupabaseLikeClient = {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<RpcResult>;
};

// ─── Period keys ─────────────────────────────────────────────────────────────

/** Daily period key: YYYY-MM-DD */
export function getDailyAiPeriodKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// ─── Limit checks ─────────────────────────────────────────────────────────────

function buildLimitError(message: string, status: number, code: string): Error {
  const error = new Error(message);
  (error as Error & { status?: number; code?: string }).status = status;
  (error as Error & { status?: number; code?: string }).code = code;
  return error;
}

// ─── Atomic AI usage meter helpers ───────────────────────────────────────────
//
// Usage pattern in each Edge Function (only when OPENAI_API_KEY is set):
//
//   // 1. Atomic quota check + reservation — closes the check-then-call race.
//   await checkAndReserveAiCall(admin, { accountId, featureKey });
//
//   // 2. AI call
//   const result = await generateInsight(input);
//
//   // 3. Record token counts after the call (fire-and-forget, non-blocking).
//   recordAiTokens(admin, { accountId, featureKey,
//     inputTokens: result.inputTokens, outputTokens: result.outputTokens });
//
// Only daily rows (period_key YYYY-MM-DD) are written to ai_usage_meter.
// Monthly usage is derived at query time by summing daily rows for the month;
// there are no separate YYYY-MM aggregate rows, avoiding legacy double counting.

/**
 * Atomically checks daily and monthly AI call quotas then increments the daily
 * meter row if both limits allow it. Calls the reserve_ai_call_checked SQL RPC
 * which holds a pg_advisory_xact_lock at account level, making the
 * read-check-increment sequence serial for all concurrent AI calls in the
 * same account.
 *
 * Quota semantics:
 *   - Monthly limit is account-wide (all features combined).
 *   - Daily limit is per feature key.
 *   - Attempted-generation billing: once this function returns, the slot is
 *     consumed even if the subsequent model call fails into deterministic
 *     fallback. This is intentional — the AI call was attempted and the quota
 *     slot should be counted. Edge Functions only call this when OPENAI_API_KEY
 *     is present, so fallback-mode deployments never consume quota at all.
 *
 * Throws 429 with code 'ai_daily_limit_reached' or 'ai_monthly_limit_reached'.
 */
export async function checkAndReserveAiCall(
  client: SupabaseLikeClient,
  { accountId, featureKey }: { accountId: string; featureKey: string },
): Promise<void> {
  const result = await client.rpc("reserve_ai_call_checked", {
    p_account_id:  accountId,
    p_feature_key: featureKey,
  });
  if (result.error) {
    throw buildLimitError("AI quota check failed", 500, "ai_limit_check_failed");
  }
  const status = String(result.data || "");
  if (status === "daily_limit_reached") {
    throw buildLimitError("Daily AI generation limit reached", 429, "ai_daily_limit_reached");
  }
  if (status === "monthly_limit_reached") {
    throw buildLimitError("Monthly AI generation limit reached", 429, "ai_monthly_limit_reached");
  }
}

/**
 * Atomically increments prompt_runs by 1 for the daily meter row BEFORE the
 * AI model call. Low-level helper — prefer checkAndReserveAiCall, which also
 * enforces plan limits atomically. Only writes daily rows (YYYY-MM-DD).
 */
export async function reserveAiCall(
  client: SupabaseLikeClient,
  { accountId, featureKey }: { accountId: string; featureKey: string },
): Promise<void> {
  const dailyKey = getDailyAiPeriodKey();
  await client.rpc("increment_ai_usage_meter", {
    p_account_id:    accountId,
    p_feature_key:   featureKey,
    p_period_key:    dailyKey,
    p_prompt_runs:   1,
    p_input_tokens:  0,
    p_output_tokens: 0,
  });
}

/**
 * Atomically adds actual token counts to the daily meter row after the AI call.
 * Fire-and-forget: token tracking is observability, not quota-enforced.
 * Only writes daily rows (YYYY-MM-DD); monthly totals are derived at query time.
 */
export function recordAiTokens(
  client: SupabaseLikeClient,
  {
    accountId,
    featureKey,
    inputTokens,
    outputTokens,
  }: {
    accountId: string;
    featureKey: string;
    inputTokens: number;
    outputTokens: number;
  },
): void {
  const dailyKey = getDailyAiPeriodKey();
  // Use async IIFE so we can await the thenable returned by rpc().
  // Calling .catch() directly on the Supabase query builder fails at runtime
  // because it is a thenable but not a full Promise (no .catch() method).
  void (async () => {
    try {
      await client.rpc("increment_ai_usage_meter", {
        p_account_id:    accountId,
        p_feature_key:   featureKey,
        p_period_key:    dailyKey,
        p_prompt_runs:   0,
        p_input_tokens:  inputTokens,
        p_output_tokens: outputTokens,
      });
    } catch (err) {
      console.error(JSON.stringify({
        event:      "ai_token_meter_failed",
        accountId,
        featureKey,
        error:      String((err as Error)?.message || err),
      }));
    }
  })();
}

// ─── Prompt / payload utilities ───────────────────────────────────────────────

export function buildUntrustedJsonPrompt(data: unknown): string {
  return JSON.stringify({
    untrusted_operational_data: data,
  });
}

export function redactForAiPrompt(value: unknown, maxLength = 800): string {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]")
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, "[redacted-postcode]")
    .slice(0, maxLength);
}

export function aliasForId(prefix: string, value: unknown): string {
  const id = String(value || "").trim();
  if (!id) return prefix;
  return `${prefix}:${id.replace(/[^a-z0-9-]/gi, "").slice(0, 8) || "known"}`;
}

export function clampAiInsightPayload<T>(payload: T): T {
  const clamped = clampValue(payload, 0) as T;
  const encoded = new TextEncoder().encode(JSON.stringify(clamped));
  if (encoded.length > MAX_AI_PAYLOAD_BYTES) {
    const error = new Error("AI insight payload exceeds maximum size");
    (error as Error & { code?: string }).code = "ai_payload_too_large";
    throw error;
  }
  return clamped;
}

/**
 * Epic F2: Returns true if a cached insight should be invalidated because
 * the prompt version has changed since it was generated.
 */
export function isCacheStaleByPromptVersion(
  cachedPromptVersion: string | null | undefined,
  currentPromptVersion: string,
): boolean {
  if (!cachedPromptVersion) return true;
  return cachedPromptVersion !== currentPromptVersion;
}

function clampValue(value: unknown, depth: number): unknown {
  if (depth > 8) return null;
  if (typeof value === "string") return value.slice(0, MAX_AI_STRING_LENGTH);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_AI_ARRAY_LENGTH).map((entry) => clampValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_AI_OBJECT_KEYS)
        .map(([key, entry]) => [key, clampValue(entry, depth + 1)]),
    );
  }
  return null;
}
