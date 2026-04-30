// src/routes/TenantRoutes.jsx
//
// Sub-routes mounted under <TenantPortalLayout />.
// Uses only the hooks a tenant needs (properties, payments, tenants)
// scoped by RLS to what the tenant can see.
//
// This deliberately does NOT use usePortfolioShellData — that hook loads
// portfolio-wide manager data (leases, owner contact, occupancy stats) which
// a tenant session neither needs nor should trigger.
import { useMemo, lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { useParams } from "react-router-dom";

import { useAccount } from "../context/AccountContext";
import { useProperties } from "../hooks/useProperties";
import { usePayments } from "../hooks/usePayments";
import { useTenants } from "../hooks/useTenants";
import { OCCUPANCY_STATUS } from "../utils/statuses";
import { normalizePlan } from "../lib/entitlements";

const TenantHomePage  = lazy(() => import("../pages/TenantHomePage"));
const TenantLeasePage = lazy(() => import("../pages/TenantLeasePage"));
const TenantPayments  = lazy(() => import("../pages/TenantPayments"));
const ProfilePage     = lazy(() => import("../pages/ProfilePage"));
const Properties      = lazy(() => import("../pages/Properties"));
const PropertyDetails = lazy(() => import("../pages/PropertyDetails"));
const Documents       = lazy(() => import("../pages/Documents"));

// Redirect for the legacy /properties/:id URL used inside the tenant portal
function TenantPropertyDetailsRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/tenant/property/${id}` : "/tenant/property"} replace />;
}

export default function TenantRoutes() {
  const { activeAccountId, activePlan } = useAccount();
  const tenantDataEnabled = !!activeAccountId;

  // Tenant-scoped hooks: RLS returns only what this tenant can see.
  const { properties, loading: propertiesLoading } = useProperties({ enabled: tenantDataEnabled });
  const { payments,   loading: paymentsLoading }   = usePayments({ enabled: tenantDataEnabled });
  const { tenants,    loading: tenantsLoading }     = useTenants({ enabled: tenantDataEnabled });

  // Light derivation: status on properties (no lease data needed for tenant view)
  const tenantProperties = useMemo(
    () =>
      properties.map((p) => {
        const isOccupied = tenants.some((t) => String(t.propertyId) === String(p.id));
        return { ...p, status: isOccupied ? OCCUPANCY_STATUS.OCCUPIED : OCCUPANCY_STATUS.VACANT };
      }),
    [properties, tenants],
  );

  const tenantPayments = useMemo(
    () => {
      const ids = new Set(properties.map((p) => String(p.id)));
      return payments.filter((p) => ids.has(String(p.propertyId)));
    },
    [payments, properties],
  );

  const safeActivePlan = normalizePlan(activePlan);

  return (
    <>
      <Route index element={<Navigate to="/tenant/home" replace />} />
      <Route path="home"    element={<TenantHomePage />} />
      <Route path="lease"   element={<TenantLeasePage />} />
      <Route path="payments" element={<TenantPayments />} />
      <Route path="profile" element={<ProfilePage />} />

      <Route
        path="property"
        element={
          <Properties
            loading={propertiesLoading}
            properties={tenantProperties}
            tenants={tenants}
            activePlan={safeActivePlan}
          />
        }
      />

      <Route
        path="property/:id"
        element={
          <PropertyDetails
            loading={propertiesLoading || tenantsLoading || paymentsLoading}
            properties={tenantProperties}
            tenants={tenants}
            payments={tenantPayments}
          />
        }
      />

      <Route
        path="documents"
        element={<Documents tenants={tenants} properties={properties} />}
      />
    </>
  );
}
