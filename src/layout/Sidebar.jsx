// src/components/Sidebar.jsx
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Home,
  Users,
  UserPlus,
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
} from "lucide-react";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { useTenants } from "../hooks/useTenants";
import { useI18n } from "../context/I18nContext";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

/* ======================
   NAV ITEM
   ====================== */

function Item({ to, icon: Icon, label, onNavigate }) {
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
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </NavLink>
  );
}

/* ======================
   ACCOUNT SWITCHER
   ====================== */

function AccountSwitcher() {
  const { accounts, activeAccountId, switchAccount, accountLoading } = useAccount();

  if (accountLoading || accounts.length <= 1) return null;

  return (
    <select
      value={activeAccountId ?? ""}
      onChange={(e) => switchAccount(e.target.value)}
      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
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
   TENANT SWITCHER
   ====================== */

function TenantSwitcher() {
  const { activeAccountId } = useAccount();
  const { activeTenantId, setActiveTenantId, clearTenant } = useTenant();
  const { t } = useI18n();

  const { tenants, loading } = useTenants({
    enabled: !!activeAccountId,
  });

  if (!activeAccountId) return null;

  return (
    <select
      value={activeTenantId ?? ""}
      disabled={loading}
      onChange={(e) =>
        e.target.value ? setActiveTenantId(e.target.value) : clearTenant()
      }
      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 disabled:bg-slate-100 dark:disabled:bg-slate-800"
    >
      <option value="">{t("tenant.allTenants")}</option>
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

/* ======================
   SIDEBAR CONTENT
   ====================== */

function SidebarContent({ onNavigate }) {
  const { activeRole, activeAccountId } = useAccount();
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();

  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const isContractor = role === "contractor";
  const isTenant = role === "tenant";
  const canManage = ["owner", "admin", "staff"].includes(role);
  const isOwner = role === "owner";
  const [operationsOpen, setOperationsOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(true);
  const [onboardingHidden, setOnboardingHidden] = useState(false);

  const onboardingHiddenKey = useMemo(() => {
    if (!activeAccountId || !user?.id) return null;
    return `sidebar_onboarding_hidden:${activeAccountId}:${user.id}`;
  }, [activeAccountId, user?.id]);

  useEffect(() => {
    if (!isOwner || !onboardingHiddenKey) {
      setOnboardingHidden(false);
      return;
    }
    try {
      setOnboardingHidden(localStorage.getItem(onboardingHiddenKey) === "1");
    } catch {
      setOnboardingHidden(false);
    }
  }, [isOwner, onboardingHiddenKey]);

  function dismissOnboarding() {
    setOnboardingHidden(true);
    if (!onboardingHiddenKey) return;
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
          <TenantSwitcher />
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
              <Item to="/dashboard" icon={LayoutDashboard} label={t("sidebar.dashboard")} onNavigate={onNavigate} />
              <Item to="/properties" icon={Home} label={t("sidebar.properties")} onNavigate={onNavigate} />
              {!isTenant && (
                <Item to="/tenants" icon={Users} label={t("sidebar.tenants")} onNavigate={onNavigate} />
              )}
              <Item to="/finance" icon={Wallet} label={t("sidebar.finance")} onNavigate={onNavigate} />
              <Item to="/documents" icon={FileText} label={t("sidebar.documents")} onNavigate={onNavigate} />
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
                {operationsOpen && (
                  <div className="space-y-1">
                    <Item to="/command-center" icon={AlertCircle} label={t("sidebar.commandCenter")} onNavigate={onNavigate} />
                    <Item to="/maintenance-inbox" icon={Wrench} label={t("sidebar.maintenanceInbox")} onNavigate={onNavigate} />
                    <Item to="/maintenance-kpi" icon={BarChart3} label={t("sidebar.maintenanceKpi")} onNavigate={onNavigate} />
                    <Item to="/portfolio-health" icon={LineChart} label={t("sidebar.portfolioHealth")} onNavigate={onNavigate} />
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
                    <Item to="/settings/billing" icon={CreditCard} label={t("sidebar.billing")} onNavigate={onNavigate} />
                    <Item to="/settings/playbooks" icon={Zap} label={t("sidebar.playbooks")} onNavigate={onNavigate} />
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
