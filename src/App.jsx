// src/App.jsx
import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { useState, useEffect, useMemo, lazy, Suspense } from "react";

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
import AppLayout from "./layout/AppLayout";
import TenantPortalLayout from "./layout/TenantPortalLayout";
import { useAccount } from "./context/AccountContext";
import { useI18n } from "./context/I18nContext";
import { OCCUPANCY_STATUS } from "./utils/statuses";
import { isManageRole } from "./utils/permissions";
import { ENTITLEMENT_FEATURES } from "./lib/entitlements";
import { assertUsageCapacity, getPlanUsageLimit, normalizePlan } from "./lib/entitlements";
import FeatureAccessCard from "./components/FeatureAccessCard";
import { saveEntityCustomFieldValues } from "./services/customFieldService";
import { listLeases } from "./services/leaseService";

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
const RolesManagementPage = lazy(() => import("./pages/RolesManagementPage"));
const CustomFieldsManagementPage = lazy(() => import("./pages/CustomFieldsManagementPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const FinancePage = lazy(() => import("./pages/FinancePage"));
const PlaybooksPage = lazy(() => import("./pages/PlaybooksPage"));
const SecurityAuditPage = lazy(() => import("./pages/SecurityAuditPage"));
const RootTelemetryPage = lazy(() => import("./pages/RootTelemetryPage"));
const AddPropertyModal = lazy(() => import("./components/AddPropertyModal"));

function EntitledRoute({ feature, children }) {
  const { activeRole, isRootOperator, canAccessTelemetry, hasEntitlement, activePlan } = useAccount();
  const role = String(activeRole || "").toLowerCase();
  const canManage = isManageRole(role, { isRootOperator });
  const canEvaluate = feature === ENTITLEMENT_FEATURES.ROOT_TELEMETRY ? canAccessTelemetry : canManage;

  if (!canEvaluate) {
    return <Navigate to="/dashboard" replace />;
  }

  if (hasEntitlement(feature)) {
    return children;
  }

  return <FeatureAccessCard feature={feature} currentPlan={activePlan} />;
}

function ManagerOnlyRoute({ children }) {
  const { activeRole, isRootOperator } = useAccount();
  const role = String(activeRole || "").toLowerCase();

  return isManageRole(role, { isRootOperator }) ? children : <Navigate to="/dashboard" replace />;
}

function isTenantRole(activeRole) {
  return String(activeRole || "").toLowerCase() === "tenant";
}

function isContractorRole(activeRole) {
  return String(activeRole || "").toLowerCase() === "contractor";
}

function TenantOnlyRoute({ children }) {
  const { activeRole } = useAccount();
  return isTenantRole(activeRole) ? children : <Navigate to="/dashboard" replace />;
}

function TenantPropertyDetailsRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/tenant/property/${id}` : "/tenant/property"} replace />;
}

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
  const { activeAccountId, activeAccount, activeRole, accountLoading, activePlan } = useAccount();
  const tenantRole = isTenantRole(activeRole);
  const contractorRole = isContractorRole(activeRole);
  const portfolioDataEnabled = !!session && !contractorRole;
  const leaseDataEnabled = portfolioDataEnabled && !tenantRole;

  /* ======================
     DATA HOOKS
     ====================== */
  // NOTE: These hooks should already be scoped by RLS (account_id policies).
  // If your hooks still fetch by owner_id, we will adjust them later.
  const {
    properties,
    loading: propertiesLoading,
    error: propertiesError,
    refetch: refetchProperties,
  } = useProperties({ enabled: portfolioDataEnabled, accountId: activeAccountId });

  const {
    payments,
    loading: paymentsLoading,
    error: paymentsError,
  } = usePayments({ enabled: portfolioDataEnabled, accountId: activeAccountId });

  const { tenants, loading: tenantsLoading, error: tenantsError } = useTenants({
    enabled: portfolioDataEnabled,
    accountId: activeAccountId,
  });

  /* ======================
     UI STATE
     ====================== */

  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);

  const [accountOwnerEmail, setAccountOwnerEmail] = useState("");
  const [leases, setLeases] = useState([]);
  const [leasesError, setLeasesError] = useState(null);

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
      } catch {
        if (!cancelled) setAccountOwnerEmail("");
      }
    }
    loadOwnerContact();
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, activeRole]);

  useEffect(() => {
    let cancelled = false;

    async function loadLeases() {
      if (!leaseDataEnabled || !activeAccountId) {
        setLeases([]);
        setLeasesError(null);
        return;
      }

      try {
        const rows = await listLeases({ accountId: activeAccountId, limit: 500 });
        if (!cancelled) {
          setLeases(rows);
          setLeasesError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLeases([]);
          setLeasesError(error);
        }
      }
    }

    loadLeases();

    return () => {
      cancelled = true;
    };
  }, [activeAccountId, leaseDataEnabled]);

  /* ======================
     OWNER (LEGACY SHIM)
     ====================== */
  // Keep AppLayout API unchanged, but represent "owner" as the active account.
  const owners = useMemo(
    () => [
      {
        id: activeAccountId,
        name: accountOwnerEmail || activeAccount?.name || "Account owner",
      },
    ],
    [activeAccountId, accountOwnerEmail, activeAccount?.name],
  );

  /* ======================
     DERIVED DATA
     ====================== */

  const ownerTenants = tenants;

  const ownerProperties = useMemo(
    () =>
      properties.map((p) => {
        const isOccupied = tenants.some(
          (tenant) => String(tenant.propertyId) === String(p.id),
        );
        return {
          ...p,
          status: isOccupied ? OCCUPANCY_STATUS.OCCUPIED : OCCUPANCY_STATUS.VACANT,
        };
      }),
    [properties, tenants],
  );

  const ownerPropertyIds = useMemo(
    () => new Set(ownerProperties.map((p) => String(p.id))),
    [ownerProperties],
  );

  const ownerPayments = useMemo(
    () => payments.filter((p) => ownerPropertyIds.has(String(p.propertyId))),
    [payments, ownerPropertyIds],
  );

  const { occupiedCount, vacantCount, occupancyRate } = useMemo(() => {
    const occupied = ownerProperties.filter(
      (p) => p.status === OCCUPANCY_STATUS.OCCUPIED,
    ).length;
    const vacant = ownerProperties.length - occupied;
    const rate =
      ownerProperties.length > 0
        ? Math.round((occupied / ownerProperties.length) * 100)
        : 0;

    return {
      occupiedCount: occupied,
      vacantCount: vacant,
      occupancyRate: rate,
    };
  }, [ownerProperties]);

  const longVacantProperties = useMemo(() => {
    const now = new Date();

    return ownerProperties
      .filter((p) => p.status === OCCUPANCY_STATUS.VACANT)
      .map((property) => {
        const latestEndedLease = leases
          .filter((lease) => String(lease.property_id) === String(property.id))
          .filter((lease) => {
            if (!lease.lease_end_date) return false;
            const leaseEnd = new Date(`${lease.lease_end_date}T00:00:00`);
            return !Number.isNaN(leaseEnd.getTime()) && leaseEnd <= now;
          })
          .sort((a, b) => String(b.lease_end_date).localeCompare(String(a.lease_end_date)))[0];

        const vacancyStart =
          latestEndedLease?.lease_end_date || property.createdAt || property.created_at;
        const vacancyStartDate = vacancyStart ? new Date(vacancyStart) : null;
        const daysVacant =
          vacancyStartDate && !Number.isNaN(vacancyStartDate.getTime())
            ? Math.floor((now - vacancyStartDate) / (1000 * 60 * 60 * 24))
            : 0;

        return { ...property, daysVacant };
      })
      .filter((p) => p.daysVacant > 30);
  }, [leases, ownerProperties]);

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

  if (propertiesError || paymentsError || tenantsError || leasesError) {
    return (
      <div className="p-6 bg-white rounded-xl border">
        <p className="font-medium">{t("app.loadErrorTitle")}</p>
        <p className="mt-3 text-sm text-gray-600">{t("app.loadErrorRetry")}</p>
      </div>
    );
  }

  const safeActivePlan = normalizePlan(activePlan);
  const propertyPlanLimit = getPlanUsageLimit(safeActivePlan, "properties");
  const canCreateMoreProperties =
    propertyPlanLimit == null ? true : ownerProperties.length < propertyPlanLimit;

  function openAddPropertyModal() {
    if (!canCreateMoreProperties) {
      window.alert(
        t("properties.limitReached", {
          plan: t(`billing.plan.${safeActivePlan}`),
          count: ownerProperties.length,
          limit: propertyPlanLimit,
        }),
      );
      return;
    }
    setEditingProperty(null);
    setIsAddPropertyOpen(true);
  }

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
            tenantRole ? (
              <Navigate to="/tenant/home" replace />
            ) : contractorRole ? (
              <Navigate to="/contractor" replace />
            ) : (
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
            )
          }
        />

        <Route
          path="properties"
          element={
            tenantRole ? (
              <Navigate to="/tenant/property" replace />
            ) : contractorRole ? (
              <Navigate to="/contractor" replace />
            ) : (
              <>
                <Properties
                  loading={propertiesLoading}
                  properties={ownerProperties}
                  tenants={ownerTenants}
                  activePlan={safeActivePlan}
                  onAddProperty={openAddPropertyModal}
                  onEditProperty={(p) => {
                    setEditingProperty(p);
                    setIsAddPropertyOpen(true);
                  }}
                  onDeleteProperty={async (propertyId) => {
                    if (!confirm(t("properties.confirmDelete"))) return;
                    await deleteProperty(propertyId);
                    await refetchProperties();
                  }}
                />

                <AddPropertyModal
                  isOpen={isAddPropertyOpen}
                  onClose={() => {
                    setIsAddPropertyOpen(false);
                    setEditingProperty(null);
                  }}
                  onSave={async (property) => {
                    if (!property.id) {
                      if (!canCreateMoreProperties) {
                        window.alert(
                          t("properties.limitReached", {
                            plan: t(`billing.plan.${safeActivePlan}`),
                            count: ownerProperties.length,
                            limit: propertyPlanLimit,
                          }),
                        );
                        return;
                      }
                      assertUsageCapacity(safeActivePlan, "properties", ownerProperties.length);
                    }
                    const payload = {
                      ...property,
                      accountId: activeAccountId, // ✅ CRITICAL
                    };

                    const savedProperty = property.id
                      ? await updateProperty(property.id, payload)
                      : await createProperty(payload);

                    await saveEntityCustomFieldValues({
                      accountId: activeAccountId,
                      entityId: savedProperty?.id || property.id,
                      definitions: property.customFieldDefinitions,
                      values: property.customFieldValues,
                    });

                    setIsAddPropertyOpen(false);
                    setEditingProperty(null);
                  }}
                  property={editingProperty}
                  tenants={ownerTenants}
                  owners={owners}
                />
              </>
            )
          }
        />

        <Route
          path="properties/:id"
          element={
            tenantRole ? (
              <TenantPropertyDetailsRedirect />
            ) : contractorRole ? (
              <Navigate to="/contractor" replace />
            ) : (
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
                    if (!property.id) {
                      if (!canCreateMoreProperties) {
                        window.alert(
                          t("properties.limitReached", {
                            plan: t(`billing.plan.${safeActivePlan}`),
                            count: ownerProperties.length,
                            limit: propertyPlanLimit,
                          }),
                        );
                        return;
                      }
                      assertUsageCapacity(safeActivePlan, "properties", ownerProperties.length);
                    }
                    const payload = {
                      ...property,
                      accountId: activeAccountId,
                    };

                    const savedProperty = property.id
                      ? await updateProperty(property.id, payload)
                      : await createProperty(payload);

                    await saveEntityCustomFieldValues({
                      accountId: activeAccountId,
                      entityId: savedProperty?.id || property.id,
                      definitions: property.customFieldDefinitions,
                      values: property.customFieldValues,
                    });

                    setIsAddPropertyOpen(false);
                    setEditingProperty(null);
                  }}
                  property={editingProperty}
                  tenants={ownerTenants}
                  owners={owners}
                />
              </>
            )
          }
        />

        <Route
          path="tenants"
          element={
            contractorRole ? (
              <Navigate to="/contractor" replace />
            ) : (
              <Tenants
                loading={tenantsLoading}
                tenants={ownerTenants}
                properties={ownerProperties}
              />
            )
          }
        />

        <Route
          path="tenants/:id"
          element={
            contractorRole ? (
              <Navigate to="/contractor" replace />
            ) : (
              <TenantDetails
                loading={tenantsLoading || paymentsLoading}
                tenants={ownerTenants}
                properties={ownerProperties}
                payments={payments}
              />
            )
          }
        />

        <Route
          path="finance"
          element={contractorRole ? <Navigate to="/contractor" replace /> : <FinancePage />}
        />

        {/* ✅ Documents route */}
        <Route
          path="documents"
          element={
            tenantRole ? (
              <Navigate to="/tenant/documents" replace />
            ) : contractorRole ? (
              <Navigate to="/contractor" replace />
            ) : (
              <Documents tenants={tenants} properties={properties} />
            )
          }
        />
        <Route path="maintenance-inbox" element={<MaintenanceInboxPage />} />
        <Route
          path="maintenance-kpi"
          element={
            <EntitledRoute feature={ENTITLEMENT_FEATURES.MAINTENANCE_KPI}>
              <MaintenanceKPIDashboardPage />
            </EntitledRoute>
          }
        />
        <Route
          path="command-center"
          element={
            <EntitledRoute feature={ENTITLEMENT_FEATURES.COMMAND_CENTER}>
              <CommandCenterPage />
            </EntitledRoute>
          }
        />
        <Route
          path="attention-center"
          element={
            <EntitledRoute feature={ENTITLEMENT_FEATURES.COMMAND_CENTER}>
              <CommandCenterPage />
            </EntitledRoute>
          }
        />
        <Route path="landlord-onboarding" element={<LandlordOnboardingPage />} />
        <Route path="invitations" element={<InvitationsPage />} />
              <Route
                path="settings/profile"
                element={tenantRole ? <Navigate to="/tenant/profile" replace /> : <ProfilePage />}
              />
              <Route
                path="settings/branding"
                element={
                  <ManagerOnlyRoute>
                    <AccountBrandingPage />
                  </ManagerOnlyRoute>
                }
              />
              <Route
                path="settings/billing"
                element={
                  <ManagerOnlyRoute>
                    <BillingPage />
                  </ManagerOnlyRoute>
                }
              />
              <Route
                path="settings/roles"
                element={
                  <ManagerOnlyRoute>
                    <RolesManagementPage />
                  </ManagerOnlyRoute>
                }
              />
              <Route
                path="settings/custom-fields"
                element={
                  <ManagerOnlyRoute>
                    <CustomFieldsManagementPage />
                  </ManagerOnlyRoute>
                }
              />
              <Route
                path="settings/playbooks"
                element={
                  <EntitledRoute feature={ENTITLEMENT_FEATURES.PLAYBOOKS}>
                    <PlaybooksPage />
                  </EntitledRoute>
                }
              />
              <Route
                path="settings/security-audit"
                element={
                  <EntitledRoute feature={ENTITLEMENT_FEATURES.SECURITY_AUDIT}>
                    <SecurityAuditPage />
                  </EntitledRoute>
                }
              />
              <Route
                path="settings/root-telemetry"
                element={
                  <EntitledRoute feature={ENTITLEMENT_FEATURES.ROOT_TELEMETRY}>
                    <RootTelemetryPage />
                  </EntitledRoute>
                }
              />
        <Route
          path="portfolio-health"
          element={
            <EntitledRoute feature={ENTITLEMENT_FEATURES.PORTFOLIO_HEALTH}>
              <PortfolioHealthDashboardPage />
            </EntitledRoute>
          }
        />
        {/* ✅ Contractor routes (relative paths because they are inside AppLayout wrapper) */}
        <Route path="contractor" element={<ContractorPortal />} />
        <Route path="contractor/jobs/:id" element={<ContractorJobDetails />} />
        <Route path="work-orders/:id" element={<WorkOrderDetails />} />


        {/* ✅ Catch-all MUST be absolute to avoid /dashboard/dashboard loops */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>

        <Route
          path="tenant"
          element={
            <TenantOnlyRoute>
              <TenantPortalLayout />
            </TenantOnlyRoute>
          }
        >
          <Route index element={<Navigate to="/tenant/home" replace />} />
          <Route
            path="home"
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
            path="property"
            element={
              <Properties
                loading={propertiesLoading}
                properties={ownerProperties}
                tenants={ownerTenants}
                activePlan={safeActivePlan}
              />
            }
          />
          <Route
            path="property/:id"
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
            path="documents"
            element={<Documents tenants={tenants} properties={properties} />}
          />
          <Route path="payments" element={<TenantPayments />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
