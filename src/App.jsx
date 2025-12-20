import { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
  useNavigate,
} from "react-router-dom";

import { supabase } from "./lib/supabase";

import { useSession } from "./hooks/useSession";
import { useProperties } from "./hooks/useProperties";
import { usePayments } from "./hooks/usePayments";
import { useTenants } from "./hooks/useTenants";

import { createProperty } from "./services/propertyService";
import { createTenant, updateTenant, deleteTenant } from "./services/tenantService";

import AppLayout from "./layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Properties from "./pages/Properties";
import Finance from "./pages/Finance";
import Documents from "./pages/Documents";
import Tenants from "./pages/Tenants";
import PropertyDetails from "./pages/PropertyDetails";
import TenantDetails from "./pages/TenantDetails";
import AddPropertyModal from "./components/AddPropertyModal";
import AddTenantModal from "./components/AddTenantModal";
import { INITIAL_OWNERS } from "./data/mockData";



export default function App() {
  /* ======================
     AUTH (MUST BE FIRST)
     ====================== */
  const { session, loading: sessionLoading } = useSession();

  /* ======================
     SUPABASE DATA (GATED)
     ====================== */
  const {
    properties,
    loading: propertiesLoading,
    error: propertiesError,
  } = useProperties({ enabled: !!session });

  const {
    payments,
    loading: paymentsLoading,
    error: paymentsError,
  } = usePayments({ enabled: !!session });

  const {
  tenants,
  loading: tenantsLoading,
  error: tenantsError,
} = useTenants({ enabled: !!session });


  /* ======================
     LOCAL STATE (TEMP)
     ====================== */
  
  const [owners] = useState(INITIAL_OWNERS);

  const [activeOwnerId, setActiveOwnerId] = useState(() => {
    const stored = localStorage.getItem("activeOwnerId");
    return stored ? Number(stored) : INITIAL_OWNERS[0].id;
  });

  const [isAddTenantOpen, setIsAddTenantOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);

  /* ======================
     DEV AUTH EFFECT
     ====================== */
  useEffect(() => {
    async function devLogin() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        await supabase.auth.signInWithPassword({
          email: "admin_test@local.com",
          password: "Password123",
        });
      }
    }

    devLogin();
  }, []);

  /* ======================
     OTHER EFFECTS
     ====================== */
  useEffect(() => {
    localStorage.setItem("activeOwnerId", activeOwnerId);
  }, [activeOwnerId]);

  useEffect(() => {
    if (!owners.some((o) => o.id === activeOwnerId)) {
      setActiveOwnerId(owners[0]?.id);
    }
  }, [owners, activeOwnerId]);

  /* ======================
     LOADING / ERROR GUARDS
     ====================== */

     if (sessionLoading) {
  return <div className="p-6">Ładowanie sesji…</div>;
}

if (propertiesLoading || paymentsLoading || tenantsLoading) {
  return <div className="p-6">Ładowanie danych…</div>;
}

if (propertiesError || paymentsError || tenantsError) {
  return (
    <div className="p-6 bg-white rounded-xl border">
      <p className="font-medium">Błąd ładowania danych z Supabase</p>
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
     DERIVED DATA
     ====================== */

  // RLS already scopes by user
  const ownerProperties = properties;
  const ownerTenants = tenants;

  const ownerPropertyIds = ownerProperties.map((p) => p.id);

  const ownerPayments = payments.filter((p) =>
    ownerPropertyIds.includes(p.propertyId)
  );

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
     ACTIONS LOCAL ONLY
     ====================== */
  

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
          activeOwnerId={activeOwnerId}
          setActiveOwnerId={setActiveOwnerId}
        />
      }
    >
      {/* INDEX */}
      <Route index element={<Navigate to="dashboard" replace />} />

      {/* DASHBOARD */}
      <Route
        path="dashboard"
        element={
          <Dashboard
            properties={ownerProperties}
            payments={payments}
          />
        }
      />

      {/* PROPERTIES LIST */}
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
                await createProperty({
                  address: property.address,
                  city: property.city,
                  tenantId: property.tenantId,
                  status: property.status,
                });
                setIsAddPropertyOpen(false);
              }}
              property={editingProperty}
              tenants={ownerTenants}
              owners={owners}
            />
          </>
        }
      />

      {/* TENANTS LIST */}
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
          if (data.id) {
            await updateTenant(data.id, data);
          } else {
            await createTenant(data);
          }
        }}
      />
    </>
  }
/>
{/*TENANT DETAILS*/}

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


      {/* 🔴 PROPERTY DETAILS — THIS MUST EXIST */}
      <Route
        path="properties/:id"
        element={
          <PropertyDetails
            properties={ownerProperties}
            tenants={ownerTenants}
          />
        }
      />

      {/* FINANCE */}
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

      {/* FALLBACK */}
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Route>
  </Routes>
</BrowserRouter>


  );
}
