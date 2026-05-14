/**
 * MobileBottomNav — role-aware iOS-style tab bar for mobile viewports.
 *
 * Renders only below 1024px (lg breakpoint).
 * Uses a frosted-glass surface matching the sidebar tint — consistent with
 * the two-surface shell (sidebar tint + content white).
 *
 * Roles:
 *  owner / admin / staff → Command, Repairs, Portfolio, Finance, More
 *  tenant                → Home, Issues, Docs, Payments, Privacy
 *  contractor            → My Jobs, Privacy
 */
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Wrench,
  Building2,
  CreditCard,
  FileText,
  Briefcase,
  Home,
  ShieldCheck,
} from "lucide-react";
import { useAccount } from "../../context/AccountContext";
import { useNotifications } from "../../hooks/useNotifications";

function NavItem({ to, icon: Icon, label, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "flex flex-col items-center justify-center gap-0.5 flex-1",
          "min-h-[52px] px-1 py-2 text-[10px] font-medium leading-tight",
          "transition-colors relative select-none",
          isActive
            ? "text-blue-600 dark:text-blue-400"
            : "text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
        ].join(" ")
      }
      aria-label={label}
    >
      <span className="relative">
        <Icon size={20} strokeWidth={1.7} />
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
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
      className="lg:hidden fixed bottom-0 left-0 right-0 z-20 flex items-stretch bg-[#F5F5F7]/95 dark:bg-[#1C1C1E]/95 backdrop-blur-md border-t border-black/[0.06] dark:border-white/[0.06]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Mobile navigation"
    >
      {role === "tenant" && (
        <>
          <NavItem to="/tenant/home"          icon={Home}       label="Home"     />
          <NavItem to="/tenant/maintenance"   icon={Wrench}     label="Issues"   />
          <NavItem to="/tenant/documents"     icon={FileText}   label="Docs"     />
          <NavItem to="/tenant/payments"      icon={CreditCard} label="Payments" />
          <NavItem to="/settings/data-privacy" icon={ShieldCheck} label="Privacy" />
        </>
      )}

      {role === "contractor" && (
        <>
          <NavItem to="/contractor-portal"    icon={Briefcase}  label="My Jobs"  />
          <NavItem to="/settings/data-privacy" icon={ShieldCheck} label="Privacy" />
        </>
      )}

      {(role === "owner" || role === "admin" || role === "staff") && (
        <>
          <NavItem to="/command-center"    icon={LayoutDashboard} label="Command"   badge={unreadCount} />
          <NavItem to="/maintenance-inbox" icon={Wrench}          label="Repairs"   />
          <NavItem to="/properties"        icon={Building2}       label="Portfolio" />
          <NavItem to="/finance"           icon={CreditCard}      label="Finance"   />
          <NavItem to="/settings/data-privacy" icon={ShieldCheck} label="Privacy"   />
        </>
      )}

      {!["tenant", "contractor", "owner", "admin", "staff"].includes(role) && (
        <>
          <NavItem to="/dashboard"  icon={LayoutDashboard} label="Home"   />
          <NavItem to="/settings/data-privacy" icon={ShieldCheck} label="Privacy" />
        </>
      )}
    </nav>
  );
}
