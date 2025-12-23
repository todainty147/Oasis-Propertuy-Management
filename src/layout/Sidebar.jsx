import { NavLink } from "react-router-dom";
import { LayoutDashboard, Home, Users, Wallet, FileText, X } from "lucide-react";

function Item({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
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

export default function Sidebar({ mobileOpen, onClose }) {
  return (
    <>
      {/* Overlay (mobile only) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-white border-r
          transform transition-transform
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
        `}
      >
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
              ORM
            </div>
            <span className="font-bold">OASIS Rental</span>
          </div>

          <button className="lg:hidden" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <nav className="px-4 space-y-1 mt-4">
          <Item to="/dashboard" icon={LayoutDashboard} label="Pulpit" onClick={onClose} />
          <Item to="/properties" icon={Home} label="Nieruchomości" onClick={onClose} />
          <Item to="/tenants" icon={Users} label="Najemcy" onClick={onClose} />
          <Item to="/finance" icon={Wallet} label="Finanse" onClick={onClose} />
          <Item to="/documents" icon={FileText} label="Dokumenty" onClick={onClose} />
        </nav>
      </aside>
    </>
  );
}
