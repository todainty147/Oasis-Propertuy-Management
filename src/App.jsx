// src/App.jsx
//
// Routing shell: auth gates + top-level route composition.
// Data loading is delegated to the route components:
//   ManagerRoutes  — portfolio hooks (owner/admin/staff sessions)
//   TenantRoutes   — tenant-scoped hooks (tenant sessions only)
//   Contractor pages fetch their own data independently
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Suspense, useEffect, useMemo, useState } from "react";

import Login          from "./pages/Login";
import Invite         from "./pages/Invite";
import LandlordSignup from "./pages/LandlordSignup";
import ResetPassword  from "./pages/ResetPassword";
import PublicDataDeletionPage from "./pages/PublicDataDeletionPage";
import PublicApplicationPage from "./pages/applications/PublicApplicationPage";

import AppLayout          from "./layout/AppLayout";
import TenantPortalLayout from "./layout/TenantPortalLayout";

import { useSession }  from "./hooks/useSession";
import { useAccount }  from "./context/AccountContext";
import { useI18n }     from "./context/I18nContext";
import { getOwnSecurityProfile } from "./services/passwordSecurityService";

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

  // Stage 4: hard enforcement — if admin has flagged the user as reset_required,
  // block all protected routes until they update their password.
  const [passwordResetRequired, setPasswordResetRequired] = useState(false);
  useEffect(() => {
    if (!session?.user) { setPasswordResetRequired(false); return; }
    let cancelled = false;
    getOwnSecurityProfile().then((profile) => {
      if (!cancelled) {
        setPasswordResetRequired(profile?.password_strength_status === "reset_required");
      }
    });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // owners: minimal account identity for Topbar / account switcher.
  // Full ownerEmail enhancement lives in usePortfolioShellData (manager sessions only).
  const owners = useMemo(
    () => [{ id: activeAccountId, name: activeAccount?.name || "My account" }],
    [activeAccountId, activeAccount?.name],
  );

  // React Router v7 validates every child of <Route>/<Routes> as a Route
  // element before rendering — a component wrapper is rejected even if it
  // returns a Route fragment. Both functions are called unconditionally here
  // (before any early returns) so React's hook-call order is stable.
  //
  // ManagerRoutes returns { modal, routes }: the modal must render outside
  // <Routes> so React Router never sees it as a non-Route child.
  const { modal: managerModal, routes: managerRouteTree } = ManagerRoutes();
  const tenantRouteTree = TenantRoutes();

  // ── Public routes rendered before the auth gate ──────────────────────────

  if (location.pathname === "/invite")         return <Invite />;
  if (location.pathname === "/reset-password") return <ResetPassword />;
  if (location.pathname === "/privacy/delete-account" || location.pathname === "/data-deletion") {
    return <PublicDataDeletionPage />;
  }
  if (location.pathname.startsWith("/apply/")) return <PublicApplicationPage />;
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

  // Stage 4: block all protected routes if admin has flagged reset_required
  if (passwordResetRequired && location.pathname !== "/reset-password") {
    return <Navigate to="/reset-password" replace state={{ reason: "reset_required" }} />;
  }

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
    <>
      {managerModal}
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
          {managerRouteTree}
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
          {tenantRouteTree}
        </Route>
      </Routes>
    </Suspense>
    </>
  );
}
