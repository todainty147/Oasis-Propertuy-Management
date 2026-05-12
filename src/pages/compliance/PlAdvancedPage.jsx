import { useState } from "react";
import {
  AlertTriangle, Building2, FileText, Landmark, LayoutDashboard, Shield, Users,
} from "lucide-react";
import { useAccount }    from "../../context/AccountContext";
import { useI18n }       from "../../context/I18nContext";
import { ENTITLEMENT_FEATURES } from "../../lib/entitlements";
import PlOverviewPanel         from "../../components/compliance/PlOverviewPanel";
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

// ── Tab button ────────────────────────────────────────────────────────────────

function TabBtn({ id, active, label, icon: Icon, locked, onClick }) {
  return (
    <button
      type="button"
      onClick={() => !locked && onClick(id)}
      aria-selected={active}
      role="tab"
      className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors whitespace-nowrap ${
        active
          ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-950/30 dark:text-blue-300"
          : locked
            ? "text-slate-300 dark:text-slate-600 cursor-default"
            : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      <Icon size={14} />
      {label}
      {locked && (
        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 px-1 rounded ml-0.5">
          Pro
        </span>
      )}
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

  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { id: "overview",          label: t("plAdvanced.tab.overview"),          icon: LayoutDashboard, locked: false },
    { id: "rentalProtection",  label: t("plAdvanced.tab.rentalProtection"),  icon: Shield,          locked: !hasPolandCompliance },
    { id: "str",               label: t("plAdvanced.tab.str"),               icon: Building2,       locked: !hasStr },
    { id: "rent",              label: t("plAdvanced.tab.rentMatch"),         icon: Landmark,        locked: !hasRentMatch },
    { id: "templates",         label: t("plAdvanced.tab.templates"),         icon: FileText,        locked: !hasTemplates },
    { id: "partners",          label: t("plAdvanced.tab.partners"),          icon: Users,           locked: !hasPartners },
  ];

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
      ) : (
        <>
          {/* Tab navigation */}
          <div
            role="tablist"
            className="flex gap-1 flex-wrap border-b border-slate-100 dark:border-slate-800 pb-2 -mx-1 px-1 overflow-x-auto"
          >
            {tabs.map((tab) => (
              <TabBtn
                key={tab.id}
                id={tab.id}
                active={activeTab === tab.id}
                label={tab.label}
                icon={tab.icon}
                locked={tab.locked}
                onClick={setActiveTab}
              />
            ))}
          </div>

          {/* Tab content */}
          <div role="tabpanel">
            {activeTab === "overview" && (
              <PlOverviewPanel
                hasStr={hasStr}
                hasRentMatch={hasRentMatch}
                hasTemplates={hasTemplates}
                hasPartners={hasPartners}
                hasPolandCompliance={hasPolandCompliance}
                onTabChange={setActiveTab}
              />
            )}

            {activeTab === "rentalProtection" && (
              hasPolandCompliance
                ? <PlRentalProtectionPanel />
                : <UpgradeGate t={t} />
            )}

            {activeTab === "str" && (
              hasStr
                ? <PlStrCompliancePanel accountId={activeAccount?.id} propertyId={null} />
                : <UpgradeGate t={t} />
            )}

            {activeTab === "rent" && (
              hasRentMatch
                ? <PlRentMatchPanel
                    accountId={activeAccount?.id}
                    propertyId={null}
                    tenantId={null}
                    leaseId={null}
                  />
                : <UpgradeGate t={t} />
            )}

            {activeTab === "templates" && (
              hasTemplates
                ? <PlTemplatePanel market="pl" />
                : <UpgradeGate t={t} />
            )}

            {activeTab === "partners" && (
              hasPartners
                ? <PlPartnerPanel market="pl" />
                : <UpgradeGate t={t} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
