import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Breadcrumbs from "../components/Breadcrumbs";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { calculatePropertyFinance } from "../utils/finance";
import PropertyDocumentsSection from "../components/PropertyDocumentsSection";
import MaintenanceRequestsSection from "../components/MaintenanceRequestsSection";
import WorkOrdersSection from "../components/WorkOrdersSection";
import { useAccount } from "../context/AccountContext";

/* ======================
   SKELETON
   ====================== */

function PropertyDetailsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-56" />

      <Card className="p-6 space-y-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[96px]" />
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
  const { accountLoading, activeAccountId } = useAccount();

  /* ---------- PROPERTY ---------- */
  const property = properties.find((p) => String(p.id) === String(id));

  /* ---------- PAGE TITLE (HOOK ALWAYS RUNS) ---------- */
  useEffect(() => {
    if (property?.address) setTitle(property.address);
  }, [property?.address, setTitle]);

  /* ---------- LOADING ---------- */
  if (loading || accountLoading) return <PropertyDetailsSkeleton />;

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

  /* ---------- TENANTS ---------- */
  const propertyTenants = tenants.filter(
    (t) => String(t.propertyId) === String(property.id)
  );
  const isOccupied = propertyTenants.length > 0;

  /* ---------- PAYMENTS ---------- */
  const propertyPayments = payments.filter(
    (p) => String(p.propertyId) === String(property.id)
  );

  /* ---------- FINANCE ---------- */
  const finance = calculatePropertyFinance({
    property,
    payments: propertyPayments,
  });

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Nieruchomości", to: "/properties" },
          { label: property.address },
        ]}
      />

      <Card className="p-6 space-y-6">
        {/* ---------- HEADER ---------- */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {property.address}
            </h2>
            <p className="text-slate-600 mt-1">{property.city}</p>
          </div>

          <Badge status={isOccupied ? "Wynajęte" : "Wolne"} />
        </div>

        {/* ---------- STATS ---------- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Czynsz</p>
            <p className="text-xl font-bold">{finance.rent.toLocaleString()} zł</p>
          </Card>

          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Opłacone</p>
            <p className="text-xl font-bold text-green-600">
              {finance.paid.toLocaleString()} zł
            </p>
          </Card>

          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Pozostało</p>
            <p className="text-xl font-bold text-rose-600">
              {finance.remaining.toLocaleString()} zł
            </p>
          </Card>
        </div>

        {/* ---------- DOCUMENTS ---------- */}
        <div className="pt-2">
          <PropertyDocumentsSection propertyId={property.id} />
        </div>

        {/* ---------- MAINTENANCE ---------- */}
        <div className="pt-2">
          <MaintenanceRequestsSection
            propertyId={property.id}
            accountId={activeAccountId} // safe optional prop (component may ignore)
          />
        </div>

        {/* ---------- WORK ORDERS ---------- */}
        <div className="pt-2">
          <WorkOrdersSection
            propertyId={property.id}
            accountId={activeAccountId} // safe optional prop (component may ignore)
          />
        </div>
      </Card>
    </div>
  );
}
