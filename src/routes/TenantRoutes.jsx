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

import { useAccount } from "../context/AccountContext";
import { useProperties } from "../hooks/useProperties";
import { useTenants } from "../hooks/useTenants";
import { OCCUPANCY_STATUS } from "../utils/statuses";

const TenantHomePage  = lazy(() => import("../pages/TenantHomePage"));
const TenantLeasePage = lazy(() => import("../pages/TenantLeasePage"));
const TenantPayments  = lazy(() => import("../pages/TenantPayments"));
const ProfilePage     = lazy(() => import("../pages/ProfilePage"));
const TenantPropertyPage = lazy(() => import("../pages/TenantPropertyPage"));
const Documents       = lazy(() => import("../pages/Documents"));

export default function TenantRoutes() {
  const { activeAccountId } = useAccount();
  const tenantDataEnabled = !!activeAccountId;

  // Tenant-scoped hooks: RLS returns only what this tenant can see.
  const { properties, loading: propertiesLoading } = useProperties({ enabled: tenantDataEnabled });
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
          <TenantPropertyPage
            loading={propertiesLoading || tenantsLoading}
            properties={tenantProperties}
            tenants={tenants}
          />
        }
      />

      <Route
        path="property/:id"
        element={
          <TenantPropertyPage
            loading={propertiesLoading || tenantsLoading}
            properties={tenantProperties}
            tenants={tenants}
          />
        }
      />

      <Route
        path="maintenance"
        element={
          <TenantPropertyPage
            loading={propertiesLoading || tenantsLoading}
            properties={tenantProperties}
            tenants={tenants}
            maintenanceOnly
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
