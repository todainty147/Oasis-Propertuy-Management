import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, FileText, Lock, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../../context/I18nContext";
import { listLegalTemplates } from "../../services/plTemplateService";
import { isTemplateProductionReady, templateStatusLabel } from "../../utils/plAdvancedUtils";

const STATUS_STYLES = {
  draft:           "bg-slate-100  text-slate-500  dark:bg-slate-800    dark:text-slate-400",
  requires_review: "bg-amber-100  text-amber-700  dark:bg-amber-950/30 dark:text-amber-300",
  reviewed:        "bg-green-100  text-green-700  dark:bg-green-950/30 dark:text-green-300",
  retired:         "bg-slate-100  text-slate-400  dark:bg-slate-800    dark:text-slate-500",
};

const TEMPLATE_TYPES = [
  "lease_agreement", "handover_protocol", "deposit_receipt",
  "tax_notice", "termination_notice", "other",
];

function TemplateCard({ template, t }) {
  const isReady   = isTemplateProductionReady(template);
  const statusKey = templateStatusLabel(template.status);

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${
      isReady
        ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        : "border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 opacity-70"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText size={14} className={isReady ? "text-blue-500" : "text-slate-400"} />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{template.title}</p>
          {!isReady && <Lock size={12} className="text-slate-400" />}
        </div>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_STYLES[template.status] || STATUS_STYLES.draft}`}>
          {t(`plAdvanced.templates.status.${statusKey}`)}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>{t(`plAdvanced.templates.type.${template.template_type}`)}</span>
        <span>v{template.version}</span>
        {template.language && <span className="uppercase">{template.language}</span>}
      </div>

      {isReady && template.reviewed_at && (
        <div className="flex items-center gap-1.5 text-[11px] text-green-700 dark:text-green-400">
          <CheckCircle2 size={11} />
          {t("plAdvanced.templates.reviewed")} · {new Date(template.reviewed_at).toLocaleDateString()}
        </div>
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">{template.disclaimer}</p>
    </div>
  );
}

// ── Improved empty state ──────────────────────────────────────────────────────

function EmptyState({ t }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-6 space-y-4">
      <div className="text-center space-y-2">
        <FileText size={28} className="text-slate-300 mx-auto" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {t("plAdvanced.templates.emptyFull")}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto leading-relaxed">
          {t("plAdvanced.templates.emptyBody")}
        </p>
      </div>
      <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
          {t("plAdvanced.templates.emptyNext")}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("plAdvanced.templates.emptyNextHint")}
        </p>
        <div className="flex gap-2 flex-wrap pt-1">
          <Link
            to="/compliance/lease-auditor"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            {t("plAdvanced.templates.openLeaseAuditor")} <ArrowRight size={11} />
          </Link>
          <Link
            to="/documents"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {t("plAdvanced.templates.openDocuments")} <ArrowRight size={11} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function PlTemplatePanel({ market = "pl" }) {
  const { t }                     = useI18n();
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [typeFilter, setTypeFilter] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listLegalTemplates({ market, includeAll: false });
      setTemplates(data);
    } catch {
      setError(t("plAdvanced.templates.loadError"));
    } finally {
      setLoading(false);
    }
  }, [market]);

  useEffect(() => { load(); }, [load]);

  const filtered = typeFilter
    ? templates.filter((tmpl) => tmpl.template_type === typeFilter)
    : templates;

  return (
    <div className="space-y-4">
      {/* Header + refresh */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t("plAdvanced.templates.title")}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t("plAdvanced.templates.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
          aria-label={t("common.refresh")}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Type filter */}
      {templates.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button type="button" onClick={() => setTypeFilter(null)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              !typeFilter
                ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
                : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
            }`}>
            {t("common.all")}
          </button>
          {TEMPLATE_TYPES.map((tt) => (
            <button key={tt} type="button" onClick={() => setTypeFilter(tt)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                typeFilter === tt
                  ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
                  : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
              }`}>
              {t(`plAdvanced.templates.type.${tt}`)}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState t={t} />
      )}

      {filtered.map((tmpl) => (
        <TemplateCard key={tmpl.id} template={tmpl} t={t} />
      ))}
    </div>
  );
}
