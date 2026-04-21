// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { Wallet, AlertCircle, Home, BriefcaseBusiness, CheckCircle2, CircleDashed, UserPlus, Wrench, X } from "lucide-react";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { useI18n } from "../context/I18nContext";
import { getMaintenanceAttention } from "../services/maintenanceDashboardService";
import {
  getLeaseAttentionItems,
  getLeaseSummary,
} from "../services/leaseService";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { formatCurrencyAmount } from "../utils/currency";
import { sumOverdue } from "../utils/finance";
import {
  getDashboardHubExtras,
  getDashboardSnapshot,
  mapDashboardHubItems,
} from "../services/dashboardService";
import { countActiveContractors } from "../services/contractorDirectoryService";
import { isManageRole } from "../utils/permissions";
import OnboardingHintCard from "../components/OnboardingHintCard";

// ✅ Tenant dashboard widget
import TenantMaintenanceDashboard from "../components/TenantMaintenanceDashboard";
import TenantPortalOverview from "../components/TenantPortalOverview";

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
  tenants = [],
  payments = [],
  occupiedCount = 0,
  vacantCount = 0,
  occupancyRate = 0,
  longVacantProperties = [],
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* ---------- PAGE TITLE ---------- */
  const { setTitle } = usePageTitle();
  useEffect(() => {
    setTitle("Pulpit");
  }, [setTitle]);

  /* ---------- ROLE ---------- */
  const { activeRole, activeAccountId, isRootOperator } = useAccount();
  const { activeTenantId } = useTenant();
  const role = useMemo(() => String(activeRole ?? "").toLowerCase(), [activeRole]);
  const isTenant = useMemo(() => role === "tenant", [role]);
  const canManage = useMemo(() => isManageRole(role, { isRootOperator }), [isRootOperator, role]);
  const isOwner = useMemo(() => role === "owner", [role]);
  const [attentionRows, setAttentionRows] = useState([]);
  const [leaseAttentionRows, setLeaseAttentionRows] = useState([]);
  const [leaseSummary, setLeaseSummary] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [hubExtras, setHubExtras] = useState([]);
  const [contractorCount, setContractorCount] = useState(0);
  const [dismissedChecklistKeys, setDismissedChecklistKeys] = useState({});
  const hubHorizon = useMemo(() => {
    const h = String(searchParams.get("horizon") || "").toLowerCase();
    return h === "today" ? "today" : "week";
  }, [searchParams]);

  function setHubHorizon(next) {
    const normalized = String(next || "").toLowerCase() === "week" ? "week" : "today";
    const params = new URLSearchParams(searchParams);
    params.set("horizon", normalized);
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    const h = String(searchParams.get("horizon") || "").toLowerCase();
    if (h === "today" || h === "week") return;
    const params = new URLSearchParams(searchParams);
    params.set("horizon", "week");
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const checklistKey = activeAccountId ? `dashboard_onboarding_hidden:${activeAccountId}:${role}` : "";
  const checklistDismissed = useMemo(() => {
    if (!checklistKey) return false;
    if (Object.prototype.hasOwnProperty.call(dismissedChecklistKeys, checklistKey)) {
      return Boolean(dismissedChecklistKeys[checklistKey]);
    }
    return localStorage.getItem(checklistKey) === "1";
  }, [checklistKey, dismissedChecklistKeys]);

  useEffect(() => {
    let dead = false;
    async function loadContractorCount() {
      if (!activeAccountId || !isOwner) {
        setContractorCount(0);
        return;
      }
      try {
        const nextCount = await countActiveContractors(activeAccountId);
        if (!dead) setContractorCount(nextCount);
      } catch {
        if (!dead) setContractorCount(0);
      }
    }
    loadContractorCount();
    return () => {
      dead = true;
    };
  }, [activeAccountId, isOwner]);

  useEffect(() => {
    let dead = false;
    async function loadAttentionAndSnapshot() {
      if (!activeAccountId) {
        setAttentionRows([]);
        setLeaseAttentionRows([]);
        setLeaseSummary(null);
        setSnapshot(null);
        setHubExtras([]);
        return;
      }

      const horizonDays = hubHorizon === "week" ? 7 : 1;
      try {
        const work = [
          getDashboardSnapshot(activeAccountId, {
            tenantId: activeTenantId || null,
            horizonDays,
          }),
          getDashboardHubExtras(activeAccountId, {
            tenantId: activeTenantId || null,
            horizonDays,
          }),
          canManage && !isTenant ? getLeaseAttentionItems(activeAccountId, 6) : Promise.resolve([]),
          canManage && !isTenant ? getLeaseSummary(activeAccountId) : Promise.resolve(null),
        ];

        if (canManage && !isTenant) {
          work.push(getMaintenanceAttention(activeAccountId));
        } else {
          work.push(Promise.resolve([]));
        }

        const [snapshotRow, extras, leaseRows, leaseSummaryRow, rows] = await Promise.all(work);
        if (!dead) {
          setSnapshot(snapshotRow || null);
          setHubExtras(Array.isArray(extras) ? extras : []);
          setLeaseAttentionRows(Array.isArray(leaseRows) ? leaseRows : []);
          setLeaseSummary(leaseSummaryRow || null);
          setAttentionRows(Array.isArray(rows) ? rows : []);
        }
      } catch {
        if (!dead) {
          setAttentionRows([]);
          setLeaseAttentionRows([]);
          setLeaseSummary(null);
          setSnapshot(null);
          setHubExtras([]);
        }
      }
    }
    loadAttentionAndSnapshot();
    return () => {
      dead = true;
    };
  }, [activeAccountId, activeTenantId, canManage, hubHorizon, isTenant]);

  useRealtimeTables({
    enabled: !!activeAccountId,
    subscriptions: [
      { channel: `dashboard-properties:${activeAccountId}`, table: "properties", filter: `account_id=eq.${activeAccountId}` },
      { channel: `dashboard-tenants:${activeAccountId}`, table: "tenants", filter: `account_id=eq.${activeAccountId}` },
      { channel: `dashboard-payments:${activeAccountId}`, table: "payments", filter: `account_id=eq.${activeAccountId}` },
      { channel: `dashboard-leases:${activeAccountId}`, table: "leases", filter: `account_id=eq.${activeAccountId}` },
      { channel: `dashboard-preventive:${activeAccountId}`, table: "preventive_maintenance_tasks", filter: `account_id=eq.${activeAccountId}` },
      { channel: `dashboard-requests:${activeAccountId}`, table: "maintenance_requests", filter: `account_id=eq.${activeAccountId}` },
      { channel: `dashboard-work-orders:${activeAccountId}`, table: "work_orders", filter: `account_id=eq.${activeAccountId}` },
    ],
    onChange: () => {
      if (!activeAccountId) return;
      const horizonDays = hubHorizon === "week" ? 7 : 1;
      Promise.all([
        getDashboardSnapshot(activeAccountId, {
          tenantId: activeTenantId || null,
          horizonDays,
          forceRefresh: true,
        }),
        getDashboardHubExtras(activeAccountId, {
          tenantId: activeTenantId || null,
          horizonDays,
        }),
        canManage && !isTenant ? getLeaseAttentionItems(activeAccountId, 6) : Promise.resolve([]),
        canManage && !isTenant ? getLeaseSummary(activeAccountId) : Promise.resolve(null),
        canManage && !isTenant ? getMaintenanceAttention(activeAccountId) : Promise.resolve([]),
      ])
        .then(([snapshotRow, extras, leaseRows, leaseSummaryRow, rows]) => {
          setSnapshot(snapshotRow || null);
          setHubExtras(Array.isArray(extras) ? extras : []);
          setLeaseAttentionRows(Array.isArray(leaseRows) ? leaseRows : []);
          setLeaseSummary(leaseSummaryRow || null);
          setAttentionRows(Array.isArray(rows) ? rows : []);
        })
        .catch(() => {
          setSnapshot(null);
          setHubExtras([]);
          setLeaseAttentionRows([]);
          setLeaseSummary(null);
          setAttentionRows([]);
        });
    },
  });

  const snapshotView = snapshot ?? {
    property_count: properties.length,
    occupied_count: occupiedCount,
    vacant_count: vacantCount,
    occupancy_rate: occupancyRate,
    tenant_paid_total: 0,
    tenant_due_total: 0,
    tenant_overdue_total: 0,
    tenant_due_overdue_count: 0,
    overdue_amount: 0,
    due_soon_count: 0,
    due_soon_amount: 0,
    overdue_current_window_amount: 0,
    overdue_previous_window_amount: 0,
    open_requests: 0,
    open_high_priority: 0,
    waiting_over_48h: 0,
    unassigned_work_orders: 0,
  };

  const dueSoonCount = Number(snapshotView.due_soon_count || 0);
  const dueSoonAmount = Number(snapshotView.due_soon_amount || 0);

  const hubItems = useMemo(
    () =>
      mapDashboardHubItems({
        attentionRows,
        dueSoonCount,
        extras: hubExtras,
        leaseItems: leaseAttentionRows,
        hubHorizon,
        t,
      }),
    [attentionRows, dueSoonCount, hubExtras, hubHorizon, leaseAttentionRows, t]
  );

  const overdueAmount = sumOverdue(
    (payments ?? []).map((p) => ({
      ...p,
      dueDate: p?.dueDate ?? p?.due_date ?? null,
      paidAt: p?.paidAt ?? p?.paid_at ?? null,
    })),
  );
  const overdueAmountView = Number(snapshotView.overdue_amount || overdueAmount);
  const unassignedWorkOrdersCount = Number(snapshotView.unassigned_work_orders || 0);
  const waiting48hCount = Number(snapshotView.waiting_over_48h || 0);
  const maintenanceStarted =
    Number(snapshotView.open_requests || 0) > 0 ||
    unassignedWorkOrdersCount > 0 ||
    waiting48hCount > 0;
  const overdueTrend = deltaMeta(
    snapshotView.overdue_current_window_amount,
    snapshotView.overdue_previous_window_amount
  );

  const overdueTrendLabel = (() => {
    if (!Number.isFinite(overdueTrend.delta) || overdueTrend.delta === 0) return t("dashboard.hub.trend.flat");
    const up = overdueTrend.delta > 0;
    if (overdueTrend.pct == null) {
      return up
        ? t("dashboard.hub.trend.upAmount", { value: formatCurrencyAmount(Math.abs(overdueTrend.delta)) })
        : t("dashboard.hub.trend.downAmount", { value: formatCurrencyAmount(Math.abs(overdueTrend.delta)) });
    }
    return up
      ? t("dashboard.hub.trend.upPct", { value: Math.abs(overdueTrend.pct) })
      : t("dashboard.hub.trend.downPct", { value: Math.abs(overdueTrend.pct) });
  })();

  const leaseSummaryView = leaseSummary ?? {
    total: 0,
    expiringSoonCount: 0,
    expiredCount: 0,
    renewalInProgressCount: 0,
  };
  const hasProperties = (properties || []).length > 0;
  const hasTenants = (tenants || []).length > 0;
  const hasPayments = (payments || []).length > 0;

  const onboardingItems = useMemo(
    () => [
      {
        key: "property",
        title: t("dashboard.onboarding.items.property.title"),
        body: t("dashboard.onboarding.items.property.body"),
        complete: hasProperties,
        href: "/properties",
        icon: Home,
      },
      {
        key: "tenant",
        title: t("dashboard.onboarding.items.tenant.title"),
        body: t("dashboard.onboarding.items.tenant.body"),
        complete: hasTenants,
        href: "/invitations",
        icon: UserPlus,
      },
      {
        key: "payment",
        title: t("dashboard.onboarding.items.payment.title"),
        body: t("dashboard.onboarding.items.payment.body"),
        complete: hasPayments,
        href: "/finance",
        icon: Wallet,
      },
      {
        key: "maintenance",
        title: t("dashboard.onboarding.items.maintenance.title"),
        body: t("dashboard.onboarding.items.maintenance.body"),
        complete: maintenanceStarted,
        href: "/maintenance-inbox",
        icon: Wrench,
      },
      {
        key: "contractor",
        title: t("dashboard.onboarding.items.contractor.title"),
        body: t("dashboard.onboarding.items.contractor.body"),
        complete: contractorCount > 0,
        href: "/invitations",
        icon: BriefcaseBusiness,
      },
    ],
    [contractorCount, hasPayments, hasProperties, hasTenants, maintenanceStarted, t]
  );
  const onboardingCompleteCount = onboardingItems.filter((item) => item.complete).length;

  /* ---------- LOADING ---------- */
  if (loading) return <DashboardSkeleton />;

  /* =========================================================
     TENANT VIEW
     ========================================================= */
  if (isTenant) {
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
        <TenantPortalOverview
          accountId={activeAccountId}
          tenantId={activeTenantId}
          propertyId={fallbackPropertyId}
          snapshot={snapshotView}
          payments={payments}
          onOpenPayments={() => navigate("/tenant/payments")}
          onOpenRequests={openTenantRequests}
          onOpenDocuments={() => navigate("/documents")}
        />

        <TenantMaintenanceDashboard
          // Your component currently requires a propertyId to query.
          // For tenant dashboard, we’ll use the first property as “home base”.
          propertyId={fallbackPropertyId}
          onOpenRequests={openTenantRequests}
          onOpenWorkOrders={openTenantWorkOrders}
        />
      </div>
    );
  }

  if (!canManage) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">{t("dashboard.accessDenied")}</p>
      </Card>
    );
  }

  /* =========================================================
     NON-TENANT VIEW (OPERATIONS HUB)
     ========================================================= */

  function dismissChecklist() {
    if (!checklistKey) return;
    localStorage.setItem(checklistKey, "1");
    setDismissedChecklistKeys((prev) => ({ ...prev, [checklistKey]: true }));
  }

  return (
    <div className="space-y-6 pt-3 lg:pt-4">
      {isOwner && !checklistDismissed ? (
        <Card className="relative overflow-hidden border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950 p-5 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_34%)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">
                {t("dashboard.onboarding.eyebrow")}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">
                {t("dashboard.onboarding.title")}
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                {t("dashboard.onboarding.subtitle", {
                  done: onboardingCompleteCount,
                  total: onboardingItems.length,
                })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/landlord-onboarding")}
                className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-sm font-medium text-slate-100 hover:border-blue-400 hover:text-blue-200"
              >
                {t("dashboard.onboarding.openGuide")}
              </button>
              <button
                type="button"
                onClick={dismissChecklist}
                className="rounded-lg border border-slate-700 bg-slate-950/30 p-2 text-slate-300 hover:border-blue-400 hover:text-blue-200"
                aria-label={t("dashboard.onboarding.dismiss")}
                title={t("dashboard.onboarding.dismiss")}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="relative mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
            {onboardingItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigate(item.href)}
                  className="rounded-xl border border-slate-700 bg-slate-900/85 p-4 text-left transition hover:border-blue-400 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-lg bg-blue-500/12 p-2 text-blue-300">
                      <Icon size={16} />
                    </div>
                    {item.complete ? (
                      <CheckCircle2 size={18} className="text-emerald-600" />
                    ) : (
                      <CircleDashed size={18} className="text-slate-400" />
                    )}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-100">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-300">{item.body}</p>
                </button>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Card className="p-6 border bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-800 text-white shadow-lg">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">{t("dashboard.hub.title")}</h2>
            <p className="text-sm text-slate-200 mt-1">{t("dashboard.hub.subtitle")}</p>
          </div>
          <div className="inline-flex rounded-lg border border-white/20 overflow-hidden">
            <button
              type="button"
              onClick={() => setHubHorizon("today")}
              className={`px-3 py-1.5 text-sm ${hubHorizon === "today" ? "bg-white text-slate-900" : "bg-white/10 text-white hover:bg-white/20"}`}
            >
              {t("dashboard.hub.range.today")}
            </button>
            <button
              type="button"
              onClick={() => setHubHorizon("week")}
              className={`px-3 py-1.5 text-sm ${hubHorizon === "week" ? "bg-white text-slate-900" : "bg-white/10 text-white hover:bg-white/20"}`}
            >
              {t("dashboard.hub.range.week")}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => navigate("/maintenance-inbox?status=waiting&aging=48h")}
            className="px-3 py-2 text-sm rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-left"
          >
            {t("dashboard.hub.quick.waiting")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/finance?status=overdue")}
            className="px-3 py-2 text-sm rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-left"
          >
            {t("dashboard.hub.quick.overdue")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/properties?status=vacant")}
            className="px-3 py-2 text-sm rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-left"
          >
            {t("dashboard.hub.quick.vacant")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/portfolio-health")}
            className="px-3 py-2 text-sm rounded-lg bg-white/10 border border-white/20 hover:bg-white/20 text-left"
          >
            {t("dashboard.hub.quick.portfolio")}
          </button>
        </div>
      </Card>

      <OnboardingHintCard
        title={t("dashboard.onboarding.hintTitle")}
        body={t("dashboard.onboarding.hintBody")}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-5 border border-emerald-200 bg-emerald-50/40">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">{t("dashboard.occupiedUnits")}</p>
              <h3 className="text-2xl font-bold text-green-600 mt-1">{Number(snapshotView.occupied_count || occupiedCount)}</h3>
            </div>
            <div className="p-2 bg-green-100 rounded-lg text-green-600">
              <Home size={20} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">{t("dashboard.ofUnits", { count: Number(snapshotView.property_count || properties.length) })}</div>
        </Card>

        <Card className="p-5 border border-blue-200 bg-blue-50/40">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">{t("dashboard.occupancyRate")}</p>
              <h3 className="text-2xl font-bold text-blue-600 mt-1">{Number(snapshotView.occupancy_rate || occupancyRate)}%</h3>
            </div>
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <Home size={20} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">{Number(snapshotView.vacant_count || vacantCount)} {t("status.vacant").toLowerCase()}</div>
        </Card>

        <Card className="p-5 border border-rose-200 bg-rose-50/40">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">{t("dashboard.hub.overdueAmount")}</p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1">{formatCurrencyAmount(overdueAmountView)}</h3>
            </div>
            <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">{t("dashboard.hub.overdueHint")}</div>
          <div
            className={`mt-1 text-xs font-medium ${
              overdueTrend.delta > 0 ? "text-rose-700" : overdueTrend.delta < 0 ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            {overdueTrendLabel}
          </div>
        </Card>

        <Card className="p-5 border border-amber-200 bg-amber-50/40">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">{t("dashboard.hub.dueSoon")}</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">{formatCurrencyAmount(dueSoonAmount)}</h3>
            </div>
            <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
              <AlertCircle size={20} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">
            {t("dashboard.hub.dueSoonCount", { count: dueSoonCount })}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {hubHorizon === "today" ? t("dashboard.hub.dueSoonHintToday") : t("dashboard.hub.dueSoonHint")}
          </div>
        </Card>
      </div>

      <Card className="p-5 border shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">{t("dashboard.hub.maintenanceLoad")}</h3>
          <span className="text-xs text-slate-500">{t("dashboard.hub.live")}</span>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-200 p-3 bg-white">
            <p className="text-xs text-slate-500">{t("portfolio.labels.openRequests")}</p>
            <p className="text-xl font-semibold text-slate-900 mt-1">{Number(snapshotView.open_requests || 0)}</p>
          </div>
          <div className="rounded-lg border border-rose-200 p-3 bg-rose-50/40">
            <p className="text-xs text-slate-500">{t("portfolio.labels.highPriority")}</p>
            <p className="text-xl font-semibold text-rose-700 mt-1">{Number(snapshotView.open_high_priority || 0)}</p>
          </div>
          <div className="rounded-lg border border-amber-200 p-3 bg-amber-50/40">
            <p className="text-xs text-slate-500">{t("portfolio.labels.waiting48h")}</p>
            <p className="text-xl font-semibold text-amber-700 mt-1">{waiting48hCount}</p>
          </div>
          <div className="rounded-lg border border-violet-200 p-3 bg-violet-50/40">
            <p className="text-xs text-slate-500">{t("dashboard.hub.unassignedWo")}</p>
            <p className="text-xl font-semibold text-violet-700 mt-1">{unassignedWorkOrdersCount}</p>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
          {(() => {
            const open = Number(snapshotView.open_requests || 0);
            const high = Number(snapshotView.open_high_priority || 0);
            const wait = Number(waiting48hCount || 0);
            const total = Math.max(1, open + high + wait);
            const wOpen = Math.max(3, Math.round((open / total) * 100));
            const wHigh = Math.max(3, Math.round((high / total) * 100));
            const wWait = Math.max(3, 100 - wOpen - wHigh);
            return (
              <div className="h-full w-full flex">
                <div className="h-full bg-slate-500" style={{ width: `${wOpen}%` }} />
                <div className="h-full bg-rose-500" style={{ width: `${wHigh}%` }} />
                <div className="h-full bg-amber-500" style={{ width: `${wWait}%` }} />
              </div>
            );
          })()}
        </div>
      </Card>

      <Card className="p-5 border shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{t("dashboard.hub.leaseWatch")}</h3>
            <p className="text-xs text-slate-500 mt-1">{t("dashboard.hub.leaseWatchHint")}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/tenants")}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            {t("dashboard.hub.viewLeases")}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-amber-200 p-3 bg-amber-50/40">
            <p className="text-xs text-slate-500">{t("dashboard.hub.leaseExpiringSoon")}</p>
            <p className="text-xl font-semibold text-amber-700 mt-1">{Number(leaseSummaryView.expiringSoonCount || 0)}</p>
          </div>
          <div className="rounded-lg border border-rose-200 p-3 bg-rose-50/40">
            <p className="text-xs text-slate-500">{t("dashboard.hub.leaseExpired")}</p>
            <p className="text-xl font-semibold text-rose-700 mt-1">{Number(leaseSummaryView.expiredCount || 0)}</p>
          </div>
          <div className="rounded-lg border border-blue-200 p-3 bg-blue-50/40">
            <p className="text-xs text-slate-500">{t("dashboard.hub.leaseRenewalInProgress")}</p>
            <p className="text-xl font-semibold text-blue-700 mt-1">{Number(leaseSummaryView.renewalInProgressCount || 0)}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">{t("dashboard.hub.priorityQueue")}</h3>
          {hubItems.length === 0 ? (
            <p className="text-sm text-slate-500 mt-3">{t("maintenance.kpi.noUrgent")}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {hubItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.to)}
                  className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500 mt-1">{item.subtitle}</p>
                  {item.meta ? <p className="text-[11px] text-slate-400 mt-1">{item.meta}</p> : null}
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">{t("dashboard.hub.vacancyWatch")}</h3>
          {longVacantProperties.length === 0 ? (
            <p className="text-sm text-slate-500 mt-3">{t("dashboard.hub.noLongVacancy")}</p>
          ) : (
            <div className="mt-3 divide-y">
              {longVacantProperties.slice(0, 6).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/properties/${p.id}`)}
                  className="w-full py-3 flex justify-between items-center text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium">{p.address}</p>
                    <p className="text-sm text-slate-500">{p.city}</p>
                  </div>
                  <span className="text-sm font-semibold text-red-600">{p.daysVacant}d</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function deltaMeta(current = 0, previous = 0) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  const delta = c - p;
  const pct = p === 0 ? null : Math.round((delta / p) * 100);
  return { delta, pct };
}
