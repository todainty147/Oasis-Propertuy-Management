// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_DAILY_AI_CALL_LIMIT = 50; // used only when plan lookup fails
const MAX_AI_STRING_LENGTH = 1_200;
const MAX_AI_ARRAY_LENGTH = 24;
const MAX_AI_OBJECT_KEYS = 64;
const MAX_AI_PAYLOAD_BYTES = 32_000;

// ─── Types ────────────────────────────────────────────────────────────────────

type RpcResult = { data?: unknown; error?: unknown };
type QueryResult<T = Record<string, unknown>> = Promise<{ data?: T[] | T | null; error?: unknown }>;

type SupabaseQueryBuilder = {
  select: (columns: string) => SupabaseQueryBuilder;
  eq: (column: string, value: string) => SupabaseQueryBuilder;
  maybeSingle: () => QueryResult<Record<string, unknown>>;
  upsert: (row: Record<string, unknown>) => Promise<RpcResult>;
  then: <TResult1 = { data?: Record<string, unknown>[] | null; error?: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data?: Record<string, unknown>[] | null; error?: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
};

type SupabaseLikeClient = {
  from: (table: string) => SupabaseQueryBuilder;
  rpc: (fn: string, params: Record<string, unknown>) => Promise<RpcResult>;
};

// ─── Period keys ─────────────────────────────────────────────────────────────

/** Daily period key: YYYY-MM-DD */
export function getDailyAiPeriodKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Monthly period key: YYYY-MM */
export function getMonthlyAiPeriodKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

// ─── Plan-aware daily limit ───────────────────────────────────────────────────

/**
 * Resolves the per-account per-day AI call ceiling from the database.
 * Falls back to FALLBACK_DAILY_AI_CALL_LIMIT if the RPC is unavailable.
 * Returns null for unlimited (operator_agency plan).
 */
export async function getDailyAiCallLimit(
  client: SupabaseLikeClient,
  accountId: string,
  featureKey: string,
): Promise<number | null> {
  try {
    const result = await client.rpc("ai_daily_call_limit_for_plan", {
      p_plan: await getAccountPlan(client, accountId),
      p_feature: featureKey,
    });
    if (result.error || result.data === undefined || result.data === null) {
      // null from DB means unlimited
      return result.data === null ? null : FALLBACK_DAILY_AI_CALL_LIMIT;
    }
    return result.data as number;
  } catch {
    return FALLBACK_DAILY_AI_CALL_LIMIT;
  }
}

async function getAccountPlan(client: SupabaseLikeClient, accountId: string): Promise<string> {
  try {
    const result = await client.rpc("account_subscription_plan", { p_account_id: accountId });
    return String(result.data || "starter");
  } catch {
    return "starter";
  }
}

// ─── Limit checks ─────────────────────────────────────────────────────────────

function buildLimitError(message: string, status: number, code: string): Error {
  const error = new Error(message);
  (error as Error & { status?: number; code?: string }).status = status;
  (error as Error & { status?: number; code?: string }).code = code;
  return error;
}

/**
 * Throws 429 if the account has exceeded its plan-based daily AI call limit.
 * Resolves the limit from the DB so it reflects the account's current plan.
 */
export async function assertAiDailyLimit(
  client: SupabaseLikeClient,
  {
    accountId,
    featureKey,
  }: {
    accountId: string;
    featureKey: string;
    limit?: number; // ignored — kept for backward-compat call sites; plan-aware now
  },
): Promise<void> {
  const limit = await getDailyAiCallLimit(client, accountId, featureKey);
  if (limit === null) return; // unlimited plan

  const periodKey = getDailyAiPeriodKey();
  const { data } = await client
    .from("ai_usage_meter")
    .select("prompt_runs")
    .eq("account_id", accountId)
    .eq("period_key", periodKey)
    .eq("feature_key", featureKey)
    .maybeSingle();

  const currentRuns = Number((data as Record<string, unknown> | null)?.prompt_runs || 0);
  if (currentRuns >= limit) {
    throw buildLimitError("Daily AI generation limit reached", 429, "ai_daily_limit_reached");
  }
}

/**
 * Throws 429 if the account has exceeded its plan-based monthly AI call limit.
 * Sums daily rows for the current month — no separate monthly aggregate needed.
 */
export async function assertAiMonthlyLimit(
  client: SupabaseLikeClient,
  {
    accountId,
    featureKey,
  }: {
    accountId: string;
    featureKey: string;
  },
): Promise<void> {
  const plan = await getAccountPlan(client, accountId);

  let monthlyLimit: number | null;
  try {
    const result = await client.rpc("ai_monthly_call_limit_for_plan", { p_plan: plan });
    monthlyLimit = result.data === null ? null : Number(result.data ?? 0);
  } catch {
    return; // fail open on RPC errors — daily limit is the primary guard
  }

  if (monthlyLimit === null) return; // unlimited
  if (monthlyLimit === 0) {
    throw buildLimitError("Monthly AI generation limit reached", 429, "ai_monthly_limit_reached");
  }

  const monthKey = getMonthlyAiPeriodKey();

  // Sum only rows for the current month. period_key is YYYY-MM-DD (daily rows)
  // or YYYY-MM (monthly aggregate). The LIKE filter is applied server-side so
  // we never load the full history of an account into the Edge runtime.
  const monthPrefix = monthKey + "%"; // e.g. "2026-04%"
  const queryBuilder = client
    .from("ai_usage_meter")
    .select("prompt_runs")
    .eq("account_id", accountId)
    .eq("feature_key", featureKey) as unknown as {
      like: (col: string, pattern: string) => typeof queryBuilder;
      then: SupabaseQueryBuilder["then"];
    };

  // Use gte/lt range bounds as a reliable alternative to LIKE across all
  // Supabase JS versions (avoids relying on the .like() method being present).
  const nextMonthKey = (() => {
    const [y, m] = monthKey.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    return next;
  })();

  const { data: rows } = await (client
    .from("ai_usage_meter")
    .select("prompt_runs")
    .eq("account_id", accountId)
    .eq("feature_key", featureKey) as unknown as SupabaseQueryBuilder & {
      gte: (col: string, val: string) => SupabaseQueryBuilder;
      lt:  (col: string, val: string) => SupabaseQueryBuilder;
    })
    .gte("period_key", monthKey)
    .lt("period_key", nextMonthKey);

  // Fall back if the client doesn't support this query shape
  if (!Array.isArray(rows)) return;

  const total = rows.reduce((sum, r) => sum + Number(r.prompt_runs || 0), 0);

  if (total >= monthlyLimit) {
    throw buildLimitError("Monthly AI generation limit reached", 429, "ai_monthly_limit_reached");
  }
}

// ─── Atomic AI usage meter helpers ───────────────────────────────────────────
//
// These replace the local upsertUsageMeterRow read-modify-write in each Edge
// Function. Both call the increment_ai_usage_meter SQL RPC which uses
// ON CONFLICT DO UPDATE SET col = col + excluded.col — fully atomic.
//
// Usage pattern in each Edge Function:
//
//   // 1. Check quota (read-only soft guard)
//   await assertAiDailyLimit(admin, { accountId, featureKey });
//   await assertAiMonthlyLimit(admin, { accountId, featureKey });
//
//   // 2. Pre-reserve quota slot atomically BEFORE the AI call.
//   //    Two concurrent calls will now see each other's reservation on the
//   //    next check, closing the check-then-call race window.
//   await reserveAiCall(admin, { accountId, featureKey });
//
//   // 3. AI call
//   const result = await generateInsight(input);
//
//   // 4. Record token counts after the call (fire-and-forget, non-blocking).
//   recordAiTokens(admin, { accountId, featureKey,
//     inputTokens: result.inputTokens, outputTokens: result.outputTokens });

/**
 * Atomically increments prompt_runs by 1 for both the daily and monthly period
 * rows BEFORE the AI model call. This pre-reserves the quota slot so that
 * concurrent calls from the same account see updated counts on their next check.
 */
export async function reserveAiCall(
  client: SupabaseLikeClient,
  { accountId, featureKey }: { accountId: string; featureKey: string },
): Promise<void> {
  const dailyKey   = getDailyAiPeriodKey();
  const monthlyKey = getMonthlyAiPeriodKey();
  await Promise.all([
    client.rpc("increment_ai_usage_meter", {
      p_account_id:    accountId,
      p_feature_key:   featureKey,
      p_period_key:    dailyKey,
      p_prompt_runs:   1,
      p_input_tokens:  0,
      p_output_tokens: 0,
    }),
    client.rpc("increment_ai_usage_meter", {
      p_account_id:    accountId,
      p_feature_key:   featureKey,
      p_period_key:    monthlyKey,
      p_prompt_runs:   1,
      p_input_tokens:  0,
      p_output_tokens: 0,
    }),
  ]);
}

/**
 * Atomically adds actual token counts to the meter after the AI call completes.
 * Fire-and-forget: token tracking is observability, not quota-enforced.
 * Errors are logged but must not block the response.
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
  const dailyKey   = getDailyAiPeriodKey();
  const monthlyKey = getMonthlyAiPeriodKey();
  Promise.all([
    client.rpc("increment_ai_usage_meter", {
      p_account_id:    accountId,
      p_feature_key:   featureKey,
      p_period_key:    dailyKey,
      p_prompt_runs:   0,
      p_input_tokens:  inputTokens,
      p_output_tokens: outputTokens,
    }),
    client.rpc("increment_ai_usage_meter", {
      p_account_id:    accountId,
      p_feature_key:   featureKey,
      p_period_key:    monthlyKey,
      p_prompt_runs:   0,
      p_input_tokens:  inputTokens,
      p_output_tokens: outputTokens,
    }),
  ]).catch((err) => {
    console.error(JSON.stringify({
      event:      "ai_token_meter_failed",
      accountId,
      featureKey,
      error:      String((err as Error)?.message || err),
    }));
  });
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
