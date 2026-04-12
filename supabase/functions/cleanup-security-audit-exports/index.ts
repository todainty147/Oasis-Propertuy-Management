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
};

type ExportJobRow = {
  id: string;
  artifact_bucket: string | null;
  artifact_path: string | null;
  status: string;
};

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (!CRON_SECRET) {
      await recordScheduledFunctionEvent(admin, {
        surface: "cleanup-security-audit-exports",
        reason: "cron_secret_not_configured",
        code: "cron_secret_not_configured",
        correlationId: requestId,
      });
      return json({ error: "CRON_SECRET is not configured" }, 500);
    }

    const auth = getCronAuthResult(req, CRON_SECRET);
    if (!auth.ok) {
      await recordScheduledFunctionEvent(admin, {
        surface: "cleanup-security-audit-exports",
        reason: "unauthorized_cron_invocation",
        code: "unauthorized",
        outcome: "denied",
        correlationId: requestId,
        metadata: {
          auth_method: auth.method,
          method: req.method,
        },
      });
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await safeJson(req)) as CleanupBody;
    const dryRun = body?.dryRun === true;

    const { data, error } = await admin
      .from("security_audit_export_jobs")
      .select("id, artifact_bucket, artifact_path, status")
      .lt("expires_at", new Date().toISOString())
      .neq("status", "expired");

    if (error) throw error;

    const jobs = (data || []) as ExportJobRow[];

    const removableByBucket = new Map<string, string[]>();
    for (const job of jobs) {
      const bucket = String(job.artifact_bucket || "").trim();
      const path = String(job.artifact_path || "").trim();
      if (!bucket || !path) continue;
      if (!removableByBucket.has(bucket)) removableByBucket.set(bucket, []);
      removableByBucket.get(bucket)?.push(path);
    }

    const removed: Record<string, string[]> = {};
    if (!dryRun) {
      for (const [bucket, paths] of removableByBucket.entries()) {
        const { error: removeError } = await admin.storage.from(bucket).remove(paths);
        if (removeError) throw removeError;
        removed[bucket] = paths;
      }

      if (jobs.length > 0) {
        const { error: updateError } = await admin
          .from("security_audit_export_jobs")
          .update({
            status: "expired",
            expired_at: new Date().toISOString(),
          })
          .lt("expires_at", new Date().toISOString())
          .neq("status", "expired");

        if (updateError) throw updateError;
      }
    }

    const response = {
      ok: true,
      dryRun,
      expiredJobs: jobs.length,
      removableBuckets: Object.fromEntries(
        Array.from(removableByBucket.entries()).map(([bucket, paths]) => [bucket, paths.length]),
      ),
      removed,
    };

    if (jobs.length > 0) {
      await recordScheduledFunctionEvent(admin, {
        surface: "cleanup-security-audit-exports",
        reason: dryRun ? "expired_exports_detected" : "expired_exports_cleaned",
        code: dryRun ? "dry_run" : "cleanup_completed",
        kind: "workflow_signal",
        outcome: "recorded",
        correlationId: requestId,
        metadata: {
          dry_run: dryRun,
          expired_jobs: jobs.length,
          bucket_count: removableByBucket.size,
        },
      });
    }

    return json(response);
  } catch (error) {
    const serialized = serializeError(error);
    await recordScheduledFunctionEvent(admin, {
      surface: "cleanup-security-audit-exports",
      reason: "unexpected_function_failure",
      code: serialized.name,
      correlationId: requestId,
      metadata: {
        error: serialized.message,
      },
    });
    return json(
      { error: serialized.message || "Unknown cleanup error" },
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
