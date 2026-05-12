import { ArrowRight, Building2, FileText, Lock, Shield, Sparkles, Users } from "lucide-react";
import { useI18n } from "../../context/I18nContext";

// ── Feature card ──────────────────────────────────────────────────────────────

function FeatureCard({ icon: Icon, title, desc, locked, lockedLabel, onNavigate }) {
  return (
    <div className={`rounded-xl border p-4 space-y-2 transition-colors ${
      locked
        ? "border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"
        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700"
    }`}
      role={locked ? undefined : "button"}
      tabIndex={locked ? undefined : 0}
      onClick={locked ? undefined : onNavigate}
      onKeyDown={locked ? undefined : (e) => e.key === "Enter" && onNavigate?.()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={15} className={locked ? "text-slate-300 dark:text-slate-600" : "text-blue-500"} />
          <p className={`text-sm font-medium ${locked ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-200"}`}>
            {title}
          </p>
        </div>
        {locked
          ? <Lock size={13} className="text-slate-300 dark:text-slate-600 shrink-0 mt-0.5" />
          : <ArrowRight size={13} className="text-slate-400 shrink-0 mt-0.5" />
        }
      </div>
      <p className={`text-xs leading-relaxed ${locked ? "text-slate-400 dark:text-slate-600" : "text-slate-500 dark:text-slate-400"}`}>
        {desc}
      </p>
      {locked && (
        <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
          {lockedLabel}
        </span>
      )}
    </div>
  );
}

// ── Next action banner ────────────────────────────────────────────────────────

function NextActionBanner({ label, t, onNavigate }) {
  if (!label) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10 px-4 py-3">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-blue-500 shrink-0" />
        <div>
          <p className="text-xs font-medium text-blue-700 dark:text-blue-300">{t("plAdvanced.overview.nextAction")}</p>
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5">{label}</p>
        </div>
      </div>
      {onNavigate && (
        <button
          type="button"
          onClick={onNavigate}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shrink-0 flex items-center gap-1.5"
        >
          {t("plAdvanced.overview.goTo")} <ArrowRight size={11} />
        </button>
      )}
    </div>
  );
}

// ── Main overview panel ───────────────────────────────────────────────────────

export default function PlOverviewPanel({
  hasStr,
  hasRentMatch,
  hasTemplates,
  hasPartners,
  hasPolandCompliance,
  onTabChange,
}) {
  const { t } = useI18n();

  // Determine the highest-priority next action based on available features.
  // We don't fetch live data here — that's done in individual tabs.
  // This is a static routing helper based on plan entitlements.
  function resolveNextAction() {
    if (hasPolandCompliance) {
      return { key: "rentalProt", tab: "rentalProtection" };
    }
    if (hasStr) {
      return { key: "strReg", tab: "str" };
    }
    if (hasRentMatch) {
      return { key: "rentMatch", tab: "rent" };
    }
    if (hasTemplates) {
      return { key: "templates", tab: "templates" };
    }
    return null;
  }

  const next = resolveNextAction();

  const cards = [
    {
      id: "rentalProtection",
      icon: Shield,
      title: t("plAdvanced.overview.rentalProtCard.title"),
      desc:  t("plAdvanced.overview.rentalProtCard.desc"),
      locked: !hasPolandCompliance,
      lockedLabel: t("plAdvanced.upgradeGate.badge"),
      tab: "rentalProtection",
    },
    {
      id: "str",
      icon: Building2,
      title: t("plAdvanced.overview.strCard.title"),
      desc:  t("plAdvanced.overview.strCard.desc"),
      locked: !hasStr,
      lockedLabel: t("plAdvanced.overview.strCard.locked"),
      tab: "str",
    },
    {
      id: "rent",
      icon: Sparkles,
      title: t("plAdvanced.overview.rentCard.title"),
      desc:  t("plAdvanced.overview.rentCard.desc"),
      locked: !hasRentMatch,
      lockedLabel: t("plAdvanced.overview.rentCard.locked"),
      tab: "rent",
    },
    {
      id: "templates",
      icon: FileText,
      title: t("plAdvanced.overview.templatesCard.title"),
      desc:  t("plAdvanced.overview.templatesCard.desc"),
      locked: !hasTemplates,
      lockedLabel: t("plAdvanced.overview.templatesCard.locked"),
      tab: "templates",
    },
    {
      id: "partners",
      icon: Users,
      title: t("plAdvanced.overview.partnersCard.title"),
      desc:  t("plAdvanced.overview.partnersCard.desc"),
      locked: !hasPartners,
      lockedLabel: t("plAdvanced.overview.partnersCard.locked"),
      tab: "partners",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {t("plAdvanced.overview.title")}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {t("plAdvanced.overview.subtitle")}
        </p>
      </div>

      {next && (
        <NextActionBanner
          label={t(`plAdvanced.overview.nextAction.${next.key}`)}
          t={t}
          onNavigate={() => onTabChange?.(next.tab)}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((card) => (
          <FeatureCard
            key={card.id}
            icon={card.icon}
            title={card.title}
            desc={card.desc}
            locked={card.locked}
            lockedLabel={card.lockedLabel}
            onNavigate={card.locked ? undefined : () => onTabChange?.(card.tab)}
          />
        ))}
      </div>
    </div>
  );
}
