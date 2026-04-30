import { useI18n } from "../../context/I18nContext";

const CONFIG = {
  income:     { labelKey: "compliance.tax.records.type.income",     className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  expense:    { labelKey: "compliance.tax.records.type.expense",    className: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
  adjustment: { labelKey: "compliance.tax.records.type.adjustment", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  evidence:   { labelKey: "compliance.tax.records.type.evidence",   className: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" },
};

export default function TaxRecordTypeBadge({ type }) {
  const { t } = useI18n();
  const cfg = CONFIG[type] ?? { labelKey: null, className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}
      data-testid={`tax-record-type-badge-${type}`}
    >
      {cfg.labelKey ? t(cfg.labelKey) : type}
    </span>
  );
}
