// src/pages/Dashboard.jsx
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { Wallet, TrendingUp, AlertCircle, Home, FileText } from "lucide-react";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";

// ✅ Tenant dashboard widget
import TenantMaintenanceDashboard from "../components/TenantMaintenanceDashboard";

/* ======================
   SKELETON
   ====================== */

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px]" />
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    </div>
  );
}

/* ======================
   DASHBOARD
   ====================== */

export default function Dashboard({
  loading = false,
  properties = [],
  payments = [],
  occupiedCount = 0,
  vacantCount = 0,
  occupancyRate = 0,
  longVacantCount = 0,
  shortVacantCount = 0,
  longVacantProperties = [],
}) {
  const { t } = useI18n();
  const navigate = useNavigate();

  /* ---------- PAGE TITLE ---------- */
  const { setTitle } = usePageTitle();
  useEffect(() => {
    setTitle("Pulpit");
  }, [setTitle]);

  /* ---------- ROLE ---------- */
  const { activeRole } = useAccount();
  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const isTenant = useMemo(() => role === "tenant", [role]);

  /* ---------- LOADING ---------- */
  if (loading) return <DashboardSkeleton />;

  /* =========================================================
     TENANT VIEW
     ========================================================= */
  if (isTenant) {
    // Payments schema: status is due/paid/overdue/void
    const paidTotal = (payments ?? [])
      .filter((p) => String(p.status ?? "").toLowerCase() === "paid")
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const dueTotal = (payments ?? [])
      .filter((p) => String(p.status ?? "").toLowerCase() === "due")
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const overdueTotal = (payments ?? [])
      .filter((p) => String(p.status ?? "").toLowerCase() === "overdue")
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);

    const dueOrOverdueCount = (payments ?? []).filter((p) =>
      ["due", "overdue"].includes(String(p.status ?? "").toLowerCase())
    ).length;

    const propertyIds = (properties ?? []).map((p) => p.id).filter(Boolean);
    const fallbackPropertyId = propertyIds[0] ?? null;

    // ✅ Wire the buttons: go to property page (tenant can see maintenance/work orders there)
    function openTenantRequests() {
      if (!fallbackPropertyId) return;
      // If you add anchors later, you can switch to:
      // navigate(`/properties/${fallbackPropertyId}#maintenance-requests`);
      navigate(`/properties/${fallbackPropertyId}`);
    }

    function openTenantWorkOrders() {
      if (!fallbackPropertyId) return;
      // If you add anchors later, you can switch to:
      // navigate(`/properties/${fallbackPropertyId}#work-orders`);
      navigate(`/properties/${fallbackPropertyId}`);
    }

    return (
      <div className="space-y-6">
        <TenantMaintenanceDashboard
          // Your component currently requires a propertyId to query.
          // For tenant dashboard, we’ll use the first property as “home base”.
          propertyId={fallbackPropertyId}
          onOpenRequests={openTenantRequests}
          onOpenWorkOrders={openTenantWorkOrders}
        />

        {/* Tenant Finance summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500">{t("finance.table.paid")}</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {paidTotal.toLocaleString()} PLN
                </h3>
              </div>
              <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                <Wallet size={20} />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm text-emerald-600">
              <TrendingUp size={16} className="mr-1" />
              <span>{t("dashboard.tenantPaymentHistory")}</span>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500">{t("dashboard.toPay")}</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">
                  {dueTotal.toLocaleString()} PLN
                </h3>
              </div>
              <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                <AlertCircle size={20} />
              </div>
            </div>
            <div className="mt-4 text-sm text-slate-500">
              {dueOrOverdueCount} płatności (due/overdue)
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500">{t("finance.summary.overdue")}</p>
                <h3 className="text-2xl font-bold text-rose-600 mt-1">
                  {overdueTotal.toLocaleString()} PLN
                </h3>
              </div>
              <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
                <AlertCircle size={20} />
              </div>
            </div>
            <div className="mt-4 text-sm text-slate-500">
              Jeśli widzisz zaległości, skontaktuj się z właścicielem.
            </div>
          </Card>
        </div>

        {/* Documents requiring attention (placeholder) */}
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
              <FileText size={18} />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              Dokumenty wymagające uwagi
            </h3>
          </div>

          <p className="text-sm text-slate-500 mt-2">
            Tutaj pokażemy dokumenty do podpisu / potwierdzenia (np. umowa, aneksy,
            protokoły). Na razie: sekcja przygotowana pod kolejną iterację.
          </p>
        </Card>
      </div>
    );
  }

  /* =========================================================
     NON-TENANT VIEW (UNCHANGED)
     ========================================================= */

  // Existing calculations (Polish labels)
  const totalRevenue = (payments ?? [])
    .filter((p) => p.status === "Opłacone")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const pendingRevenue = (payments ?? [])
    .filter((p) => p.status === "Oczekujące" || p.status === "Zaległe")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">{t("dashboard.monthlyRevenue")}</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {totalRevenue.toLocaleString()} PLN
              </h3>
            </div>
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm text-emerald-600">
            <TrendingUp size={16} className="mr-1" />
            <span>+12% od zeszłego miesiąca</span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">{t("dashboard.pendingAndOverdue")}</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {pendingRevenue.toLocaleString()} PLN
              </h3>
            </div>
            <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
              <AlertCircle size={20} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">
            {
              (payments ?? []).filter(
                (p) => p.status === "Oczekujące" || p.status === "Zaległe"
              ).length
            }{" "}
            płatności do weryfikacji
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">{t("dashboard.occupiedUnits")}</p>
              <h3 className="text-2xl font-bold text-green-600 mt-1">{occupiedCount}</h3>
            </div>
            <div className="p-2 bg-green-100 rounded-lg text-green-600">
              <Home size={20} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">{t("dashboard.ofUnits", { count: properties.length })}</div>
        </Card>

        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">{t("dashboard.occupancyRate")}</p>
              <h3 className="text-2xl font-bold text-blue-600 mt-1">{occupancyRate}%</h3>
            </div>
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <Home size={20} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">{vacantCount} wolnych lokali</div>
        </Card>

        <Card className="p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">{t("dashboard.longVacant")}</p>
              <h3 className="text-2xl font-bold text-red-600 mt-1">{longVacantCount}</h3>
            </div>
            <div className="p-2 bg-red-100 rounded-lg text-red-600">
              <AlertCircle size={20} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">{shortVacantCount} wolne ≤ 30 dni</div>
        </Card>
      </div>

      {longVacantProperties.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 text-red-600">
            Lokale puste ponad 30 dni
          </h3>

          <div className="divide-y">
            {longVacantProperties.map((p) => (
              <div key={p.id} className="py-3 flex justify-between items-center">
                <div>
                  <p className="font-medium">{p.address}</p>
                  <p className="text-sm text-slate-500">{p.city}</p>
                </div>

                <span className="text-sm font-semibold text-red-600">{p.daysVacant} dni</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
