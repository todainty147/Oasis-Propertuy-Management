import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { useI18n } from "../context/I18nContext";
import {
  getPortfolioAttentionItems,
  getPortfolioHealthSnapshot,
  mapPortfolioAttentionItems,
} from "../services/portfolioHealthService";
import {
  getAccountReportSettings,
  sendWeeklySummaryNow,
  upsertAccountReportSettings,
} from "../services/reportingService";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { formatCurrencyAmount } from "../utils/currency";
import {
  getLeaseAttentionItems,
  getLeaseSummary,
} from "../services/leaseService";
import {
  listPropertyOperationalHealthScores,
  summarizePropertyOperationalHealth,
} from "../services/propertyHealthScoreService";
import { isManageRole } from "../utils/permissions";
import OnboardingHintCard from "../components/OnboardingHintCard";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";

function pctDelta(current, previous) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return Math.round(((c - p) / p) * 100);
}

function StatCard({ title, value, hint = "", to = "", tone = "blue" }) {
  const tones = {
    blue: "from-blue-600/10 to-cyan-500/10 border-blue-200",
    emerald: "from-emerald-600/10 to-lime-500/10 border-emerald-200",
    amber: "from-amber-500/10 to-orange-500/10 border-amber-200",
    rose: "from-rose-500/10 to-red-500/10 border-rose-200",
    violet: "from-violet-500/10 to-indigo-500/10 border-violet-200",
  };
  const body = (
    <Card className={`p-4 border bg-gradient-to-br ${tones[tone] || tones.blue} shadow-sm hover:shadow-md transition-shadow`}>
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      {hint ? <p className="text-xs text-slate-500 mt-1">{hint}</p> : null}
    </Card>
  );
  if (!to) return body;
  return (
    <Link to={to} className="block">
      {body}
    </Link>
  );
}

function DonutCard({ title, totalLabel, rows = [], toByKey = {}, labels = {} }) {
  const total = rows.reduce((sum, r) => sum + Number(r.value || 0), 0);
  const palette = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#6366f1"];
  const segments = rows.reduce(
    (acc, r, idx) => {
      const pct = total > 0 ? (Number(r.value || 0) / total) * 100 : 0;
      const from = acc.nextStart;
      const to = from + pct;
      return {
        nextStart: to,
        rows: [...acc.rows, { ...r, pct, color: palette[idx % palette.length], from, to }],
      };
    },
    { nextStart: 0, rows: [] },
  ).rows;

  const gradient = segments.length
    ? `conic-gradient(${segments
        .map((s) => `${s.color} ${s.from.toFixed(2)}% ${s.to.toFixed(2)}%`)
        .join(", ")})`
    : "conic-gradient(#e2e8f0 0 100%)";

  return (
    <Card className="p-4 border shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3 items-center">
        <div className="mx-auto relative w-36 h-36">
          <div className="w-36 h-36 rounded-full border border-slate-200" style={{ background: gradient }} />
          <div className="absolute inset-5 rounded-full bg-white border border-slate-200 flex items-center justify-center">
            <div className="text-center">
              <div className="text-xs text-slate-500">{totalLabel}</div>
              <div className="text-xl font-bold text-slate-900">{total}</div>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {segments.map((s) => {
            const to = toByKey[s.key] || "";
            const row = (
              <div className={`flex items-center justify-between text-xs rounded-lg border border-slate-200 px-2 py-1.5 ${to ? "hover:bg-slate-50" : ""}`}>
                <span className="inline-flex items-center gap-2 text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {labels[s.key] || s.key}
                </span>
                <span className="font-semibold text-slate-900">
                  {s.value} <span className="text-slate-500 font-normal">({Math.round(s.pct)}%)</span>
                </span>
              </div>
            );
            if (!to) return <div key={s.key}>{row}</div>;
            return (
              <Link key={s.key} to={to} className="block">
                {row}
              </Link>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function BarCard({ title, rows = [], labels = {}, toByKey = {} }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.value || 0)));
  return (
    <Card className="p-4 border shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2 text-sm">
        {rows.map((r) => {
          const val = Number(r.value || 0);
          const w = Math.max(3, Math.round((val / max) * 100));
          const to = toByKey[r.key] || "";
          const row = (
            <div className={`rounded-lg border border-slate-200 bg-white p-2 ${to ? "hover:bg-slate-50" : ""}`}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-700">{labels[r.key] || r.key}</span>
                <span className="font-semibold text-slate-900">{val}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{ width: `${w}%` }} />
              </div>
            </div>
          );
          if (!to) return <div key={r.key}>{row}</div>;
          return (
            <Link key={r.key} to={to} className="block">
              {row}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

export default function PortfolioHealthDashboardPage() {
  const { setTitle } = usePageTitle();
  const { activeRole, activeAccountId, isRootOperator } = useAccount();
  const { activeTenantId } = useTenant();
  const { t } = useI18n();

  const role = useMemo(() => String(activeRole || "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => isManageRole(role, { isRootOperator }), [isRootOperator, role]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [attentionItems, setAttentionItems] = useState([]);
  const [leaseAttentionItems, setLeaseAttentionItems] = useState([]);
  const [leaseSummary, setLeaseSummary] = useState(null);
  const [propertyHealthRows, setPropertyHealthRows] = useState([]);
  const [reporting, setReporting] = useState(null);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportSending, setReportSending] = useState(false);

  useEffect(() => {
    setTitle(t("portfolio.pageTitle"));
  }, [setTitle, t]);

  useEffect(() => {
    if (!activeAccountId || !canManage) return;

    let dead = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [snapshotRow, attention, leaseAttention, leaseSummaryRow, healthRows] = await Promise.all([
          getPortfolioHealthSnapshot(activeAccountId, activeTenantId || null),
          getPortfolioAttentionItems(activeAccountId, activeTenantId || null, 10),
          getLeaseAttentionItems(activeAccountId, 6),
          getLeaseSummary(activeAccountId),
          listPropertyOperationalHealthScores(activeAccountId, { limit: 200 }),
        ]);
        if (dead) return;

        setSnapshot(snapshotRow);
        setAttentionItems(Array.isArray(attention) ? attention : []);
        setLeaseAttentionItems(Array.isArray(leaseAttention) ? leaseAttention : []);
        setLeaseSummary(leaseSummaryRow || null);
        setPropertyHealthRows(Array.isArray(healthRows) ? healthRows : []);
      } catch (e) {
        if (!dead) setError(e?.message || t("portfolio.error"));
      } finally {
        if (!dead) setLoading(false);
      }
    }

    load();
    return () => {
      dead = true;
    };
  }, [activeAccountId, activeTenantId, canManage, t]);

  useRealtimeTables({
    enabled: !!activeAccountId && canManage,
    subscriptions: [
      { channel: `portfolio-properties:${activeAccountId}`, table: "properties", filter: `account_id=eq.${activeAccountId}` },
      { channel: `portfolio-tenants:${activeAccountId}`, table: "tenants", filter: `account_id=eq.${activeAccountId}` },
      { channel: `portfolio-payments:${activeAccountId}`, table: "payments", filter: `account_id=eq.${activeAccountId}` },
      { channel: `portfolio-leases:${activeAccountId}`, table: "leases", filter: `account_id=eq.${activeAccountId}` },
      { channel: `portfolio-requests:${activeAccountId}`, table: "maintenance_requests", filter: `account_id=eq.${activeAccountId}` },
      { channel: `portfolio-work-orders:${activeAccountId}`, table: "work_orders", filter: `account_id=eq.${activeAccountId}` },
      { channel: `portfolio-reporting:${activeAccountId}`, table: "account_report_settings", filter: `account_id=eq.${activeAccountId}` },
    ],
    onChange: async () => {
      if (!activeAccountId || !canManage) return;
      try {
        const [snapshotRow, attention, leaseAttention, leaseSummaryRow, reportingRow, healthRows] = await Promise.all([
          getPortfolioHealthSnapshot(activeAccountId, activeTenantId || null, { forceRefresh: true }),
          getPortfolioAttentionItems(activeAccountId, activeTenantId || null, 10),
          getLeaseAttentionItems(activeAccountId, 6),
          getLeaseSummary(activeAccountId),
          getAccountReportSettings(activeAccountId),
          listPropertyOperationalHealthScores(activeAccountId, { limit: 200 }),
        ]);
        setSnapshot(snapshotRow || null);
        setAttentionItems(Array.isArray(attention) ? attention : []);
        setLeaseAttentionItems(Array.isArray(leaseAttention) ? leaseAttention : []);
        setLeaseSummary(leaseSummaryRow || null);
        setPropertyHealthRows(Array.isArray(healthRows) ? healthRows : []);
        setReporting(reportingRow || null);
      } catch {
        setSnapshot(null);
        setAttentionItems([]);
        setLeaseAttentionItems([]);
        setLeaseSummary(null);
        setPropertyHealthRows([]);
      }
    },
  });

  useEffect(() => {
    if (!activeAccountId || !canManage) return;
    let dead = false;
    async function loadSettings() {
      try {
        const row = await getAccountReportSettings(activeAccountId);
        if (!dead) setReporting(row);
      } catch {
        if (!dead) setReporting(null);
      }
    }
    loadSettings();
    return () => {
      dead = true;
    };
  }, [activeAccountId, canManage]);

  async function saveReporting(nextPatch = {}) {
    if (!activeAccountId) return;
    const base = reporting || {
      weekly_summary_enabled: false,
      weekly_summary_day: 1,
      weekly_summary_hour: 8,
      timezone: "Europe/Warsaw",
    };
    const payload = {
      accountId: activeAccountId,
      weeklySummaryEnabled:
        nextPatch.weekly_summary_enabled ?? base.weekly_summary_enabled,
      weeklySummaryDay:
        nextPatch.weekly_summary_day ?? base.weekly_summary_day,
      weeklySummaryHour:
        nextPatch.weekly_summary_hour ?? base.weekly_summary_hour,
      timezone: nextPatch.timezone ?? base.timezone,
    };
    setReportSaving(true);
    try {
      const row = await upsertAccountReportSettings(payload);
      setReporting(row);
    } catch (e) {
      alert(e?.message || t("portfolio.reporting.saveError"));
    } finally {
      setReportSaving(false);
    }
  }

  async function handleSendSummaryNow() {
    if (!activeAccountId) return;
    setReportSending(true);
    try {
      const res = await sendWeeklySummaryNow(activeAccountId);
      alert(t("portfolio.reporting.sent", { count: res?.sent ?? 0 }));
    } catch (e) {
      alert(e?.message || t("portfolio.reporting.sendError"));
    } finally {
      setReportSending(false);
    }
  }

  const snapshotView = useMemo(
    () =>
      snapshot ?? {
        property_count: 0,
        occupied_count: 0,
        vacant_count: 0,
        occupancy_rate: 0,
        paid_amount: 0,
        due_amount: 0,
        overdue_amount: 0,
        due_soon_amount: 0,
        outstanding_amount: 0,
        overdue_0_7_amount: 0,
        overdue_8_30_amount: 0,
        overdue_30_plus_amount: 0,
        open_requests: 0,
        high_priority_open_requests: 0,
        waiting_over_48h: 0,
        active_work_orders: 0,
        work_orders_without_contractor: 0,
        contractor_ack_overdue: 0,
        stalled_repairs: 0,
        long_running_repairs: 0,
        repeat_repair_properties: 0,
        recent_open_created: 0,
        prev_open_created: 0,
        outstanding_current_month: 0,
        outstanding_previous_month: 0,
      },
    [snapshot],
  );

  const occupancyRows = useMemo(
    () => [
      { key: "occupied", value: Number(snapshotView.occupied_count || 0) },
      { key: "vacant", value: Number(snapshotView.vacant_count || 0) },
    ],
    [snapshotView]
  );

  const maintenanceRows = useMemo(
    () => [
      { key: "open", value: Number(snapshotView.open_requests || 0) },
      { key: "high", value: Number(snapshotView.high_priority_open_requests || 0) },
      { key: "waiting48h", value: Number(snapshotView.waiting_over_48h || 0) },
      { key: "woNoContractor", value: Number(snapshotView.work_orders_without_contractor || 0) },
      { key: "ackOverdue", value: Number(snapshotView.contractor_ack_overdue || 0) },
      { key: "stalledRepairs", value: Number(snapshotView.stalled_repairs || 0) },
      { key: "longRunning", value: Number(snapshotView.long_running_repairs || 0) },
      { key: "repeatRepairs", value: Number(snapshotView.repeat_repair_properties || 0) },
    ],
    [snapshotView]
  );

  const arrearsAgingRows = useMemo(
    () => [
      { key: "overdue_0_7", value: Math.round(Number(snapshotView.overdue_0_7_amount || 0)) },
      { key: "overdue_8_30", value: Math.round(Number(snapshotView.overdue_8_30_amount || 0)) },
      { key: "overdue_30_plus", value: Math.round(Number(snapshotView.overdue_30_plus_amount || 0)) },
    ],
    [snapshotView]
  );

  const financeRows = useMemo(
    () => [
      { key: "paid", value: Math.round(Number(snapshotView.paid_amount || 0)) },
      { key: "due", value: Math.round(Number(snapshotView.due_amount || 0)) },
      { key: "overdue", value: Math.round(Number(snapshotView.overdue_amount || 0)) },
    ],
    [snapshotView]
  );

  const attentionView = useMemo(
    () => mapPortfolioAttentionItems([...(attentionItems || []), ...(leaseAttentionItems || [])], t),
    [attentionItems, leaseAttentionItems, t]
  );

  const leaseExpiringLink = useMemo(() => {
    const matches = (leaseAttentionItems || []).filter(
      (item) => String(item?.item_type || "").toLowerCase() === "lease_expiring_soon",
    );
    if (matches.length > 1) return "/tenants?lease=expiring";
    return matches[0]?.link_path || "/tenants";
  }, [leaseAttentionItems]);

  const leaseExpiredLink = useMemo(() => {
    const matches = (leaseAttentionItems || []).filter(
      (item) => String(item?.item_type || "").toLowerCase() === "lease_expired",
    );
    if (matches.length > 1) return "/tenants?lease=expired";
    return matches[0]?.link_path || "/tenants";
  }, [leaseAttentionItems]);

  const openTrend = useMemo(
    () => Number(snapshotView.recent_open_created || 0) - Number(snapshotView.prev_open_created || 0),
    [snapshotView]
  );

  const outstandingDeltaPct = useMemo(() => {
    return pctDelta(snapshotView.outstanding_current_month, snapshotView.outstanding_previous_month);
  }, [snapshotView]);

  const leaseSummaryView = leaseSummary ?? {
    total: 0,
    expiringSoonCount: 0,
    expiredCount: 0,
    renewalInProgressCount: 0,
  };

  const propertyHealthSummary = useMemo(
    () => summarizePropertyOperationalHealth(propertyHealthRows),
    [propertyHealthRows],
  );

  const propertyHealthDistributionRows = useMemo(
    () => [
      { key: "healthy", value: propertyHealthSummary.healthyCount },
      { key: "attention_needed", value: propertyHealthSummary.attentionCount },
      { key: "high_risk", value: propertyHealthSummary.highRiskCount },
    ],
    [propertyHealthSummary],
  );

  const lowestHealthRows = useMemo(
    () =>
      (propertyHealthSummary.lowestProperties || []).map((row) => ({
        key: row.propertyId,
        value: Number(row.score || 0),
      })),
    [propertyHealthSummary],
  );

  const lowestHealthLabels = useMemo(
    () =>
      Object.fromEntries(
        (propertyHealthSummary.lowestProperties || []).map((row) => [
          row.propertyId,
          `${row.propertyLabel || "—"} (${t(`propertyHealth.status.${row.category}`)})`,
        ]),
      ),
    [propertyHealthSummary, t],
  );

  const lowestHealthLinks = useMemo(
    () =>
      Object.fromEntries(
        (propertyHealthSummary.lowestProperties || []).map((row) => [row.propertyId, `/properties/${row.propertyId}`]),
      ),
    [propertyHealthSummary],
  );

  if (!canManage) {
    return (
      <div className="space-y-6">
        <DashboardBreadcrumbs items={[{ label: t("portfolio.pageTitle") }]} />
        <Card className="p-6">
          <p className="text-sm text-slate-600">{t("portfolio.accessDenied")}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardBreadcrumbs items={[{ label: t("portfolio.pageTitle") }]} />
      <Card className="p-6 border bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-800 text-white shadow-lg">
        <h2 className="text-lg font-semibold">{t("portfolio.title")}</h2>
        <p className="text-sm text-slate-200 mt-1">{t("portfolio.subtitle")}</p>
        {activeTenantId ? (
          <p className="text-xs text-cyan-100 mt-2">{t("portfolio.scopeFiltered")}</p>
        ) : null}
      </Card>

      <OnboardingHintCard
        title={t("pageHints.portfolioHealth.title")}
        body={t("pageHints.portfolioHealth.body")}
      />

      {error ? (
        <Card className="p-4 border border-rose-200 bg-rose-50 text-rose-700 text-sm">{error}</Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard title={t("portfolio.kpi.properties")} value={Number(snapshotView.property_count || 0)} to="/properties" tone="blue" />
        <StatCard title={t("portfolio.kpi.occupancyRate")} value={`${Number(snapshotView.occupancy_rate || 0)}%`} hint={`${Number(snapshotView.occupied_count || 0)}/${Number(snapshotView.property_count || 0)}`} to="/properties?status=occupied" tone="emerald" />
        <StatCard title={t("portfolio.kpi.collected")} value={formatCurrencyAmount(snapshotView.paid_amount)} to="/finance" tone="violet" />
        <StatCard
          title={t("portfolio.kpi.outstanding")}
          value={formatCurrencyAmount(snapshotView.outstanding_amount)}
          hint={outstandingDeltaPct == null ? "" : t("portfolio.kpi.trendVsPrevMonth", { value: outstandingDeltaPct })}
          to="/finance?status=overdue,due"
          tone="rose"
        />
        <StatCard
          title={t("portfolio.kpi.openMaintenance")}
          value={Number(snapshotView.open_requests || 0)}
          hint={t("portfolio.kpi.trendVsPrev7d", { value: openTrend })}
          to="/maintenance-inbox?status=open,in_progress,waiting,resolved"
          tone="amber"
        />
        <StatCard title={t("portfolio.kpi.dueSoon")} value={formatCurrencyAmount(snapshotView.due_soon_amount)} to="/finance?status=due&range=7d" tone="amber" />
        <StatCard title={t("portfolio.kpi.leasesExpiring")} value={Number(leaseSummaryView.expiringSoonCount || 0)} to={leaseExpiringLink} tone="amber" />
        <StatCard title={t("portfolio.kpi.activeWorkOrders")} value={Number(snapshotView.active_work_orders || 0)} to="/maintenance-inbox?status=in_progress" tone="blue" />
        <StatCard title={t("portfolio.kpi.leasesExpired")} value={Number(leaseSummaryView.expiredCount || 0)} to={leaseExpiredLink} tone="rose" />
        <StatCard title={t("portfolio.kpi.waitingOver48h")} value={Number(snapshotView.waiting_over_48h || 0)} to="/maintenance-inbox?status=waiting&aging=48h" tone="amber" />
        <StatCard title={t("portfolio.kpi.withoutContractor")} value={Number(snapshotView.work_orders_without_contractor || 0)} to="/maintenance-kpi?filter=no-contractor" tone="rose" />
        <StatCard title={t("portfolio.kpi.ackOverdue")} value={Number(snapshotView.contractor_ack_overdue || 0)} to="/attention-center" tone="rose" />
        <StatCard title={t("portfolio.kpi.stalledRepairs")} value={Number(snapshotView.stalled_repairs || 0)} to="/attention-center" tone="rose" />
        <StatCard title={t("portfolio.kpi.longRunningRepairs")} value={Number(snapshotView.long_running_repairs || 0)} to="/attention-center" tone="amber" />
        <StatCard title={t("portfolio.kpi.repeatRepairProperties")} value={Number(snapshotView.repeat_repair_properties || 0)} to="/attention-center" tone="violet" />
        <StatCard title={t("portfolio.kpi.avgHealthScore")} value={propertyHealthSummary.averageScore} to="/properties" tone="emerald" />
        <StatCard title={t("portfolio.kpi.highRiskProperties")} value={propertyHealthSummary.highRiskCount} to="/properties" tone="rose" />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <DonutCard
            title={t("portfolio.charts.occupancy")}
            totalLabel={t("portfolio.total")}
            rows={occupancyRows}
            labels={{ occupied: t("portfolio.labels.occupied"), vacant: t("portfolio.labels.vacant") }}
            toByKey={{ occupied: "/properties?status=occupied", vacant: "/properties?status=vacant" }}
          />

          <BarCard
            title={t("portfolio.charts.finance")}
            rows={financeRows}
            labels={{ paid: t("portfolio.labels.paid"), due: t("portfolio.labels.due"), overdue: t("portfolio.labels.overdue") }}
            toByKey={{ paid: "/finance?status=paid", due: "/finance?status=due", overdue: "/finance?status=overdue" }}
          />

          <BarCard
            title={t("portfolio.charts.arrearsAging")}
            rows={arrearsAgingRows}
            labels={{
              overdue_0_7: t("portfolio.labels.overdue0_7"),
              overdue_8_30: t("portfolio.labels.overdue8_30"),
              overdue_30_plus: t("portfolio.labels.overdue30_plus"),
            }}
            toByKey={{
              overdue_0_7: "/finance?status=overdue&bucket=0_7",
              overdue_8_30: "/finance?status=overdue&bucket=8_30",
              overdue_30_plus: "/finance?status=overdue&bucket=30_plus",
            }}
          />

          <BarCard
            title={t("portfolio.charts.maintenance")}
            rows={maintenanceRows}
            labels={{
              open: t("portfolio.labels.openRequests"),
              high: t("portfolio.labels.highPriority"),
              waiting48h: t("portfolio.labels.waiting48h"),
              woNoContractor: t("portfolio.labels.woNoContractor"),
              ackOverdue: t("portfolio.labels.ackOverdue"),
              stalledRepairs: t("portfolio.labels.stalledRepairs"),
              longRunning: t("portfolio.labels.longRunningRepairs"),
              repeatRepairs: t("portfolio.labels.repeatRepairProperties"),
            }}
            toByKey={{
              open: "/maintenance-inbox?status=open,in_progress,waiting,resolved",
              high: "/maintenance-inbox?priority=high,critical",
              waiting48h: "/maintenance-inbox?status=waiting&aging=48h",
              woNoContractor: "/maintenance-kpi?filter=no-contractor",
              ackOverdue: "/attention-center",
              stalledRepairs: "/attention-center",
              longRunning: "/attention-center",
              repeatRepairs: "/attention-center",
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DonutCard
          title={t("portfolio.charts.healthDistribution")}
          totalLabel={t("portfolio.total")}
          rows={propertyHealthDistributionRows}
          labels={{
            healthy: t("propertyHealth.status.healthy"),
            attention_needed: t("propertyHealth.status.attention_needed"),
            high_risk: t("propertyHealth.status.high_risk"),
          }}
          toByKey={{
            healthy: "/properties",
            attention_needed: "/properties",
            high_risk: "/properties",
          }}
        />

        <BarCard
          title={t("portfolio.charts.lowestHealth")}
          rows={lowestHealthRows}
          labels={lowestHealthLabels}
          toByKey={lowestHealthLinks}
        />
      </div>

      <Card className="p-4 border shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{t("portfolio.reporting.title")}</h3>
            <p className="text-xs text-slate-500 mt-1">{t("portfolio.reporting.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={handleSendSummaryNow}
            disabled={reportSending}
            className={`px-3 py-2 text-sm rounded-lg text-white ${
              reportSending ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"
            }`}
          >
            {reportSending ? t("common.sending") : t("portfolio.reporting.sendNow")}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="rounded-lg border border-slate-200 p-3 bg-white text-sm">
            <span className="text-xs text-slate-500">{t("portfolio.reporting.enabled")}</span>
            <div className="mt-2">
              <input
                type="checkbox"
                checked={Boolean(reporting?.weekly_summary_enabled)}
                onChange={(e) => saveReporting({ weekly_summary_enabled: e.target.checked })}
                disabled={reportSaving}
              />
            </div>
          </label>
          <label className="rounded-lg border border-slate-200 p-3 bg-white text-sm">
            <span className="text-xs text-slate-500">{t("portfolio.reporting.day")}</span>
            <select
              className="mt-2 w-full border rounded-lg px-2 py-1.5 text-sm"
              value={Number(reporting?.weekly_summary_day ?? 1)}
              onChange={(e) => saveReporting({ weekly_summary_day: Number(e.target.value) })}
              disabled={reportSaving}
            >
              <option value={1}>{t("portfolio.reporting.days.mon")}</option>
              <option value={2}>{t("portfolio.reporting.days.tue")}</option>
              <option value={3}>{t("portfolio.reporting.days.wed")}</option>
              <option value={4}>{t("portfolio.reporting.days.thu")}</option>
              <option value={5}>{t("portfolio.reporting.days.fri")}</option>
              <option value={6}>{t("portfolio.reporting.days.sat")}</option>
              <option value={0}>{t("portfolio.reporting.days.sun")}</option>
            </select>
          </label>
          <label className="rounded-lg border border-slate-200 p-3 bg-white text-sm">
            <span className="text-xs text-slate-500">{t("portfolio.reporting.hour")}</span>
            <select
              className="mt-2 w-full border rounded-lg px-2 py-1.5 text-sm"
              value={Number(reporting?.weekly_summary_hour ?? 8)}
              onChange={(e) => saveReporting({ weekly_summary_hour: Number(e.target.value) })}
              disabled={reportSaving}
            >
              {Array.from({ length: 24 }).map((_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
          <label className="rounded-lg border border-slate-200 p-3 bg-white text-sm">
            <span className="text-xs text-slate-500">{t("portfolio.reporting.timezone")}</span>
            <input
              value={String(reporting?.timezone || "Europe/Warsaw")}
              onChange={(e) => setReporting((prev) => ({ ...(prev || {}), timezone: e.target.value }))}
              onBlur={(e) => saveReporting({ timezone: e.target.value })}
              className="mt-2 w-full border rounded-lg px-2 py-1.5 text-sm"
              disabled={reportSaving}
            />
          </label>
        </div>

        <p className="text-xs text-slate-500 mt-3">{t("portfolio.reporting.note")}</p>
      </Card>

      <Card className="p-4 border shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">{t("portfolio.attention.title")}</h3>
        {attentionView.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">{t("portfolio.attention.empty")}</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {attentionView.map((item) => (
              <Link key={item.key} to={item.to} className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
                <p className="text-sm font-medium text-slate-900">{item.title}</p>
                <p className="text-xs text-slate-500 mt-1">{item.subtitle}</p>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
