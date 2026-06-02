// src/layout/Sidebar.jsx
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Home,
  Users,
  UserPlus,
  UserCog,
  Rows3,
  Wallet,
  CreditCard,
  FileText,
  X,
  Wrench,
  BarChart3,
  LineChart,
  Palette,
  Map,
  ChevronDown,
  AlertCircle,
  CalendarDays,
  Zap,
  Shield,
  Activity,
  DatabaseZap,
  Scale,
  Receipt,
  PlugZap,
  Umbrella,
  FileSearch,
  ShieldCheck,
  Lock,
  Leaf,
  Globe,
  Flag,
  CalendarClock,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { APP_LANGUAGES } from "../i18n/languages";
import { can, isManageRole } from "../utils/permissions";
import TenantSwitcher from "../components/TenantSwitcher";
import BrandLogo from "../components/BrandLogo";
import { ENTITLEMENT_FEATURES } from "../lib/entitlements";
import { isPolishMarket } from "../utils/complianceMarket";

/* ─────────────────────────────────────────────
   NAV ITEM
   Active: translucent fill (macOS Finder style).
   No rings, no colour shifts — just weight + fill.
───────────────────────────────────────────── */

function Item({ to, icon, label, onNavigate, end = false }) {
  const IconComponent = icon;
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-2.5 py-[5px] rounded-md text-[13px] leading-5 transition-colors duration-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/60 dark:focus-visible:ring-slate-500/70 ${
          isActive
            ? "bg-black/[0.07] dark:bg-white/[0.09] text-slate-900 dark:text-slate-100 font-[500]"
            : "text-slate-500 dark:text-slate-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] hover:text-slate-800 dark:hover:text-slate-200"
        }`
      }
    >
      <IconComponent size={14} strokeWidth={1.7} className="shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
}

/* ─────────────────────────────────────────────
   LOCKED NAV ITEM
   Dimmed opacity + small lock badge. Navigable
   so the plan-upgrade page can be reached.
───────────────────────────────────────────── */

function LockedItem({ to, icon, label, onNavigate }) {
  const IconComponent = icon;
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className="flex items-center gap-2.5 px-2.5 py-[5px] rounded-md text-[13px] leading-5 text-slate-400/60 dark:text-slate-600 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/60 dark:focus-visible:ring-slate-500/70"
      data-testid={`locked-nav-${to.replace(/\//g, "-").replace(/^-/, "")}`}
    >
      {/* <Lock icon marks feature-flagged or plan-gated destinations. */}
      <IconComponent size={14} strokeWidth={1.7} className="shrink-0" />
      <span className="flex-1">{label}</span>
      <Lock size={10} className="shrink-0 opacity-40" aria-label="Requires upgrade" />
    </NavLink>
  );
}

function FooterLanguagePicker({ lang, setLang, t }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const activeLanguage = APP_LANGUAGES.find((language) => language.code === lang) || APP_LANGUAGES[1];

  useEffect(() => {
    function onDown(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }

    function onEsc(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-lg bg-black/[0.04] px-2 text-left text-[11px] text-slate-500 transition-colors hover:bg-black/[0.07] hover:text-slate-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/60 dark:bg-white/[0.05] dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-200 dark:focus-visible:ring-slate-500/70"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("topbar.language")}
      >
        <Globe size={11} strokeWidth={1.8} className="shrink-0 text-slate-400" />
        <span aria-hidden="true">{activeLanguage.flag}</span>
        <span className="truncate font-medium">{activeLanguage.code.toUpperCase()}</span>
        <ChevronDown size={11} strokeWidth={1.8} className={`ml-auto shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          className="absolute bottom-full left-0 z-50 mb-2 w-44 overflow-hidden rounded-xl border border-black/[0.08] bg-white p-1.5 shadow-xl dark:border-white/[0.08] dark:bg-[#2C2C2E]"
          role="menu"
          aria-label={t("topbar.language")}
        >
          {APP_LANGUAGES.map((language) => {
            const active = language.code === lang;
            return (
              <button
                key={language.code}
                type="button"
                onClick={() => {
                  setLang(language.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/60 dark:focus-visible:ring-slate-500/70 ${
                  active
                    ? "bg-black/[0.07] font-medium text-slate-900 dark:bg-white/[0.09] dark:text-white"
                    : "text-slate-600 hover:bg-black/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.06]"
                }`}
                role="menuitemradio"
                aria-checked={active}
              >
                <span aria-hidden="true">{language.flag}</span>
                <span className="min-w-0 flex-1 truncate">{t(language.labelKey)}</span>
                <span className="text-[10px] uppercase text-slate-400">{language.code}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FooterThemeSegment({ theme, setTheme, t }) {
  const items = [
    { key: "light", label: t("theme.light"), icon: Sun },
    { key: "system", label: t("theme.system"), icon: Monitor },
    { key: "dark", label: t("theme.dark"), icon: Moon },
  ];

  return (
    <div
      className="flex h-7 rounded-lg bg-black/[0.04] p-[2px] dark:bg-white/[0.05]"
      role="group"
      aria-label={t("topbar.theme")}
    >
      {items.map(({ key, label, icon }) => {
        const IconComponent = icon;
        const active = theme === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setTheme(key)}
            className={`flex h-full w-7 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/60 dark:focus-visible:ring-slate-500/70 ${
              active
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
            }`}
            aria-label={label}
            aria-pressed={active}
            title={label}
          >
            <IconComponent size={12} strokeWidth={1.8} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SECTION
   Non-collapsible: just a heading + children.
   Collapsible: chevron rotates in-place (no
   icon swap) to signal the open/closed state.
───────────────────────────────────────────── */

function Section({ label, sectionIcon: SectionIcon, collapsible = false, open = true, onToggle, children }) {
  const headingClass =
    "flex items-center gap-1 px-2.5 pt-5 pb-[5px] text-[10px] font-semibold uppercase tracking-widest text-slate-400/80 dark:text-slate-500";

  return (
    <div>
      {label && (
        collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            className={`${headingClass} w-full justify-between`}
          >
            <span className="flex items-center gap-1">
              {SectionIcon && <SectionIcon size={9} strokeWidth={2} />}
              {label}
            </span>
            <ChevronDown
              size={11}
              strokeWidth={2}
              className={`transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
            />
          </button>
        ) : (
          <p className={headingClass}>
            {SectionIcon && <SectionIcon size={9} strokeWidth={2} />}
            {label}
          </p>
        )
      )}
      {(!collapsible || open) && <div className="space-y-px">{children}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────
   ACCOUNT SWITCHER  (root operators only)
   Appears when managing multiple accounts.
───────────────────────────────────────────── */

function AccountSwitcher() {
  const { accounts, activeAccountId, switchAccount, accountLoading, isRootOperator } = useAccount();
  const { t } = useI18n();

  if (accountLoading || !isRootOperator || accounts.length <= 1) return null;

  return (
    <select
      value={activeAccountId ?? ""}
      onChange={(e) => switchAccount(e.target.value)}
      className="w-full rounded-md px-2.5 py-[5px] text-[12px] bg-black/[0.05] dark:bg-white/[0.05] text-slate-700 dark:text-slate-300 border-0 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600"
      aria-label={t("tenantPortal.shell.accountLabel")}
    >
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>{a.name}</option>
      ))}
    </select>
  );
}

/* ─────────────────────────────────────────────
   SIDEBAR CONTENT
───────────────────────────────────────────── */

function SidebarContent({ onNavigate }) {
  const {
    activeRole,
    activeAccount,
    activeAccountId,
    activePermissionContext,
    isRootOperator,
    canAccessTelemetry,
    hasEntitlement,
  } = useAccount();
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();

  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const isContractor = role === "contractor";
  const isTenant    = role === "tenant";
  const canManage   = isManageRole(role, { isRootOperator });
  const isOwner     = role === "owner";

  const canReadProperties = isTenant || isRootOperator || can(activePermissionContext, "properties", "read");
  const canReadTenants    = isRootOperator || can(activePermissionContext, "tenants", "read");
  const canReadFinance    = isTenant || isRootOperator || can(activePermissionContext, "finance", "read");
  const canReadDocuments  = isTenant || isRootOperator || can(activePermissionContext, "documents", "read");

  const [operationsOpen, setOperationsOpen] = useState(true);
  const [complianceOpen, setComplianceOpen] = useState(true);
  const [adminOpen,      setAdminOpen]      = useState(true);

  // Onboarding banner dismissal — persisted per account/user
  const [dismissedOnboardingKey, setDismissedOnboardingKey] = useState(null);
  const userId          = user?.id || null;
  const onboardingKey   = activeAccountId && userId
    ? `sidebar_onboarding_hidden:${activeAccountId}:${userId}`
    : null;

  let onboardingHidden = false;
  if (isOwner && onboardingKey) {
    try {
      onboardingHidden =
        dismissedOnboardingKey === onboardingKey ||
        localStorage.getItem(onboardingKey) === "1";
    } catch {
      onboardingHidden = dismissedOnboardingKey === onboardingKey;
    }
  }

  function dismissOnboarding() {
    if (!onboardingKey) return;
    setDismissedOnboardingKey(onboardingKey);
    try { localStorage.setItem(onboardingKey, "1"); } catch { /* ignore */ }
  }

  return (
    <div className="h-full flex flex-col">

      {/* ── Logo + mobile close ── */}
      <div className="px-3.5 pt-4 pb-3 flex items-center justify-between shrink-0">
        <BrandLogo
          variant="sidebar"
          compact={Boolean(onNavigate)}
          showSubtitle={!onNavigate}
          className="min-w-0"
        />
        {onNavigate && (
          <button
            onClick={onNavigate}
            aria-label={t("common.close")}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
          >
            <X size={15} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* ── Account switcher (root only) ── */}
      {!isContractor && (
        <div className="px-2.5 mb-1.5">
          <AccountSwitcher />
        </div>
      )}

      {/* ── Tenant context (managers only) ── */}
      {canManage && (
        <div className="px-2.5 mb-1">
          <TenantSwitcher
            showWhenEmpty
            className="w-full border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 disabled:bg-slate-50 dark:disabled:bg-slate-800 text-[12px]"
          />
        </div>
      )}

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-2.5 pb-2">

        {/* ── Contractor view ── */}
        {isContractor ? (
          <div className="pt-2">
            <Item
              to="/contractor"
              icon={Wrench}
              label={t("sidebar.contractorPortal")}
              onNavigate={onNavigate}
            />
          </div>
        ) : (
          <div>

            {/* Onboarding hint — subtle left-accent card */}
            {isOwner && !onboardingHidden && (
              <div className="mt-2 mb-1 flex items-center gap-2 rounded-md border-l-2 border-blue-500/70 bg-blue-50/70 dark:bg-blue-950/25 px-3 py-2">
                <NavLink
                  to="/landlord-onboarding"
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex-1 flex items-center gap-2 text-[12px] font-medium ${
                      isActive
                        ? "text-blue-700 dark:text-blue-300"
                        : "text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300"
                    }`
                  }
                >
                  <Map size={12} strokeWidth={1.8} />
                  <span>{t("sidebar.landlordOnboarding")}</span>
                </NavLink>
                <button
                  type="button"
                  onClick={dismissOnboarding}
                  aria-label={t("common.hide")}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0"
                >
                  <X size={11} strokeWidth={2} />
                </button>
              </div>
            )}

            {/* ── Core ── */}
            <Section label={t("sidebar.section.core")}>
              <Item
                to={isTenant ? "/tenant/home" : "/dashboard"}
                icon={LayoutDashboard}
                label={t("sidebar.dashboard")}
                onNavigate={onNavigate}
              />
              {canReadProperties && (
                <Item
                  to={isTenant ? "/tenant/property" : "/properties"}
                  icon={Home}
                  label={t("sidebar.properties")}
                  onNavigate={onNavigate}
                />
              )}
              {canReadTenants && !isTenant && (
                <Item to="/tenants" icon={Users} label={t("sidebar.tenants")} onNavigate={onNavigate} />
              )}
              {canReadFinance && (
                <Item
                  to={isTenant ? "/tenant/payments" : "/finance"}
                  icon={Wallet}
                  label={t("sidebar.finance")}
                  onNavigate={onNavigate}
                  end
                />
              )}
              {canReadFinance && !isTenant && hasEntitlement(ENTITLEMENT_FEATURES.RENT_RULES_CORE) && (
                <Item
                  to="/finance/rent-plans"
                  icon={CalendarClock}
                  label={t("sidebar.rentPlans")}
                  onNavigate={onNavigate}
                />
              )}
              {canReadFinance && !isTenant && (
                hasEntitlement(ENTITLEMENT_FEATURES.DEPOSIT_DEDUCTIONS_LOG) ||
                hasEntitlement(ENTITLEMENT_FEATURES.DEPOSIT_SETTLEMENT_STATEMENT)
              ) && (
                <Item
                  to="/finance/deposit-vault"
                  icon={ShieldCheck}
                  label="Deposit Vault"
                  onNavigate={onNavigate}
                />
              )}
              {canReadDocuments && (
                <Item
                  to={isTenant ? "/tenant/documents" : "/documents"}
                  icon={FileText}
                  label={t("sidebar.documents")}
                  onNavigate={onNavigate}
                  end
                />
              )}
              {canManage && (
                hasEntitlement(ENTITLEMENT_FEATURES.EVIDENCE_VAULT) ? (
                  <Item
                    to="/documents/evidence-vault"
                    icon={ShieldCheck}
                    label={t("sidebar.evidenceVault")}
                    onNavigate={onNavigate}
                  />
                ) : (
                  <LockedItem to="/documents/evidence-vault" icon={ShieldCheck} label={t("sidebar.evidenceVault")} onNavigate={onNavigate} />
                )
              )}
            </Section>

            {/* ── Operations ── */}
            {canManage && (
              <Section
                label={t("sidebar.section.operations")}
                collapsible
                open={operationsOpen}
                onToggle={() => setOperationsOpen((v) => !v)}
              >
                <Item to="/maintenance-inbox" icon={Wrench}       label={t("sidebar.maintenanceInbox")} onNavigate={onNavigate} />
                <Item to="/operating-calendar" icon={CalendarDays} label="Operating Calendar"            onNavigate={onNavigate} />
                {hasEntitlement(ENTITLEMENT_FEATURES.COMMAND_CENTER) && (
                  <Item to="/command-center"  icon={AlertCircle}  label={t("sidebar.commandCenter")}   onNavigate={onNavigate} />
                )}
                {hasEntitlement(ENTITLEMENT_FEATURES.MAINTENANCE_KPI) && (
                  <Item to="/maintenance-kpi" icon={BarChart3}    label={t("sidebar.maintenanceKpi")}  onNavigate={onNavigate} />
                )}
                {hasEntitlement(ENTITLEMENT_FEATURES.PORTFOLIO_HEALTH) && (
                  <Item to="/portfolio-health" icon={LineChart}   label={t("sidebar.portfolioHealth")} onNavigate={onNavigate} />
                )}
                {(hasEntitlement(ENTITLEMENT_FEATURES.ECO_UPGRADE_PLANNER) || hasEntitlement(ENTITLEMENT_FEATURES.PORTFOLIO_HEALTH_ECO_COMPLIANCE)) && (
                  <Item to="/portfolio-health/eco-upgrade-planner" icon={Leaf} label="Eco-Upgrade Planner" onNavigate={onNavigate} />
                )}
                {(hasEntitlement(ENTITLEMENT_FEATURES.TENANT_APPLICATION_LINKS) || hasEntitlement(ENTITLEMENT_FEATURES.APPLICANT_PRESCREENING_DASHBOARD)) ? (
                  <Item to="/applications" icon={UserPlus} label={t("sidebar.applications")} onNavigate={onNavigate} />
                ) : (
                  <LockedItem to="/applications" icon={UserPlus} label={t("sidebar.applications")} onNavigate={onNavigate} />
                )}
              </Section>
            )}

            {/* ── Compliance ── */}
            {canManage && (
              <Section
                label={t("sidebar.section.compliance")}
                sectionIcon={Scale}
                collapsible
                open={complianceOpen}
                onToggle={() => setComplianceOpen((v) => !v)}
              >
                {(hasEntitlement(ENTITLEMENT_FEATURES.TAX_READINESS_DASHBOARD) || hasEntitlement(ENTITLEMENT_FEATURES.TAX_TOOLS_IN_APP)) ? (
                  <Item       to="/compliance/tax-tools" icon={Receipt} label={t("sidebar.taxTools")} onNavigate={onNavigate} />
                ) : (
                  <LockedItem to="/compliance/tax-tools" icon={Receipt} label={t("sidebar.taxTools")} onNavigate={onNavigate} />
                )}
                {hasEntitlement(ENTITLEMENT_FEATURES.HMRC_MTD_CONNECTION) && (
                  <Item       to="/compliance/hmrc-connection" icon={PlugZap} label="HMRC Connection" onNavigate={onNavigate} />
                )}
                {hasEntitlement(ENTITLEMENT_FEATURES.COMPLIANCE_SAFE) ? (
                  <Item       to="/compliance/safe" icon={Shield} label={t("sidebar.complianceSafe")} onNavigate={onNavigate} />
                ) : (
                  <LockedItem to="/compliance/safe" icon={Shield} label={t("sidebar.complianceSafe")} onNavigate={onNavigate} />
                )}
                {hasEntitlement(ENTITLEMENT_FEATURES.TAX_READINESS_DASHBOARD) ? (
                  <Item to="/compliance/rent-shield" icon={Umbrella} label={t("sidebar.rentShield")} onNavigate={onNavigate} />
                ) : (
                  <LockedItem to="/compliance/rent-shield" icon={Umbrella} label={t("sidebar.rentShield")} onNavigate={onNavigate} />
                )}
                {hasEntitlement(ENTITLEMENT_FEATURES.AI_LEASE_AUDITOR) ? (
                  <Item       to="/compliance/leases"         icon={FileSearch}  label={t("sidebar.leaseAuditor")}   onNavigate={onNavigate} />
                ) : (
                  <LockedItem to="/compliance/leases"         icon={FileSearch}  label={t("sidebar.leaseAuditor")}   onNavigate={onNavigate} />
                )}
                {hasEntitlement(ENTITLEMENT_FEATURES.RENTERS_RIGHTS_READINESS) ? (
                  <Item       to="/compliance/renters-rights" icon={ShieldCheck} label={t("sidebar.rentersRights")}  onNavigate={onNavigate} />
                ) : (
                  <LockedItem to="/compliance/renters-rights" icon={ShieldCheck} label={t("sidebar.rentersRights")}  onNavigate={onNavigate} />
                )}
                {isPolishMarket({ account: activeAccount || {} }) && (
                  hasEntitlement(ENTITLEMENT_FEATURES.POLAND_COMPLIANCE) ? (
                    <Item       to="/compliance/poland" icon={Flag} label={t("sidebar.polandCompliance")} onNavigate={onNavigate} />
                  ) : (
                    <LockedItem to="/compliance/poland" icon={Flag} label={t("sidebar.polandCompliance")} onNavigate={onNavigate} />
                  )
                )}
                {isPolishMarket({ account: activeAccount || {} }) && (
                  hasEntitlement(ENTITLEMENT_FEATURES.PL_STR_COMPLIANCE) ||
                  hasEntitlement(ENTITLEMENT_FEATURES.PL_OPEN_BANKING_READINESS) ||
                  hasEntitlement(ENTITLEMENT_FEATURES.PL_TEMPLATE_LIBRARY) ||
                  hasEntitlement(ENTITLEMENT_FEATURES.PL_PARTNER_DIRECTORY)
                ) && (
                  <Item to="/compliance/poland-advanced" icon={Flag} label={t("sidebar.plAdvanced")} onNavigate={onNavigate} />
                )}
              </Section>
            )}

            {/* ── Settings ── */}
            {canManage && (
              <Section
                label={t("sidebar.section.adminSettings")}
                collapsible
                open={adminOpen}
                onToggle={() => setAdminOpen((v) => !v)}
              >
                <Item to="/invitations"           icon={UserPlus}    label={t("sidebar.invitations")}  onNavigate={onNavigate} />
                <Item to="/settings/roles"         icon={UserCog}     label="Roles"                     onNavigate={onNavigate} />
                <Item to="/settings/custom-fields" icon={Rows3}       label="Custom fields"             onNavigate={onNavigate} />
                <Item to="/settings/billing"       icon={CreditCard}  label={t("sidebar.billing")}     onNavigate={onNavigate} />
                {hasEntitlement(ENTITLEMENT_FEATURES.PLAYBOOKS) && (
                  <Item to="/settings/playbooks"      icon={Zap}    label={t("sidebar.playbooks")}    onNavigate={onNavigate} />
                )}
                {hasEntitlement(ENTITLEMENT_FEATURES.SECURITY_AUDIT) && (
                  <Item to="/settings/security-audit" icon={Shield} label={t("sidebar.securityAudit")} onNavigate={onNavigate} />
                )}
                {canAccessTelemetry && hasEntitlement(ENTITLEMENT_FEATURES.ROOT_TELEMETRY) && (
                  <>
                    <Item to="/settings/root-telemetry" icon={Activity}    label={t("sidebar.rootTelemetry")} onNavigate={onNavigate} />
                    <Item to="/root/accounts"            icon={Users}       label={t("sidebar.rootAccounts")}  onNavigate={onNavigate} />
                    <Item to="/root/data-requests"       icon={DatabaseZap} label="Data Requests"               onNavigate={onNavigate} />
                  </>
                )}
                <Item to="/settings/data-privacy" icon={ShieldCheck} label="Data & Privacy" onNavigate={onNavigate} />
                {isOwner && (
                  <Item to="/settings/branding"      icon={Palette} label={t("sidebar.branding")}      onNavigate={onNavigate} />
                )}
                {(isOwner || role === "admin") && (
                  <Item to="/settings/localization"  icon={Globe}   label={t("sidebar.localization")}  onNavigate={onNavigate} />
                )}
              </Section>
            )}

          </div>
        )}
      </nav>

      {/* ── Footer: language · theme · user ──
          Controls that don't belong in navigation
          live here, quiet and out of the way.   */}
      <div className="shrink-0 px-3.5 py-3 border-t border-black/[0.06] dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <FooterLanguagePicker lang={lang} setLang={setLang} t={t} />
          <FooterThemeSegment theme={theme} setTheme={setTheme} t={t} />
        </div>
        {user?.email && (
          <p className="mt-1.5 text-[10px] text-slate-400/70 dark:text-slate-500 truncate leading-4">
            {user.email}
          </p>
        )}
      </div>

    </div>
  );
}

/* ─────────────────────────────────────────────
   SIDEBAR WRAPPER
───────────────────────────────────────────── */

export default function Sidebar({ open, isDesktop, onClose }) {
  if (isDesktop) {
    return (
      <aside className="w-[236px] shrink-0 bg-[#F5F5F7] dark:bg-[#1C1C1E] border-r border-black/[0.06] dark:border-white/[0.06]">
        <SidebarContent />
      </aside>
    );
  }

  if (!open) return null;

  return (
    <>
      {/* Frosted-glass backdrop — softer than a flat black overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 left-0 z-50 w-[236px] bg-[#F5F5F7] dark:bg-[#1C1C1E] shadow-2xl"
      >
        <SidebarContent onNavigate={onClose} />
      </aside>
    </>
  );
}
