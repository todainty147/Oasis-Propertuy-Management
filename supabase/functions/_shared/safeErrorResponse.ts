import { buildJsonHeaders } from "./trustedOrigin.ts";

const BLOCKED_KEYS = new Set([
  "authorization",
  "apikey",
  "access_token",
  "accessToken",
  "anonKey",
  "apiKey",
  "body",
  "email",
  "inviteToken",
  "password",
  "rawPayload",
  "refresh_token",
  "refreshToken",
  "secret",
  "secretKey",
  "serviceRoleKey",
  "signedUrl",
  "storagePath",
  "token",
]);

type SafeErrorOptions = {
  allowedOrigins?: string | null;
  code?: string;
  context?: Record<string, unknown>;
  correlationId?: string;
  error?: unknown;
  functionName: string;
  message?: string;
  status?: number;
};

export function safeErrorResponse(req: Request, options: SafeErrorOptions) {
  const status = normalizeStatus(options.status);
  const correlationId = options.correlationId || crypto.randomUUID();
  const message = options.message || defaultClientMessage(status);

  logSafeError({
    ...options,
    correlationId,
    message,
    status,
  });

  return new Response(
    JSON.stringify({
      error: message,
      correlationId,
      ...(options.code ? { code: options.code } : {}),
    }),
    {
      status,
      headers: buildJsonHeaders(req, options.allowedOrigins),
    },
  );
}

function normalizeStatus(status: number | undefined) {
  return Number.isInteger(status) && status && status >= 400 && status <= 599 ? status : 500;
}

function defaultClientMessage(status: number) {
  if (status === 400) return "Invalid request";
  if (status === 401) return "Unauthorized";
  if (status === 403) return "Forbidden";
  if (status === 404) return "Not found";
  if (status === 405) return "Method not allowed";
  if (status === 429) return "Too many requests";
  return "Operation failed";
}

function logSafeError({
  code,
  context,
  correlationId,
  error,
  functionName,
  message,
  status,
}: Required<Pick<SafeErrorOptions, "correlationId" | "functionName" | "message" | "status">> &
  Pick<SafeErrorOptions, "code" | "context" | "error">) {
  console.error(JSON.stringify({
    level: "error",
    event: "edge_function_safe_error",
    functionName,
    status,
    clientMessage: message,
    code,
    correlationId,
    error: serializeError(error),
    context: scrubRecord(context || {}),
  }));
}

function serializeError(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) {
    return scrubRecord({
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(typeof (error as { code?: unknown }).code !== "undefined"
        ? { code: (error as { code?: unknown }).code }
        : {}),
      ...(typeof (error as { status?: unknown }).status !== "undefined"
        ? { status: (error as { status?: unknown }).status }
        : {}),
    });
  }

  if (typeof error === "object") {
    return scrubRecord(error as Record<string, unknown>);
  }

  return truncate(String(error));
}

function scrubRecord(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key, value]) => value !== undefined && !BLOCKED_KEYS.has(key))
      .map(([key, value]) => [key, scrubValue(value)]),
  );
}

function scrubValue(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(scrubValue).slice(0, 20);
  if (typeof value === "object") return scrubRecord(value as Record<string, unknown>);
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return truncate(String(value));
}

function truncate(value: string) {
  return value.length > 1200 ? `${value.slice(0, 1200)}...` : value;
}
