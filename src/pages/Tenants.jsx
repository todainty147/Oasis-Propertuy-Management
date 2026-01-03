// src/pages/Tenants.jsx
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import Card from "../components/Card";
import Badge from "../components/Badge";
import Skeleton from "../components/ui/Skeleton";
import AddTenantModal from "../components/AddTenantModal";

import { usePageTitle } from "../layout/PageTitleContext";
import { useTenants } from "../hooks/useTenants";
import { useProperties } from "../hooks/useProperties";
import { useTenant } from "../context/TenantContext";
import { useAccount } from "../context/AccountContext";
import { canCreateTenant } from "../utils/permissions";

/* ======================
   SKELETON
   ====================== */

function TenantsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[150px]" />
        ))}
      </div>
    </div>
  );
}

/* ======================
   TENANTS PAGE
   ====================== */

export default function Tenants() {
  const { setTitle } = usePageTitle();
  const { activeTenantId } = useTenant();
  const { activeRole } = useAccount();

  const { tenants, loading, createTenant } = useTenants();
  const { properties } = useProperties();

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    setTitle("Najemcy");
  }, [setTitle]);

  /* ---------- LOADING ---------- */
  if (loading) {
    return <TenantsSkeleton />;
  }

  /* ---------- EMPTY ---------- */
  if (tenants.length === 0) {
    return (
      <>
        <div className="text-center py-20">
          <h3 className="text-xl font-semibold text-slate-900">
            Brak najemców
          </h3>
          <p className="text-slate-500 mt-2">
            {activeTenantId
              ? "Wybrany najemca nie istnieje lub został usunięty"
              : "Dodaj pierwszego najemcę"}
          </p>

          {canCreateTenant(activeRole) && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Dodaj najemcę
            </button>
          )}
        </div>

        <AddTenantModal
          open={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          properties={properties}
          onSave={createTenant}
        />
      </>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* HEADER */}
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-900">
            Najemcy
          </h2>

          {canCreateTenant(activeRole) && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Dodaj najemcę
            </button>
          )}
        </div>

        {/* TENANT CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tenants.map((tenant) => {
            const property = properties.find(
              (p) => p.id === tenant.propertyId
            );

            return (
              <Link
                key={tenant.id}
                to={`/tenants/${tenant.id}`}
                className="block"
              >
                <Card className="hover:shadow-md transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg text-slate-900">
                        {tenant.name}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {tenant.email ?? "—"}
                      </p>
                    </div>

                    {property && <Badge status="Wynajęte" />}
                  </div>

                  <div className="mt-3 text-sm text-slate-600">
                    {property
                      ? `Wynajmuje: ${property.address}`
                      : "Brak przypisanej nieruchomości"}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      <AddTenantModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        properties={properties}
        onSave={createTenant}
      />
    </>
  );
}
