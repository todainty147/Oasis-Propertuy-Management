import { NavLink } from "react-router-dom";
import { LayoutDashboard, Home, Users, Wallet, FileText } from "lucide-react";

function Item({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
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

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 h-screen fixed left-0 top-0 z-20">
      <div className="p-6 flex items-center space-x-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">
          ORM
        </div>
        <span className="text-xl font-bold tracking-tight text-slate-900">
          OASIS Rental Management
        </span>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-4">
        <Item to="/dashboard" icon={LayoutDashboard} label="Pulpit" />
        <Item to="/properties" icon={Home} label="Nieruchomości" />
        <Item to="/tenants" icon={Users} label="Najemcy" />
        <Item to="/finance" icon={Wallet} label="Finanse" />
        <Item to="/documents" icon={FileText} label="Dokumenty" />
      </nav>
    </aside>
  );
}
