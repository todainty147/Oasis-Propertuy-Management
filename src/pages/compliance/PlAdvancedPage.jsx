import { useState } from "react";
import {
  AlertTriangle, ArrowLeft, Building2, FileText, Landmark, Lock, Shield, Users,
} from "lucide-react";
import { useAccount }    from "../../context/AccountContext";
import { useI18n }       from "../../context/I18nContext";
import { ENTITLEMENT_FEATURES } from "../../lib/entitlements";
import PlRentalProtectionPanel from "../../components/compliance/PlRentalProtectionPanel";
import PlRentMatchPanel        from "../../components/compliance/PlRentMatchPanel";
import PlStrCompliancePanel    from "../../components/compliance/PlStrCompliancePanel";
import PlTemplatePanel         from "../../components/compliance/PlTemplatePanel";
import PlPartnerPanel          from "../../components/compliance/PlPartnerPanel";

// ── Upgrade gate ──────────────────────────────────────────────────────────────

function UpgradeGate({ t }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-8 text-center space-y-3">
      <div className="text-2xl" aria-hidden>🇵🇱</div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        {t("plAdvanced.upgradeGate.title")}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
        {t("plAdvanced.upgradeGate.body")}
      </p>
      <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
        {t("plAdvanced.upgradeGate.badge")}
      </span>
    </div>
  );
}

// ── Overview feature card ─────────────────────────────────────────────────────

function FeatureCard({ icon: Icon, title, desc, locked, lockedLabel, onClick }) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      className={`w-full text-left rounded-xl border p-4 space-y-2 transition-colors ${
        locked
          ? "border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 cursor-default"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={15} className={locked ? "text-slate-300 dark:text-slate-600" : "text-blue-500"} />
          <p className={`text-sm font-medium ${locked ? "text-slate-400 dark:text-slate-500" : "text-slate-800 dark:text-slate-200"}`}>
            {title}
          </p>
        </div>
        {locked
          ? <Lock size={12} className="text-slate-300 dark:text-slate-600 shrink-0 mt-0.5" />
          : <ArrowLeft size={12} className="text-slate-400 shrink-0 mt-0.5 rotate-180" />
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
    </button>
  );
}

// ── Section breadcrumb ────────────────────────────────────────────────────────

function SectionBreadcrumb({ label, onBack, t }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline mb-1"
    >
      <ArrowLeft size={12} />
      {t("plAdvanced.backToOverview")}
      {label && <span className="text-slate-400 font-normal">/ {label}</span>}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlAdvancedPage() {
  const { t }                           = useI18n();
  const { activeAccount, hasEntitlement } = useAccount();

  const hasPolandCompliance = hasEntitlement(ENTITLEMENT_FEATURES.POLAND_COMPLIANCE);
  const hasStr              = hasEntitlement(ENTITLEMENT_FEATURES.PL_STR_COMPLIANCE);
  const hasRentMatch        = hasEntitlement(ENTITLEMENT_FEATURES.PL_OPEN_BANKING_READINESS);
  const hasTemplates        = hasEntitlement(ENTITLEMENT_FEATURES.PL_TEMPLATE_LIBRARY);
  const hasPartners         = hasEntitlement(ENTITLEMENT_FEATURES.PL_PARTNER_DIRECTORY);
  const hasAny              = hasPolandCompliance || hasStr || hasRentMatch || hasTemplates || hasPartners;

  // null = overview, string = section id
  const [section, setSection] = useState(null);

  const cards = [
    {
      id:          "rentalProtection",
      icon:        Shield,
      title:       t("plAdvanced.overview.rentalProtCard.title"),
      desc:        t("plAdvanced.overview.rentalProtCard.desc"),
      locked:      !hasPolandCompliance,
      lockedLabel: t("plAdvanced.upgradeGate.badge"),
    },
    {
      id:          "str",
      icon:        Building2,
      title:       t("plAdvanced.overview.strCard.title"),
      desc:        t("plAdvanced.overview.strCard.desc"),
      locked:      !hasStr,
      lockedLabel: t("plAdvanced.overview.strCard.locked"),
    },
    {
      id:          "rent",
      icon:        Landmark,
      title:       t("plAdvanced.overview.rentCard.title"),
      desc:        t("plAdvanced.overview.rentCard.desc"),
      locked:      !hasRentMatch,
      lockedLabel: t("plAdvanced.overview.rentCard.locked"),
    },
    {
      id:          "templates",
      icon:        FileText,
      title:       t("plAdvanced.overview.templatesCard.title"),
      desc:        t("plAdvanced.overview.templatesCard.desc"),
      locked:      !hasTemplates,
      lockedLabel: t("plAdvanced.overview.templatesCard.locked"),
    },
    {
      id:          "partners",
      icon:        Users,
      title:       t("plAdvanced.overview.partnersCard.title"),
      desc:        t("plAdvanced.overview.partnersCard.desc"),
      locked:      !hasPartners,
      lockedLabel: t("plAdvanced.overview.partnersCard.locked"),
    },
  ];

  const activeCard = cards.find((c) => c.id === section);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg" aria-hidden>🇵🇱</span>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {t("plAdvanced.pageTitle")}
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 font-medium">
            {t("plAdvanced.featurePreviewBadge")}
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("plAdvanced.pageSubtitle")}
        </p>
      </div>

      {/* Global disclaimer — shown once at page level */}
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
        <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t("plAdvanced.globalDisclaimer")}
        </p>
      </div>

      {!hasAny ? (
        <UpgradeGate t={t} />
      ) : section === null ? (
        /* ── Overview — card grid ── */
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {t("plAdvanced.overview.title")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t("plAdvanced.overview.subtitle")}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cards.map((card) => (
              <FeatureCard
                key={card.id}
                icon={card.icon}
                title={card.title}
                desc={card.desc}
                locked={card.locked}
                lockedLabel={card.lockedLabel}
                onClick={() => setSection(card.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        /* ── Section view with breadcrumb ── */
        <div className="space-y-4">
          <SectionBreadcrumb
            label={activeCard?.title}
            onBack={() => setSection(null)}
            t={t}
          />

          {section === "rentalProtection" && (
            hasPolandCompliance
              ? <PlRentalProtectionPanel />
              : <UpgradeGate t={t} />
          )}

          {section === "str" && (
            hasStr
              ? <PlStrCompliancePanel accountId={activeAccount?.id} propertyId={null} />
              : <UpgradeGate t={t} />
          )}

          {section === "rent" && (
            hasRentMatch
              ? <PlRentMatchPanel
                  accountId={activeAccount?.id}
                  propertyId={null}
                  tenantId={null}
                  leaseId={null}
                />
              : <UpgradeGate t={t} />
          )}

          {section === "templates" && (
            hasTemplates
              ? <PlTemplatePanel market="pl" />
              : <UpgradeGate t={t} />
          )}

          {section === "partners" && (
            hasPartners
              ? <PlPartnerPanel market="pl" accountId={activeAccount?.id} />
              : <UpgradeGate t={t} />
          )}
        </div>
      )}
    </div>
  );
}
