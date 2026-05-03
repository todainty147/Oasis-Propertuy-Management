import { useI18n } from "../../context/I18nContext";

const CONFIG = {
  likely_allowable:      { labelKey: "compliance.tax.records.treatment.likely_allowable",      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  likely_disallowable:   { labelKey: "compliance.tax.records.treatment.likely_disallowable",   className: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
  review_required:       { labelKey: "compliance.tax.records.treatment.review_required",       className: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  capital_candidate:     { labelKey: "compliance.tax.records.treatment.capital_candidate",     className: "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300" },
  evidence_only:         { labelKey: "compliance.tax.records.treatment.evidence_only",         className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

export default function TaxTreatmentBadge({ treatment }) {
  const { t } = useI18n();
  const cfg = CONFIG[treatment] ?? CONFIG.review_required;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}
      data-testid={`tax-treatment-badge-${treatment}`}
    >
      {t(cfg.labelKey)}
    </span>
  );
}
