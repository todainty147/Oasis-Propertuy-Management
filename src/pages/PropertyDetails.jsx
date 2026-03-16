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
import ActivityLogSection from "../components/ActivityLogSection";
import LeaseSummaryCard from "../components/LeaseSummaryCard";
import PropertyPerformanceCard from "../components/PropertyPerformanceCard";
import PropertyPreventiveMaintenanceCard from "../components/PropertyPreventiveMaintenanceCard";
import PropertyOperatingExpensesCard from "../components/PropertyOperatingExpensesCard";
import PropertyComplianceCard from "../components/PropertyComplianceCard";
import { useI18n } from "../context/I18nContext";
import { formatCurrencyAmount } from "../utils/currency";

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
  const { accountLoading, activeAccountId, activeRole } = useAccount();
  const { t } = useI18n();
  const canManageLease = ["owner", "admin", "staff"].includes(
    String(activeRole || "").toLowerCase(),
  );

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
        <p>{t("propertyDetails.notFound")}</p>
        <button
          className="mt-4 text-blue-600"
          onClick={() => navigate("/properties")}
        >
          {t("common.back")}
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
          { label: t("properties.title"), to: "/properties" },
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

          <Badge status={isOccupied ? t("status.occupied") : t("status.vacant")} />
        </div>

        {/* ---------- STATS ---------- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">{t("finance.table.rent")}</p>
            <p className="text-xl font-bold">{formatCurrencyAmount(finance.rent)}</p>
          </Card>

          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">{t("finance.table.paid")}</p>
            <p className="text-xl font-bold text-green-600">
              {formatCurrencyAmount(finance.paid)}
            </p>
          </Card>

          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">{t("finance.table.remaining")}</p>
            <p className="text-xl font-bold text-rose-600">
              {formatCurrencyAmount(finance.remaining)}
            </p>
          </Card>
        </div>

        <div className="pt-2">
          <PropertyPerformanceCard
            accountId={activeAccountId}
            property={property}
            payments={propertyPayments}
            tenantCount={propertyTenants.length}
          />
        </div>

        <div className="pt-2">
          <LeaseSummaryCard
            accountId={activeAccountId}
            propertyId={property.id}
            tenantId={propertyTenants[0]?.id || null}
            canManage={canManageLease}
          />
        </div>

        {canManageLease ? (
          <div className="pt-2">
            <PropertyPreventiveMaintenanceCard
              accountId={activeAccountId}
              propertyId={property.id}
            />
          </div>
        ) : null}

        {canManageLease ? (
          <div className="pt-2">
            <PropertyOperatingExpensesCard
              accountId={activeAccountId}
              propertyId={property.id}
            />
          </div>
        ) : null}

        {canManageLease ? (
          <div className="pt-2">
            <PropertyComplianceCard
              accountId={activeAccountId}
              propertyId={property.id}
            />
          </div>
        ) : null}

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

        {/* ✅ NEW: ACTIVITY LOG (read-only, minimal) */}
<ActivityLogSection
  propertyId={property.id}
  limit={25}
  defaultOpen={false}
/>

      </Card>
    </div>
  );
}
