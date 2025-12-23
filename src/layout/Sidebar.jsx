import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Home,
  Users,
  Wallet,
  FileText,
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

export default function Sidebar({ onNavigate }) {
  return (
    <aside className="flex flex-col w-64 bg-white border-r border-slate-200 h-full">
      {/* LOGO */}
      <div className="p-6 flex items-center space-x-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
          ORM
        </div>
        <span className="text-sm font-bold tracking-tight text-slate-900">
          OASIS Rental
        </span>
      </div>

      {/* NAV */}
      <nav className="flex-1 px-4 space-y-1 mt-4">
        <Item to="/dashboard" icon={LayoutDashboard} label="Pulpit" onNavigate={onNavigate} />
        <Item to="/properties" icon={Home} label="Nieruchomości" onNavigate={onNavigate} />
        <Item to="/tenants" icon={Users} label="Najemcy" onNavigate={onNavigate} />
        <Item to="/finance" icon={Wallet} label="Finanse" onNavigate={onNavigate} />
        <Item to="/documents" icon={FileText} label="Dokumenty" onNavigate={onNavigate} />
      </nav>
    </aside>
  );
}
