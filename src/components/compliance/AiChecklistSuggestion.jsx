import { AlertTriangle, CheckCircle2, Sparkles, X } from "lucide-react";
import { useI18n } from "../../context/I18nContext";

// ── Confidence badge ─────────────────────────────────────────────────────────

const CONFIDENCE_STYLES = {
  high:   "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800",
  medium: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800",
  low:    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

function ConfidencePill({ confidence, t }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${CONFIDENCE_STYLES[confidence] || CONFIDENCE_STYLES.low}`}>
      <Sparkles size={9} />
      {t(`aiSuggestion.confidence.${confidence}`)}
    </span>
  );
}

// ── Single suggestion card ────────────────────────────────────────────────────

function SuggestionCard({ suggestion, onAccept, onDismiss, t }) {
  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {suggestion.itemTitle || suggestion.item_key}
          </p>
          <ConfidencePill confidence={suggestion.confidence} t={t} />
        </div>
        <button
          type="button"
          onClick={() => onDismiss(suggestion)}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
          aria-label={t("aiSuggestion.dismiss")}
        >
          <X size={14} />
        </button>
      </div>

      {suggestion.reasoning && (
        <p className="text-xs text-slate-600 dark:text-slate-400 pl-5">
          {suggestion.reasoning}
        </p>
      )}

      {/* Legal disclaimer */}
      <div className="pl-5 flex items-start gap-1.5">
        <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          {t("aiSuggestion.reviewRequired")}
        </p>
      </div>

      <div className="flex gap-2 pl-5 pt-1">
        <button
          type="button"
          onClick={() => onAccept(suggestion)}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5"
        >
          <CheckCircle2 size={11} />
          {t("aiSuggestion.accept")}
        </button>
        <button
          type="button"
          onClick={() => onDismiss(suggestion)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {t("aiSuggestion.dismiss")}
        </button>
      </div>
    </div>
  );
}

// ── AiChecklistSuggestion panel ───────────────────────────────────────────────

/**
 * Renders a panel of AI-generated checklist item suggestions for a document.
 * Users can accept (link document → item) or dismiss each suggestion individually.
 *
 * Props:
 *   suggestions   [{item_key, confidence, reasoning, itemTitle?}]
 *   source        'openai' | 'name_match' | 'fallback'
 *   disclaimer    string from edge function
 *   onAccept      (suggestion) => void — caller handles actual linking
 *   onDismissAll  () => void — close the panel
 */
export default function AiChecklistSuggestion({
  suggestions = [],
  source,
  disclaimer,
  onAccept,
  onDismissAll,
}) {
  const { t } = useI18n();

  if (suggestions.length === 0) return null;

  const sourceLabel = source === "openai"
    ? t("aiSuggestion.sourceAi")
    : t("aiSuggestion.sourceNameMatch");

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-blue-500" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t("aiSuggestion.title")}
          </p>
          <span className="text-xs text-slate-400 dark:text-slate-500">· {sourceLabel}</span>
        </div>
        <button
          type="button"
          onClick={onDismissAll}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          {t("aiSuggestion.dismissAll")}
        </button>
      </div>

      {/* Suggestion cards */}
      {suggestions.map((s) => (
        <SuggestionCard
          key={s.item_key}
          suggestion={s}
          onAccept={onAccept}
          onDismiss={() => onDismissAll?.()}
          t={t}
        />
      ))}

      {/* Global disclaimer */}
      {disclaimer && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
          {disclaimer}
        </p>
      )}
    </div>
  );
}
