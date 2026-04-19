import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  buildJsonHeaders,
} from "../_shared/trustedOrigin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_APP_ORIGINS = Deno.env.get("ALLOWED_APP_ORIGINS") || "";
const EXPORT_BUCKET = "security-audit-exports";
const MAX_EXPORT_ROWS = 20000;
const PAGE_SIZE = 1000;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type ExportRequest = {
  jobId?: string;
};

type ExportJobRow = {
  id: string;
  account_id: string;
  requested_by_user_id: string | null;
  requested_label: string | null;
  format: string;
  status: string;
  filter_criteria: Record<string, unknown> | null;
  expires_at: string | null;
};

type AuditRow = {
  id: string;
  account_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

Deno.serve(async (req) => {
  const respond = (payload: unknown, status = 200) => json(req, payload, status);
  let jobId = "";

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(req, ALLOWED_APP_ORIGINS) });
  }

  try {
    if (req.method !== "POST") {
      return respond({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respond({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as ExportRequest;
    jobId = String(body?.jobId || "").trim();
    if (!jobId) {
      return respond({ error: "jobId is required" }, 400);
    }

    const { data, error: jobError } = await admin
      .from("security_audit_export_jobs")
      .select("id, account_id, requested_by_user_id, requested_label, format, status, filter_criteria, expires_at")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) {
      return respond({ error: jobError.message }, 400);
    }

    const job = data as ExportJobRow | null;

    if (!job) {
      return respond({ error: "Export job not found" }, 404);
    }

    const { error: accessError } = await userClient.rpc("assert_manage_account_access", {
      p_account_id: job.account_id,
    });

    if (accessError) {
      return respond({ error: accessError.message || "Access denied" }, 403);
    }

    if (job.status === "completed") {
      return respond({ ok: true, jobId: job.id, status: job.status });
    }

    await updateJob(job.id, {
      status: "running",
      started_at: new Date().toISOString(),
      completed_at: null,
      error_summary: null,
    });

    const filters = normalizeFilters(job.filter_criteria);
    const rows = await fetchAuditRows(job.account_id, filters);
    const csv = buildCsv(rows);
    const encoder = new TextEncoder();
    const csvBytes = encoder.encode(csv);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const labelPart = sanitizeFilePart(job.requested_label, "security-audit");
    const fileName = `${labelPart}-${timestamp}.csv`;
    const artifactPath = `account/${job.account_id}/security_audit_exports/${job.id}/${fileName}`;

    const { error: uploadError } = await admin.storage
      .from(EXPORT_BUCKET)
      .upload(artifactPath, csvBytes, {
        contentType: "text/csv;charset=utf-8",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    await updateJob(job.id, {
      status: "completed",
      artifact_bucket: EXPORT_BUCKET,
      artifact_path: artifactPath,
      row_count: rows.length,
      file_size_bytes: csvBytes.byteLength,
      completed_at: new Date().toISOString(),
      error_summary: null,
    });

    return respond({
      ok: true,
      jobId: job.id,
      status: "completed",
      rowCount: rows.length,
      artifactBucket: EXPORT_BUCKET,
      artifactPath,
    });
  } catch (error) {
    if (jobId) {
      try {
        await updateJob(jobId, {
          status: "failed",
          completed_at: new Date().toISOString(),
          error_summary: error instanceof Error ? error.message : "Unknown export error",
        });
      } catch {
        // Best effort only.
      }
    }

    return respond(
      { error: error instanceof Error ? error.message : "Unknown export error" },
      500,
    );
  }
});

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: buildJsonHeaders(req, ALLOWED_APP_ORIGINS),
  });
}

async function updateJob(jobId: string, patch: Record<string, unknown>) {
  const { error } = await admin
    .from("security_audit_export_jobs")
    .update(patch)
    .eq("id", jobId);

  if (error) throw error;
}

function normalizeFilters(input: Record<string, unknown> | null) {
  const raw = input && typeof input === "object" ? input : {};
  return {
    dateFrom: normalizeText(raw.dateFrom),
    dateTo: normalizeText(raw.dateTo),
    action: normalizeText(raw.action),
    actorUserId: normalizeText(raw.actorUserId),
    entityType: normalizeText(raw.entityType),
    entityId: normalizeText(raw.entityId),
  };
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function sanitizeFilePart(value: unknown, fallback: string) {
  const next = String(value || fallback)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return next || fallback;
}

function normalizeDateStart(value: string) {
  return value ? `${value}T00:00:00.000Z` : "";
}

function normalizeDateEnd(value: string) {
  return value ? `${value}T23:59:59.999Z` : "";
}

async function fetchAuditRows(accountId: string, filters: ReturnType<typeof normalizeFilters>) {
  const rows: AuditRow[] = [];
  let from = 0;

  while (rows.length < MAX_EXPORT_ROWS) {
    const to = Math.min(from + PAGE_SIZE - 1, MAX_EXPORT_ROWS - 1);
    let query = admin
      .from("security_audit_ledger")
      .select("id, account_id, actor_user_id, action, entity_type, entity_id, metadata, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filters.dateFrom) query = query.gte("created_at", normalizeDateStart(filters.dateFrom));
    if (filters.dateTo) query = query.lte("created_at", normalizeDateEnd(filters.dateTo));
    if (filters.action) query = query.eq("action", filters.action);
    if (filters.actorUserId) query = query.eq("actor_user_id", filters.actorUserId);
    if (filters.entityType) query = query.eq("entity_type", filters.entityType);
    if (filters.entityId) query = query.eq("entity_id", filters.entityId);

    const { data, error } = await query.returns<AuditRow[]>();
    if (error) throw error;

    const batch = data || [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function csvEscape(value: unknown) {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows: AuditRow[]) {
  const header = [
    "created_at",
    "account_id",
    "action",
    "actor_user_id",
    "entity_type",
    "entity_id",
    "metadata",
  ];

  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.created_at,
        row.account_id,
        row.action,
        row.actor_user_id || "",
        row.entity_type || "",
        row.entity_id || "",
        row.metadata || {},
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];

  return `${lines.join("\n")}\n`;
}
