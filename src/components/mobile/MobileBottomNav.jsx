/**
 * MobileBottomNav — role-aware bottom navigation for mobile viewports.
 *
 * Rendered inside AppLayout below the main content area, only on < 1024px.
 * Does NOT replace the sidebar — sidebar remains for desktop.
 *
 * Roles:
 *  owner / admin / staff  → Command Center, Maintenance, Properties, Finance, Notifications
 *  tenant                 → Home, Maintenance, Documents, Payments
 *  contractor             → Jobs, Photos
 */
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Wrench,
  Building2,
  CreditCard,
  Bell,
  FileText,
  Briefcase,
  Home,
  Camera,
  ShieldCheck,
} from "lucide-react";
import { useAccount } from "../../context/AccountContext";
import { useNotifications } from "../../hooks/useNotifications";

function NavItem({ to, icon, label, badge }) {
  const NavIcon = icon;
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "flex flex-col items-center justify-center gap-0.5 flex-1",
          "min-h-[52px] px-1 py-2 text-[10px] font-semibold leading-tight",
          "transition-colors relative",
          isActive
            ? "text-[#0b4f6c] dark:text-[#14b8a6]"
            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
        ].join(" ")
      }
      aria-label={label}
    >
      <span className="relative">
        <NavIcon size={22} strokeWidth={1.8} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="truncate max-w-[52px]">{label}</span>
    </NavLink>
  );
}

export default function MobileBottomNav() {
  const { activeRole } = useAccount();
  const { unreadCount } = useNotifications({ accountId: null });

  const role = String(activeRole || "").toLowerCase();

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-20 flex items-stretch bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Mobile navigation"
    >
      {role === "tenant" && (
        <>
          <NavItem to="/tenant/home"         icon={Home}      label="Home" />
          <NavItem to="/tenant/maintenance"  icon={Wrench}    label="Issues" />
          <NavItem to="/tenant/documents"    icon={FileText}  label="Docs" />
          <NavItem to="/tenant/payments"     icon={CreditCard} label="Payments" />
          <NavItem to="/settings/data-privacy" icon={ShieldCheck} label="Privacy" />
        </>
      )}

      {role === "contractor" && (
        <>
          <NavItem to="/contractor-portal"  icon={Briefcase} label="My Jobs" />
          <NavItem to="/contractor-portal"  icon={Camera}    label="Photos" />
          <NavItem to="/settings/data-privacy" icon={ShieldCheck} label="Privacy" />
        </>
      )}

      {(role === "owner" || role === "admin" || role === "staff") && (
        <>
          <NavItem to="/command-center"    icon={LayoutDashboard} label="Command" />
          <NavItem to="/maintenance-inbox" icon={Wrench}          label="Repairs" />
          <NavItem to="/properties"        icon={Building2}       label="Portfolio" />
          <NavItem to="/finance"           icon={CreditCard}      label="Finance" />
          <NavItem
            to="/settings/data-privacy"
            icon={ShieldCheck}
            label="Privacy"
          />
        </>
      )}

      {/* Fallback for unknown roles — minimal nav */}
      {!["tenant", "contractor", "owner", "admin", "staff"].includes(role) && (
        <>
          <NavItem to="/dashboard"  icon={LayoutDashboard} label="Home" />
          <NavItem to="/notifications" icon={Bell} label="Alerts" badge={unreadCount} />
        </>
      )}
    </nav>
  );
}
