import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Card from "../components/Card";
import Breadcrumbs from "../components/Breadcrumbs";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";

/* ======================
   SKELETON
   ====================== */

function PropertyDetailsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Skeleton className="h-4 w-64" />

      {/* Main card */}
      <Card className="p-6 space-y-4">
        <div>
          <Skeleton className="h-7 w-80" />
          <Skeleton className="h-4 w-48 mt-2" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px]" />
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ======================
   PROPERTY DETAILS
   ====================== */

export default function PropertyDetails({
  loading = false,
  properties,
  tenants,
  payments = [],
}) {
  const { id } = useParams();
  const navigate = useNavigate();

  const { setTitle } = usePageTitle();

  if (loading) {
    return <PropertyDetailsSkeleton />;
  }

  const property = properties.find(
    (p) => String(p.id) === String(id)
  );

  /* ---------- PAGE TITLE ---------- */
  useEffect(() => {
    if (property?.address) {
      setTitle(property.address);
    }
  }, [property?.address, setTitle]);

  if (!property) {
    return (
      <div className="p-6 bg-white rounded-xl border">
        <p>Nie znaleziono nieruchomości.</p>
        <button
          className="mt-4 text-blue-600"
          onClick={() => navigate("/properties")}
        >
          ← Wróć
        </button>
      </div>
    );
  }

  /* ======================
     NAJEMCA (tenants-first)
     ====================== */
  const tenantNamesFromTenants = tenants
    .filter(
      (t) =>
        String(t.propertyId) === String(property.id)
    )
    .map((t) => t.name)
    .filter(Boolean);

  // Fallback only — tenants table is source of truth
  const tenantNamesFromPayments = payments
    .filter(
      (p) =>
        String(p.propertyId) === String(property.id)
    )
    .map((p) => p.tenantName)
    .filter(Boolean);

  const tenantNames = Array.from(
    new Set([
      ...tenantNamesFromTenants,
      ...tenantNamesFromPayments,
    ])
  );

  /* ======================
     PAYMENTS / REMAINING
     ====================== */
  const propertyPayments = payments.filter(
    (p) =>
      String(p.propertyId) === String(property.id)
  );

  const paid = propertyPayments
    .filter((p) => p.status === "Opłacone")
    .reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );

  const rent = Number(property.rent) || 0;
  const remaining = Math.max(rent - paid, 0);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Nieruchomości", to: "/properties" },
          { label: property.address },
        ]}
      />

      <Card className="p-6">
        <h2 className="text-2xl font-bold text-slate-900">
          {property.address}
        </h2>
        <p className="text-slate-600 mt-1">
          {property.city} • {property.size}
        </p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* CZYNSZ */}
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">
              Czynsz
            </p>
            <p className="font-semibold">
              {rent.toLocaleString("pl-PL")} zł
            </p>
          </Card>

          {/* STATUS */}
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">
              Status
            </p>
            <p className="font-semibold">
              {property.status}
            </p>
          </Card>

          {/* NAJEMCA */}
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">
              Najemca
            </p>
            <p className="font-semibold">
              {tenantNames.length
                ? tenantNames.join(", ")
                : "Brak"}
            </p>
          </Card>

          {/* POZOSTAŁO */}
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">
              Pozostało do zapłaty
            </p>

            <p
              className={`font-semibold ${
                remaining > 0
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {remaining.toLocaleString("pl-PL")} zł
            </p>

            {remaining === 0 && (
              <p className="text-xs text-green-600 mt-1">
                Opłacone
              </p>
            )}
          </Card>
        </div>
      </Card>
    </div>
  );
}
