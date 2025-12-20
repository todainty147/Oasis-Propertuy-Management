import { useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Login from "./pages/Login";
import { useSession } from "./hooks/useSession";
import { useProperties } from "./hooks/useProperties";
import { usePayments } from "./hooks/usePayments";
import { useTenants } from "./hooks/useTenants";

import { createProperty } from "./services/propertyService";
import {
  createTenant,
  updateTenant,
  deleteTenant,
} from "./services/tenantService";

import AppLayout from "./layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Properties from "./pages/Properties";
import Finance from "./pages/Finance";
import Tenants from "./pages/Tenants";
import PropertyDetails from "./pages/PropertyDetails";
import TenantDetails from "./pages/TenantDetails";
import AddPropertyModal from "./components/AddPropertyModal";
import AddTenantModal from "./components/AddTenantModal";

export default function App() {
  /* ======================
     AUTH
     ====================== */
  const { session, loading: sessionLoading } = useSession();

  /* ======================
     DATA HOOKS (ALWAYS)
     ====================== */
  const { properties, loading: propertiesLoading, error: propertiesError } =
    useProperties({ enabled: !!session });

  const { payments, loading: paymentsLoading, error: paymentsError } =
    usePayments({ enabled: !!session });

  const { tenants, loading: tenantsLoading, error: tenantsError } =
    useTenants({ enabled: !!session });

  /* ======================
     UI STATE (MUST BE ABOVE RETURNS)
     ====================== */
  const [isAddTenantOpen, setIsAddTenantOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);

  /* ======================
     RENDER GATES
     ====================== */
  if (sessionLoading) return <div className="p-6">Ładowanie sesji…</div>;
  if (!session) return <Login />;

  if (propertiesLoading || paymentsLoading || tenantsLoading) {
    return <div className="p-6">Ładowanie danych…</div>;
  }

  if (propertiesError || paymentsError || tenantsError) {
    return (
      <div className="p-6 bg-white rounded-xl border">
        <p className="font-medium">Błąd ładowania danych</p>
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
     OWNER (SESSION-BASED)
     ====================== */
  const owners = [
    {
      id: session.user.id,
      name: session.user.email,
    },
  ];

  /* ======================
     DERIVED DATA (OPTION A)
     ====================== */

  // Tenants drive occupancy
  const ownerProperties = properties.map((p) => {
    const isOccupied = tenants.some((t) => t.propertyId === p.id);
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

  const now = new Date();

  const vacancyAging = ownerProperties
    .filter((p) => p.status === "Wolne")
    .map((property) => {
      const pastTenants = ownerTenants
        .filter((t) => t.propertyId === property.id)
        .sort(
          (a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        );

      const vacancyStart =
        pastTenants[0]?.created_at || property.created_at;

      const daysVacant = Math.floor(
        (now - new Date(vacancyStart)) / (1000 * 60 * 60 * 24)
      );

      return { ...property, daysVacant };
    });

  const longVacantProperties = vacancyAging.filter(
    (p) => p.daysVacant > 30
  );

  const longVacantCount = longVacantProperties.length;
  const shortVacantCount =
    vacancyAging.length - longVacantCount;

  const financeTotals = {
    totalIncome: ownerPayments
      .filter((p) => p.status === "Opłacone")
      .reduce((s, p) => s + p.amount, 0),
    overdueIncome: ownerPayments
      .filter((p) => p.status === "Zaległe")
      .reduce((s, p) => s + p.amount, 0),
    expectedIncome: ownerPayments.reduce((s, p) => s + p.amount, 0),
  };

  const propertyFinance = ownerProperties.map((property) => {
    const propertyPayments = ownerPayments.filter(
      (p) => p.propertyId === property.id
    );

    return {
      propertyId: property.id,
      address: property.address,
      city: property.city,
      paid: propertyPayments
        .filter((p) => p.status === "Opłacone")
        .reduce((s, p) => s + p.amount, 0),
      overdue: propertyPayments
        .filter((p) => p.status === "Zaległe")
        .reduce((s, p) => s + p.amount, 0),
      expected: propertyPayments.reduce((s, p) => s + p.amount, 0),
    };
  });

  /* ======================
     ROUTES
     ====================== */
  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <AppLayout
              owners={owners}
              activeOwnerId={session.user.id}
              setActiveOwnerId={() => {}}
            />
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />

          <Route
            path="dashboard"
            element={
              <Dashboard
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
                  onDeleteProperty={() =>
                    alert("DELETE coming next")
                  }
                />

                <AddPropertyModal
                  isOpen={isAddPropertyOpen}
                  onClose={() => {
                    setIsAddPropertyOpen(false);
                    setEditingProperty(null);
                  }}
                  onSave={async (property) => {
                    await createProperty(property);
                    setIsAddPropertyOpen(false);
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
                properties={ownerProperties}
                tenants={ownerTenants}
              />
            }
          />

          <Route
            path="tenants"
            element={
              <>
                <Tenants
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
                    data.id
                      ? await updateTenant(data.id, data)
                      : await createTenant(data);
                  }}
                />
              </>
            }
          />

          <Route
            path="tenants/:id"
            element={
              <TenantDetails
                tenants={ownerTenants}
                properties={ownerProperties}
                payments={payments}
              />
            }
          />

          <Route
            path="finance"
            element={
              <Finance
                summary={financeTotals}
                payments={ownerPayments}
                propertyFinance={propertyFinance}
              />
            }
          />

          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
