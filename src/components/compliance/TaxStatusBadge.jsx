import { useI18n } from "../../context/I18nContext";

const CONFIG = {
  compliant: {
    labelKey: "compliance.tax.status.compliant",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  upcoming: {
    labelKey: "compliance.tax.status.upcoming",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  },
  overdue: {
    labelKey: "compliance.tax.status.overdue",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  },
  scheduled: {
    labelKey: "compliance.tax.status.scheduled",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  },
};

export default function TaxStatusBadge({ status }) {
  const { t } = useI18n();
  const cfg = CONFIG[status] ?? CONFIG.scheduled;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}
      data-testid={`tax-status-badge-${status}`}
    >
      {t(cfg.labelKey)}
    </span>
  );
}
