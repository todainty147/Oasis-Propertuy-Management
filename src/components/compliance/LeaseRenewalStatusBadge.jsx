import { useI18n } from "../../context/I18nContext";

const CONFIG = {
  active:               { labelKey: "compliance.leases.renewalStatus.active",              className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" },
  expiring_soon:        { labelKey: "compliance.leases.renewalStatus.expiring_soon",        className: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300" },
  renewal_in_progress:  { labelKey: "compliance.leases.renewalStatus.renewal_in_progress",  className: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" },
  renewed:              { labelKey: "compliance.leases.renewalStatus.renewed",              className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  ended:                { labelKey: "compliance.leases.renewalStatus.ended",                className: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
};

export default function LeaseRenewalStatusBadge({ status }) {
  const { t } = useI18n();
  const cfg = CONFIG[status] ?? CONFIG.active;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}
      data-testid={`lease-renewal-status-badge-${status}`}
    >
      {t(cfg.labelKey)}
    </span>
  );
}
