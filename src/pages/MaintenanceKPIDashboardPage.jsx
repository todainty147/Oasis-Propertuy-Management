import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { useI18n } from "../context/I18nContext";
import {
  getMaintenanceAttention,
  getMaintenanceKpiSnapshot,
  getMaintenanceRecentActivity,
  mapMaintenanceAttentionItems,
} from "../services/maintenanceDashboardService";
import { useRealtimeTables } from "../hooks/useRealtimeTables";

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function slaToneByHours(hours, t) {
  const h = Number.isFinite(Number(hours)) ? Number(hours) : -1;
  if (h > 48) {
    return {
      label: t("maintenance.sla.red"),
      className: "bg-rose-50 border-rose-200 text-rose-700",
    };
  }
  if (h > 24) {
    return {
      label: t("maintenance.sla.yellow"),
      className: "bg-amber-50 border-amber-200 text-amber-700",
    };
  }
  return {
    label: t("maintenance.sla.green"),
    className: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };
}

function KPIStatCard({ label, value, hint = "", to = "", tone = "blue" }) {
  const themes = {
    blue: "from-blue-600/10 to-cyan-500/10 border-blue-200",
    amber: "from-amber-500/10 to-orange-500/10 border-amber-200",
    emerald: "from-emerald-500/10 to-lime-500/10 border-emerald-200",
    rose: "from-rose-500/10 to-red-500/10 border-rose-200",
    violet: "from-violet-500/10 to-indigo-500/10 border-violet-200",
  };
  const toneClass = themes[tone] || themes.blue;
  const content = (
    <Card className={`p-4 border bg-gradient-to-br ${toneClass} shadow-sm hover:shadow-md transition-shadow`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">
        <AnimatedNumber value={value} />
      </div>
      {hint ? <div className="text-xs text-slate-500 mt-1">{hint}</div> : null}
    </Card>
  );
  if (!to) return content;
  return (
    <Link to={to} className="block">
      {content}
    </Link>
  );
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
                <span className="font-semibold text-slate-900">
                  {r.value} <span className="text-slate-500 font-normal">({pct}%)</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barTone(r.key)}`}
                  style={{ width: `${widthPct}%` }}
                />
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

function barTone(key) {
  const k = String(key || "").toLowerCase();
  if (k === "open" || k === "assigned") return "bg-gradient-to-r from-slate-500 to-slate-400";
  if (k === "in_progress") return "bg-gradient-to-r from-blue-500 to-cyan-500";
  if (k === "waiting") return "bg-gradient-to-r from-amber-500 to-orange-500";
  if (k === "resolved" || k === "completed") return "bg-gradient-to-r from-emerald-500 to-lime-500";
  if (k === "closed" || k === "cancelled") return "bg-gradient-to-r from-violet-500 to-indigo-500";
  return "bg-gradient-to-r from-blue-500 to-cyan-500";
}

function AnimatedNumber({ value = 0, durationMs = 550 }) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    const from = display;
    const to = target;
    if (from === to) return;

    const start = performance.now();
    let raf = 0;

    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (to - from) * eased);
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return <>{display}</>;
}

function DonutChart({ title, rows = [], labels = {}, totalLabel = "Total", toByKey = {} }) {
  const total = rows.reduce((a, b) => a + b.value, 0);
  const palette = ["#0ea5e9", "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#64748b"];
  let start = 0;
  const segments = rows.map((r, idx) => {
    const pct = total > 0 ? (r.value / total) * 100 : 0;
    const seg = {
      key: r.key,
      value: r.value,
      pct,
      color: palette[idx % palette.length],
      from: start,
      to: start + pct,
    };
    start += pct;
    return seg;
  });
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
            const to = toByKey?.[s.key] || "";
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

function AgingBars({ title, subtitle = "", rows = [], toByKey = {} }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="p-4 border shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {subtitle ? <p className="text-xs text-slate-500 mt-1">{subtitle}</p> : null}
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

export default function MaintenanceKPIDashboardPage() {
  const { setTitle } = usePageTitle();
  const { activeAccountId, activeRole } = useAccount();
  const { t } = useI18n();

  const role = useMemo(() => String(activeRole || "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => ["owner", "admin", "staff"].includes(role), [role]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feed, setFeed] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  const [attentionRows, setAttentionRows] = useState([]);

  useEffect(() => {
    setTitle(t("maintenance.kpi.pageTitle"));
  }, [setTitle, t]);

  async function loadAll() {
    if (!activeAccountId) return;

    setLoading(true);
    setError("");
    try {
      const [stats, attention, recentActivity] = await Promise.all([
        getMaintenanceKpiSnapshot(activeAccountId),
        getMaintenanceAttention(activeAccountId),
        getMaintenanceRecentActivity(activeAccountId, t, 10),
      ]);

      setSnapshot(stats || null);
      setAttentionRows(attention || []);
      setFeed(recentActivity || []);
    } catch (e) {
      setError(e?.message || t("maintenance.kpi.error"));
      setFeed([]);
      setSnapshot(null);
      setAttentionRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeAccountId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, t]);

  useRealtimeTables({
    enabled: !!activeAccountId && canManage,
    subscriptions: [
      { channel: `maintenance-kpi-requests:${activeAccountId}`, table: "maintenance_requests", filter: `account_id=eq.${activeAccountId}` },
      { channel: `maintenance-kpi-work-orders:${activeAccountId}`, table: "work_orders", filter: `account_id=eq.${activeAccountId}` },
      { channel: `maintenance-kpi-activity:${activeAccountId}`, table: "activity_log", filter: `account_id=eq.${activeAccountId}` },
      { channel: `maintenance-kpi-audit:${activeAccountId}`, table: "work_order_audit_log" },
    ],
    onChange: loadAll,
  });

  const snapshotView = snapshot ?? {
    open_requests: 0,
    active_work_orders: 0,
    awaiting_action: 0,
    resolved_pending_closure: 0,
    open_high_priority: 0,
    req_by_status: {
      open: 0,
      in_progress: 0,
      waiting: 0,
      resolved: 0,
      closed: 0,
    },
    wo_by_status: {
      assigned: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    },
    aging: {
      b0_24: 0,
      b24_48: 0,
      b48_72: 0,
      b72_plus: 0,
    },
  };

  const kpi = useMemo(() => {
    return {
      openRequests: Number(snapshotView.open_requests || 0),
      activeWorkOrders: Number(snapshotView.active_work_orders || 0),
      awaitingAction: Number(snapshotView.awaiting_action || 0),
      resolvedPendingClosure: Number(snapshotView.resolved_pending_closure || 0),
      openHighPriority: Number(snapshotView.open_high_priority || 0),
      reqByStatus: snapshotView.req_by_status || {
        open: 0,
        in_progress: 0,
        waiting: 0,
        resolved: 0,
        closed: 0,
      },
      woByStatus: snapshotView.wo_by_status || {
        assigned: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
      },
    };
  }, [snapshotView]);

  const attentionItems = useMemo(
    () => mapMaintenanceAttentionItems(attentionRows, t, 12),
    [attentionRows, t]
  );

  const agingRows = useMemo(() => {
    const counts = snapshotView.aging || {
      b0_24: 0,
      b24_48: 0,
      b48_72: 0,
      b72_plus: 0,
    };
    return [
      {
        key: "b0_24",
        label: t("maintenance.kpi.aging.0_24"),
        value: Number(counts.b0_24 || 0),
        barClass: "bg-emerald-500",
      },
      {
        key: "b24_48",
        label: t("maintenance.kpi.aging.24_48"),
        value: Number(counts.b24_48 || 0),
        barClass: "bg-amber-500",
      },
      {
        key: "b48_72",
        label: t("maintenance.kpi.aging.48_72"),
        value: Number(counts.b48_72 || 0),
        barClass: "bg-orange-500",
      },
      {
        key: "b72_plus",
        label: t("maintenance.kpi.aging.72_plus"),
        value: Number(counts.b72_plus || 0),
        barClass: "bg-rose-600",
      },
    ];
  }, [snapshotView, t]);

  if (!canManage) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">{t("maintenance.kpi.accessDenied")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 flex items-center justify-between gap-3">
        <div className="absolute -top-10 -right-8 h-36 w-36 rounded-full bg-cyan-400/20 blur-2xl" />
        <div className="absolute -bottom-10 -left-8 h-36 w-36 rounded-full bg-blue-500/20 blur-2xl" />
        <div>
          <h2 className="text-lg font-semibold text-white">{t("maintenance.kpi.title")}</h2>
          <p className="text-sm text-slate-200 mt-1">{t("maintenance.kpi.heroSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="relative z-10 px-3 py-2 text-sm rounded-lg border border-white/30 text-white hover:bg-white/10 disabled:opacity-50"
        >
          {t("common.refresh")}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <KPIStatCard label={t("maintenance.kpi.kpi.openRequests")} value={kpi.openRequests} to="/maintenance-inbox" tone="blue" />
            <KPIStatCard label={t("maintenance.kpi.kpi.activeWorkOrders")} value={kpi.activeWorkOrders} to="/maintenance-inbox?status=in_progress" tone="violet" />
            <KPIStatCard label={t("maintenance.kpi.kpi.awaitingAction")} value={kpi.awaitingAction} to="/maintenance-inbox?status=waiting" tone="amber" />
            <KPIStatCard
              label={t("maintenance.kpi.kpi.resolvedPending")}
              value={kpi.resolvedPendingClosure}
              to="/maintenance-inbox?status=resolved"
              tone="emerald"
            />
            <KPIStatCard label={t("maintenance.kpi.kpi.openHighPriority")} value={kpi.openHighPriority} to="/maintenance-inbox" tone="rose" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <StatusBarChart
              title={t("maintenance.kpi.requestsByStatus")}
              rows={Object.entries(kpi.reqByStatus).map(([key, value]) => ({ key, value }))}
              toByKey={{
                open: "/maintenance-inbox?status=open",
                in_progress: "/maintenance-inbox?status=in_progress",
                waiting: "/maintenance-inbox?status=waiting",
                resolved: "/maintenance-inbox?status=resolved",
                closed: "/maintenance-inbox?status=closed",
              }}
              labels={{
                open: t("status.req.open"),
                in_progress: t("status.req.in_progress"),
                waiting: t("status.req.waiting"),
                resolved: t("status.req.resolved"),
                closed: t("status.req.closed"),
              }}
            />

            <DonutChart
              title={t("maintenance.kpi.workOrdersByStatus")}
              rows={Object.entries(kpi.woByStatus).map(([key, value]) => ({ key, value }))}
              totalLabel={t("common.total")}
              toByKey={{
                assigned: "/maintenance-inbox?woStatus=assigned",
                in_progress: "/maintenance-inbox?woStatus=in_progress",
                completed: "/maintenance-inbox?woStatus=completed",
                cancelled: "/maintenance-inbox?woStatus=cancelled",
              }}
              labels={{
                assigned: t("status.wo.assigned"),
                in_progress: t("status.wo.in_progress"),
                completed: t("status.wo.completed"),
                cancelled: t("status.wo.cancelled"),
              }}
            />

            <AgingBars
              title={t("maintenance.kpi.aging.title")}
              subtitle={t("maintenance.kpi.aging.subtitle")}
              rows={agingRows}
              toByKey={{
                b0_24: "/maintenance-inbox?age=0_24",
                b24_48: "/maintenance-inbox?age=24_48",
                b48_72: "/maintenance-inbox?age=48_72",
                b72_plus: "/maintenance-inbox?age=72_plus",
              }}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
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
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded border ${
                            slaToneByHours(i.ageHours, t).className
                          }`}
                        >
                          {t("maintenance.sla.short")}: {slaToneByHours(i.ageHours, t).label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{i.detail}</p>
                      {i.property ? <p className="text-xs text-slate-500 mt-0.5">{i.property}</p> : null}
                      {i.timestamp ? <p className="text-xs text-slate-500 mt-0.5">{i.timestamp}</p> : null}
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
                    <Link
                      key={f.key}
                      to={f.linkPath}
                      className="block rounded-lg border border-slate-200 hover:bg-slate-50 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-slate-900">{f.title}</p>
                      <p className="text-xs text-slate-600">{f.detail}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{fmtDate(f.at)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
