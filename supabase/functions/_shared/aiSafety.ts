const DEFAULT_DAILY_AI_CALL_LIMIT = 75;
const MAX_AI_STRING_LENGTH = 1_200;
const MAX_AI_ARRAY_LENGTH = 24;
const MAX_AI_OBJECT_KEYS = 64;
const MAX_AI_PAYLOAD_BYTES = 32_000;

type SupabaseLikeClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data?: Record<string, unknown> | null; error?: unknown }>;
          };
        };
      };
    };
  };
};

export function getDailyAiCallLimit() {
  const configured = Number(Deno.env.get("OASIS_AI_DAILY_CALL_LIMIT") || "");
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(Math.floor(configured), 5_000);
  }
  return DEFAULT_DAILY_AI_CALL_LIMIT;
}

export function getDailyAiPeriodKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function assertAiDailyLimit(
  client: SupabaseLikeClient,
  {
    accountId,
    featureKey,
    limit = getDailyAiCallLimit(),
  }: {
    accountId: string;
    featureKey: string;
    limit?: number;
  },
) {
  const periodKey = getDailyAiPeriodKey();
  const { data } = await client
    .from("ai_usage_meter")
    .select("prompt_runs")
    .eq("account_id", accountId)
    .eq("period_key", periodKey)
    .eq("feature_key", featureKey)
    .maybeSingle();

  const currentRuns = Number(data?.prompt_runs || 0);
  if (currentRuns >= limit) {
    const error = new Error("Daily AI generation limit reached");
    (error as Error & { status?: number; code?: string }).status = 429;
    (error as Error & { status?: number; code?: string }).code = "ai_daily_limit_reached";
    throw error;
  }
}

export function buildUntrustedJsonPrompt(data: unknown) {
  return JSON.stringify({
    untrusted_operational_data: data,
  });
}

export function redactForAiPrompt(value: unknown, maxLength = 800) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]")
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, "[redacted-postcode]")
    .slice(0, maxLength);
}

export function aliasForId(prefix: string, value: unknown) {
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
