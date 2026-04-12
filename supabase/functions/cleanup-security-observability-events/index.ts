import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getCronAuthResult,
  recordScheduledFunctionEvent,
  serializeError,
} from "../_shared/scheduledObservability.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CleanupBody = {
  dryRun?: boolean;
  retentionDays?: number;
  batchSize?: number;
  maxBatches?: number;
};

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    if (!CRON_SECRET) {
      await recordScheduledFunctionEvent(admin, {
        surface: "cleanup-security-observability-events",
        reason: "cron_secret_not_configured",
        code: "cron_secret_not_configured",
        correlationId: requestId,
      });
      return json({ ok: false, error: "CRON_SECRET is not configured" }, 500);
    }

    const auth = getCronAuthResult(req, CRON_SECRET);
    if (!auth.ok) {
      await recordScheduledFunctionEvent(admin, {
        surface: "cleanup-security-observability-events",
        reason: "unauthorized_cron_invocation",
        code: "unauthorized",
        outcome: "denied",
        correlationId: requestId,
        metadata: {
          auth_method: auth.method,
          method: req.method,
        },
      });
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = (await safeJson(req)) as CleanupBody;
    const dryRun = body?.dryRun === true;
    const retentionDays = clampInteger(body?.retentionDays, 90, 7, 3650);
    const batchSize = clampInteger(body?.batchSize, 5000, 100, 10000);
    const maxBatches = clampInteger(body?.maxBatches, 5, 1, 50);

    if (dryRun) {
      const { count, error } = await admin
        .from("security_observability_events")
        .select("id", { count: "exact", head: true })
        .lt("created_at", cutoffIso(retentionDays));
      if (error) throw error;

      const response = {
        ok: true,
        dryRun,
        retentionDays,
        batchSize,
        maxBatches,
        expiredRows: count || 0,
        deletedRows: 0,
      };

      if ((count || 0) > 0) {
        await recordScheduledFunctionEvent(admin, {
          surface: "cleanup-security-observability-events",
          reason: "expired_observability_rows_detected",
          code: "dry_run",
          kind: "workflow_signal",
          outcome: "recorded",
          correlationId: requestId,
          metadata: {
            retention_days: retentionDays,
            expired_rows: count || 0,
          },
        });
      }

      return json(response);
    }

    let deletedRows = 0;
    let batches = 0;

    for (let i = 0; i < maxBatches; i += 1) {
      const { data, error } = await admin.rpc("cleanup_security_observability_events", {
        p_retention_days: retentionDays,
        p_batch_size: batchSize,
      });
      if (error) throw error;

      const deletedThisBatch = Number(data || 0);
      deletedRows += deletedThisBatch;
      batches += 1;
      if (deletedThisBatch <= 0) break;
    }

    const response = {
      ok: true,
      dryRun,
      retentionDays,
      batchSize,
      maxBatches,
      batches,
      deletedRows,
    };

    if (deletedRows > 0) {
      await recordScheduledFunctionEvent(admin, {
        surface: "cleanup-security-observability-events",
        reason: "expired_observability_rows_cleaned",
        code: "cleanup_completed",
        kind: "workflow_signal",
        outcome: "recorded",
        correlationId: requestId,
        metadata: {
          retention_days: retentionDays,
          batches,
          deleted_rows: deletedRows,
        },
      });
    }

    return json(response);
  } catch (error) {
    const serialized = serializeError(error);
    await recordScheduledFunctionEvent(admin, {
      surface: "cleanup-security-observability-events",
      reason: "unexpected_function_failure",
      code: serialized.name,
      correlationId: requestId,
      metadata: {
        error: serialized.message,
      },
    });
    return json(
      { ok: false, error: serialized.message || "Unknown observability cleanup error" },
      500,
    );
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function safeJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(Math.trunc(next), max));
}

function cutoffIso(retentionDays: number) {
  return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}
