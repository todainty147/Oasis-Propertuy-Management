// src/App.jsx
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";

import Login from "./pages/Login";
import Invite from "./pages/Invite";
import LandlordSignup from "./pages/LandlordSignup";
import ResetPassword from "./pages/ResetPassword";
import { useSession } from "./hooks/useSession";
import { useProperties } from "./hooks/useProperties";
import { usePayments } from "./hooks/usePayments";
import { useTenants } from "./hooks/useTenants";
import {
  createProperty,
  updateProperty,
  deleteProperty,
} from "./services/propertyService";
import { getAccountOwnerContact } from "./services/accountOwnerService";

// IMPORTANT: use searchDocuments so we can scope by accountId
import { searchDocuments } from "./services/documentService";

import AppLayout from "./layout/AppLayout";
import { useAccount } from "./context/AccountContext";
import { useI18n } from "./context/I18nContext";
import { OCCUPANCY_STATUS } from "./utils/statuses";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Properties = lazy(() => import("./pages/Properties"));
const Tenants = lazy(() => import("./pages/Tenants"));
const PropertyDetails = lazy(() => import("./pages/PropertyDetails"));
const TenantDetails = lazy(() => import("./pages/TenantDetails"));
const Documents = lazy(() => import("./pages/Documents"));
const ContractorPortal = lazy(() => import("./pages/ContractorPortal"));
const ContractorJobDetails = lazy(() => import("./pages/ContractorJobDetails"));
const TenantPayments = lazy(() => import("./pages/TenantPayments"));
const WorkOrderDetails = lazy(() => import("./pages/WorkOrderDetails"));
const MaintenanceInboxPage = lazy(() => import("./pages/MaintenanceInboxPage"));
const MaintenanceKPIDashboardPage = lazy(() => import("./pages/MaintenanceKPIDashboardPage"));
const CommandCenterPage = lazy(() => import("./pages/CommandCenterPage"));
const PortfolioHealthDashboardPage = lazy(() => import("./pages/PortfolioHealthDashboardPage"));
const LandlordOnboardingPage = lazy(() => import("./pages/LandlordOnboardingPage"));
const InvitationsPage = lazy(() => import("./pages/InvitationsPage"));
const AccountBrandingPage = lazy(() => import("./pages/AccountBrandingPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const FinancePage = lazy(() => import("./pages/FinancePage"));
const PlaybooksPage = lazy(() => import("./pages/PlaybooksPage"));
const SecurityAuditPage = lazy(() => import("./pages/SecurityAuditPage"));
const AddPropertyModal = lazy(() => import("./components/AddPropertyModal"));

export default function App() {
  const { t } = useI18n();
  const location = useLocation();
  /* ======================
     AUTH
     ====================== */
  const { session, loading: sessionLoading } = useSession();

  /* ======================
     ACCOUNT (NEW)
     ====================== */
  const { activeAccountId, activeAccount, activeRole, accountLoading } = useAccount();

  /* ======================
     DATA HOOKS
     ====================== */
  // NOTE: These hooks should already be scoped by RLS (account_id policies).
  // If your hooks still fetch by owner_id, we will adjust them later.
  const {
    properties,
    loading: propertiesLoading,
    error: propertiesError,
  } = useProperties({ enabled: !!session, accountId: activeAccountId });

  const {
    payments,
    loading: paymentsLoading,
    error: paymentsError,
  } = usePayments({ enabled: !!session, accountId: activeAccountId });

  const { tenants, loading: tenantsLoading, error: tenantsError } = useTenants({
    enabled: !!session,
    accountId: activeAccountId,
  });

  /* ======================
     UI STATE
     ====================== */

  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);

  const [documents, setDocuments] = useState([]);
  const [accountOwnerEmail, setAccountOwnerEmail] = useState("");

  /* ======================
     DOCUMENTS (ACCOUNT-SCOPED)
     ====================== */
  async function loadDocuments() {
    if (!activeAccountId) return;

    try {
      const data = await searchDocuments({
        query: "",
        tags: [],
        tenantId: null,
        propertyId: null,
        accountId: activeAccountId,
        // onlyUploaded defaults to true in your newer service
      });

      setDocuments(data);
    } catch (e) {
      console.error("loadDocuments failed:", e);
      setDocuments([]);
    }
  }

  useEffect(() => {
    if (session && activeAccountId) {
      loadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeAccountId]);

  useEffect(() => {
    let cancelled = false;
    async function loadOwnerContact() {
      if (!activeAccountId) return;
      const role = String(activeRole || "").toLowerCase();
      if (role === "tenant" || role === "contractor") {
        if (!cancelled) setAccountOwnerEmail("");
        return;
      }
      try {
        const owner = await getAccountOwnerContact(activeAccountId);
        if (!cancelled) {
          setAccountOwnerEmail(owner?.ownerEmail || "");
        }
      } catch (e) {
        if (!cancelled) setAccountOwnerEmail("");
      }
    }
    loadOwnerContact();
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, activeRole]);

  /* ======================
     RENDER GATES
     ====================== */
  if (sessionLoading || accountLoading) {
    return <div className="p-6">{t("common.loading")}</div>;
  }

  if (location.pathname === "/invite") {
    return <Invite />;
  }

  if (location.pathname === "/reset-password") {
    return <ResetPassword />;
  }

  if (location.pathname === "/signup" && !session) {
    return <LandlordSignup />;
  }

  if (location.pathname === "/login" && !session) {
    return <Login />;
  }

  if (session && (location.pathname === "/signup" || location.pathname === "/login")) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!session) {
    return <Login />;
  }

  if (!activeAccountId) {
    return (
      <div className="p-6">
        <p className="font-medium">{t("app.noAccountTitle")}</p>
        <p className="text-sm text-gray-600 mt-2">
          {t("app.noAccountBody")}
        </p>
      </div>
    );
  }

  if (propertiesError || paymentsError || tenantsError) {
    return (
      <div className="p-6 bg-white rounded-xl border">
        <p className="font-medium">{t("app.loadErrorTitle")}</p>
        <pre className="mt-3 text-xs text-gray-600 whitespace-pre-wrap">
          {String(
            propertiesError?.message ||
              paymentsError?.message ||
              tenantsError?.message
          )}
        </pre>
      </div>
    );
  }

  /* ======================
     OWNER (LEGACY SHIM)
     ====================== */
  // Keep AppLayout API unchanged, but represent "owner" as the active account.
  const owners = [
    {
      id: activeAccountId,
      name: accountOwnerEmail || activeAccount?.name || "Account owner",
    },
  ];

  /* ======================
     DERIVED DATA
     ====================== */

  const ownerProperties = properties.map((p) => {
    const isOccupied = tenants.some(
      (t) => String(t.propertyId) === String(p.id)
    );
    return {
      ...p,
      status: isOccupied ? OCCUPANCY_STATUS.OCCUPIED : OCCUPANCY_STATUS.VACANT,
    };
  });

  const ownerTenants = tenants;

  const ownerPropertyIds = ownerProperties.map((p) => p.id);
  const ownerPayments = payments.filter((p) =>
    ownerPropertyIds.includes(p.propertyId)
  );

  const occupiedCount = ownerProperties.filter(
    (p) => p.status === OCCUPANCY_STATUS.OCCUPIED
  ).length;
  const vacantCount = ownerProperties.length - occupiedCount;

  const occupancyRate =
    ownerProperties.length > 0
      ? Math.round((occupiedCount / ownerProperties.length) * 100)
      : 0;

  /* ---------- Vacancy aging ---------- */
  const now = new Date();

  const vacancyAging = ownerProperties
    .filter((p) => p.status === OCCUPANCY_STATUS.VACANT)
    .map((property) => {
      const pastTenants = ownerTenants
        .filter((t) => String(t.propertyId) === String(property.id))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const vacancyStart = pastTenants[0]?.created_at || property.created_at;

      const daysVacant = Math.floor(
        (now - new Date(vacancyStart)) / (1000 * 60 * 60 * 24)
      );

      return { ...property, daysVacant };
    });

  const longVacantProperties = vacancyAging.filter((p) => p.daysVacant > 30);

  /* ======================
     ROUTES
     ====================== */
  return (
    <Suspense fallback={<div className="p-6">{t("common.loading")}</div>}>
      <Routes>
        <Route
          element={
            <AppLayout
              owners={owners}
              activeOwnerId={activeAccountId}
              setActiveOwnerId={() => {}}
            />
          }
        >
        {/* ✅ Absolute redirect avoids /dashboard/dashboard loops */}
        <Route index element={<Navigate to="/dashboard" replace />} />

        <Route
          path="dashboard"
          element={
            <Dashboard
              loading={propertiesLoading || paymentsLoading || tenantsLoading}
              properties={ownerProperties}
              tenants={ownerTenants}
              payments={payments}
              occupiedCount={occupiedCount}
              vacantCount={vacantCount}
              occupancyRate={occupancyRate}
              longVacantProperties={longVacantProperties}
            />
          }
        />

        <Route
          path="properties"
          element={
            <>
              <Properties
                loading={propertiesLoading}
                properties={ownerProperties}
                tenants={ownerTenants}
                onAddProperty={() => {
                  setEditingProperty(null);
                  setIsAddPropertyOpen(true);
                }}
                onEditProperty={(p) => {
                  setEditingProperty(p);
                  setIsAddPropertyOpen(true);
                }}
                onDeleteProperty={async (propertyId) => {
                  if (!confirm(t("properties.confirmDelete"))) return;
                  await deleteProperty(propertyId);
                }}
              />

              <AddPropertyModal
                isOpen={isAddPropertyOpen}
                onClose={() => {
                  setIsAddPropertyOpen(false);
                  setEditingProperty(null);
                }}
                onSave={async (property) => {
                  const payload = {
                    ...property,
                    accountId: activeAccountId, // ✅ CRITICAL
                  };

                  if (property.id) {
                    await updateProperty(property.id, payload);
                  } else {
                    await createProperty(payload);
                  }

                  setIsAddPropertyOpen(false);
                  setEditingProperty(null);
                }}
                property={editingProperty}
                tenants={ownerTenants}
                owners={owners}
              />
            </>
          }
        />

        <Route
          path="properties/:id"
          element={
            <>
              <PropertyDetails
                loading={propertiesLoading || tenantsLoading}
                properties={ownerProperties}
                tenants={ownerTenants}
                payments={ownerPayments}
                onEditProperty={(p) => {
                  setEditingProperty(p);
                  setIsAddPropertyOpen(true);
                }}
              />

              <AddPropertyModal
                isOpen={isAddPropertyOpen}
                onClose={() => {
                  setIsAddPropertyOpen(false);
                  setEditingProperty(null);
                }}
                onSave={async (property) => {
                  const payload = {
                    ...property,
                    accountId: activeAccountId,
                  };

                  if (property.id) {
                    await updateProperty(property.id, payload);
                  } else {
                    await createProperty(payload);
                  }

                  setIsAddPropertyOpen(false);
                  setEditingProperty(null);
                }}
                property={editingProperty}
                tenants={ownerTenants}
                owners={owners}
              />
            </>
          }
        />

        <Route
          path="tenants"
          element={
            <Tenants
              loading={tenantsLoading}
              tenants={ownerTenants}
              properties={ownerProperties}
            />
          }
        />

        <Route
          path="tenants/:id"
          element={
            <TenantDetails
              loading={tenantsLoading || paymentsLoading}
              tenants={ownerTenants}
              properties={ownerProperties}
              payments={payments}
            />
          }
        />

        {/* ✅ A) Tenant Payments */}
        <Route path="tenant/payments" element={<TenantPayments />} />

        <Route
          path="finance"
          element={<FinancePage />}
        />

        {/* ✅ Documents route */}
        <Route
          path="documents"
          element={<Documents tenants={tenants} properties={properties} />}
        />
        <Route path="maintenance-inbox" element={<MaintenanceInboxPage />} />
        <Route path="maintenance-kpi" element={<MaintenanceKPIDashboardPage />} />
        <Route path="command-center" element={<CommandCenterPage />} />
        <Route path="attention-center" element={<CommandCenterPage />} />
        <Route path="landlord-onboarding" element={<LandlordOnboardingPage />} />
        <Route path="invitations" element={<InvitationsPage />} />
              <Route path="settings/profile" element={<ProfilePage />} />
              <Route path="settings/branding" element={<AccountBrandingPage />} />
              <Route path="settings/billing" element={<BillingPage />} />
              <Route path="settings/playbooks" element={<PlaybooksPage />} />
              <Route path="settings/security-audit" element={<SecurityAuditPage />} />
        <Route
          path="portfolio-health"
          element={<PortfolioHealthDashboardPage />}
        />
        {/* ✅ Contractor routes (relative paths because they are inside AppLayout wrapper) */}
        <Route path="contractor" element={<ContractorPortal />} />
        <Route path="contractor/jobs/:id" element={<ContractorJobDetails />} />
        <Route path="work-orders/:id" element={<WorkOrderDetails />} />


        {/* ✅ Catch-all MUST be absolute to avoid /dashboard/dashboard loops */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
