import { useCallback, useEffect, useState } from "react";
import { FileText, Search, Sparkles, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { listAccountDocuments, getAiChecklistSuggestions } from "../../services/evidencePackService";
import { suggestByDocumentName } from "../../utils/evidencePackUtils";

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

function mimeLabel(mimeType) {
  if (!mimeType) return "";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "IMG";
  if (mimeType.includes("word")) return "DOC";
  return "FILE";
}

function mimeColor(mimeType) {
  if (!mimeType) return "bg-slate-100 text-slate-500";
  if (mimeType === "application/pdf") return "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400";
  if (mimeType.startsWith("image/")) return "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400";
  return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
}

// ── Suggestion confidence badge ──────────────────────────────────────────────

function ConfidenceBadge({ confidence }) {
  const styles = {
    high:   "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    low:    "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${styles[confidence] || styles.low}`}>
      {confidence}
    </span>
  );
}

// ── Document row ─────────────────────────────────────────────────────────────

function DocumentRow({ doc, onSelect, suggestion, isSuggested }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(doc)}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors ${
        isSuggested ? "bg-blue-50/40 dark:bg-blue-950/10" : ""
      }`}
    >
      {/* Type badge */}
      <span className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${mimeColor(doc.mime_type)}`}>
        {mimeLabel(doc.mime_type)}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
            {doc.name}
          </p>
          {isSuggested && suggestion && (
            <ConfidenceBadge confidence={suggestion.confidence} />
          )}
        </div>

        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {doc.uploaded_at && <span>{formatDate(doc.uploaded_at)}</span>}
          {doc.scope && <span className="capitalize">· {doc.scope}</span>}
        </div>

        {isSuggested && suggestion?.reasoning && (
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
            <Sparkles size={10} className="shrink-0" />
            {suggestion.reasoning}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Main DocumentLinkPicker ─────────────────────────────────────────────────

export default function DocumentLinkPicker({
  accountId,
  propertyId,
  tenantId,
  checklistItem,   // { item_id, item_key, title }
  onSelect,        // (doc) => void
  onClose,
}) {
  const { t } = useI18n();
  const [documents,    setDocuments]    = useState([]);
  const [query,        setQuery]        = useState("");
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [suggestions,  setSuggestions]  = useState([]);
  const [aiLoading,    setAiLoading]    = useState(false);
  const [aiSource,     setAiSource]     = useState(null);

  // Load documents
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAccountDocuments({ accountId, propertyId, tenantId })
      .then((docs) => { if (!cancelled) setDocuments(docs); })
      .catch(() => { if (!cancelled) setError(t("evidencePack.loadDocsError")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accountId, propertyId, tenantId, t]);

  // AI suggestions (triggered on mount for the selected item)
  useEffect(() => {
    if (!checklistItem?.item_key || documents.length === 0) return;
    // Name-based suggestions — always available, no network call
    const nameBased = documents.flatMap((doc) => {
      const sug = suggestByDocumentName(doc.name, doc.tags);
      const match = sug.find((s) => s.item_key === checklistItem.item_key);
      return match ? [{ docId: doc.id, ...match }] : [];
    });
    setSuggestions(nameBased);
    setAiSource("name_match");
  }, [documents, checklistItem?.item_key]);

  const handleAiSuggestions = useCallback(async () => {
    if (!checklistItem?.item_key || documents.length === 0) return;
    setAiLoading(true);
    try {
      // Try AI for the most likely matching document (first PDF with extraction)
      const pdfDoc = documents.find((d) => d.mime_type === "application/pdf");
      if (pdfDoc) {
        const result = await getAiChecklistSuggestions({
          accountId,
          documentId: pdfDoc.id,
          propertyId,
          tenantId,
        });
        if (result?.suggestions?.length) {
          const itemSuggestions = result.suggestions.filter(
            (s) => s.item_key === checklistItem.item_key,
          );
          if (itemSuggestions.length > 0) {
            setSuggestions(itemSuggestions.map((s) => ({ docId: pdfDoc.id, ...s })));
            setAiSource(result.source || "openai");
          }
        }
      }
    } catch {
      // AI failure is non-blocking — keep name-based suggestions
    } finally {
      setAiLoading(false);
    }
  }, [accountId, checklistItem, documents, propertyId, tenantId]);

  // Filter and sort — suggested documents first
  const suggestionDocIds = new Set(suggestions.map((s) => s.docId));
  const filtered = documents.filter((doc) =>
    !query || doc.name.toLowerCase().includes(query.toLowerCase()),
  );
  const sorted = [
    ...filtered.filter((d) => suggestionDocIds.has(d.id)),
    ...filtered.filter((d) => !suggestionDocIds.has(d.id)),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {t("evidencePack.pickerTitle")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {checklistItem?.title}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        {/* AI hint strip */}
        {suggestions.length > 0 && (
          <div className="px-5 py-2 bg-blue-50 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900/40 flex items-center gap-2">
            <Sparkles size={13} className="text-blue-500 shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              {t("evidencePack.suggestionsAvailable", { count: suggestions.length })}
              {" — "}{t("evidencePack.suggestionsHint")}
            </p>
            {aiSource === "name_match" && (
              <button
                type="button"
                disabled={aiLoading}
                onClick={handleAiSuggestions}
                className="ml-auto text-xs text-blue-600 dark:text-blue-300 hover:underline disabled:opacity-50 shrink-0"
              >
                {aiLoading ? t("common.loading") : t("evidencePack.improveWithAi")}
              </button>
            )}
          </div>
        )}

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder={t("common.search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none text-slate-800 dark:text-slate-200 placeholder-slate-400"
              autoFocus
            />
          </div>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <p className="px-5 py-8 text-sm text-center text-slate-400">{t("common.loading")}</p>
          )}
          {error && (
            <p className="px-5 py-8 text-sm text-center text-red-500 flex items-center justify-center gap-2">
              <AlertTriangle size={14} /> {error}
            </p>
          )}
          {!loading && !error && sorted.length === 0 && (
            <p className="px-5 py-8 text-sm text-center text-slate-500">{t("evidencePack.noDocuments")}</p>
          )}
          {!loading && !error && sorted.map((doc) => {
            const suggestion = suggestions.find((s) => s.docId === doc.id);
            return (
              <DocumentRow
                key={doc.id}
                doc={doc}
                suggestion={suggestion}
                isSuggested={suggestionDocIds.has(doc.id)}
                onSelect={onSelect}
              />
            );
          })}
        </div>

        {/* Footer disclaimer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {t("evidencePack.pickerDisclaimer")}
          </p>
        </div>
      </div>
    </div>
  );
}
