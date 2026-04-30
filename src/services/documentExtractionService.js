import { supabase } from "../lib/supabase";
import {
  parseDocumentExtractionRow,
  parseDocumentExtractionRunRow,
  parseRpcRows,
} from "./rpcContracts";

const EXTRACTION_SELECT = [
  "id", "account_id", "document_id", "extractor", "language_hint",
  "status", "text_content", "markdown_content", "structured_payload",
  "confidence_score", "source_hash", "page_count", "character_count",
  "error_message", "created_by", "created_at", "updated_at", "completed_at",
].join(", ");

const RUN_SELECT = [
  "id", "account_id", "document_id", "extraction_id", "extractor",
  "status", "started_at", "completed_at", "error_message",
  "metadata", "created_by", "created_at",
].join(", ");

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

// ── Request extraction ────────────────────────────────────────────────────────

export async function requestDocumentExtraction(accountId, documentId, {
  extractor = "auto",
  languageHint = null,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!documentId) throw new Error("Missing documentId");

  const { data, error } = await supabase
    .rpc("request_document_extraction", {
      p_account_id:    accountId,
      p_document_id:   documentId,
      p_extractor:     extractor,
      p_language_hint: languageHint || null,
    })
    .single();

  if (error) throw error;
  return parseDocumentExtractionRunRow(data);
}

// ── Get best extraction for a document ───────────────────────────────────────

export async function getDocumentExtraction(accountId, documentId, {
  extractor = null,
} = {}) {
  if (!accountId || !documentId) return null;

  const { data, error } = await supabase
    .rpc("get_document_extraction", {
      p_account_id:  accountId,
      p_document_id: documentId,
      p_extractor:   extractor || null,
    });

  if (error) {
    if (error.code === "PGRST202") {
      return _getDocumentExtractionDirect(accountId, documentId, { extractor });
    }
    if (isMissingBackendObject(error)) return null;
    throw error;
  }

  const rows = data ?? [];
  return rows.length > 0 ? parseDocumentExtractionRow(rows[0]) : null;
}

async function _getDocumentExtractionDirect(accountId, documentId, { extractor = null } = {}) {
  let query = supabase
    .from("document_extractions")
    .select(EXTRACTION_SELECT)
    .eq("account_id", accountId)
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (extractor) query = query.eq("extractor", extractor);

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  const rows = data ?? [];
  return rows.length > 0 ? parseDocumentExtractionRow(rows[0]) : null;
}

// ── List extractions for account ─────────────────────────────────────────────

export async function listDocumentExtractions(accountId, {
  status = null,
  limit = 100,
  offset = 0,
} = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .rpc("list_document_extractions", {
      p_account_id: accountId,
      p_status:     status || null,
      p_limit:      limit,
      p_offset:     offset,
    });

  if (error) {
    if (error.code === "PGRST202") {
      return _listDocumentExtractionsDirect(accountId, { status });
    }
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseDocumentExtractionRow, "document extractions");
}

async function _listDocumentExtractionsDirect(accountId, { status = null } = {}) {
  let query = supabase
    .from("document_extractions")
    .select(EXTRACTION_SELECT)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseDocumentExtractionRow, "document extractions");
}

// ── List extraction runs ──────────────────────────────────────────────────────

export async function listDocumentExtractionRuns(accountId, {
  documentId = null,
  status = null,
  limit = 50,
} = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .rpc("list_document_extraction_runs", {
      p_account_id:  accountId,
      p_document_id: documentId || null,
      p_status:      status || null,
      p_limit:       limit,
      p_offset:      0,
    });

  if (error) {
    if (error.code === "PGRST202") {
      return _listDocumentExtractionRunsDirect(accountId, { documentId, status, limit });
    }
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseDocumentExtractionRunRow, "document extraction runs");
}

async function _listDocumentExtractionRunsDirect(accountId, {
  documentId = null,
  status = null,
  limit = 50,
} = {}) {
  let query = supabase
    .from("document_extraction_runs")
    .select(RUN_SELECT)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (documentId) query = query.eq("document_id", documentId);
  if (status)     query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseDocumentExtractionRunRow, "document extraction runs");
}

// ── Mark extraction stale ─────────────────────────────────────────────────────

export async function markDocumentExtractionStale(accountId, documentId) {
  if (!accountId) throw new Error("Missing accountId");
  if (!documentId) throw new Error("Missing documentId");

  const { data, error } = await supabase
    .rpc("mark_document_extraction_stale", {
      p_account_id:  accountId,
      p_document_id: documentId,
    });

  if (error) throw error;
  return parseRpcRows(data ?? [], parseDocumentExtractionRow, "stale extractions");
}

// ── Lease Auditor readiness helper ────────────────────────────────────────────
//
// Returns a structured result for the AI Lease Auditor to consume.
// The Lease Auditor should call this instead of reading document_extractions
// directly — this helper handles quality checks and status signals.
//
// Return shape:
//   { status, extraction, error_message? }
//
// status values:
//   'ready'                         — completed extraction with good quality
//   'advanced_extraction_recommended' — completed but low confidence
//   'extraction_in_progress'        — queued or processing
//   'stale_extraction'              — extraction exists but is stale
//   'extraction_failed'             — last extraction failed
//   'extraction_required'           — no extraction exists at all
//   'unavailable'                   — could not fetch (error / missing feature)

export async function getBestDocumentExtractionForAudit(accountId, documentId) {
  if (!accountId || !documentId) {
    return { status: "unavailable", extraction: null };
  }

  let extraction = null;
  try {
    extraction = await getDocumentExtraction(accountId, documentId);
  } catch (_err) {
    return { status: "unavailable", extraction: null };
  }

  if (!extraction) {
    return { status: "extraction_required", extraction: null };
  }

  if (extraction.status === "failed") {
    return {
      status: "extraction_failed",
      extraction,
      error_message: extraction.error_message,
    };
  }

  if (extraction.status === "stale") {
    return { status: "stale_extraction", extraction };
  }

  if (extraction.status === "pending" || extraction.status === "processing") {
    return { status: "extraction_in_progress", extraction };
  }

  if (extraction.status === "completed") {
    const qualityFlag =
      extraction.structured_payload?.quality_flag ||
      _deriveQualityFlag(extraction);

    if (qualityFlag === "low_confidence" || qualityFlag === "too_short") {
      return { status: "advanced_extraction_recommended", extraction };
    }
    return { status: "ready", extraction };
  }

  return { status: "unavailable", extraction };
}

function _deriveQualityFlag(extraction) {
  if (!extraction) return "unavailable";
  const score = extraction.confidence_score;
  if (score != null) {
    if (score < 0.4) return "low_confidence";
    if (score >= 0.8) return "good";
    return "ok";
  }
  const charCount = extraction.character_count ?? 0;
  if (charCount < 100)  return "too_short";
  if (charCount < 500)  return "low_confidence";
  return "good";
}
