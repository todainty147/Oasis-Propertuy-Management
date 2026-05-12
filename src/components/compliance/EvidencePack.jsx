import { CheckCircle2, Circle, FileText, MinusCircle, AlertTriangle, Clock } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import {
  calcCompletionPct,
  getMissingItems,
  getPendingReviewItems,
  getResolvedItems,
  sortChecklistItems,
} from "../../utils/evidencePackUtils";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(value) {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

function mimeIcon(mimeType) {
  if (!mimeType) return <FileText size={14} className="text-slate-400" />;
  if (mimeType === "application/pdf") return <FileText size={14} className="text-red-400" />;
  if (mimeType.startsWith("image/")) return <FileText size={14} className="text-blue-400" />;
  return <FileText size={14} className="text-slate-400" />;
}

// ── Completion bar ─────────────────────────────────────────────────────────

function CompletionBar({ pct }) {
  const color =
    pct >= 80 ? "bg-green-500"
    : pct >= 40 ? "bg-amber-500"
    : "bg-red-400";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">Evidence Pack</span>
        <span className={`text-xs font-semibold ${pct >= 80 ? "text-green-600 dark:text-green-400" : pct >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
          {pct}%
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Item status icon ────────────────────────────────────────────────────────

function ItemIcon({ item }) {
  if (item.status === "complete") {
    return <CheckCircle2 size={16} className="text-green-500 shrink-0 mt-0.5" />;
  }
  if (item.status === "not_applicable") {
    return <MinusCircle size={16} className="text-slate-400 shrink-0 mt-0.5" />;
  }
  if (item.evidence_document_id) {
    return <Clock size={16} className="text-amber-500 shrink-0 mt-0.5" />;
  }
  return <Circle size={16} className="text-slate-300 shrink-0 mt-0.5" />;
}

// ── Single evidence item row ────────────────────────────────────────────────

function EvidenceItemRow({ item, onLink, onRemove, t }) {
  const hasDoc     = Boolean(item.evidence_document_id);
  const isComplete = item.status === "complete" || item.status === "not_applicable";

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <ItemIcon item={item} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
          {item.title}
        </p>

        {hasDoc && item.doc_name && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
            {mimeIcon(item.doc_mime_type)}
            {item.doc_name}
            {item.doc_uploaded_at && (
              <span className="text-slate-400 dark:text-slate-500 ml-1">
                · {formatDate(item.doc_uploaded_at)}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Actions */}
      {!isComplete && (
        <div className="flex items-center gap-1.5 shrink-0">
          {hasDoc ? (
            <>
              <button
                type="button"
                onClick={() => onLink(item)}
                className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {t("evidencePack.replace")}
              </button>
              <button
                type="button"
                onClick={() => onRemove(item)}
                className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {t("evidencePack.unlink")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onLink(item)}
              className="text-xs px-2 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30"
            >
              {t("evidencePack.linkDocument")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main EvidencePack component ─────────────────────────────────────────────

export default function EvidencePack({ items = [], onLinkDocument, onRemoveDocument, loading = false }) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <p className="text-sm text-slate-400">{t("common.loading")}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("evidencePack.empty")}</p>
      </div>
    );
  }

  const sorted  = sortChecklistItems(items);
  const pct     = calcCompletionPct(items);
  const missing = getMissingItems(items);
  const pending = getPendingReviewItems(items);
  const resolved = getResolvedItems(items);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t("evidencePack.title")}
          </p>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t("evidencePack.disclaimer")}
          </span>
        </div>

        <CompletionBar pct={pct} />

        {/* Summary pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/20 dark:text-green-300 dark:border-green-900">
            {resolved.length} {t("evidencePack.done")}
          </span>
          {pending.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900">
              {pending.length} {t("evidencePack.pendingReview")}
            </span>
          )}
          {missing.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/20 dark:text-red-300 dark:border-red-900 flex items-center gap-1">
              <AlertTriangle size={10} />
              {missing.length} {t("evidencePack.missing")}
            </span>
          )}
        </div>

        {/* Export placeholder */}
        <p className="text-xs text-slate-400 dark:text-slate-500 italic">
          {t("evidencePack.exportComingSoon")}
        </p>
      </div>

      {/* Item list */}
      <div className="px-5 py-1">
        {sorted.map((item) => (
          <EvidenceItemRow
            key={item.item_id || item.id}
            item={item}
            onLink={onLinkDocument}
            onRemove={onRemoveDocument}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}
