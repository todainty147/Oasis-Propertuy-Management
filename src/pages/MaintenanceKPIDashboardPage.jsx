// src/pages/MaintenanceKPIDashboardPage.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { ChevronDown } from "lucide-react";
import { useAccount } from "../context/AccountContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { useI18n } from "../context/I18nContext";
import {
  getMaintenanceAttention,
  getMaintenanceFinancialAnalytics,
  getMaintenanceKpiSnapshot,
  getMaintenanceRecentActivity,
  getMaintenanceSlaAnalytics,
  mapMaintenanceAttentionItems,
  upsertMaintenanceBudget,
} from "../services/maintenanceDashboardService";
import { getPreventiveMaintenanceOverview } from "../services/preventiveMaintenanceService";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { formatCurrencyAmount } from "../utils/currency";
import { isManageRole } from "../utils/permissions";
import OnboardingHintCard from "../components/OnboardingHintCard";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";

/* ======================
   HELPERS
   ====================== */

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function slaToneByHours(hours, t) {
  const h = Number.isFinite(Number(hours)) ? Number(hours) : -1;
  if (h > 48) return { label: t("maintenance.sla.red"),    className: "bg-rose-50 border-rose-200 text-rose-700" };
  if (h > 24) return { label: t("maintenance.sla.yellow"), className: "bg-amber-50 border-amber-200 text-amber-700" };
  return          { label: t("maintenance.sla.green"),   className: "bg-emerald-50 border-emerald-200 text-emerald-700" };
}

function hoursToDays(hours) {
  const value = Number(hours || 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value / 24)) : 0;
}

function barTone(key) {
  const k = String(key || "").toLowerCase();
  if (k === "open" || k === "assigned")      return "bg-gradient-to-r from-slate-500 to-slate-400";
  if (k === "in_progress")                   return "bg-gradient-to-r from-blue-500 to-cyan-500";
  if (k === "waiting")                       return "bg-gradient-to-r from-amber-500 to-orange-500";
  if (k === "resolved" || k === "completed") return "bg-gradient-to-r from-emerald-500 to-lime-500";
  if (k === "closed" || k === "cancelled")   return "bg-gradient-to-r from-violet-500 to-indigo-500";
  return "bg-gradient-to-r from-blue-500 to-cyan-500";
}

/* ======================
   REUSABLE CHART COMPONENTS
   ====================== */

function AnimatedNumber({ value = 0, durationMs = 550 }) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const [display, setDisplay] = useState(target);
  useEffect(() => {
    const from = display;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const tPct = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - tPct, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (tPct < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return <>{display}</>;
}

function KPIStatCard({ label, value, hint = "", to = "", tone = "blue", size = "normal" }) {
  const themes = {
    blue:    "from-blue-600/10 to-cyan-500/10 border-blue-200",
    amber:   "from-amber-500/10 to-orange-500/10 border-amber-200",
    emerald: "from-emerald-500/10 to-lime-500/10 border-emerald-200",
    rose:    "from-rose-500/10 to-red-500/10 border-rose-200",
    violet:  "from-violet-500/10 to-indigo-500/10 border-violet-200",
  };
  const content = (
    <Card className={`border bg-gradient-to-br ${themes[tone] || themes.blue} shadow-sm hover:shadow-md transition-shadow h-full ${size === "large" ? "p-5" : "p-4"}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`font-bold text-slate-900 mt-1 ${size === "large" ? "text-3xl" : "text-2xl"}`}>
        <AnimatedNumber value={value} />
      </div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </Card>
  );
  if (!to) return content;
  return <Link to={to} className="block h-full">{content}</Link>;
}

function StatusBarChart({ title, rows = [], labels = {}, toByKey = {} }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const sum = rows.reduce((a, b) => a + b.value, 0);
  return (
    <Card className="p-4 border shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2 text-sm">
        {rows.map((r) => {
          const pct = sum > 0 ? Math.round((r.value / sum) * 100) : 0;
          const widthPct = Math.max(3, Math.round((r.value / max) * 100));
          const to = toByKey?.[r.key] || "";
          const row = (
            <div className={`rounded-lg border border-slate-200 bg-white p-2 ${to ? "hover:bg-slate-50" : ""}`}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-700">{labels[r.key] || r.key}</span>
                <span className="font-semibold text-slate-900">{r.value} <span className="text-slate-500 font-normal">({pct}%)</span></span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${barTone(r.key)}`} style={{ width: `${widthPct}%` }} />
              </div>
            </div>
          );
          if (!to) return <div key={r.key}>{row}</div>;
          return <Link key={r.key} to={to} className="block">{row}</Link>;
        })}
      </div>
    </Card>
  );
}

function DonutChart({ title, rows = [], labels = {}, totalLabel = "Total", toByKey = {} }) {
  const total = rows.reduce((a, b) => a + b.value, 0);
  const palette = ["#0ea5e9", "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#64748b"];
  let start = 0;
  const segments = rows.map((r, idx) => {
    const pct = total > 0 ? (r.value / total) * 100 : 0;
    const seg = { key: r.key, value: r.value, pct, color: palette[idx % palette.length], from: start, to: start + pct };
    start += pct;
    return seg;
  });
  const gradient = segments.length
    ? `conic-gradient(${segments.map((s) => `${s.color} ${s.from.toFixed(2)}% ${s.to.toFixed(2)}%`).join(", ")})`
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
            const to = toByKey?.[s.key] || "";
            const row = (
              <div className={`flex items-center justify-between text-xs rounded-lg border border-slate-200 px-2 py-1.5 ${to ? "hover:bg-slate-50" : ""}`}>
                <span className="inline-flex items-center gap-2 text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {labels[s.key] || s.key}
                </span>
                <span className="font-semibold text-slate-900">{s.value} <span className="text-slate-500 font-normal">({Math.round(s.pct)}%)</span></span>
              </div>
            );
            if (!to) return <div key={s.key}>{row}</div>;
            return <Link key={s.key} to={to} className="block">{row}</Link>;
          })}
        </div>
      </div>
    </Card>
  );
}

function AgingBars({ title, subtitle = "", rows = [], toByKey = {} }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="p-4 border shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      <div className="mt-3 space-y-2 text-sm">
        {rows.map((r) => {
          const widthPct = Math.max(3, Math.round((r.value / max) * 100));
          const to = toByKey?.[r.key] || "";
          const row = (
            <div className={`rounded-lg border border-slate-200 bg-white p-2 ${to ? "hover:bg-slate-50" : ""}`}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-700">{r.label}</span>
                <span className="font-semibold text-slate-900">{r.value}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${r.barClass}`} style={{ width: `${widthPct}%` }} />
              </div>
            </div>
          );
          if (!to) return <div key={r.key}>{row}</div>;
          return <Link key={r.key} to={to} className="block">{row}</Link>;
        })}
      </div>
    </Card>
  );
}

function SpendBars({ title, rows = [], emptyText = "", valueFormatter = (v) => v, linkBuilder }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.amount || 0)));
  return (
    <Card className="p-4 border shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 mt-3">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((row) => {
            const to = typeof linkBuilder === "function" ? linkBuilder(row) : "";
            const widthPct = Math.max(3, Math.round((Number(row.amount || 0) / max) * 100));
            const content = (
              <div className={`rounded-lg border border-slate-200 bg-white p-2 ${to ? "hover:bg-slate-50" : ""}`}>
                <div className="flex items-center justify-between text-xs mb-1 gap-3">
                  <span className="text-slate-700 truncate">{row.label || "—"}</span>
                  <span className="font-semibold text-slate-900 whitespace-nowrap">{valueFormatter(row.amount || 0)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${widthPct}%` }} />
                </div>
              </div>
            );
            if (!to) return <div key={row.label}>{content}</div>;
            return <Link key={row.label} to={to} className="block">{content}</Link>;
          })}
        </div>
      )}
    </Card>
  );
}

/* ======================
   SECTION NAV
   ====================== */

function SectionNav({ sections, t }) {
  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <div className="sticky top-0 z-10 -mx-1 overflow-x-auto rounded-xl border border-slate-200 bg-white/90 backdrop-blur-sm px-4 py-2 flex gap-1">
      {sections.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => scrollTo(id)}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ======================
   PAGE
   ====================== */

export default function MaintenanceKPIDashboardPage() {
  const { setTitle } = usePageTitle();
  const { activeAccountId, activeRole, isRootOperator } = useAccount();
  const { t } = useI18n();

  const role = useMemo(() => String(activeRole || "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => isManageRole(role, { isRootOperator }), [isRootOperator, role]);

  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState("");
  const [feed, setFeed]                     = useState([]);
  const [snapshot, setSnapshot]             = useState(null);
  const [attentionRows, setAttentionRows]   = useState([]);
  const [financialAnalytics, setFinancialAnalytics] = useState(null);
  const [preventiveOverview, setPreventiveOverview] = useState(null);
  const [slaAnalytics, setSlaAnalytics]     = useState(null);
  const [budgetAmount, setBudgetAmount]     = useState("");
  const [budgetSaving, setBudgetSaving]     = useState(false);
  const [budgetError, setBudgetError]       = useState("");
  const [budgetFormOpen, setBudgetFormOpen] = useState(false);

  useEffect(() => { setTitle(t("maintenance.kpi.pageTitle")); }, [setTitle, t]);

  async function loadAll() {
    if (!activeAccountId) return;
    setLoading(true);
    setError("");
    try {
      const [stats, attention, recentActivity, spendAnalytics, preventive, sla] = await Promise.all([
        getMaintenanceKpiSnapshot(activeAccountId),
        getMaintenanceAttention(activeAccountId),
        getMaintenanceRecentActivity(activeAccountId, t, 10),
        getMaintenanceFinancialAnalytics(activeAccountId),
        getPreventiveMaintenanceOverview(activeAccountId),
        getMaintenanceSlaAnalytics(activeAccountId),
      ]);
      setSnapshot(stats || null);
      setAttentionRows(attention || []);
      setFeed(recentActivity || []);
      setFinancialAnalytics(spendAnalytics || null);
      setPreventiveOverview(preventive || null);
      setSlaAnalytics(sla || null);
    } catch (e) {
      setError(e?.message || t("maintenance.kpi.error"));
      setFeed([]); setSnapshot(null); setAttentionRows([]);
      setFinancialAnalytics(null); setPreventiveOverview(null); setSlaAnalytics(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!activeAccountId) return; loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeAccountId, t]);

  useRealtimeTables({
    enabled: !!activeAccountId && canManage,
    subscriptions: [
      { channel: `maintenance-kpi-requests:${activeAccountId}`, table: "maintenance_requests", filter: `account_id=eq.${activeAccountId}` },
      { channel: `maintenance-kpi-work-orders:${activeAccountId}`, table: "work_orders", filter: `account_id=eq.${activeAccountId}` },
      { channel: `maintenance-kpi-financials:${activeAccountId}`, table: "work_order_financials" },
      { channel: `maintenance-kpi-expenses:${activeAccountId}`, table: "maintenance_expenses", filter: `account_id=eq.${activeAccountId}` },
      { channel: `maintenance-kpi-budgets:${activeAccountId}`, table: "maintenance_budgets", filter: `account_id=eq.${activeAccountId}` },
      { channel: `maintenance-kpi-preventive:${activeAccountId}`, table: "preventive_maintenance_tasks", filter: `account_id=eq.${activeAccountId}` },
      { channel: `maintenance-kpi-activity:${activeAccountId}`, table: "activity_log", filter: `account_id=eq.${activeAccountId}` },
      { channel: `maintenance-kpi-audit:${activeAccountId}`, table: "work_order_audit_log" },
    ],
    onChange: loadAll,
  });

  // Default views
  const snapshotView = snapshot ?? { open_requests: 0, active_work_orders: 0, awaiting_action: 0, resolved_pending_closure: 0, open_high_priority: 0, triage_over_24h: 0, contractor_ack_overdue: 0, stalled_repairs: 0, long_running_repairs: 0, repeat_repair_properties: 0, req_by_status: { open: 0, in_progress: 0, waiting: 0, resolved: 0, closed: 0 }, wo_by_status: { assigned: 0, in_progress: 0, completed: 0, cancelled: 0 }, aging: { b0_24: 0, b24_48: 0, b48_72: 0, b72_plus: 0 } };
  const spendView = financialAnalytics ?? { totalSpend: 0, totalQuoted: 0, avgCostPerWorkOrder: 0, topProperties: [], topContractors: [], expensiveRepairs: [], monthlySpend: [], categorySpend: [], currentMonthActual: 0, currentMonthBudget: 0, currentMonthVariance: 0 };
  const preventiveView = preventiveOverview ?? { activeCount: 0, overdueCount: 0, dueSoonCount: 0, items: [], propertiesWithDueTasks: [] };
  const slaView = slaAnalytics ?? { stalledRepairs: [], longRunningRepairs: [], repeatRepairProperties: [] };

  const kpi = useMemo(() => ({
    openRequests:          Number(snapshotView.open_requests || 0),
    activeWorkOrders:      Number(snapshotView.active_work_orders || 0),
    awaitingAction:        Number(snapshotView.awaiting_action || 0),
    resolvedPendingClosure: Number(snapshotView.resolved_pending_closure || 0),
    openHighPriority:      Number(snapshotView.open_high_priority || 0),
    triageOver24h:         Number(snapshotView.triage_over_24h || 0),
    contractorAckOverdue:  Number(snapshotView.contractor_ack_overdue || 0),
    stalledRepairs:        Number(snapshotView.stalled_repairs || 0),
    longRunningRepairs:    Number(snapshotView.long_running_repairs || 0),
    repeatRepairProperties: Number(snapshotView.repeat_repair_properties || 0),
    reqByStatus: snapshotView.req_by_status || { open: 0, in_progress: 0, waiting: 0, resolved: 0, closed: 0 },
    woByStatus:  snapshotView.wo_by_status  || { assigned: 0, in_progress: 0, completed: 0, cancelled: 0 },
  }), [snapshotView]);

  const attentionItems = useMemo(() => mapMaintenanceAttentionItems(attentionRows, t, 12), [attentionRows, t]);

  const agingRows = useMemo(() => {
    const counts = snapshotView.aging || { b0_24: 0, b24_48: 0, b48_72: 0, b72_plus: 0 };
    return [
      { key: "b0_24",    label: t("maintenance.kpi.aging.0_24"),  value: Number(counts.b0_24    || 0), barClass: "bg-emerald-500" },
      { key: "b24_48",   label: t("maintenance.kpi.aging.24_48"), value: Number(counts.b24_48   || 0), barClass: "bg-amber-500" },
      { key: "b48_72",   label: t("maintenance.kpi.aging.48_72"), value: Number(counts.b48_72   || 0), barClass: "bg-orange-500" },
      { key: "b72_plus", label: t("maintenance.kpi.aging.72_plus"),value: Number(counts.b72_plus || 0), barClass: "bg-rose-600" },
    ];
  }, [snapshotView, t]);

  const spendTrendMax = useMemo(() => Math.max(1, ...(spendView.monthlySpend || []).map((row) => Number(row.amount || 0))), [spendView]);

  const budgetMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }, []);

  useEffect(() => {
    if (budgetSaving) return;
    const nextValue = Number(spendView.currentMonthBudget || 0);
    setBudgetAmount(nextValue > 0 ? String(nextValue) : "");
  }, [spendView.currentMonthBudget, budgetSaving]);

  async function handleBudgetSave(event) {
    event.preventDefault();
    if (!activeAccountId) return;
    setBudgetSaving(true);
    setBudgetError("");
    try {
      await upsertMaintenanceBudget({ accountId: activeAccountId, budgetAmount, periodMonth: budgetMonth });
      await loadAll();
      setBudgetFormOpen(false);
    } catch (e) {
      setBudgetError(e?.message || t("maintenance.kpi.financial.budgetSaveError"));
    } finally {
      setBudgetSaving(false);
    }
  }

  // Budget progress
  const budgetPct = spendView.currentMonthBudget > 0
    ? Math.min(100, Math.round((spendView.currentMonthActual / spendView.currentMonthBudget) * 100))
    : 0;

  const SECTIONS = [
    { id: "kpi-overview",   label: t("maintenance.kpi.section.overview")   },
    { id: "kpi-charts",     label: t("maintenance.kpi.section.charts")     },
    { id: "kpi-preventive", label: t("maintenance.kpi.section.preventive") },
    { id: "kpi-financial",  label: t("maintenance.kpi.section.financial")  },
    { id: "kpi-sla",        label: t("maintenance.kpi.section.sla")        },
    { id: "kpi-activity",   label: t("maintenance.kpi.section.activity")   },
  ];

  if (!canManage) {
    return (
      <div className="space-y-4">
        <DashboardBreadcrumbs items={[{ label: t("maintenance.kpi.pageTitle") }]} />
        <Card className="p-6"><p className="text-sm text-slate-600">{t("maintenance.kpi.accessDenied")}</p></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardBreadcrumbs items={[{ label: t("maintenance.kpi.pageTitle") }]} />

      {/* HERO */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 flex items-center justify-between gap-3">
        <div className="absolute -top-10 -right-8 h-36 w-36 rounded-full bg-cyan-400/20 blur-2xl" />
        <div className="absolute -bottom-10 -left-8 h-36 w-36 rounded-full bg-blue-500/20 blur-2xl" />
        <div className="relative">
          <h2 className="text-lg font-semibold text-white">{t("maintenance.kpi.title")}</h2>
          <p className="text-sm text-slate-300 mt-1">{t("maintenance.kpi.heroSubtitle")}</p>
        </div>
        <button type="button" onClick={loadAll} disabled={loading}
          className="relative z-10 shrink-0 px-3 py-2 text-sm rounded-lg border border-white/30 text-white hover:bg-white/10 disabled:opacity-50">
          {t("common.refresh")}
        </button>
      </div>

      <OnboardingHintCard title={t("pageHints.maintenanceKpi.title")} body={t("pageHints.maintenanceKpi.body")} />

      {/* SECTION NAV */}
      <SectionNav sections={SECTIONS} t={t} />

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          {/* ── SECTION: OVERVIEW ─────────────────────────────────────────── */}
          <div id="kpi-overview" className="space-y-3 scroll-mt-4">
            {/* Tier 1 — Primary operating metrics */}
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("maintenance.kpi.section.overview")}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <KPIStatCard label={t("maintenance.kpi.kpi.openRequests")}    value={kpi.openRequests}      to="/maintenance-inbox"                         tone="blue"   size="large" />
              <KPIStatCard label={t("maintenance.kpi.kpi.activeWorkOrders")} value={kpi.activeWorkOrders}  to="/maintenance-inbox?status=in_progress"      tone="violet" size="large" />
              <KPIStatCard label={t("maintenance.kpi.kpi.openHighPriority")} value={kpi.openHighPriority}  to="/maintenance-inbox"                         tone="rose"   size="large" />
            </div>

            {/* Tier 2 — Risk flags */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPIStatCard label={t("maintenance.kpi.kpi.awaitingAction")}  value={kpi.awaitingAction}       to="/maintenance-inbox?status=waiting"   tone="amber" />
              <KPIStatCard label={t("maintenance.kpi.kpi.stalledRepairs")}  value={kpi.stalledRepairs}       to="/attention-center"                   tone="rose" />
              <KPIStatCard label={t("maintenance.kpi.kpi.ackOverdue")}      value={kpi.contractorAckOverdue} to="/attention-center"                   tone="rose" />
              <KPIStatCard label={t("maintenance.kpi.kpi.longRunningRepairs")} value={kpi.longRunningRepairs} to="/attention-center"                  tone="amber" />
            </div>

            {/* Tier 3 — Deeper diagnostics */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <KPIStatCard label={t("maintenance.kpi.kpi.triageOver24h")}      value={kpi.triageOver24h}            to="/maintenance-inbox?status=open"       tone="amber" />
              <KPIStatCard label={t("maintenance.kpi.kpi.repeatRepairProperties")} value={kpi.repeatRepairProperties} to="/attention-center"                   tone="violet" />
              <KPIStatCard label={t("maintenance.kpi.kpi.resolvedPending")}    value={kpi.resolvedPendingClosure}   to="/maintenance-inbox?status=resolved"   tone="emerald" />
            </div>

            {/* Compact attention banner */}
            {attentionItems.slice(0, 3).length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{t("maintenance.kpi.attentionNeeded")}</p>
                  <Link to="/attention-center" className="text-xs text-amber-700 hover:underline font-medium">
                    {t("common.viewAll")} ({attentionItems.length}) ↗
                  </Link>
                </div>
                <div className="space-y-2">
                  {attentionItems.slice(0, 3).map((i) => (
                    <Link key={i.key} to={i.linkPath}
                      className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 hover:bg-amber-50 transition-colors">
                      <p className="text-sm font-medium text-slate-900 truncate">{i.title}</p>
                      <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded border ${slaToneByHours(i.ageHours, t).className}`}>
                        {slaToneByHours(i.ageHours, t).label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── SECTION: CHARTS ────────────────────────────────────────────── */}
          <div id="kpi-charts" className="scroll-mt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("maintenance.kpi.section.charts")}</p>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <StatusBarChart
                title={t("maintenance.kpi.requestsByStatus")}
                rows={Object.entries(kpi.reqByStatus).map(([key, value]) => ({ key, value }))}
                toByKey={{ open: "/maintenance-inbox?status=open", in_progress: "/maintenance-inbox?status=in_progress", waiting: "/maintenance-inbox?status=waiting", resolved: "/maintenance-inbox?status=resolved", closed: "/maintenance-inbox?status=closed" }}
                labels={{ open: t("status.req.open"), in_progress: t("status.req.in_progress"), waiting: t("status.req.waiting"), resolved: t("status.req.resolved"), closed: t("status.req.closed") }}
              />
              <DonutChart
                title={t("maintenance.kpi.workOrdersByStatus")}
                rows={Object.entries(kpi.woByStatus).map(([key, value]) => ({ key, value }))}
                totalLabel={t("common.total")}
                toByKey={{ assigned: "/maintenance-inbox?woStatus=assigned", in_progress: "/maintenance-inbox?woStatus=in_progress", completed: "/maintenance-inbox?woStatus=completed", cancelled: "/maintenance-inbox?woStatus=cancelled" }}
                labels={{ assigned: t("status.wo.assigned"), in_progress: t("status.wo.in_progress"), completed: t("status.wo.completed"), cancelled: t("status.wo.cancelled") }}
              />
              <AgingBars
                title={t("maintenance.kpi.aging.title")}
                subtitle={t("maintenance.kpi.aging.subtitle")}
                rows={agingRows}
                toByKey={{ b0_24: "/maintenance-inbox?age=0_24", b24_48: "/maintenance-inbox?age=24_48", b48_72: "/maintenance-inbox?age=48_72", b72_plus: "/maintenance-inbox?age=72_plus" }}
              />
            </div>
          </div>

          {/* ── SECTION: PREVENTIVE ────────────────────────────────────────── */}
          <div id="kpi-preventive" className="scroll-mt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("maintenance.kpi.section.preventive")}</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{t("maintenance.kpi.preventive.title")}</h3>
                    <p className="text-xs text-slate-500 mt-1">{t("maintenance.kpi.preventive.subtitle")}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs text-slate-500">{t("maintenance.kpi.preventive.activePlans")}</p>
                    <p className="text-xl font-semibold text-slate-900 mt-1">{preventiveView.activeCount}</p>
                  </div>
                  <div className="rounded-lg border border-rose-200 bg-white p-3">
                    <p className="text-xs text-slate-500">{t("maintenance.kpi.preventive.overdue")}</p>
                    <p className="text-xl font-semibold text-rose-700 mt-1">{preventiveView.overdueCount}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-white p-3">
                    <p className="text-xs text-slate-500">{t("maintenance.kpi.preventive.dueSoon")}</p>
                    <p className="text-xl font-semibold text-amber-700 mt-1">{preventiveView.dueSoonCount}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {preventiveView.items.length === 0 ? (
                    <p className="text-sm text-slate-500">{t("maintenance.kpi.preventive.empty")}</p>
                  ) : (
                    preventiveView.items.map((item) => (
                      <Link key={item.item_key} to={item.link_path || "/maintenance-kpi"}
                        className="block rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
                        <p className="text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="text-xs text-slate-600 mt-1">
                          {[item.property_label, item.next_due_date, item.assigned_to_label].filter(Boolean).join(" • ")}
                        </p>
                      </Link>
                    ))
                  )}
                </div>
              </Card>
              <SpendBars
                title={t("maintenance.kpi.preventive.byProperty")}
                rows={preventiveView.propertiesWithDueTasks.map((row) => ({ label: row.label, amount: row.count }))}
                emptyText={t("maintenance.kpi.preventive.noPropertyLoad")}
                valueFormatter={(value) => t("maintenance.kpi.preventive.taskCount", { count: Number(value || 0) })}
              />
            </div>
          </div>

          {/* ── SECTION: FINANCIAL ─────────────────────────────────────────── */}
          <div id="kpi-financial" className="scroll-mt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("maintenance.kpi.section.financial")}</p>

            {/* Financial KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">{t("maintenance.kpi.financial.totalSpend")}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrencyAmount(spendView.totalSpend)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">{t("maintenance.kpi.financial.totalQuoted")}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrencyAmount(spendView.totalQuoted)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">{t("maintenance.kpi.financial.avgPerWorkOrder")}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrencyAmount(spendView.avgCostPerWorkOrder)}</p>
              </div>
            </div>

            {/* Budget progress bar */}
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{t("maintenance.kpi.financial.currentMonthBudget")}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {spendView.currentMonthBudget > 0
                      ? spendView.currentMonthVariance > 0
                        ? t("maintenance.kpi.financial.overBudget")
                        : t("maintenance.kpi.financial.underBudget")
                      : t("maintenance.kpi.financial.noBudget")}
                  </p>
                </div>
                <button type="button" onClick={() => setBudgetFormOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50">
                  {t("maintenance.kpi.financial.editBudget")}
                  <ChevronDown size={13} className={`transition-transform ${budgetFormOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              {spendView.currentMonthBudget > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-500">{t("maintenance.kpi.financial.budgetUsage")}</span>
                    <span className={`font-semibold ${spendView.currentMonthVariance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {formatCurrencyAmount(spendView.currentMonthActual)} / {formatCurrencyAmount(spendView.currentMonthBudget)} ({budgetPct}%)
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${budgetPct >= 100 ? "bg-rose-500" : budgetPct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${budgetPct}%` }}
                    />
                  </div>
                  {spendView.currentMonthVariance !== 0 && (
                    <p className={`text-xs mt-1 ${spendView.currentMonthVariance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {spendView.currentMonthVariance > 0 ? "+" : ""}{formatCurrencyAmount(Math.abs(spendView.currentMonthVariance))} variance
                    </p>
                  )}
                </div>
              )}

              {budgetFormOpen && (
                <form onSubmit={handleBudgetSave} className="mt-3 border-t border-slate-100 pt-3">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <label className="flex-1">
                      <span className="block text-xs text-slate-500 mb-1">{t("maintenance.kpi.financial.budgetFormLabel")}</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={budgetAmount}
                        onChange={(e) => setBudgetAmount(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        placeholder="0.00"
                      />
                    </label>
                    <button type="submit" disabled={budgetSaving}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                      {budgetSaving ? t("common.saving") : t("maintenance.kpi.financial.budgetSave")}
                    </button>
                  </div>
                  {budgetError && <p className="text-xs text-rose-600 mt-2">{budgetError}</p>}
                </form>
              )}
            </Card>

            {/* Monthly spend trend */}
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h4 className="text-sm font-semibold text-slate-900">{t("maintenance.kpi.financial.monthlyTrend")}</h4>
                <span className="text-xs text-slate-500">{t("maintenance.kpi.financial.lastMonths")}</span>
              </div>
              {(spendView.monthlySpend || []).length === 0 ? (
                <p className="text-sm text-slate-500">{t("maintenance.kpi.financial.noSpend")}</p>
              ) : (
                <div className="grid grid-cols-6 gap-2 items-end">
                  {(spendView.monthlySpend || []).map((row) => {
                    const height = Math.max(12, Math.round((Number(row.amount || 0) / spendTrendMax) * 96));
                    return (
                      <div key={row.key} className="text-center">
                        <div className="mx-auto flex h-28 w-full max-w-[56px] items-end justify-center rounded-lg bg-slate-100">
                          <div className="w-8 rounded-t-md bg-gradient-to-t from-violet-500 to-fuchsia-500" style={{ height }} />
                        </div>
                        <p className="mt-1.5 text-xs text-slate-500">{row.label}</p>
                        <p className="text-xs font-medium text-slate-900">{formatCurrencyAmount(row.amount, { maximumFractionDigits: 0 })}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Spend breakdowns — 3-col */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <SpendBars
                title={t("maintenance.kpi.financial.byProperty")}
                rows={spendView.topProperties}
                emptyText={t("maintenance.kpi.financial.noSpend")}
                valueFormatter={(v) => formatCurrencyAmount(v)}
                linkBuilder={(row) => row.propertyId ? `/properties/${row.propertyId}` : ""}
              />
              <SpendBars
                title={t("maintenance.kpi.financial.byContractor")}
                rows={spendView.topContractors}
                emptyText={t("maintenance.kpi.financial.noSpend")}
                valueFormatter={(v) => formatCurrencyAmount(v)}
              />
              <SpendBars
                title={t("maintenance.kpi.financial.byCategory")}
                rows={spendView.categorySpend}
                emptyText={t("maintenance.kpi.financial.noSpend")}
                valueFormatter={(v) => formatCurrencyAmount(v)}
              />
            </div>

            {/* Expensive repairs */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-slate-900">{t("maintenance.kpi.financial.expensiveRepairs")}</h3>
              {(spendView.expensiveRepairs || []).length === 0 ? (
                <p className="text-sm text-slate-500 mt-3">{t("maintenance.kpi.financial.noRepairs")}</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {(spendView.expensiveRepairs || []).map((repair) => (
                    <Link key={repair.id} to={repair.linkPath} className="block rounded-lg border border-slate-200 hover:bg-slate-50 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{repair.title}</p>
                          <p className="text-xs text-slate-600 mt-1">
                            {repair.propertyLabel}{repair.contractorLabel ? ` • ${t("common.contractor")}: ${repair.contractorLabel}` : ""}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">{formatCurrencyAmount(repair.amount)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── SECTION: SLA ───────────────────────────────────────────────── */}
          <div id="kpi-sla" className="scroll-mt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("maintenance.kpi.section.sla")}</p>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-900">{t("maintenance.kpi.sla.stalledRepairs")}</h3>
                {slaView.stalledRepairs.length === 0 ? (
                  <p className="text-sm text-slate-500 mt-3">{t("maintenance.kpi.sla.noStalled")}</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {slaView.stalledRepairs.map((repair) => (
                      <Link key={repair.id} to={repair.linkPath} className="block rounded-lg border border-slate-200 hover:bg-slate-50 px-3 py-2">
                        <p className="text-sm font-medium text-slate-900">{repair.title}</p>
                        <p className="text-xs text-slate-600 mt-1">
                          {[repair.propertyLabel, repair.contractorLabel ? `${t("common.contractor")}: ${repair.contractorLabel}` : ""].filter(Boolean).join(" • ")}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">{t("maintenance.kpi.sla.lastUpdated", { count: hoursToDays(repair.ageHours) })}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-900">{t("maintenance.kpi.sla.longRunningRepairs")}</h3>
                {slaView.longRunningRepairs.length === 0 ? (
                  <p className="text-sm text-slate-500 mt-3">{t("maintenance.kpi.sla.noLongRunning")}</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {slaView.longRunningRepairs.map((repair) => (
                      <Link key={repair.id} to={repair.linkPath} className="block rounded-lg border border-slate-200 hover:bg-slate-50 px-3 py-2">
                        <p className="text-sm font-medium text-slate-900">{repair.title}</p>
                        <p className="text-xs text-slate-600 mt-1">{repair.propertyLabel}</p>
                        <p className="text-xs text-slate-500 mt-1">{t("maintenance.kpi.sla.repairAgeDays", { count: hoursToDays(repair.repairAgeHours) })}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
              <SpendBars
                title={t("maintenance.kpi.sla.repeatRepairProperties")}
                rows={slaView.repeatRepairProperties}
                emptyText={t("maintenance.kpi.sla.noRepeatRepairs")}
                valueFormatter={(value) => t("maintenance.kpi.sla.repeatCount", { count: Number(value || 0) })}
                linkBuilder={(row) => row.propertyId ? `/properties/${row.propertyId}` : ""}
              />
            </div>
          </div>

          {/* ── SECTION: ACTIVITY ──────────────────────────────────────────── */}
          <div id="kpi-activity" className="scroll-mt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("maintenance.kpi.section.activity")}</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {/* Full attention items */}
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-900">{t("maintenance.kpi.attentionNeeded")}</h3>
                {attentionItems.length === 0 ? (
                  <p className="text-sm text-slate-500 mt-3">{t("maintenance.kpi.noUrgent")}</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {attentionItems.map((i) => (
                      <Link key={i.key} to={i.linkPath} className="block rounded-lg border border-slate-200 hover:bg-slate-50 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900">{i.title}</p>
                          <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded border ${slaToneByHours(i.ageHours, t).className}`}>
                            {t("maintenance.sla.short")}: {slaToneByHours(i.ageHours, t).label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">{i.detail}</p>
                        {i.property && <p className="text-xs text-slate-500 mt-0.5">{i.property}</p>}
                        {i.timestamp && <p className="text-xs text-slate-500 mt-0.5">{i.timestamp}</p>}
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-900">{t("maintenance.kpi.recentActivity")}</h3>
                {feed.length === 0 ? (
                  <p className="text-sm text-slate-500 mt-3">{t("maintenance.kpi.noEvents")}</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {feed.map((f) => (
                      <Link key={f.key} to={f.linkPath} className="block rounded-lg border border-slate-200 hover:bg-slate-50 px-3 py-2">
                        <p className="text-sm font-medium text-slate-900">{f.title}</p>
                        <p className="text-xs text-slate-600">{f.detail}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{fmtDate(f.at)}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
