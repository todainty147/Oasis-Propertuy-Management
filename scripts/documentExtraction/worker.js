"use strict";

// ── OASIS Document Extraction Worker ─────────────────────────────────────────
//
// Polls document_extraction_runs for queued jobs and runs the extraction
// pipeline. Writes results to document_extractions and audit log.
//
// Environment variables required:
//   SUPABASE_URL          — Supabase project URL
//   SUPABASE_SERVICE_KEY  — Supabase service_role key (bypasses RLS)
//
// Optional:
//   OCR_FALLBACK_ENABLED  — 'true' to enable OCRmyPDF fallback
//   WORKER_POLL_INTERVAL  — poll interval in ms (default: 5000)
//   WORKER_MAX_ATTEMPTS   — max retry attempts per job (default: 3)
//
// Usage:
//   node worker.js            # continuous poll loop
//   node worker.js --once     # process one batch then exit
//
// Security:
//   • This worker uses the service_role key — it runs server-side only.
//   • Never expose SUPABASE_SERVICE_KEY to the browser or commit it to source.
//   • The service_role key bypasses RLS; the worker is responsible for ensuring
//     it only reads/writes rows it is authorised to process.
// =============================================================================

const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");
const { computeSourceHash } = require("./sourceHash");
const { routeExtraction } = require("./extractors/router");

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const POLL_INTERVAL        = parseInt(process.env.WORKER_POLL_INTERVAL || "5000", 10);
const MAX_ATTEMPTS         = parseInt(process.env.WORKER_MAX_ATTEMPTS  || "3",    10);
const RUN_ONCE             = process.argv.includes("--once");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "[worker] FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required.\n" +
    "         Copy .env.example to .env and fill in your Supabase credentials."
  );
  process.exit(1);
}

// Service-role client — bypasses RLS.  Never expose this key to the browser.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});

// ── Main poll loop ─────────────────────────────────────────────────────────────

async function main() {
  console.log("[worker] OASIS document extraction worker starting.");
  console.log(`[worker] Poll interval: ${POLL_INTERVAL}ms | Max attempts: ${MAX_ATTEMPTS} | Run once: ${RUN_ONCE}`);

  do {
    try {
      await processNextBatch();
    } catch (err) {
      console.error("[worker] Unexpected error in processNextBatch:", err.message);
    }

    if (!RUN_ONCE) {
      await sleep(POLL_INTERVAL);
    }
  } while (!RUN_ONCE);

  console.log("[worker] Finished.");
}

async function processNextBatch() {
  // Fetch up to 5 queued jobs, ordered by creation time (FIFO).
  const { data: jobs, error } = await supabase
    .from("document_extraction_runs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) {
    console.error("[worker] Failed to fetch queued jobs:", error.message);
    return;
  }

  if (!jobs || jobs.length === 0) {
    return; // nothing to do
  }

  console.log(`[worker] Found ${jobs.length} queued job(s).`);

  for (const job of jobs) {
    await processJob(job);
  }
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processJob(run) {
  const runId      = run.id;
  const documentId = run.document_id;
  const accountId  = run.account_id;
  const extractor  = run.extractor || "auto";

  // Optimistic claim: update status to 'processing' only if still 'queued'.
  // Prevents two workers from processing the same job concurrently.
  const { data: claimed, error: claimError } = await supabase
    .from("document_extraction_runs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "queued")
    .select()
    .single();

  if (claimError || !claimed) {
    // Another worker claimed this job first — skip silently.
    return;
  }

  console.log(`[worker] Processing run ${runId} | doc=${documentId} | extractor=${extractor}`);

  // Write extraction_started audit event
  await writeAuditEvent(accountId, documentId, "extraction_started", {
    run_id:    runId,
    extractor,
  }, {
    actorUserId: run.created_by,
  });

  let fileBuffer;
  let doc;

  try {
    // Fetch document metadata
    const { data: docRow, error: docError } = await supabase
      .from("documents")
      .select("id, account_id, storage_path, mime_type, property_id, tenant_id, upload_status")
      .eq("id", documentId)
      .eq("account_id", accountId)
      .single();

    if (docError || !docRow) {
      throw new Error(`Document not found: ${documentId}`);
    }

    if (docRow.upload_status !== "uploaded") {
      throw new Error(`Document ${documentId} is not in 'uploaded' status (current: ${docRow.upload_status})`);
    }

    doc = docRow;

    // Download file from Supabase Storage (service_role bypasses signed URL requirement)
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("documents")
      .download(doc.storage_path);

    if (downloadError || !fileData) {
      throw new Error(`Storage download failed for ${doc.storage_path}: ${downloadError?.message || "no data"}`);
    }

    // Convert Blob to Buffer (Node.js environment)
    const arrayBuffer = await fileData.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);

  } catch (setupErr) {
    await failRun(runId, setupErr.message);
    await writeAuditEvent(accountId, documentId, "extraction_failed", {
      run_id: runId, error: setupErr.message,
    }, {
      actorUserId: run.created_by,
      propertyId: doc?.property_id,
      tenantId: doc?.tenant_id,
    });
    return;
  }

  // Compute source hash
  const sourceHash = computeSourceHash(fileBuffer);
  const languageHint = run.metadata?.language_hint || null;

  // Run extraction router
  let routeResult;
  try {
    routeResult = await routeExtraction(fileBuffer, doc.mime_type, extractor, languageHint);
  } catch (extractErr) {
    await failRun(runId, extractErr.message, { source_hash: sourceHash });
    await writeAuditEvent(accountId, documentId, "extraction_failed", {
      run_id: runId, error: extractErr.message,
    }, {
      actorUserId: run.created_by,
      propertyId: doc.property_id,
      tenantId: doc.tenant_id,
    });
    return;
  }

  // Unsupported MIME type
  if (routeResult.unsupported) {
    await skipRun(runId, routeResult.unsupported_reason, { source_hash: sourceHash });
    return;
  }

  // Extractor-level error (e.g. corrupt PDF where native_pdf threw internally).
  // _routePdf catches the throw and returns { error } rather than propagating it
  // so the router can still return a result object. We treat this as a failure.
  if (routeResult.error) {
    await failRun(runId, routeResult.error, { source_hash: sourceHash });
    await writeAuditEvent(accountId, documentId, "extraction_failed", {
      run_id: runId, error: routeResult.error,
    }, {
      actorUserId: run.created_by,
      propertyId: doc.property_id,
      tenantId: doc.tenant_id,
    });
    return;
  }

  const {
    extractor_used,
    text,
    markdown,
    page_count,
    quality,
    structured_payload = {},
  } = routeResult;

  // Upsert document_extractions row.
  // ON CONFLICT (account_id, document_id, extractor, source_hash) DO UPDATE
  // means a re-run with the same file updates the existing row rather than
  // inserting a duplicate.
  const now = new Date().toISOString();
  const { data: extractionRow, error: upsertError } = await supabase
    .from("document_extractions")
    .upsert({
      account_id:         accountId,
      document_id:        documentId,
      extractor:          extractor_used,
      language_hint:      languageHint,
      status:             "completed",
      text_content:       text || null,
      markdown_content:   markdown || null,
      structured_payload: {
        ...structured_payload,
        quality_flag:     quality?.quality_flag,
        confidence_notes: quality?.notes,
      },
      confidence_score:   quality?.confidence_score ?? null,
      source_hash:        sourceHash,
      page_count:         page_count ?? null,
      character_count:    text ? text.length : 0,
      error_message:      null,
      completed_at:       now,
      updated_at:         now,
    }, {
      onConflict: "account_id,document_id,extractor,source_hash",
    })
    .select()
    .single();

  if (upsertError) {
    await failRun(runId, `Upsert failed: ${upsertError.message}`, { source_hash: sourceHash });
    await writeAuditEvent(accountId, documentId, "extraction_failed", {
      run_id: runId, error: upsertError.message,
    }, {
      actorUserId: run.created_by,
      propertyId: doc.property_id,
      tenantId: doc.tenant_id,
    });
    return;
  }

  // Mark run as completed and link to the extraction row.
  await supabase
    .from("document_extraction_runs")
    .update({
      status:        "completed",
      extraction_id: extractionRow.id,
      completed_at:  now,
      metadata: {
        ...(run.metadata || {}),
        source_hash:          sourceHash,
        actual_extractor_used: extractor_used,
        quality_flag:         quality?.quality_flag,
        character_count:      text ? text.length : 0,
        page_count:           page_count ?? null,
      },
    })
    .eq("id", runId);

  await writeAuditEvent(accountId, documentId, "extraction_completed", {
    run_id:        runId,
    extraction_id: extractionRow.id,
    extractor_used,
    quality_flag:  quality?.quality_flag,
    character_count: text ? text.length : 0,
  }, {
    actorUserId: run.created_by,
    propertyId: doc.property_id,
    tenantId: doc.tenant_id,
  });

  console.log(`[worker] ✓ Run ${runId} completed | extractor=${extractor_used} | quality=${quality?.quality_flag} | chars=${text?.length ?? 0}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function failRun(runId, errorMessage, extraMeta = {}) {
  console.error(`[worker] ✗ Run ${runId} failed: ${errorMessage}`);
  await supabase
    .from("document_extraction_runs")
    .update({
      status:        "failed",
      completed_at:  new Date().toISOString(),
      error_message: errorMessage,
      metadata: extraMeta,
    })
    .eq("id", runId);
}

async function skipRun(runId, reason, extraMeta = {}) {
  console.warn(`[worker] ~ Run ${runId} skipped: ${reason}`);
  await supabase
    .from("document_extraction_runs")
    .update({
      status:        "skipped",
      completed_at:  new Date().toISOString(),
      error_message: reason,
      metadata: extraMeta,
    })
    .eq("id", runId);
}

async function writeAuditEvent(accountId, documentId, action, metadata = {}, options = {}) {
  const actorUserId = options.actorUserId || null;

  if (!actorUserId) {
    console.warn(`[worker] Audit event '${action}' skipped: missing created_by actor for document_extraction_runs row.`);
    return;
  }

  // The service_role key bypasses RLS including the 'no_write' policy on
  // document_audit_log, so this insert goes through unconditionally.
  // This is the only safe path for server-side audit writes.
  const { error } = await supabase
    .from("document_audit_log")
    .insert({
      document_id:  documentId,
      account_id:   accountId,
      action,
      performed_by: actorUserId,
      performed_at: new Date().toISOString(),
      property_id:   options.propertyId || null,
      tenant_id:     options.tenantId || null,
      created_at:   new Date().toISOString(),
    });

  if (error) {
    // Audit failure is non-fatal; log and continue.
    console.warn(`[worker] Audit event '${action}' failed: ${error.message}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
