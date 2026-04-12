import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildRateLimitBody,
  recordRateLimitAttempt,
} from "../_shared/rateLimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BLOCKED_KEYS = new Set([
  "token",
  "inviteToken",
  "email",
  "body",
  "fileName",
  "filename",
  "metadata",
  "originalFilename",
  "rawPayload",
  "accessToken",
  "password",
  "path",
  "signedUrl",
  "storagePath",
]);

type Payload = {
  category?: string;
  kind?: string;
  surface?: string;
  reason?: string | null;
  outcome?: string;
  code?: string | null;
  hint?: string | null;
  accountId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  correlationId?: string | null;
  source?: string | null;
  guardDenied?: boolean;
  context?: Record<string, unknown>;
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function normalizeText(value: unknown) {
  const text = String(value || "").trim().toLowerCase();
  return text || null;
}

function scrubContext(input: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => {
      if (BLOCKED_KEYS.has(key)) return false;
      if (value === undefined || value === null || value === "") return false;
      return true;
    }),
  );
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Payload;
    const surface = normalizeText(body.surface);
    const kind = normalizeText(body.kind);
    const category = normalizeText(body.category);
    const reason = normalizeText(body.reason);
    const outcome = normalizeText(body.outcome) || "error";
    const code = normalizeText(body.code);
    const hint = body.hint ? String(body.hint).trim() : null;
    const entityType = normalizeText(body.entityType);
    const entityId = body.entityId ? String(body.entityId) : null;
    const correlationId = body.correlationId ? String(body.correlationId) : null;
    const source = normalizeText(body.source) || "app_client";
    const guardDenied = body.guardDenied === true;
    const context = scrubContext(body.context || {});

    if (!surface || !kind || !category) {
      return json({ error: "surface, kind, and category are required" }, 400);
    }

    let accountId = body.accountId ? String(body.accountId) : null;

    if (!accountId && entityType && entityId) {
      const { data: resolvedAccountId } = await userClient.rpc(
        "resolve_security_denied_event_account_id",
        {
          p_account_id: null,
          p_entity_type: entityType,
          p_entity_id: entityId,
        },
      );
      accountId = resolvedAccountId || null;
    }

    if (accountId) {
      const { data: canRecord, error: canRecordError } = await userClient.rpc(
        "actor_can_record_security_denied_event",
        { p_account_id: accountId },
      );

      if (canRecordError || !canRecord) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    const rateLimit = await recordRateLimitAttempt(admin, {
      surface: "ingest-security-observability",
      accountId,
      actorUserId: user.id,
      windowSeconds: 60,
      maxAttempts: 120,
      metadata: {
        correlation_id: correlationId,
        limit_scope: "actor_account",
        event_surface: surface,
        event_kind: kind,
      },
    });
    if (!rateLimit.allowed) {
      return json(buildRateLimitBody(rateLimit), 429);
    }

    const { data: actorRole } = accountId
      ? await userClient.rpc("security_denied_event_actor_role", { p_account_id: accountId })
      : { data: "authenticated" };

    const { error: insertError } = await admin.from("security_observability_events").insert({
      account_id: accountId,
      actor_user_id: user.id,
      actor_role: actorRole || "authenticated",
      category,
      kind,
      surface,
      reason,
      outcome,
      code,
      guard_denied: guardDenied,
      entity_type: entityType,
      entity_id: entityId,
      correlation_id: correlationId,
      source,
      metadata: {
        hint,
        ...context,
      },
    });

    if (insertError) return json({ error: insertError.message }, 500);

    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
