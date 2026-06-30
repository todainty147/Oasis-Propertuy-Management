import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getCronAuthResult,
  recordScheduledFunctionEvent,
  serializeError,
} from "../_shared/scheduledObservability.ts";
import {
  performRegulatorySourceCheck,
  type RegulatorySourceCheckOutcome,
  type RegulatorySourceForCheck,
} from "../_shared/regulatorySourceCheck.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const REGULATORY_SOURCE_RUN_STALE_AFTER_MINUTES = clampInteger(
  Deno.env.get("REGULATORY_SOURCE_RUN_STALE_AFTER_MINUTES"),
  120,
  1,
  1440,
);

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type ScheduledRunStart = {
  run_id?: string;
  account_id?: string;
  status?: string;
  skipped?: boolean;
};

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 405 });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    if (!CRON_SECRET) {
      await recordScheduledFunctionEvent(admin, {
        surface: "check-regulatory-sources-scheduled",
        reason: "cron_secret_not_configured",
        code: "cron_secret_not_configured",
        correlationId: requestId,
      });
      return json({ ok: false, error: "CRON_SECRET is not configured" }, 500);
    }

    const auth = getCronAuthResult(req, CRON_SECRET);
    if (!auth.ok) {
      await recordScheduledFunctionEvent(admin, {
        surface: "check-regulatory-sources-scheduled",
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

    const sourcesResult = await admin.rpc("list_regulatory_sources_for_scheduled_check");
    if (sourcesResult.error) throw new Error(sourcesResult.error.message || "Could not list regulatory sources");

    const sources = (Array.isArray(sourcesResult.data) ? sourcesResult.data : []) as RegulatorySourceForCheck[];
    const sourcesByAccount = groupSourcesByAccount(sources);
    const accountRuns = [];

    for (const [accountId, accountSources] of sourcesByAccount.entries()) {
      const counters = emptyCounters();
      let runId = "";

      try {
        const runStart = await beginRun(accountId);
        if (runStart.skipped || runStart.status === "skipped") {
          accountRuns.push({
            accountId,
            runId: runStart.run_id || null,
            status: "skipped",
            ...counters,
          });
          continue;
        }

        runId = String(runStart.run_id || "");

        for (const source of accountSources) {
          const outcome = await performRegulatorySourceCheck({
            client: admin,
            source,
            resultRpc: "record_regulatory_source_scheduled_check_result",
            failureRpc: "record_regulatory_source_scheduled_check_failed",
            runId,
            triggerType: "scheduled",
          });
          applyOutcome(counters, outcome);
        }

        await completeRun(runId, counters);
        accountRuns.push({
          accountId,
          runId,
          status: "completed",
          ...counters,
        });
      } catch (error) {
        const serialized = serializeError(error);
        if (runId) {
          await failRun(runId, serialized.message);
        }
        accountRuns.push({
          accountId,
          runId: runId || null,
          status: "failed",
          error: serialized.message,
          ...counters,
        });
      }
    }

    await recordScheduledFunctionEvent(admin, {
      surface: "check-regulatory-sources-scheduled",
      reason: "scheduled_regulatory_source_check_completed",
      code: "scheduled_run_completed",
      kind: "workflow_signal",
      outcome: "recorded",
      correlationId: requestId,
      metadata: {
        account_runs: accountRuns.length,
        sources_seen: sources.length,
      },
    });

    return json({
      ok: true,
      triggerType: "scheduled",
      sourcesSeen: sources.length,
      accountRuns,
    });
  } catch (error) {
    const serialized = serializeError(error);
    await recordScheduledFunctionEvent(admin, {
      surface: "check-regulatory-sources-scheduled",
      reason: "unexpected_function_failure",
      code: serialized.name,
      correlationId: requestId,
      metadata: {
        error: serialized.message,
      },
    });
    return json(
      { ok: false, error: serialized.message || "Unknown regulatory source scheduled check error" },
      500,
    );
  }
});

async function beginRun(accountId: string): Promise<ScheduledRunStart> {
  const { data, error } = await admin.rpc("begin_regulatory_source_scheduled_run", {
    p_account_id: accountId,
    p_stale_after_minutes: REGULATORY_SOURCE_RUN_STALE_AFTER_MINUTES,
    p_demo_mode: true,
  });
  if (error) throw new Error(error.message || "Could not begin scheduled regulatory source run");
  return (data || {}) as ScheduledRunStart;
}

async function completeRun(runId: string, counters: ReturnType<typeof emptyCounters>) {
  const { error } = await admin.rpc("complete_regulatory_source_scheduled_run", {
    p_run_id: runId,
    p_sources_checked: counters.sourcesChecked,
    p_changes_detected: counters.changesDetected,
    p_candidates_created: counters.candidatesCreated,
    p_checks_failed: counters.checksFailed,
    p_demo_mode: true,
  });
  if (error) throw new Error(error.message || "Could not complete scheduled regulatory source run");
}

async function failRun(runId: string, errorSummary: string) {
  const { error } = await admin.rpc("fail_regulatory_source_scheduled_run", {
    p_run_id: runId,
    p_error_summary: errorSummary,
    p_demo_mode: true,
  });
  if (error) throw new Error(error.message || "Could not fail scheduled regulatory source run");
}

function groupSourcesByAccount(sources: RegulatorySourceForCheck[]) {
  const result = new Map<string, RegulatorySourceForCheck[]>();
  for (const source of sources) {
    const accountId = String(source.account_id || "").trim();
    if (!accountId) continue;
    const existing = result.get(accountId) || [];
    existing.push(source);
    result.set(accountId, existing);
  }
  return result;
}

function emptyCounters() {
  return {
    sourcesChecked: 0,
    changesDetected: 0,
    candidatesCreated: 0,
    checksFailed: 0,
  };
}

function applyOutcome(counters: ReturnType<typeof emptyCounters>, outcome: RegulatorySourceCheckOutcome) {
  counters.sourcesChecked += 1;
  if (outcome.status === "error") counters.checksFailed += 1;
  if (outcome.changed) counters.changesDetected += 1;
  if (outcome.candidateCreated) counters.candidatesCreated += 1;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(Math.trunc(next), max));
}
