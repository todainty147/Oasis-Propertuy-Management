type CronAuthMethod = "x-cron-secret" | "authorization" | "none";

type CronAuthResult = {
  ok: boolean;
  method: CronAuthMethod;
};

type ObservabilityClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => Promise<{ error?: { message?: string } | null }>;
  };
};

type ScheduledEvent = {
  surface: string;
  reason: string;
  code?: string | null;
  outcome?: "denied" | "error" | "recorded";
  kind?: "authorization_denied" | "unexpected_security_failure" | "workflow_signal";
  accountId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_KEY_PATTERN = /email|phone|token|secret|authorization|password|key|signature|body|html|recipient/i;

export function getCronAuthResult(req: Request, cronSecret: string): CronAuthResult {
  const headerSecret = req.headers.get("x-cron-secret") || "";
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (headerSecret) {
    return {
      ok: headerSecret === cronSecret,
      method: "x-cron-secret",
    };
  }

  if (token) {
    return {
      ok: token === cronSecret,
      method: "authorization",
    };
  }

  return {
    ok: false,
    method: "none",
  };
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "Unknown error",
    };
  }
  return {
    name: "UnknownError",
    message: String(error || "Unknown error"),
  };
}

export async function recordScheduledFunctionEvent(
  admin: ObservabilityClient,
  {
    surface,
    reason,
    code = null,
    outcome = "error",
    kind = outcome === "denied" ? "authorization_denied" : "unexpected_security_failure",
    accountId = null,
    entityType = null,
    entityId = null,
    correlationId = null,
    metadata = {},
  }: ScheduledEvent,
) {
  try {
    const { error } = await admin.from("security_observability_events").insert({
      account_id: accountId,
      category: "scheduled_workflow",
      kind,
      surface,
      reason,
      outcome,
      code,
      guard_denied: kind === "authorization_denied",
      entity_type: entityType,
      entity_id: entityId,
      correlation_id: correlationId,
      source: "edge_function",
      metadata: scrubMetadata(metadata),
    });

    if (error) {
      console.warn(JSON.stringify({
        level: "warn",
        surface,
        reason: "scheduled_observability_insert_failed",
        error: error.message || "Unknown insert error",
      }));
    }
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      surface,
      reason: "scheduled_observability_insert_failed",
      error: serializeError(error).message,
    }));
  }
}

function scrubMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value || {})
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, nextValue]) => [key, scrubValue(nextValue)]),
  );
}

function scrubValue(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item));
  if (typeof value === "object") return scrubMetadata(value as Record<string, unknown>);
  if (typeof value === "string") return value.slice(0, 500);
  return value;
}
