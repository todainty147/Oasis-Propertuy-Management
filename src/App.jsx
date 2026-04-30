// src/App.jsx
//
// Routing shell: auth gates + top-level route composition.
// Data loading is delegated to the route components:
//   ManagerRoutes  — portfolio hooks (owner/admin/staff sessions)
//   TenantRoutes   — tenant-scoped hooks (tenant sessions only)
//   Contractor pages fetch their own data independently
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { lazy, Suspense, useMemo } from "react";

import Login          from "./pages/Login";
import Invite         from "./pages/Invite";
import LandlordSignup from "./pages/LandlordSignup";
import ResetPassword  from "./pages/ResetPassword";

import AppLayout          from "./layout/AppLayout";
import TenantPortalLayout from "./layout/TenantPortalLayout";

import { useSession }  from "./hooks/useSession";
import { useAccount }  from "./context/AccountContext";
import { useI18n }     from "./context/I18nContext";

import ManagerRoutes  from "./routes/ManagerRoutes";
import TenantRoutes   from "./routes/TenantRoutes";

// TenantOnlyRoute is still needed here to guard the /tenant layout
function TenantOnlyRoute({ children }) {
  const { activeRole } = useAccount();
  return String(activeRole || "").toLowerCase() === "tenant"
    ? children
    : <Navigate to="/dashboard" replace />;
}

export default function App() {
  const { t }                                                    = useI18n();
  const location                                                 = useLocation();
  const { session, loading: sessionLoading }                     = useSession();
  const { activeAccountId, activeAccount, accountLoading }       = useAccount();

  // owners: minimal account identity for Topbar / account switcher.
  // Full ownerEmail enhancement lives in usePortfolioShellData (manager sessions only).
  const owners = useMemo(
    () => [{ id: activeAccountId, name: activeAccount?.name || "My account" }],
    [activeAccountId, activeAccount?.name],
  );

  // ── Public routes rendered before the auth gate ──────────────────────────

  if (location.pathname === "/invite")         return <Invite />;
  if (location.pathname === "/reset-password") return <ResetPassword />;
  if (location.pathname === "/signup" && !session) return <LandlordSignup />;
  if (location.pathname === "/login"  && !session) return <Login />;

  // ── Auth loading ──────────────────────────────────────────────────────────

  if (sessionLoading || accountLoading) {
    return <div className="p-6">{t("common.loading")}</div>;
  }

  if (session && (location.pathname === "/signup" || location.pathname === "/login")) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!session) return <Login />;

  if (!activeAccountId) {
    return (
      <div className="p-6">
        <p className="font-medium">{t("app.noAccountTitle")}</p>
        <p className="text-sm text-gray-600 mt-2">{t("app.noAccountBody")}</p>
      </div>
    );
  }

  // ── Authenticated routing ─────────────────────────────────────────────────

  return (
    <Suspense fallback={<div className="p-6">{t("common.loading")}</div>}>
      <Routes>
        {/* Manager + contractor surface — AppLayout shell */}
        <Route
          element={
            <AppLayout
              owners={owners}
              activeOwnerId={activeAccountId}
              setActiveOwnerId={() => {}}
            />
          }
        >
          <ManagerRoutes />
        </Route>

        {/* Tenant portal — separate layout, tenant-scoped data hooks */}
        <Route
          path="tenant"
          element={
            <TenantOnlyRoute>
              <TenantPortalLayout />
            </TenantOnlyRoute>
          }
        >
          <TenantRoutes />
        </Route>
      </Routes>
    </Suspense>
  );
}
