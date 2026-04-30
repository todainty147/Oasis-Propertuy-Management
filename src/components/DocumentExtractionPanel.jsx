import { useCallback, useEffect, useState } from "react";
import {
  getDocumentExtraction,
  listDocumentExtractionRuns,
  logDocumentExtractionViewed,
  markDocumentExtractionStale,
  requestDocumentExtraction,
} from "../services/documentExtractionService";

// ── Status badge helpers ──────────────────────────────────────────────────────

const STATUS_STYLES = {
  completed:  "bg-green-100 text-green-800",
  processing: "bg-blue-100 text-blue-800",
  queued:     "bg-blue-100 text-blue-800",
  pending:    "bg-blue-100 text-blue-800",
  failed:     "bg-red-100 text-red-800",
  stale:      "bg-amber-100 text-amber-800",
};

const STATUS_LABELS = {
  completed:  "Extracted",
  processing: "Processing",
  queued:     "Queued",
  pending:    "Queued",
  failed:     "Failed",
  stale:      "Stale",
};

const EXTRACTOR_LABELS = {
  native_pdf:          "Native PDF",
  ocrmypdf_tesseract:  "OCR (Tesseract)",
  docling:             "Docling",
  paddleocr:           "PaddleOCR",
  olmocr:              "olmOCR",
  manual:              "Manual",
  auto:                "Auto",
};

function ExtractionStatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status;
  const style = STATUS_STYLES[status] || "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

// ── Extracted text preview ────────────────────────────────────────────────────

const PREVIEW_CHAR_LIMIT = 600;

function ExtractionTextPreview({ extraction, onClose }) {
  const [expanded, setExpanded] = useState(false);

  const text = extraction?.text_content || "";
  const isLong = text.length > PREVIEW_CHAR_LIMIT;
  const displayText = expanded ? text : text.slice(0, PREVIEW_CHAR_LIMIT);

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Extracted text
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-600"
          aria-label="Close extracted text preview"
        >
          ✕
        </button>
      </div>

      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-slate-700 max-h-48 overflow-y-auto">
        {displayText}
        {isLong && !expanded && (
          <span className="text-slate-400">…</span>
        )}
      </pre>

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-blue-600 hover:underline"
        >
          {expanded ? "Show less" : `Show all (${text.length.toLocaleString()} chars)`}
        </button>
      )}

      <p className="mt-2 text-xs text-slate-400 italic">
        Extracted text may contain errors. Always verify against the original document.
      </p>

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
        {extraction.extractor && (
          <span>Extractor: {EXTRACTOR_LABELS[extraction.extractor] || extraction.extractor}</span>
        )}
        {extraction.page_count != null && (
          <span>Pages: {extraction.page_count}</span>
        )}
        {extraction.character_count != null && (
          <span>Characters: {extraction.character_count.toLocaleString()}</span>
        )}
        {extraction.confidence_score != null && (
          <span>Confidence: {(extraction.confidence_score * 100).toFixed(0)}%</span>
        )}
        {extraction.structured_payload?.quality_flag && (
          <span>Quality: {extraction.structured_payload.quality_flag}</span>
        )}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

/**
 * DocumentExtractionPanel
 *
 * Shows extraction status for a single document and allows managers to:
 * - Request text extraction
 * - View extracted text (read-only, truncated preview)
 * - Re-run extraction (marks existing as stale and requests a new run)
 *
 * Security:
 * - This component must ONLY be rendered for owner / admin / staff roles.
 * - The parent (Documents.jsx) is responsible for gating on canUploadDocument().
 * - Tenants and contractors must never see this panel.
 * - The RLS policies on document_extractions and document_extraction_runs
 *   enforce the same restriction at the database level.
 */
export default function DocumentExtractionPanel({ accountId, documentId, mimeType }) {
  const [extraction, setExtraction]     = useState(undefined); // undefined = loading
  const [latestRun, setLatestRun]       = useState(null);
  const [showPreview, setShowPreview]   = useState(false);
  const [requesting, setRequesting]     = useState(false);
  const [error, setError]               = useState(null);

  const extractable = _isExtractable(mimeType);

  const loadExtractionState = useCallback(async () => {
    if (!accountId || !documentId) return;
    try {
      const [ext, runs] = await Promise.all([
        getDocumentExtraction(accountId, documentId),
        listDocumentExtractionRuns(accountId, { documentId, limit: 1 }),
      ]);
      setExtraction(ext ?? null);
      setLatestRun(runs[0] ?? null);
    } catch (_err) {
      setExtraction(null);
    }
  }, [accountId, documentId]);

  useEffect(() => {
    loadExtractionState();
  }, [loadExtractionState]);

  // Auto-refresh while a run is queued or processing
  useEffect(() => {
    const inProgress =
      latestRun?.status === "queued" ||
      latestRun?.status === "processing";

    if (!inProgress) return;

    const timer = setInterval(loadExtractionState, 4000);
    return () => clearInterval(timer);
  }, [latestRun?.status, loadExtractionState]);

  async function handleRequestExtraction() {
    if (!accountId || !documentId) return;
    setRequesting(true);
    setError(null);
    try {
      await requestDocumentExtraction(accountId, documentId, { extractor: "auto" });
      await loadExtractionState();
    } catch (err) {
      setError(err?.message || "Failed to request extraction.");
    } finally {
      setRequesting(false);
    }
  }

  async function handleRerun() {
    if (!accountId || !documentId) return;
    setRequesting(true);
    setError(null);
    try {
      await markDocumentExtractionStale(accountId, documentId);
      await requestDocumentExtraction(accountId, documentId, { extractor: "auto" });
      setShowPreview(false);
      await loadExtractionState();
    } catch (err) {
      setError(err?.message || "Failed to re-run extraction.");
    } finally {
      setRequesting(false);
    }
  }

  if (!extractable) return null;

  const runStatus = latestRun?.status || null;
  const extStatus = extraction?.status || null;
  const displayStatus = extStatus || runStatus;
  const isInProgress = runStatus === "queued" || runStatus === "processing";
  const canView = extStatus === "completed";
  const hasExtraction = extraction !== null && extraction !== undefined;
  const isLoading = extraction === undefined;

  return (
    <div className="mt-2 border-t border-slate-100 pt-2" data-testid="document-extraction-panel">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500 font-medium">Text extraction:</span>

        {isLoading ? (
          <span className="text-slate-400">Loading…</span>
        ) : displayStatus ? (
          <ExtractionStatusBadge status={displayStatus} />
        ) : (
          <span className="text-slate-400">Not extracted</span>
        )}

        {/* Extractor label when completed */}
        {extStatus === "completed" && extraction?.extractor && (
          <span className="text-slate-400">
            via {EXTRACTOR_LABELS[extraction.extractor] || extraction.extractor}
          </span>
        )}

        {/* Completion time */}
        {extStatus === "completed" && extraction?.completed_at && (
          <span className="text-slate-400">
            {new Date(extraction.completed_at).toLocaleDateString()}
          </span>
        )}

        {/* Low confidence / advanced extractor recommendation */}
        {extStatus === "completed" &&
          extraction?.structured_payload?.recommended_extractor && (
            <span className="text-amber-600" title="A more capable extractor may improve quality">
              ⚠ Low confidence
            </span>
          )}

        {/* Failed message */}
        {extStatus === "failed" && extraction?.error_message && (
          <span className="text-red-600 text-xs" title={extraction.error_message}>
            Error
          </span>
        )}

        {/* Action buttons */}
        {!isLoading && (
          <div className="flex gap-2 ml-auto">
            {canView && (
              <button
                type="button"
                onClick={() => {
                  const nextShow = !showPreview;
                  setShowPreview(nextShow);
                  // Audit only when opening the preview, not on every toggle.
                  // Fire-and-forget — must not block or error the UI.
                  if (nextShow) {
                    logDocumentExtractionViewed(accountId, documentId).catch(() => {});
                  }
                }}
                className="text-blue-600 hover:underline text-xs"
                data-testid="view-extracted-text-button"
              >
                {showPreview ? "Hide text" : "View text"}
              </button>
            )}

            {canView && (
              <button
                type="button"
                onClick={handleRerun}
                disabled={requesting || isInProgress}
                className="text-slate-500 hover:underline text-xs disabled:opacity-50"
                data-testid="rerun-extraction-button"
              >
                Re-run
              </button>
            )}

            {!hasExtraction && !isInProgress && (
              <button
                type="button"
                onClick={handleRequestExtraction}
                disabled={requesting}
                className="text-blue-600 hover:underline text-xs disabled:opacity-50"
                data-testid="request-extraction-button"
              >
                {requesting ? "Requesting…" : "Extract text"}
              </button>
            )}

            {(extStatus === "failed" || extStatus === "stale") && !isInProgress && (
              <button
                type="button"
                onClick={handleRequestExtraction}
                disabled={requesting}
                className="text-blue-600 hover:underline text-xs disabled:opacity-50"
                data-testid="retry-extraction-button"
              >
                {requesting ? "Requesting…" : "Retry extraction"}
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1 text-xs text-red-600" data-testid="extraction-error-message">
          {error}
        </p>
      )}

      {showPreview && extraction?.text_content && (
        <ExtractionTextPreview
          extraction={extraction}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

function _isExtractable(mimeType) {
  return (
    mimeType === "application/pdf" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp"
  );
}
