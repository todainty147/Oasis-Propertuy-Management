import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Card from "../components/Card";
import Breadcrumbs from "../components/Breadcrumbs";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { calculatePropertyFinance } from "../utils/finance";

/* ======================
   SKELETON
   ====================== */

function PropertyDetailsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-64" />

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
  properties = [],
  tenants = [],
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

  /* ---------- NOT FOUND ---------- */
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

  /* ---------- PAGE TITLE ---------- */
  useEffect(() => {
    setTitle(property.address);
  }, [property.address, setTitle]);

  /* ---------- TENANTS ---------- */
  const tenantNames = tenants
    .filter((t) => String(t.propertyId) === String(property.id))
    .map((t) => t.name)
    .filter(Boolean);

  /* ---------- FINANCE (UTIL-DRIVEN) ---------- */
  const finance = calculatePropertyFinance({
    property,
    payments: payments.filter(
      (p) => String(p.propertyId) === String(property.id)
    ),
  });

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
          {/* RENT */}
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Czynsz</p>
            <p className="font-semibold">
              {finance.rent.toLocaleString("pl-PL")} zł
            </p>
          </Card>

          {/* STATUS */}
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Status</p>
            <p className="font-semibold">
              {finance.paymentStatus}
            </p>
          </Card>

          {/* TENANTS */}
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Najemca</p>
            <p className="font-semibold">
              {tenantNames.length
                ? tenantNames.join(", ")
                : "Brak"}
            </p>
          </Card>

          {/* REMAINING */}
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">
              Pozostało do zapłaty
            </p>

            <p
              className={`font-semibold ${
                finance.remaining > 0
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {finance.remaining.toLocaleString("pl-PL")} zł
            </p>

            {finance.remaining === 0 && (
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
