// src/layout/Topbar.jsx
import { Bell, Search, Building2, Menu, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { usePageTitle } from "../layout/PageTitleContext";

import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { useTenants } from "../hooks/useTenants";

export default function Topbar({ onMenuClick }) {
  const { title } = usePageTitle();

  /* ======================
     ACCOUNT
     ====================== */
  const {
    accounts,
    activeAccountId,
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
          aria-label="Otwórz menu"
        >
          <Menu size={22} />
        </button>

        <h1 className="text-lg lg:text-2xl font-bold truncate">
          {title}
        </h1>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-3">
        {/* ======================
            ACCOUNT SWITCHER
           ====================== */}
        {accounts.length > 1 && (
          <div className="hidden lg:flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
            <Building2 size={16} className="text-slate-400" />
            <select
              value={activeAccountId}
              onChange={(e) => switchAccount(e.target.value)} // ✅ FIX
              className="text-sm bg-transparent focus:outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
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
              <option value="">Wszyscy najemcy</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* SEARCH */}
        <div className="hidden xl:flex relative">
          <input
            type="text"
            placeholder="Szukaj..."
            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          <Search
            className="absolute left-3 top-2.5 text-slate-400"
            size={16}
          />
        </div>

        {/* NOTIFICATIONS */}
        <button className="p-2 relative border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
          <Bell size={18} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border border-white" />
        </button>

        {/* LOGOUT */}
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          Wyloguj
        </button>
      </div>
    </header>
  );
}
