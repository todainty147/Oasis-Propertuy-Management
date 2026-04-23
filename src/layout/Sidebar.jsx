// src/components/Sidebar.jsx
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
  ChevronRight,
  AlertCircle,
    Zap,
    Shield,
    Activity,
} from "lucide-react";

import { useMemo, useState } from "react";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { can, isManageRole } from "../utils/permissions";
import TenantSwitcher from "../components/TenantSwitcher";
import { ENTITLEMENT_FEATURES } from "../lib/entitlements";

/* ======================
   NAV ITEM
   ====================== */

function Item({ to, icon, label, onNavigate }) {
  const NavIcon = icon;

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
          isActive
            ? "bg-blue-50 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900"
            : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
        }`
      }
    >
      <NavIcon size={20} />
      <span className="font-medium">{label}</span>
    </NavLink>
  );
}

/* ======================
   ACCOUNT SWITCHER
   ====================== */

function AccountSwitcher() {
  const { accounts, activeAccountId, switchAccount, accountLoading, isRootOperator } = useAccount();

  if (accountLoading || !isRootOperator || accounts.length <= 1) return null;

  return (
    <select
      value={activeAccountId ?? ""}
      onChange={(e) => switchAccount(e.target.value)}
      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
      aria-label="Account"
    >
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

/* ======================
   SIDEBAR CONTENT
   ====================== */

function SidebarContent({ onNavigate }) {
  const {
    activeRole,
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
  const isTenant = role === "tenant";
  const canManage = isManageRole(role, { isRootOperator });
  const isOwner = role === "owner";
  const canReadProperties = isTenant || isRootOperator || can(activePermissionContext, "properties", "read");
  const canReadTenants = isRootOperator || can(activePermissionContext, "tenants", "read");
  const canReadFinance = isTenant || isRootOperator || can(activePermissionContext, "finance", "read");
  const canReadDocuments = isTenant || isRootOperator || can(activePermissionContext, "documents", "read");
  const [operationsOpen, setOperationsOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(true);
  const [dismissedOnboardingKey, setDismissedOnboardingKey] = useState(null);
  const userId = user?.id || null;
  const onboardingHiddenKey = activeAccountId && userId
    ? `sidebar_onboarding_hidden:${activeAccountId}:${userId}`
    : null;
  let onboardingHidden = false;
  if (isOwner && onboardingHiddenKey) {
    try {
      onboardingHidden =
        dismissedOnboardingKey === onboardingHiddenKey ||
        localStorage.getItem(onboardingHiddenKey) === "1";
    } catch {
      onboardingHidden = dismissedOnboardingKey === onboardingHiddenKey;
    }
  }

  function dismissOnboarding() {
    if (!onboardingHiddenKey) return;
    setDismissedOnboardingKey(onboardingHiddenKey);
    try {
      localStorage.setItem(onboardingHiddenKey, "1");
    } catch {
      // ignore localStorage failures
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            ORM
          </div>
          <span className="font-bold text-slate-900 dark:text-slate-100">{t("app.brand")}</span>
        </div>

        {onNavigate && (
          <button onClick={onNavigate} aria-label={t("common.close")}>
            <X size={20} />
          </button>
        )}
      </div>

      {/* Account switcher (hide for contractor) */}
      {!isContractor && (
        <div className="px-4 mb-3">
          <AccountSwitcher />
        </div>
      )}

      <div className="px-4 mb-3">
        <div className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">{t("topbar.language")}</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="text-sm bg-transparent focus:outline-none text-slate-800 dark:text-slate-200"
            aria-label={t("topbar.language")}
          >
            <option value="pl">{t("lang.polish")}</option>
            <option value="en">{t("lang.english")}</option>
          </select>
        </div>
      </div>

      <div className="px-4 mb-3">
        <div className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">{t("topbar.theme")}</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="text-sm bg-transparent focus:outline-none text-slate-800 dark:text-slate-200"
            aria-label={t("topbar.theme")}
          >
            <option value="system">{t("theme.system")}</option>
            <option value="light">{t("theme.light")}</option>
            <option value="dark">{t("theme.dark")}</option>
          </select>
        </div>
      </div>

      {/* Tenant switcher (only owner/admin/staff) */}
      {canManage && (
        <div className="px-4 mb-4">
          <TenantSwitcher
            showWhenEmpty
            className="w-full border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 disabled:bg-slate-100 dark:disabled:bg-slate-800"
          />
        </div>
      )}

      {/* Navigation */}
      <nav className="px-4 mt-2 pb-safe flex-1 overflow-y-auto">
        {/* CONTRACTOR MENU */}
        {isContractor ? (
          <div className="space-y-1">
            <Item
              to="/contractor"
              icon={Wrench}
              label={t("sidebar.contractorPortal")}
              onNavigate={onNavigate}
            />
          </div>
        ) : (
          <div className="space-y-5">
            {isOwner && !onboardingHidden && (
              <div className="space-y-2">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  {t("sidebar.section.gettingStarted")}
                </p>
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-1.5 dark:border-blue-900/70 dark:bg-blue-950/50">
                  <div className="flex items-center justify-between gap-2 px-2 py-1">
                    <NavLink
                      to="/landlord-onboarding"
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        `flex items-center gap-2 text-sm font-medium ${
                          isActive
                            ? "text-blue-700 dark:text-blue-200"
                            : "text-slate-700 hover:text-blue-700 dark:text-slate-100 dark:hover:text-blue-200"
                        }`
                      }
                    >
                      <Map size={16} />
                      <span>{t("sidebar.landlordOnboarding")}</span>
                    </NavLink>
                    <button
                      type="button"
                      onClick={dismissOnboarding}
                      className="ml-2 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white"
                      title={t("common.hide")}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("sidebar.section.core")}
              </p>
              <div className="space-y-1">
              <Item to={isTenant ? "/tenant/home" : "/dashboard"} icon={LayoutDashboard} label={t("sidebar.dashboard")} onNavigate={onNavigate} />
              {canReadProperties && (
                <Item to={isTenant ? "/tenant/property" : "/properties"} icon={Home} label={t("sidebar.properties")} onNavigate={onNavigate} />
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
                />
              )}
              {canReadDocuments && (
                <Item to={isTenant ? "/tenant/documents" : "/documents"} icon={FileText} label={t("sidebar.documents")} onNavigate={onNavigate} />
              )}
              </div>
            </div>

            {canManage && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setOperationsOpen((v) => !v)}
                  className="w-full px-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  <span>{t("sidebar.section.operations")}</span>
                  {operationsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <p className="px-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                  {t("sidebar.section.operationsHint")}
                </p>
                {operationsOpen && (
                  <div className="space-y-1">
                    <Item to="/maintenance-inbox" icon={Wrench} label={t("sidebar.maintenanceInbox")} onNavigate={onNavigate} />
                    {hasEntitlement(ENTITLEMENT_FEATURES.COMMAND_CENTER) ? (
                      <Item to="/command-center" icon={AlertCircle} label={t("sidebar.commandCenter")} onNavigate={onNavigate} />
                    ) : null}
                    {hasEntitlement(ENTITLEMENT_FEATURES.MAINTENANCE_KPI) ? (
                      <Item to="/maintenance-kpi" icon={BarChart3} label={t("sidebar.maintenanceKpi")} onNavigate={onNavigate} />
                    ) : null}
                    {hasEntitlement(ENTITLEMENT_FEATURES.PORTFOLIO_HEALTH) ? (
                      <Item to="/portfolio-health" icon={LineChart} label={t("sidebar.portfolioHealth")} onNavigate={onNavigate} />
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {canManage && (
              <div className="space-y-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setAdminOpen((v) => !v)}
                  className="w-full px-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  <span>{t("sidebar.section.adminSettings")}</span>
                  {adminOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {adminOpen && (
                  <div className="space-y-1">
                    <Item to="/invitations" icon={UserPlus} label={t("sidebar.invitations")} onNavigate={onNavigate} />
                    <Item to="/settings/roles" icon={UserCog} label="Roles" onNavigate={onNavigate} />
                    <Item to="/settings/custom-fields" icon={Rows3} label="Custom fields" onNavigate={onNavigate} />
                    <Item to="/settings/billing" icon={CreditCard} label={t("sidebar.billing")} onNavigate={onNavigate} />
                    {hasEntitlement(ENTITLEMENT_FEATURES.PLAYBOOKS) ? (
                      <Item to="/settings/playbooks" icon={Zap} label={t("sidebar.playbooks")} onNavigate={onNavigate} />
                    ) : null}
                    {hasEntitlement(ENTITLEMENT_FEATURES.SECURITY_AUDIT) ? (
                      <Item to="/settings/security-audit" icon={Shield} label={t("sidebar.securityAudit")} onNavigate={onNavigate} />
                    ) : null}
                    {canAccessTelemetry && hasEntitlement(ENTITLEMENT_FEATURES.ROOT_TELEMETRY) ? (
                      <Item to="/settings/root-telemetry" icon={Activity} label={t("sidebar.rootTelemetry")} onNavigate={onNavigate} />
                    ) : null}
                    {role === "owner" && (
                      <Item to="/settings/branding" icon={Palette} label={t("sidebar.branding")} onNavigate={onNavigate} />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </nav>

    </div>
  );
}

/* ======================
   SIDEBAR WRAPPER
   ====================== */

export default function Sidebar({ open, isDesktop, onClose }) {
  if (isDesktop) {
    return (
      <aside className="w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <SidebarContent />
      </aside>
    );
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <aside
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 shadow-xl"
      >
        <SidebarContent onNavigate={onClose} />
      </aside>
    </>
  );
}
