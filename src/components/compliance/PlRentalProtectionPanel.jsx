import { ArrowRight, BookOpen, FileText, FolderOpen, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../../context/I18nContext";

// ── Protection feature card ───────────────────────────────────────────────────

function ProtectionCard({ icon: Icon, title, desc, linkTo, linkLabel, color = "blue" }) {
  const colorMap = {
    blue:   { icon: "text-blue-500",   border: "border-blue-100  dark:border-blue-900/30",  bg: "bg-blue-50/50  dark:bg-blue-950/10"  },
    green:  { icon: "text-green-500",  border: "border-green-100 dark:border-green-900/30", bg: "bg-green-50/50 dark:bg-green-950/10" },
    purple: { icon: "text-purple-500", border: "border-purple-100 dark:border-purple-900/30", bg: "bg-purple-50/50 dark:bg-purple-950/10" },
    amber:  { icon: "text-amber-500",  border: "border-amber-100 dark:border-amber-900/30", bg: "bg-amber-50/50 dark:bg-amber-950/10"  },
  };
  const styles = colorMap[color] || colorMap.blue;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${styles.border} ${styles.bg}`}>
      <div className="flex items-start gap-3">
        <Icon size={18} className={`${styles.icon} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
        </div>
      </div>
      <Link
        to={linkTo}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
      >
        {linkLabel}
        <ArrowRight size={11} />
      </Link>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function PlRentalProtectionPanel() {
  const { t } = useI18n();

  const cards = [
    {
      icon:      Shield,
      title:     t("plAdvanced.rentalProtection.najem.title"),
      desc:      t("plAdvanced.rentalProtection.najem.desc"),
      linkTo:    "/compliance/poland",
      linkLabel: t("plAdvanced.rentalProtection.najem.go"),
      color:     "blue",
    },
    {
      icon:      BookOpen,
      title:     t("plAdvanced.rentalProtection.evidence.title"),
      desc:      t("plAdvanced.rentalProtection.evidence.desc"),
      linkTo:    "/compliance/poland",
      linkLabel: t("plAdvanced.rentalProtection.evidence.go"),
      color:     "green",
    },
    {
      icon:      FolderOpen,
      title:     t("plAdvanced.rentalProtection.docs.title"),
      desc:      t("plAdvanced.rentalProtection.docs.desc"),
      linkTo:    "/documents",
      linkLabel: t("plAdvanced.rentalProtection.docs.go"),
      color:     "purple",
    },
    {
      icon:      FileText,
      title:     t("plAdvanced.rentalProtection.lease.title"),
      desc:      t("plAdvanced.rentalProtection.lease.desc"),
      linkTo:    "/compliance/lease-auditor",
      linkLabel: t("plAdvanced.rentalProtection.lease.go"),
      color:     "amber",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {t("plAdvanced.rentalProtection.title")}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          {t("plAdvanced.rentalProtection.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {cards.map((card) => (
          <ProtectionCard key={card.linkTo + card.title} {...card} />
        ))}
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 italic pt-1">
        {t("plAdvanced.rentalProtection.disclaimer")}
      </p>
    </div>
  );
}
