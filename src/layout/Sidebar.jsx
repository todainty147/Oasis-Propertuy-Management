import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Home,
  Users,
  Wallet,
  FileText,
  X,
} from "lucide-react";

import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { useTenants } from "../hooks/useTenants";

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
            ? "bg-blue-50 text-blue-600 ring-1 ring-blue-100"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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
  const {
    accounts,
    activeAccountId,
    switchAccount,
    accountLoading,
  } = useAccount();

  if (accountLoading || accounts.length <= 1) return null;

  return (
    <select
      value={activeAccountId ?? ""}
      onChange={(e) => switchAccount(e.target.value)}
      className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
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
  const { activeTenantId, setActiveTenantId, clearTenant } =
    useTenant();

  const { tenants, loading } = useTenants({
    enabled: !!activeAccountId,
  });

  if (!activeAccountId) return null;

  return (
    <select
      value={activeTenantId ?? ""}
      disabled={loading}
      onChange={(e) =>
        e.target.value
          ? setActiveTenantId(e.target.value)
          : clearTenant()
      }
      className="w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-slate-100"
    >
      <option value="">Wszyscy najemcy</option>
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
  return (
    <>
      {/* Header */}
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            ORM
          </div>
          <span className="font-bold">OASIS Rental</span>
        </div>

        {onNavigate && (
          <button onClick={onNavigate} aria-label="Zamknij menu">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Account switcher */}
      <div className="px-4 mb-3">
        <AccountSwitcher />
      </div>

      {/* Tenant switcher */}
      <div className="px-4 mb-4">
        <TenantSwitcher />
      </div>

      {/* Navigation */}
      <nav className="px-4 mt-4 space-y-4 pb-safe">
        <div className="space-y-1">
          <Item to="/dashboard" icon={LayoutDashboard} label="Pulpit" onNavigate={onNavigate} />
          <Item to="/properties" icon={Home} label="Nieruchomości" onNavigate={onNavigate} />
          <Item to="/tenants" icon={Users} label="Najemcy" onNavigate={onNavigate} />
          <Item to="/finance" icon={Wallet} label="Finanse" onNavigate={onNavigate} />
        </div>

        <div className="border-t pt-4 space-y-1">
          <Item to="/documents" icon={FileText} label="Dokumenty" onNavigate={onNavigate} />
        </div>
      </nav>
    </>
  );
}

/* ======================
   SIDEBAR WRAPPER
   ====================== */

export default function Sidebar({ open, isDesktop, onClose }) {
  if (isDesktop) {
    return (
      <aside className="w-64 shrink-0 bg-white border-r">
        <SidebarContent />
      </aside>
    );
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl"
      >
        <SidebarContent onNavigate={onClose} />
      </aside>
    </>
  );
}
