import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Breadcrumbs from "../components/Breadcrumbs";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import TenantDocumentsSection from "../components/TenantDocumentsSection";
import { useAccount } from "../context/AccountContext";

/* ======================
   SKELETON
   ====================== */

function TenantDetailsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-56" />
      <Card className="p-6 space-y-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
      </Card>
    </div>
  );
}

/* ======================
   TENANT DETAILS
   ====================== */

export default function TenantDetails({
  loading = false,
  tenants = [],
  properties = [],
  payments = [],
}) {
  /* ---------- ROUTER ---------- */
  const { id } = useParams();
  const navigate = useNavigate();

  /* ---------- ACCOUNT ---------- */
  const { accountLoading } = useAccount();

  /* ---------- PAGE TITLE ---------- */
  const { setTitle } = usePageTitle();

  /* ---------- DATA LOOKUPS ---------- */
  const tenant = tenants.find((t) => String(t.id) === String(id));
  const property = properties.find(
    (p) => String(p.id) === String(tenant?.propertyId)
  );

  /* ---------- EFFECTS ---------- */
  useEffect(() => {
    if (tenant?.name) {
      setTitle(tenant.name);
    }
  }, [tenant?.name, setTitle]);

  /* ---------- EARLY STATES ---------- */
  if (loading || accountLoading) {
    return <TenantDetailsSkeleton />;
  }

  if (!tenant) {
    return (
      <div className="p-6 bg-white rounded-xl border">
        <p>Nie znaleziono najemcy.</p>
        <button
          className="mt-4 text-blue-600"
          onClick={() => navigate("/tenants")}
        >
          ← Wróć
        </button>
      </div>
    );
  }

  /* ---------- PAYMENTS ---------- */
  const tenantPayments = payments.filter(
    (p) => String(p.tenantId) === String(tenant.id)
  );

  const paidCount = tenantPayments.filter(
    (p) => p.status === "Opłacone"
  ).length;

  const overdueCount = tenantPayments.filter(
    (p) => p.status === "Zaległe"
  ).length;

  /* ---------- TENANT STATUS ---------- */
  let tenantStatus = "Zaległe";
  if (overdueCount === 0 && paidCount > 0) tenantStatus = "Opłacone";
  else if (paidCount > 0 && overdueCount > 0) tenantStatus = "Częściowo";

  /* ======================
     RENDER
     ====================== */

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Najemcy", to: "/tenants" },
          { label: tenant.name },
        ]}
      />

      {/* ---------- TENANT CARD ---------- */}
      <Card className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {tenant.name}
            </h2>
            <p className="text-slate-600 mt-1">{tenant.email}</p>
            <p className="text-slate-600">{tenant.phone}</p>
          </div>

          <Badge status={tenantStatus} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Lokal</p>
            <p className="font-semibold">{property?.address || "—"}</p>
            <p className="text-sm text-slate-500">
              {property?.city || ""}
            </p>
          </Card>

          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Opłacone</p>
            <p className="text-xl font-bold">{paidCount}</p>
          </Card>

          <Card className="p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Zaległe</p>
            <p className="text-xl font-bold text-rose-600">
              {overdueCount}
            </p>
          </Card>
        </div>
      </Card>

      {/* ---------- TENANT DOCUMENTS ---------- */}
      <TenantDocumentsSection tenantId={tenant.id} />
    </div>
  );
}
