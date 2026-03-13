// src/layout/Topbar.jsx
import { Search, Building2, Menu, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { usePageTitle } from "../layout/PageTitleContext";
import NotificationsBell from "../components/NotificationsBell";
import { useI18n } from "../context/I18nContext";

import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { useTenants } from "../hooks/useTenants";

export default function Topbar({ onMenuClick }) {
  const { title } = usePageTitle();
  const { lang, setLang, t } = useI18n();

  /* ======================
     ACCOUNT
     ====================== */
  const {
    accounts,
    activeAccount,
    activeAccountId,
    isRootOperator,
    switchAccount, // ✅ CORRECT API
  } = useAccount();

  /* ======================
     TENANTS
     ====================== */
  const {
    activeTenantId,
    setActiveTenantId,
    clearTenant,
  } = useTenant();

  const { tenants, loading: tenantsLoading } = useTenants({
    enabled: !!activeAccountId,
  });

  return (
    <header className="fixed top-0 left-0 right-0 h-14 lg:h-16 bg-white border-b flex items-center px-4 lg:px-8 z-30 lg:left-64">
      {/* LEFT */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded hover:bg-slate-100"
          aria-label={t("topbar.openMenu")}
        >
          <Menu size={22} />
        </button>

        <h1 className="text-lg lg:text-2xl font-bold truncate">
          {title}
        </h1>
      </div>

      {/* RIGHT */}
      
 <div className="flex items-center gap-2">
    <NotificationsBell />
</div>
      <div className="flex items-center gap-3">
        {/* ======================
            ACCOUNT SWITCHER
           ====================== */}
        {isRootOperator && accounts.length > 1 && (
          <div className="hidden lg:flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
            <Building2 size={16} className="text-slate-400" />
            <select
              value={activeAccountId}
              onChange={(e) => switchAccount(e.target.value)} // ✅ FIX
              className="text-sm bg-transparent focus:outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.is_disabled ? " (disabled)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {activeAccountId && (
          <div className="hidden xl:flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
            <Building2 size={14} className="text-slate-500" />
            <div className="leading-tight">
              <p className="text-xs text-slate-700 font-medium">{activeAccount?.name || "Account"}</p>
              <p className="text-[11px] text-slate-500" title={String(activeAccountId)}>
                ID: {String(activeAccountId)}
              </p>
            </div>
          </div>
        )}

        {/* ======================
            TENANT SWITCHER
           ====================== */}
        {!tenantsLoading && tenants.length > 0 && (
          <div className="hidden lg:flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
            <Users size={16} className="text-slate-400" />
            <select
              value={activeTenantId ?? ""}
              onChange={(e) =>
                e.target.value
                  ? setActiveTenantId(e.target.value)
                  : clearTenant()
              }
              className="text-sm bg-transparent focus:outline-none"
            >
              <option value="">{t("tenant.allTenants")}</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* SEARCH */}
        <div className="hidden xl:flex relative">
          <input
            type="text"
            placeholder={t("common.search")}
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          <Search
            className="absolute left-3 top-2.5 text-slate-400"
            size={16}
          />
        </div>

        <div className="hidden lg:flex items-center gap-2 border border-slate-200 rounded-lg px-2 py-1.5">
          <span className="text-xs text-slate-500">{t("topbar.language")}</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="text-sm bg-transparent focus:outline-none"
            aria-label={t("topbar.language")}
          >
            <option value="pl">{t("lang.polish")}</option>
            <option value="en">{t("lang.english")}</option>
          </select>
        </div>

        
        {/* LOGOUT */}
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          {t("topbar.logout")}
        </button>
      </div>
    </header>
  );
}
