import { useI18n } from "../../context/I18nContext";

const CONFIG = {
  low:      { labelKey: "compliance.leases.risk.low",      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  medium:   { labelKey: "compliance.leases.risk.medium",   className: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  high:     { labelKey: "compliance.leases.risk.high",     className: "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300" },
  critical: { labelKey: "compliance.leases.risk.critical", className: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
};

export default function LeaseClauseRiskBadge({ risk, size = "sm" }) {
  const { t } = useI18n();
  const cfg = CONFIG[risk] ?? CONFIG.medium;
  const padding = size === "lg" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${padding} ${cfg.className}`}
      data-testid={`lease-clause-risk-badge-${risk}`}
    >
      {t(cfg.labelKey)}
    </span>
  );
}
