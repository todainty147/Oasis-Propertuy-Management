import { useI18n } from "../../context/I18nContext";

const CONFIG = {
  strong:   { labelKey: "compliance.rentShield.tier.strong",   className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  moderate: { labelKey: "compliance.rentShield.tier.moderate", className: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" },
  elevated: { labelKey: "compliance.rentShield.tier.elevated", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  critical: { labelKey: "compliance.rentShield.tier.critical", className: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
};

export default function RentShieldTierBadge({ tier, size = "md" }) {
  const { t } = useI18n();
  const cfg = CONFIG[tier] ?? CONFIG.elevated;
  const padding = size === "lg" ? "px-4 py-1.5 text-sm" : "px-2.5 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${padding} ${cfg.className}`}
      data-testid={`rent-shield-tier-badge-${tier}`}
    >
      {t(cfg.labelKey)}
    </span>
  );
}
