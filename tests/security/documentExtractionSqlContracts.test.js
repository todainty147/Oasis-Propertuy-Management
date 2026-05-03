import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

const extractionSql    = read("supabase/document_extraction_foundation.sql");
const entitlementsSql  = read("supabase/account_entitlements.sql");
const rpcContracts     = read("src/services/rpcContracts.js");
const extractionSvc    = read("src/services/documentExtractionService.js");
const documentsPage    = read("src/pages/Documents.jsx");
const extractionPanel  = read("src/components/DocumentExtractionPanel.jsx");
const workerJs         = read("scripts/documentExtraction/worker.js");
const routerJs         = read("scripts/documentExtraction/extractors/router.js");
const nativePdfJs      = read("scripts/documentExtraction/extractors/nativePdf.js");
const ocrFallbackJs    = read("scripts/documentExtraction/extractors/ocrFallback.js");
const qualityJs        = read("scripts/documentExtraction/qualityEvaluator.js");
const sourceHashJs     = read("scripts/documentExtraction/sourceHash.js");


// ─── SQL: document_extractions table ─────────────────────────────────────────

describe("SQL: document_extractions table", () => {
  it("creates document_extractions table", () => {
    expect(extractionSql).toContain("create table if not exists public.document_extractions");
  });

  it("has account_id and document_id FK columns", () => {
    expect(extractionSql).toContain("account_id");
    expect(extractionSql).toContain("document_id");
    expect(extractionSql).toContain("references public.accounts(id)");
    expect(extractionSql).toContain("references public.documents(id)");
  });

  it("has extractor check constraint listing all valid extractors", () => {
    const idx = extractionSql.indexOf("create table if not exists public.document_extractions");
    const snippet = extractionSql.slice(idx, idx + 800);
    expect(snippet).toContain("native_pdf");
    expect(snippet).toContain("ocrmypdf_tesseract");
    expect(snippet).toContain("olmocr");
    expect(snippet).toContain("manual");
  });

  it("has status check constraint", () => {
    const idx = extractionSql.indexOf("create table if not exists public.document_extractions");
    const snippet = extractionSql.slice(idx, idx + 1000);
    expect(snippet).toContain("pending");
    expect(snippet).toContain("completed");
    expect(snippet).toContain("failed");
    expect(snippet).toContain("stale");
  });

  it("has source_hash not null", () => {
    // Find source_hash in the column definition (not comments)
    const colIdx = extractionSql.indexOf("  source_hash        text");
    expect(colIdx).toBeGreaterThan(-1);
    const snippet = extractionSql.slice(colIdx, colIdx + 80);
    expect(snippet).toContain("not null");
  });

  it("has unique constraint on (account_id, document_id, extractor, source_hash)", () => {
    expect(extractionSql).toContain("unique (account_id, document_id, extractor, source_hash)");
  });

  it("has text_content and markdown_content columns", () => {
    expect(extractionSql).toContain("text_content");
    expect(extractionSql).toContain("markdown_content");
  });

  it("has structured_payload jsonb column", () => {
    expect(extractionSql).toContain("structured_payload");
    expect(extractionSql).toContain("jsonb");
  });

  it("has confidence_score, page_count, character_count columns", () => {
    expect(extractionSql).toContain("confidence_score");
    expect(extractionSql).toContain("page_count");
    expect(extractionSql).toContain("character_count");
  });
});

// ─── SQL: document_extraction_runs table ─────────────────────────────────────

describe("SQL: document_extraction_runs table", () => {
  it("creates document_extraction_runs table", () => {
    expect(extractionSql).toContain("create table if not exists public.document_extraction_runs");
  });

  it("has status check constraint with queued, processing, completed, failed, skipped", () => {
    const idx = extractionSql.indexOf("create table if not exists public.document_extraction_runs");
    const snippet = extractionSql.slice(idx, idx + 600);
    ["queued", "processing", "completed", "failed", "skipped"].forEach((s) => {
      expect(snippet).toContain(s);
    });
  });

  it("links to document_extractions via extraction_id", () => {
    expect(extractionSql).toContain("extraction_id");
    expect(extractionSql).toContain("references public.document_extractions(id)");
  });

  it("has metadata jsonb column", () => {
    const idx = extractionSql.indexOf("create table if not exists public.document_extraction_runs");
    const snippet = extractionSql.slice(idx, idx + 900);
    expect(snippet).toContain("metadata");
    expect(snippet).toContain("jsonb");
  });
});

// ─── SQL: RLS policies ────────────────────────────────────────────────────────

describe("SQL: RLS policies", () => {
  it("enables RLS on document_extractions", () => {
    expect(extractionSql).toContain("alter table public.document_extractions enable row level security");
  });

  it("enables RLS on document_extraction_runs", () => {
    expect(extractionSql).toContain("alter table public.document_extraction_runs enable row level security");
  });

  it("select policy uses user_can_manage_account (owner/admin/staff only)", () => {
    expect(extractionSql).toContain("user_can_manage_account(account_id)");
  });

  it("blocks direct writes via no_direct_write policy on document_extractions", () => {
    expect(extractionSql).toContain("document_extractions_no_direct_write");
    // Find the create policy statement (not the drop)
    const createIdx = extractionSql.indexOf("create policy document_extractions_no_direct_write");
    expect(createIdx).toBeGreaterThan(-1);
    const snippet = extractionSql.slice(createIdx, createIdx + 300);
    expect(snippet).toContain("using (false)");
    expect(snippet).toContain("with check (false)");
  });

  it("blocks direct writes via no_direct_write policy on document_extraction_runs", () => {
    expect(extractionSql).toContain("document_extraction_runs_no_direct_write");
  });

  it("revokes insert, update, delete on document_extractions from authenticated", () => {
    expect(extractionSql).toContain("revoke insert, update, delete on public.document_extractions from authenticated");
  });

  it("grants only select on document_extractions to authenticated", () => {
    expect(extractionSql).toContain("grant select on public.document_extractions to authenticated");
  });
});

// ─── SQL: RPCs ────────────────────────────────────────────────────────────────

describe("SQL: RPCs — request_document_extraction", () => {
  it("is defined as security definer", () => {
    const idx = extractionSql.indexOf("create or replace function public.request_document_extraction");
    const snippet = extractionSql.slice(idx, idx + 600);
    expect(snippet).toContain("security definer");
    expect(snippet).toContain("set search_path = public");
  });

  it("calls assert_manage_account_access", () => {
    const idx = extractionSql.indexOf("create or replace function public.request_document_extraction");
    const snippet = extractionSql.slice(idx, idx + 800);
    expect(snippet).toContain("assert_manage_account_access");
  });

  it("calls assert_account_feature_access for document_extraction", () => {
    const idx = extractionSql.indexOf("create or replace function public.request_document_extraction");
    const snippet = extractionSql.slice(idx, idx + 800);
    expect(snippet).toContain("assert_account_feature_access");
    expect(snippet).toContain("document_extraction");
  });

  it("inserts audit event extraction_requested", () => {
    const idx = extractionSql.indexOf("create or replace function public.request_document_extraction");
    const snippet = extractionSql.slice(idx, idx + 1800);
    expect(snippet).toContain("extraction_requested");
    expect(snippet).toContain("document_audit_log");
  });

  it("is revoked from public and granted to authenticated", () => {
    expect(extractionSql).toContain("revoke all on function public.request_document_extraction");
    expect(extractionSql).toContain("grant execute on function public.request_document_extraction");
    expect(extractionSql).toContain("to authenticated");
  });
});

describe("SQL: RPCs — get_document_extraction", () => {
  it("is defined", () => {
    expect(extractionSql).toContain("create or replace function public.get_document_extraction");
  });

  it("returns setof document_extractions", () => {
    const idx = extractionSql.indexOf("create or replace function public.get_document_extraction");
    const snippet = extractionSql.slice(idx, idx + 300);
    expect(snippet).toContain("returns setof public.document_extractions");
  });

  it("is marked stable (no audit side-effects on poll)", () => {
    const idx = extractionSql.indexOf("create or replace function public.get_document_extraction");
    const snippet = extractionSql.slice(idx, idx + 400);
    expect(snippet).toContain("stable");
  });

  it("does NOT insert into document_audit_log directly (no poll noise)", () => {
    const idx = extractionSql.indexOf("create or replace function public.get_document_extraction");
    // Only look at this function's body — stop before the next function definition
    const nextFnIdx = extractionSql.indexOf("create or replace function", idx + 50);
    const body = extractionSql.slice(idx, nextFnIdx);
    expect(body).not.toContain("insert into public.document_audit_log");
  });

  it("orders by status priority (completed first)", () => {
    const idx = extractionSql.indexOf("create or replace function public.get_document_extraction");
    const snippet = extractionSql.slice(idx, idx + 1800);
    expect(snippet).toContain("completed");
    expect(snippet).toContain("order by");
    expect(snippet).toContain("limit 1");
  });
});

describe("SQL: RPCs — log_document_extraction_viewed", () => {
  it("is defined as a separate RPC", () => {
    expect(extractionSql).toContain("create or replace function public.log_document_extraction_viewed");
  });

  it("inserts extraction_viewed into document_audit_log", () => {
    const idx = extractionSql.indexOf("create or replace function public.log_document_extraction_viewed");
    const snippet = extractionSql.slice(idx, idx + 800);
    expect(snippet).toContain("extraction_viewed");
    expect(snippet).toContain("document_audit_log");
  });

  it("is security definer", () => {
    const idx = extractionSql.indexOf("create or replace function public.log_document_extraction_viewed");
    const snippet = extractionSql.slice(idx, idx + 300);
    expect(snippet).toContain("security definer");
  });

  it("is revoked from public and granted to authenticated", () => {
    expect(extractionSql).toContain("revoke all on function public.log_document_extraction_viewed");
    expect(extractionSql).toContain("grant execute on function public.log_document_extraction_viewed");
  });
});

describe("SQL: RPCs — mark_document_extraction_stale", () => {
  it("is defined", () => {
    expect(extractionSql).toContain("create or replace function public.mark_document_extraction_stale");
  });

  it("logs extraction_marked_stale audit event", () => {
    const idx = extractionSql.indexOf("create or replace function public.mark_document_extraction_stale");
    const snippet = extractionSql.slice(idx, idx + 1200);
    expect(snippet).toContain("extraction_marked_stale");
  });

  it("updates status to stale", () => {
    const idx = extractionSql.indexOf("create or replace function public.mark_document_extraction_stale");
    const snippet = extractionSql.slice(idx, idx + 1800);
    // SQL uses "set status     = 'stale'" with alignment spaces
    expect(snippet).toContain("'stale'");
    expect(snippet).toContain("update public.document_extractions");
  });
});

// ─── SQL: audit log constraint extension ─────────────────────────────────────

describe("SQL: document_audit_log constraint extension", () => {
  it("drops existing action check constraint idempotently", () => {
    expect(extractionSql).toContain("drop constraint if exists document_audit_log_action_check");
  });

  it("re-adds constraint including extraction actions", () => {
    const idx = extractionSql.indexOf("add constraint document_audit_log_action_check");
    const snippet = extractionSql.slice(idx, idx + 400);
    expect(snippet).toContain("extraction_requested");
    expect(snippet).toContain("extraction_started");
    expect(snippet).toContain("extraction_completed");
    expect(snippet).toContain("extraction_failed");
    expect(snippet).toContain("extraction_viewed");
    expect(snippet).toContain("extraction_marked_stale");
  });

  it("preserves original actions in constraint", () => {
    const idx = extractionSql.indexOf("add constraint document_audit_log_action_check");
    const snippet = extractionSql.slice(idx, idx + 400);
    expect(snippet).toContain("'upload'");
    expect(snippet).toContain("'delete'");
    expect(snippet).toContain("'update_tags'");
  });
});

// ─── SQL: updated_at trigger ──────────────────────────────────────────────────

describe("SQL: updated_at trigger", () => {
  it("creates trigger on document_extractions", () => {
    expect(extractionSql).toContain("trg_document_extractions_updated_at");
    expect(extractionSql).toContain("tg_set_updated_at()");
  });

  it("uses drop trigger if exists for idempotency", () => {
    expect(extractionSql).toContain("drop trigger if exists trg_document_extractions_updated_at");
  });
});

// ─── account_entitlements: feature key ───────────────────────────────────────

describe("account_entitlements: document_extraction feature key", () => {
  it("defines document_extraction at growth tier", () => {
    expect(entitlementsSql).toContain("'document_extraction'");
    expect(entitlementsSql).toContain("document_extraction");
    const idx = entitlementsSql.indexOf("document_extraction");
    const snippet = entitlementsSql.slice(idx, idx + 80);
    expect(snippet).toContain("growth");
  });
});

// ─── rpcContracts: parsers ────────────────────────────────────────────────────

describe("rpcContracts: parseDocumentExtractionRow", () => {
  it("is exported", () => {
    expect(rpcContracts).toContain("export function parseDocumentExtractionRow");
  });

  it("parses extraction-specific fields", () => {
    const idx = rpcContracts.indexOf("export function parseDocumentExtractionRow");
    const snippet = rpcContracts.slice(idx, idx + 1300);
    [
      "extractor", "status", "text_content", "markdown_content",
      "confidence_score", "source_hash", "page_count", "character_count",
      "structured_payload", "completed_at",
    ].forEach((f) => {
      expect(snippet).toContain(f);
    });
  });
});

describe("rpcContracts: parseDocumentExtractionRunRow", () => {
  it("is exported", () => {
    expect(rpcContracts).toContain("export function parseDocumentExtractionRunRow");
  });

  it("parses run-specific fields", () => {
    const idx = rpcContracts.indexOf("export function parseDocumentExtractionRunRow");
    const snippet = rpcContracts.slice(idx, idx + 700);
    ["extraction_id", "extractor", "status", "started_at", "metadata"].forEach((f) => {
      expect(snippet).toContain(f);
    });
  });
});

// ─── documentExtractionService: structure ────────────────────────────────────

describe("documentExtractionService: structure", () => {
  const EXPORTS = [
    "requestDocumentExtraction",
    "getDocumentExtraction",
    "listDocumentExtractions",
    "listDocumentExtractionRuns",
    "markDocumentExtractionStale",
    "getBestDocumentExtractionForAudit",
    "logDocumentExtractionViewed",
  ];
  for (const fn of EXPORTS) {
    it(`exports ${fn}`, () => {
      expect(extractionSvc).toContain(fn);
    });
  }

  it("logDocumentExtractionViewed calls log_document_extraction_viewed RPC", () => {
    expect(extractionSvc).toContain("log_document_extraction_viewed");
    expect(extractionSvc).toContain("p_account_id");
    expect(extractionSvc).toContain("p_document_id");
  });

  it("uses PGRST202 fallback for getDocumentExtraction", () => {
    expect(extractionSvc).toContain('error.code === "PGRST202"');
    expect(extractionSvc).toContain("_getDocumentExtractionDirect");
  });

  it("uses PGRST202 fallback for listDocumentExtractions", () => {
    expect(extractionSvc).toContain("_listDocumentExtractionsDirect");
  });

  it("uses PGRST202 fallback for listDocumentExtractionRuns", () => {
    expect(extractionSvc).toContain("_listDocumentExtractionRunsDirect");
  });

  it("getBestDocumentExtractionForAudit returns extraction_required when null", () => {
    expect(extractionSvc).toContain('"extraction_required"');
  });

  it("getBestDocumentExtractionForAudit returns ready for completed", () => {
    expect(extractionSvc).toContain('"ready"');
  });

  it("getBestDocumentExtractionForAudit returns advanced_extraction_recommended for low quality", () => {
    expect(extractionSvc).toContain('"advanced_extraction_recommended"');
  });
});

// ─── DocumentExtractionPanel: security ───────────────────────────────────────

describe("DocumentExtractionPanel: security", () => {
  it("panel only renders for non-tenant roles (Documents.jsx gating)", () => {
    expect(documentsPage).toContain("!isTenant && canUploadDocument");
    expect(documentsPage).toContain("DocumentExtractionPanel");
  });

  it("panel component has testid for extraction panel", () => {
    expect(extractionPanel).toContain('data-testid="document-extraction-panel"');
  });

  it("panel has request extraction button testid", () => {
    expect(extractionPanel).toContain('data-testid="request-extraction-button"');
  });

  it("panel has view extracted text button testid", () => {
    expect(extractionPanel).toContain('data-testid="view-extracted-text-button"');
  });

  it("panel shows error message with testid", () => {
    expect(extractionPanel).toContain('data-testid="extraction-error-message"');
  });

  it("panel includes disclaimer text about extraction accuracy", () => {
    expect(extractionPanel).toContain("Extracted text may contain errors");
  });

  it("audit log is called only on preview open, not on every toggle", () => {
    // logDocumentExtractionViewed must be called only when nextShow is true
    expect(extractionPanel).toContain("logDocumentExtractionViewed");
    expect(extractionPanel).toContain("if (nextShow)");
  });

  it("audit call is fire-and-forget and cannot block the UI", () => {
    expect(extractionPanel).toContain(".catch(() => {})");
  });
});

// ─── Worker: security and design ─────────────────────────────────────────────

describe("Worker: security contracts", () => {
  it("requires SUPABASE_URL and SUPABASE_SERVICE_KEY env vars", () => {
    expect(workerJs).toContain("SUPABASE_URL");
    expect(workerJs).toContain("SUPABASE_SERVICE_KEY");
  });

  it("explicitly comments that service_role key must not be in browser", () => {
    expect(workerJs).toContain("service_role");
    expect(workerJs).toContain("Never expose");
  });

  it("uses optimistic claim pattern to avoid duplicate processing", () => {
    expect(workerJs).toContain(".eq(\"status\", \"queued\")");
    expect(workerJs).toContain("status: \"processing\"");
  });

  it("writes audit events for extraction lifecycle", () => {
    expect(workerJs).toContain("extraction_started");
    expect(workerJs).toContain("extraction_completed");
    expect(workerJs).toContain("extraction_failed");
    expect(workerJs).toContain("writeAuditEvent");
  });

  it("uses computeSourceHash for document fingerprinting", () => {
    expect(workerJs).toContain("computeSourceHash");
  });

  it("handles routeResult.error (native PDF extractor failure) as a failRun", () => {
    expect(workerJs).toContain("routeResult.error");
    expect(workerJs).toContain("failRun");
  });

  it("failRun and skipRun signatures do not carry unused accountId/documentId params", () => {
    // Correct signature: failRun(runId, errorMessage, extraMeta)
    const failIdx = workerJs.indexOf("async function failRun(");
    const failSig = workerJs.slice(failIdx, failIdx + 60);
    expect(failSig).not.toContain("accountId");
    expect(failSig).not.toContain("documentId");

    const skipIdx = workerJs.indexOf("async function skipRun(");
    const skipSig = workerJs.slice(skipIdx, skipIdx + 60);
    expect(skipSig).not.toContain("accountId");
    expect(skipSig).not.toContain("documentId");
  });
});

// ─── Extractor router: design ─────────────────────────────────────────────────

describe("Extractor router: tiered design", () => {
  it("tries native_pdf before OCR", () => {
    expect(routerJs).toContain("_routePdf");
    expect(routerJs).toContain("native_pdf");
    expect(routerJs).toContain("ocrmypdf_tesseract");
  });

  it("falls back to OCR when native quality is poor", () => {
    expect(routerJs).toContain("isQualityPoor");
    expect(routerJs).toContain("isAvailable");
  });

  it("stores recommended_extractor when OCR is unavailable", () => {
    expect(routerJs).toContain("recommended_extractor");
    expect(routerJs).toContain("olmocr");
  });

  it("has stubs for olmocr and paddleocr", () => {
    expect(routerJs).toContain("olmocr");
    expect(routerJs).toContain("paddleocr");
    expect(routerJs).toContain("not yet implemented");
  });
});

// ─── OCR fallback: safe degradation ──────────────────────────────────────────

describe("OCR fallback: safe degradation", () => {
  it("defines OcrNotConfiguredError", () => {
    expect(ocrFallbackJs).toContain("OcrNotConfiguredError");
  });

  it("is disabled by default (OCR_FALLBACK_ENABLED env check)", () => {
    expect(ocrFallbackJs).toContain("OCR_FALLBACK_ENABLED");
    expect(ocrFallbackJs).toContain("isAvailable");
  });

  it("throws OcrNotConfiguredError when not enabled", () => {
    expect(ocrFallbackJs).toContain("OcrNotConfiguredError");
    expect(ocrFallbackJs).toContain("OCR fallback is not configured");
  });

  it("documents required system binaries", () => {
    expect(ocrFallbackJs).toContain("OCRmyPDF");
    expect(ocrFallbackJs).toContain("Tesseract");
  });
});

// ─── Quality evaluator: thresholds ───────────────────────────────────────────

describe("Quality evaluator: thresholds", () => {
  it("exports evaluateExtractionQuality and isQualityPoor", () => {
    expect(qualityJs).toContain("evaluateExtractionQuality");
    expect(qualityJs).toContain("isQualityPoor");
  });

  it("marks empty text as too_short", () => {
    expect(qualityJs).toContain("too_short");
    expect(qualityJs).toContain("No text extracted");
  });

  it("uses low_confidence flag for suspicious text", () => {
    expect(qualityJs).toContain("low_confidence");
  });

  it("uses good flag for clean adequate text", () => {
    expect(qualityJs).toContain("'good'");
  });
});

// ─── sourceHash: integrity ───────────────────────────────────────────────────

describe("sourceHash", () => {
  it("exports computeSourceHash", () => {
    expect(sourceHashJs).toContain("computeSourceHash");
  });

  it("uses SHA-256", () => {
    expect(sourceHashJs).toContain("sha256");
  });
});
