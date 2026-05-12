import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Lock, RefreshCw } from "lucide-react";
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
  const isReady    = isTemplateProductionReady(template);
  const statusKey  = templateStatusLabel(template.status);

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${
      isReady
        ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
        : "border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 opacity-70"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText size={14} className={isReady ? "text-blue-500" : "text-slate-400"} />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {template.title}
          </p>
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

      {!isReady && (
        <div className="flex items-start gap-1.5">
          <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            {t("plAdvanced.templates.notReady")}
          </p>
        </div>
      )}

      {isReady && template.reviewed_at && (
        <div className="flex items-center gap-1.5 text-[11px] text-green-700 dark:text-green-400">
          <CheckCircle2 size={11} />
          {t("plAdvanced.templates.reviewed")} · {new Date(template.reviewed_at).toLocaleDateString()}
        </div>
      )}

      {/* Disclaimer always shown */}
      <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
        {template.disclaimer}
      </p>
    </div>
  );
}

export default function PlTemplatePanel({ market = "pl" }) {
  const { t }                   = useI18n();
  const [templates, setTemplates]   = useState([]);
  const [loading,   setLoading]     = useState(true);
  const [error,     setError]       = useState(null);
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
    ? templates.filter((t) => t.template_type === typeFilter)
    : templates;

  return (
    <div className="space-y-4">
      {/* Feature preview + global disclaimer */}
      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 space-y-1">
        <div className="flex items-center gap-2">
          <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {t("plAdvanced.templates.featurePreview")}
          </p>
        </div>
        <p className="text-[11px] text-amber-700 dark:text-amber-400 pl-5">
          {t("plAdvanced.templates.globalDisclaimer")}
        </p>
      </div>

      {/* Header + filter */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t("plAdvanced.templates.title")}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t("plAdvanced.templates.subtitle")}
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="text-slate-400 hover:text-slate-600">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Type filter */}
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

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <FileText size={24} className="text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("plAdvanced.templates.empty")}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t("plAdvanced.templates.emptyHint")}
          </p>
        </div>
      )}

      {filtered.map((tmpl) => (
        <TemplateCard key={tmpl.id} template={tmpl} t={t} />
      ))}
    </div>
  );
}
