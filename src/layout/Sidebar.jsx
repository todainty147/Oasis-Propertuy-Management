import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Home,
  Users,
  Wallet,
  FileText,
  X,
} from "lucide-react";

function Item({ to, icon: Icon, label, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
          isActive
            ? "bg-blue-50 text-blue-600"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`
      }
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </NavLink>
  );
}

export default function Sidebar({ open, isDesktop, onClose }) {
  // 🖥 Desktop sidebar (always mounted)
  if (isDesktop) {
    return (
      <aside className="w-64 shrink-0 bg-white border-r">
        <SidebarContent onNavigate={null} />
      </aside>
    );
  }

  // 📱 Mobile sidebar (unmounted when closed)
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl">
        <SidebarContent onNavigate={onClose} />
      </aside>
    </>
  );
}

function SidebarContent({ onNavigate }) {
  return (
    <>
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            ORM
          </div>
          <span className="font-bold">OASIS Rental</span>
        </div>

        {onNavigate && (
          <button onClick={onNavigate}>
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="px-4 space-y-1 mt-4">
        <Item to="/dashboard" icon={LayoutDashboard} label="Pulpit" onNavigate={onNavigate} />
        <Item to="/properties" icon={Home} label="Nieruchomości" onNavigate={onNavigate} />
        <Item to="/tenants" icon={Users} label="Najemcy" onNavigate={onNavigate} />
        <Item to="/finance" icon={Wallet} label="Finanse" onNavigate={onNavigate} />
        <Item to="/documents" icon={FileText} label="Dokumenty" onNavigate={onNavigate} />
      </nav>
    </>
  );
}
