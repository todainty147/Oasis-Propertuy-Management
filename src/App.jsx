// src/App.jsx
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";

import Login from "./pages/Login";
import Invite from "./pages/Invite";
import { useSession } from "./hooks/useSession";
import { useProperties } from "./hooks/useProperties";
import { usePayments } from "./hooks/usePayments";
import { useTenants } from "./hooks/useTenants";


import {
  createTenant,
  updateTenant,
  deleteTenant,
} from "./services/tenantService";
import {
  createPayment,
  updatePayment,
  deletePayment,
} from "./services/paymentService";
import {
  createProperty,
  updateProperty,
  deleteProperty,
} from "./services/propertyService";

// IMPORTANT: use searchDocuments so we can scope by accountId
import { searchDocuments } from "./services/documentService";

import {
  calculatePropertyFinance,
  sumPaid,
  sumOverdue,
  sumExpected,
} from "./utils/finance";

import AppLayout from "./layout/AppLayout";
import { useAccount } from "./context/AccountContext";
import { useI18n } from "./context/I18nContext";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Properties = lazy(() => import("./pages/Properties"));
const Finance = lazy(() => import("./pages/Finance"));
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
const PortfolioHealthDashboardPage = lazy(() => import("./pages/PortfolioHealthDashboardPage"));
const InvitationsPage = lazy(() => import("./pages/InvitationsPage"));
const FinancePage = lazy(() => import("./pages/FinancePage"));
const AddPropertyModal = lazy(() => import("./components/AddPropertyModal"));
const AddTenantModal = lazy(() => import("./components/AddTenantModal"));
const AddPaymentModal = lazy(() => import("./components/AddPaymentModal"));

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
  const { activeAccountId, accountLoading } = useAccount();

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
  const [isAddTenantOpen, setIsAddTenantOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);

  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);

  const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);

  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);

  /* ======================
     DOCUMENTS (ACCOUNT-SCOPED)
     ====================== */
  async function loadDocuments() {
    if (!activeAccountId) return;

    setDocumentsLoading(true);
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
    } finally {
      setDocumentsLoading(false);
    }
  }

  useEffect(() => {
    if (session && activeAccountId) {
      loadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeAccountId]);

  /* ======================
     RENDER GATES
     ====================== */
  if (sessionLoading || accountLoading) {
    return <div className="p-6">{t("common.loading")}</div>;
  }

  if (location.pathname === "/invite") {
    return <Invite />;
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
      name: session.user.email,
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
      status: isOccupied ? "Wynajęte" : "Wolne",
    };
  });

  const ownerTenants = tenants;

  const ownerPropertyIds = ownerProperties.map((p) => p.id);
  const ownerPayments = payments.filter((p) =>
    ownerPropertyIds.includes(p.propertyId)
  );

  const occupiedCount = ownerProperties.filter(
    (p) => p.status === "Wynajęte"
  ).length;
  const vacantCount = ownerProperties.length - occupiedCount;

  const occupancyRate =
    ownerProperties.length > 0
      ? Math.round((occupiedCount / ownerProperties.length) * 100)
      : 0;

  /* ---------- Vacancy aging ---------- */
  const now = new Date();

  const vacancyAging = ownerProperties
    .filter((p) => p.status === "Wolne")
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
  const longVacantCount = longVacantProperties.length;
  const shortVacantCount = vacancyAging.length - longVacantCount;

  /* ---------- Finance totals ---------- */
  const financeTotals = {
    totalIncome: sumPaid(ownerPayments),
    overdueIncome: sumOverdue(ownerPayments),
    expectedIncome: sumExpected(ownerPayments),
  };

  /* ---------- Property finance ---------- */
  const propertyFinance = ownerProperties.map((property) => {
    const finance = calculatePropertyFinance({
      property,
      payments: ownerPayments.filter(
        (p) => String(p.propertyId) === String(property.id)
      ),
    });

    return {
      propertyId: property.id,
      address: property.address,
      city: property.city,
      ...finance,
    };
  });

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
              payments={payments}
              occupiedCount={occupiedCount}
              vacantCount={vacantCount}
              occupancyRate={occupancyRate}
              longVacantCount={longVacantCount}
              shortVacantCount={shortVacantCount}
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
            <PropertyDetails
              loading={propertiesLoading || tenantsLoading}
              properties={ownerProperties}
              tenants={ownerTenants}
              payments={ownerPayments}
            />
          }
        />

        <Route
          path="tenants"
          element={
            <>
              <Tenants
                loading={tenantsLoading}
                tenants={ownerTenants}
                properties={ownerProperties}
                onOpenAddTenant={() => {
                  setEditingTenant(null);
                  setIsAddTenantOpen(true);
                }}
                onEditTenant={(tenant) => {
                  setEditingTenant(tenant);
                  setIsAddTenantOpen(true);
                }}
                onDeleteTenant={deleteTenant}
              />

              <AddTenantModal
                isOpen={isAddTenantOpen}
                onClose={() => {
                  setIsAddTenantOpen(false);
                  setEditingTenant(null);
                }}
                properties={ownerProperties}
                tenant={editingTenant}
                onSave={async (data) => {
                  const payload = {
                    ...data,
                    accountId: activeAccountId, // ✅ CRITICAL
                  };

                  if (data.id) {
                    await updateTenant(data.id, payload);
                  } else {
                    await createTenant(payload);
                  }
                }}
              />
            </>
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
          element={
            <>
              <Finance
                loading={paymentsLoading}
                summary={financeTotals}
                payments={ownerPayments}
                propertyFinance={propertyFinance}
                onAddPayment={() => {
                  setEditingPayment(null);
                  setIsAddPaymentOpen(true);
                }}
                onDeletePayment={deletePayment}
              />

              <AddPaymentModal
                isOpen={isAddPaymentOpen}
                onClose={() => {
                  setIsAddPaymentOpen(false);
                  setEditingPayment(null);
                }}
                payment={editingPayment}
                properties={ownerProperties}
                tenants={ownerTenants}
                onSave={async (form) => {
                  const paidAt =
                    form.status === "Opłacone"
                      ? new Date().toISOString().slice(0, 10)
                      : null;

                  const payload = {
                    accountId: activeAccountId, // ✅ CRITICAL
                    propertyId: form.propertyId,
                    tenantId: form.tenantId,
                    amount: Number(form.amount),
                    dueDate: form.dueDate,
                    paidAt,
                  };

                  if (form.id) {
                    await updatePayment(form.id, payload);
                  } else {
                    await createPayment(payload);
                  }
                }}
              />
            </>
          }
        />

        {/* ✅ Documents route */}
        <Route
          path="documents"
          element={<Documents tenants={tenants} properties={properties} />}
        />
        <Route path="maintenance-inbox" element={<MaintenanceInboxPage />} />
        <Route path="maintenance-kpi" element={<MaintenanceKPIDashboardPage />} />
        <Route path="invitations" element={<InvitationsPage />} />
        <Route
          path="portfolio-health"
          element={
            <PortfolioHealthDashboardPage
              properties={ownerProperties}
              payments={ownerPayments}
              occupiedCount={occupiedCount}
              vacantCount={vacantCount}
              occupancyRate={occupancyRate}
              longVacantProperties={longVacantProperties}
            />
          }
        />

        {/* Optional: Keep FinancePage available but under a different path */}
        <Route path="finance-page" element={<FinancePage />} />

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
