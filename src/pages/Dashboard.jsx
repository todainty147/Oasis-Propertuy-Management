// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Skeleton from "../components/ui/Skeleton";
import { Wallet, AlertCircle, Home, BriefcaseBusiness, CheckCircle2, CircleDashed, UserPlus, Wrench, X } from "lucide-react";
import {
  ActionPill,
  EmptyState,
  MetricTile,
  OperationalList,
  OperationalListItem,
  PageHeader,
  PageHeroPanel,
  PageShell,
  SectionHeader,
  StatusPill,
  TenaqoCard,
} from "../components/ui/TenaqoPrimitives";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { useI18n } from "../context/I18nContext";
import { getMaintenanceAttention } from "../services/maintenanceDashboardService";
import {
  getLeaseAttentionItems,
  getLeaseSummary,
} from "../services/leaseService";
import {
  listPropertyOperationalHealthScores,
  summarizePropertyOperationalHealth,
} from "../services/propertyHealthScoreService";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { formatCurrencyAmount } from "../utils/currency";
import { sumOverdue } from "../utils/finance";
import {
  getDashboardHubExtras,
  getDashboardSnapshot,
  mapDashboardHubItems,
} from "../services/dashboardService";
import { getImportedReviewCount } from "../services/complianceImportService";
import { countActiveContractors } from "../services/contractorDirectoryService";
import { isManageRole } from "../utils/permissions";
import OnboardingHintCard from "../components/OnboardingHintCard";
import SecurityPostureBanner from "../components/security/SecurityPostureBanner";

// ✅ Tenant dashboard widget
import TenantMaintenanceDashboard from "../components/TenantMaintenanceDashboard";
import TenantPortalOverview from "../components/TenantPortalOverview";
import TenantTimelineCard from "../components/TenantTimelineCard";

/* ======================
   SKELETON
   ====================== */

function DashboardSkeleton() {
  return (
    <PageShell className="space-y-6">
      <Skeleton className="h-28 rounded-[1.5rem]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[132px] rounded-[1.25rem]" />
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    </PageShell>
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
    setTitle(t("sidebar.dashboard"));
  }, [setTitle, t]);

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
  const [importedReviewCount, setImportedReviewCount] = useState(0);
  const [contractorCount, setContractorCount] = useState(0);
  const [propertyHealthRows, setPropertyHealthRows] = useState([]);
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
        setImportedReviewCount(0);
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
          work.push(listPropertyOperationalHealthScores(activeAccountId, { limit: 200 }));
          work.push(getImportedReviewCount(activeAccountId).catch(() => 0));
        } else {
          work.push(Promise.resolve([]));
          work.push(Promise.resolve([]));
          work.push(Promise.resolve(0));
        }

        const [snapshotRow, extras, leaseRows, leaseSummaryRow, rows, healthRows, importedCount] = await Promise.all(work);
        if (!dead) {
          setSnapshot(snapshotRow || null);
          setHubExtras(Array.isArray(extras) ? extras : []);
          setLeaseAttentionRows(Array.isArray(leaseRows) ? leaseRows : []);
          setLeaseSummary(leaseSummaryRow || null);
          setAttentionRows(Array.isArray(rows) ? rows : []);
          setPropertyHealthRows(Array.isArray(healthRows) ? healthRows : []);
          setImportedReviewCount(Number(importedCount) || 0);
        }
      } catch {
        if (!dead) {
          setAttentionRows([]);
          setLeaseAttentionRows([]);
          setLeaseSummary(null);
          setSnapshot(null);
          setHubExtras([]);
          setPropertyHealthRows([]);
          setImportedReviewCount(0);
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
        canManage && !isTenant ? listPropertyOperationalHealthScores(activeAccountId, { limit: 200 }) : Promise.resolve([]),
        canManage && !isTenant ? getImportedReviewCount(activeAccountId).catch(() => 0) : Promise.resolve(0),
      ])
        .then(([snapshotRow, extras, leaseRows, leaseSummaryRow, rows, healthRows, importedCount]) => {
          setSnapshot(snapshotRow || null);
          setHubExtras(Array.isArray(extras) ? extras : []);
          setLeaseAttentionRows(Array.isArray(leaseRows) ? leaseRows : []);
          setLeaseSummary(leaseSummaryRow || null);
          setAttentionRows(Array.isArray(rows) ? rows : []);
          setPropertyHealthRows(Array.isArray(healthRows) ? healthRows : []);
          setImportedReviewCount(Number(importedCount) || 0);
        })
        .catch(() => {
          setSnapshot(null);
          setHubExtras([]);
          setLeaseAttentionRows([]);
          setLeaseSummary(null);
          setAttentionRows([]);
          setPropertyHealthRows([]);
          setImportedReviewCount(0);
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
  const propertyHealthSummary = useMemo(
    () => summarizePropertyOperationalHealth(propertyHealthRows),
    [propertyHealthRows],
  );
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
    const tenantRow = (tenants ?? []).find((entry) => String(entry.id) === String(activeTenantId)) || null;
    const propertyRow = (properties ?? []).find((entry) => String(entry.id) === String(fallbackPropertyId)) || null;

    // ✅ Wire the buttons: go to property page (tenant can see maintenance/work orders there)
    function openTenantRequests() {
      if (!fallbackPropertyId) return;
      navigate(`/tenant/property/${fallbackPropertyId}`);
    }

    function openTenantWorkOrders() {
      if (!fallbackPropertyId) return;
      navigate(`/tenant/property/${fallbackPropertyId}`);
    }

    return (
      <PageShell className="space-y-6">
        <TenantPortalOverview
          accountId={activeAccountId}
          tenantId={activeTenantId}
          propertyId={fallbackPropertyId}
          snapshot={snapshotView}
          payments={payments}
          onOpenPayments={() => navigate("/tenant/payments")}
          onOpenRequests={openTenantRequests}
          onOpenDocuments={() => navigate("/tenant/documents")}
        />

        <TenantMaintenanceDashboard
          // Your component currently requires a propertyId to query.
          // For tenant dashboard, we’ll use the first property as “home base”.
          propertyId={fallbackPropertyId}
          onOpenRequests={openTenantRequests}
          onOpenWorkOrders={openTenantWorkOrders}
        />

        {tenantRow ? (
          <TenantTimelineCard
            accountId={activeAccountId}
            tenant={tenantRow}
            property={propertyRow}
            viewer="tenant"
          />
        ) : null}
      </PageShell>
    );
  }

  if (!canManage) {
    return (
      <PageShell>
        <TenaqoCard>
          <p className="text-sm text-[var(--text-secondary)]">{t("dashboard.accessDenied")}</p>
        </TenaqoCard>
      </PageShell>
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
    <PageShell className="space-y-6">
      <PageHeader
        eyebrow="Tenaqo"
        title={t("dashboard.hub.title")}
        subtitle={t("dashboard.hub.subtitle")}
        actions={
          <div className="inline-flex rounded-full border border-[var(--border-soft)] bg-[var(--surface-2)] p-1">
            <ActionPill onClick={() => setHubHorizon("today")} active={hubHorizon === "today"}>
              {t("dashboard.hub.range.today")}
            </ActionPill>
            <ActionPill onClick={() => setHubHorizon("week")} active={hubHorizon === "week"}>
              {t("dashboard.hub.range.week")}
            </ActionPill>
          </div>
        }
      />

      {canManage && !isTenant ? (
        <SecurityPostureBanner accountId={activeAccountId} />
      ) : null}
      {isOwner && !checklistDismissed ? (
        <TenaqoCard className="relative overflow-hidden" variant="elevated">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-logo-subtitle)]">
                {t("dashboard.onboarding.eyebrow")}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                {t("dashboard.onboarding.title")}
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
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
                className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                {t("dashboard.onboarding.openGuide")}
              </button>
              <button
                type="button"
                onClick={dismissChecklist}
                className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-2)] p-2 text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                aria-label={t("dashboard.onboarding.dismiss")}
                title={t("dashboard.onboarding.dismiss")}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
            {onboardingItems.map((item) => {
              const Icon = item.icon;
              return (
                <TenaqoCard
                  key={item.key}
                  as="button"
                  type="button"
                  onClick={() => navigate(item.href)}
                  variant="interactive"
                  className="text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="tenaqo-icon-tile">
                      <Icon size={16} />
                    </div>
                    {item.complete ? (
                      <CheckCircle2 size={18} className="text-emerald-600" />
                    ) : (
                      <CircleDashed size={18} className="text-slate-400" />
                    )}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{item.body}</p>
                </TenaqoCard>
              );
            })}
          </div>
        </TenaqoCard>
      ) : null}

      <PageHeroPanel>
        <div className="relative z-10">
          <SectionHeader
            eyebrow={hubHorizon === "today" ? t("dashboard.hub.range.today") : t("dashboard.hub.range.week")}
            title={t("dashboard.hub.title")}
            subtitle={t("dashboard.hub.subtitle")}
          />
          <div className="mt-5 flex flex-wrap gap-2">
            <ActionPill
              type="button"
              onClick={() => navigate("/maintenance-inbox?status=waiting&aging=48h")}
            >
              {t("dashboard.hub.quick.waiting")}
            </ActionPill>
            <ActionPill
              type="button"
              onClick={() => navigate("/attention-center")}
            >
              {t("dashboard.hub.quick.stalled")}
            </ActionPill>
            <ActionPill
              type="button"
              onClick={() => navigate("/finance?status=overdue")}
            >
              {t("dashboard.hub.quick.overdue")}
            </ActionPill>
            <ActionPill
              type="button"
              onClick={() => navigate("/properties?status=vacant")}
            >
              {t("dashboard.hub.quick.vacant")}
            </ActionPill>
            <ActionPill
              type="button"
              onClick={() => navigate("/portfolio-health")}
            >
              {t("dashboard.hub.quick.portfolio")}
            </ActionPill>
          </div>
        </div>
      </PageHeroPanel>

      <OnboardingHintCard
        title={t("dashboard.onboarding.hintTitle")}
        body={t("dashboard.onboarding.hintBody")}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label={t("dashboard.occupiedUnits")}
          value={Number(snapshotView.occupied_count || occupiedCount)}
          context={t("dashboard.ofUnits", { count: Number(snapshotView.property_count || properties.length) })}
          icon={Home}
          status="success"
        />

        <MetricTile
          label={t("dashboard.occupancyRate")}
          value={`${Number(snapshotView.occupancy_rate || occupancyRate)}%`}
          context={`${Number(snapshotView.vacant_count || vacantCount)} ${t("status.vacant").toLowerCase()}`}
          icon={Home}
          status="info"
        />

        <MetricTile
          label={t("dashboard.hub.overdueAmount")}
          value={formatCurrencyAmount(overdueAmountView)}
          context={t("dashboard.hub.overdueHint")}
          trend={overdueTrendLabel}
          icon={Wallet}
          status={overdueAmountView > 0 ? "danger" : "neutral"}
        />

        <MetricTile
          label={t("dashboard.hub.dueSoon")}
          value={formatCurrencyAmount(dueSoonAmount)}
          context={t("dashboard.hub.dueSoonCount", { count: dueSoonCount })}
          trend={hubHorizon === "today" ? t("dashboard.hub.dueSoonHintToday") : t("dashboard.hub.dueSoonHint")}
          icon={AlertCircle}
          status={dueSoonAmount > 0 ? "warning" : "neutral"}
        />
      </div>

      <TenaqoCard>
        <SectionHeader
          title={t("dashboard.hub.maintenanceLoad")}
          action={<StatusPill variant="neutral">{t("dashboard.hub.live")}</StatusPill>}
        />
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <MetricTile
            label={t("portfolio.labels.openRequests")}
            value={Number(snapshotView.open_requests || 0)}
            status="neutral"
            className="min-h-0"
          />
          <MetricTile
            label={t("portfolio.labels.highPriority")}
            value={Number(snapshotView.open_high_priority || 0)}
            status="danger"
            className="min-h-0"
          />
          <MetricTile
            label={t("portfolio.labels.waiting48h")}
            value={waiting48hCount}
            status="warning"
            className="min-h-0"
          />
          <MetricTile
            label={t("dashboard.hub.unassignedWo")}
            value={unassignedWorkOrdersCount}
            status="info"
            className="min-h-0"
          />
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
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
      </TenaqoCard>

      <TenaqoCard>
        <SectionHeader
          title={t("dashboard.hub.leaseWatch")}
          subtitle={t("dashboard.hub.leaseWatchHint")}
          action={
            <ActionPill onClick={() => navigate("/tenants")}>
              {t("dashboard.hub.viewLeases")}
            </ActionPill>
          }
        />
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <MetricTile
            label={t("dashboard.hub.leaseExpiringSoon")}
            value={Number(leaseSummaryView.expiringSoonCount || 0)}
            status="warning"
            className="min-h-0"
          />
          <MetricTile
            label={t("dashboard.hub.leaseExpired")}
            value={Number(leaseSummaryView.expiredCount || 0)}
            status="danger"
            className="min-h-0"
          />
          <MetricTile
            label={t("dashboard.hub.leaseRenewalInProgress")}
            value={Number(leaseSummaryView.renewalInProgressCount || 0)}
            status="info"
            className="min-h-0"
          />
        </div>
      </TenaqoCard>

      {canManage && !isTenant ? (
        <TenaqoCard>
          <SectionHeader
            title={t("dashboard.healthRadar.title")}
            subtitle={t("dashboard.healthRadar.subtitle")}
            action={
              <ActionPill onClick={() => navigate("/portfolio-health")}>
                {t("dashboard.healthRadar.cta")}
              </ActionPill>
            }
          />
          {propertyHealthRows.length === 0 ? (
            <EmptyState className="mt-4" body={t("dashboard.healthRadar.empty")} />
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <MetricTile
                label={t("dashboard.healthRadar.avgScore")}
                value={propertyHealthSummary.averageScore}
                status="success"
                className="min-h-0"
              />
              <MetricTile
                label={t("dashboard.healthRadar.attentionNeeded")}
                value={propertyHealthSummary.attentionCount}
                status="warning"
                className="min-h-0"
              />
              <MetricTile
                label={t("dashboard.healthRadar.highRisk")}
                value={propertyHealthSummary.highRiskCount}
                status="danger"
                className="min-h-0"
              />
            </div>
          )}
        </TenaqoCard>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TenaqoCard>
          <SectionHeader title={t("dashboard.hub.priorityQueue")} />
          {hubItems.length === 0 ? (
            <EmptyState className="mt-4" body={t("maintenance.kpi.noUrgent")} />
          ) : (
            <OperationalList className="mt-4">
              {hubItems.map((item) => (
                <OperationalListItem
                  key={item.id}
                  onClick={() => navigate(item.to)}
                >
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{item.subtitle}</p>
                  {item.meta ? <p className="mt-1 text-[11px] text-[var(--text-muted)]">{item.meta}</p> : null}
                </OperationalListItem>
              ))}
            </OperationalList>
          )}
          {importedReviewCount > 0 && (
            <div
              className="mt-4 border-t border-[var(--border-soft)] pt-3"
              data-testid="dashboard-imported-review-block"
            >
              <p className="text-xs font-semibold text-sky-700">
                Imported compliance records to review
              </p>
              <p className="mt-0.5 text-sm text-[var(--text-primary)]">
                {importedReviewCount} spreadsheet-supplied{" "}
                {importedReviewCount === 1 ? "record needs" : "records need"} review.
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Dates were supplied through spreadsheet import and have not been independently
                verified. Review the source record before acting.
              </p>
            </div>
          )}
        </TenaqoCard>

        <TenaqoCard>
          <SectionHeader title={t("dashboard.hub.vacancyWatch")} />
          {longVacantProperties.length === 0 ? (
            <EmptyState className="mt-4" body={t("dashboard.hub.noLongVacancy")} />
          ) : (
            <OperationalList className="mt-4">
              {longVacantProperties.slice(0, 6).map((p) => (
                <OperationalListItem
                  key={p.id}
                  onClick={() => navigate(`/properties/${p.id}`)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">{p.address}</p>
                      <p className="text-sm text-[var(--text-muted)]">{p.city}</p>
                    </div>
                    <StatusPill variant="danger">{p.daysVacant}d</StatusPill>
                  </div>
                </OperationalListItem>
              ))}
            </OperationalList>
          )}
        </TenaqoCard>
      </div>
    </PageShell>
  );
}

function deltaMeta(current = 0, previous = 0) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  const delta = c - p;
  const pct = p === 0 ? null : Math.round((delta / p) * 100);
  return { delta, pct };
}
