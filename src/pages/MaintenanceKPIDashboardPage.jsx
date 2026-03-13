import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { supabase } from "../lib/supabase";
import { useI18n } from "../context/I18nContext";

function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function daysSince(ts) {
  if (!ts) return 0;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
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

function StatusBarChart({ title, rows = [], labels = {} }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const sum = rows.reduce((a, b) => a + b.value, 0);
  return (
    <Card className="p-4 border shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2 text-sm">
        {rows.map((r) => {
          const pct = sum > 0 ? Math.round((r.value / sum) * 100) : 0;
          const widthPct = Math.max(3, Math.round((r.value / max) * 100));
          return (
            <div key={r.key} className="rounded-lg border border-slate-200 bg-white p-2">
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

function DonutChart({ title, rows = [], labels = {}, totalLabel = "Total" }) {
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
          {segments.map((s) => (
            <div key={s.key} className="flex items-center justify-between text-xs rounded-lg border border-slate-200 px-2 py-1.5">
              <span className="inline-flex items-center gap-2 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {labels[s.key] || s.key}
              </span>
              <span className="font-semibold text-slate-900">
                {s.value} <span className="text-slate-500 font-normal">({Math.round(s.pct)}%)</span>
              </span>
            </div>
          ))}
        </div>
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
  const [requests, setRequests] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [propertyLabelById, setPropertyLabelById] = useState({});
  const [feed, setFeed] = useState([]);
  const [serverStats, setServerStats] = useState(null);

  useEffect(() => {
    setTitle(t("maintenance.kpi.pageTitle"));
  }, [setTitle, t]);

  async function loadAll() {
    if (!activeAccountId) return;

    setLoading(true);
    setError("");
    try {
      const [{ data: reqRows, error: reqErr }, { data: woRows, error: woErr }, { data: propRows, error: propErr }] =
        await Promise.all([
          supabase
            .from("maintenance_requests")
            .select("id, property_id, title, priority, status, created_at, updated_at")
            .eq("account_id", activeAccountId)
            .order("created_at", { ascending: false }),
          supabase
            .from("work_orders_with_flags")
            .select(
              "id, maintenance_request_id, property_id, status, contractor_user_id, contractor_name, contractor_phone, created_at, updated_at"
            )
            .eq("account_id", activeAccountId)
            .order("created_at", { ascending: false }),
          supabase.from("properties").select("id, address, city").eq("account_id", activeAccountId),
        ]);

      if (reqErr) throw reqErr;
      if (woErr) throw woErr;
      if (propErr) throw propErr;

      const reqData = reqRows || [];
      const woData = woRows || [];
      setRequests(reqData);
      setWorkOrders(woData);

      // Optional server-side aggregate function (faster + consistent cross-environment).
      try {
        const { data: statsData, error: statsErr } = await supabase.rpc("maintenance_dashboard_stats", {
          p_account_id: activeAccountId,
        });
        if (!statsErr) {
          const row = Array.isArray(statsData) ? statsData[0] : statsData;
          setServerStats(row || null);
        } else {
          setServerStats(null);
        }
      } catch {
        setServerStats(null);
      }

      const labels = {};
      for (const p of propRows || []) {
        labels[p.id] = `${p.address || t("common.property")}${p.city ? `, ${p.city}` : ""}`;
      }
      setPropertyLabelById(labels);

      const woIds = woData.map((w) => w.id).filter(Boolean);

      const [activityRes, woAuditRes] = await Promise.all([
        supabase
          .from("activity_log")
          .select("id, entity_type, entity_id, action, field, actor_role, created_at")
          .eq("account_id", activeAccountId)
          .in("entity_type", ["maintenance_request", "maintenance_requests", "work_order", "work_orders"])
          .order("created_at", { ascending: false })
          .limit(30),
        woIds.length > 0
          ? supabase
              .from("work_order_audit_log")
              .select("id, work_order_id, action, created_at")
              .in("work_order_id", woIds.slice(0, 200))
              .order("created_at", { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (activityRes.error) throw activityRes.error;
      if (woAuditRes.error) throw woAuditRes.error;

      const feedRows = [];
      for (const a of activityRes.data || []) {
        const et = String(a.entity_type || "").toLowerCase();
        const isWO = et === "work_order" || et === "work_orders";
        feedRows.push({
          key: `act-${a.id}`,
          at: a.created_at,
          title: isWO ? t("maintenance.kpi.feed.workOrderChange") : t("maintenance.kpi.feed.requestChange"),
          detail: a.field ? `${a.action || "update"} • ${a.field}` : a.action || "update",
          linkPath: isWO && a.entity_id ? `/work-orders/${a.entity_id}` : "/maintenance-inbox",
        });
      }
      for (const a of woAuditRes.data || []) {
        feedRows.push({
          key: `woa-${a.id}`,
          at: a.created_at,
          title: t("maintenance.kpi.feed.workOrderAudit"),
          detail: a.action || "update",
          linkPath: a.work_order_id ? `/work-orders/${a.work_order_id}` : "/maintenance-inbox",
        });
      }
      feedRows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setFeed(feedRows.slice(0, 10));
    } catch (e) {
      setError(e?.message || t("maintenance.kpi.error"));
      setRequests([]);
      setWorkOrders([]);
      setFeed([]);
      setServerStats(null);
      setPropertyLabelById({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeAccountId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId]);

  const requestById = useMemo(() => {
    const map = {};
    for (const r of requests) map[r.id] = r;
    return map;
  }, [requests]);

  const workOrdersByRequestId = useMemo(() => {
    const map = {};
    for (const wo of workOrders) {
      const k = wo.maintenance_request_id;
      if (!k) continue;
      if (!map[k]) map[k] = [];
      map[k].push(wo);
    }
    return map;
  }, [workOrders]);

  const kpi = useMemo(() => {
    const localOpenRequests = requests.filter((r) => String(r.status || "").toLowerCase() !== "closed").length;
    const localActiveWorkOrders = workOrders.filter((w) => String(w.status || "").toLowerCase() === "in_progress").length;
    const localAwaitingAction = requests.filter((r) => String(r.status || "").toLowerCase() === "waiting").length;
    const localResolvedPendingClosure = requests.filter((r) => String(r.status || "").toLowerCase() === "resolved").length;
    const localOpenHighPriority = requests.filter((r) => {
      const s = String(r.status || "").toLowerCase();
      const p = String(r.priority || "").toLowerCase();
      return s !== "closed" && (p === "high" || p === "urgent");
    }).length;

    const reqByStatus = { open: 0, in_progress: 0, waiting: 0, resolved: 0, closed: 0 };
    for (const r of requests) {
      const s = String(r.status || "").toLowerCase();
      if (Object.prototype.hasOwnProperty.call(reqByStatus, s)) reqByStatus[s] += 1;
    }

    const woByStatus = { assigned: 0, in_progress: 0, completed: 0, cancelled: 0 };
    for (const w of workOrders) {
      const s = String(w.status || "").toLowerCase();
      if (Object.prototype.hasOwnProperty.call(woByStatus, s)) woByStatus[s] += 1;
    }

    const openRequests = Number.isFinite(Number(serverStats?.open_requests))
      ? Number(serverStats.open_requests)
      : localOpenRequests;
    const activeWorkOrders = Number.isFinite(Number(serverStats?.active_work_orders))
      ? Number(serverStats.active_work_orders)
      : localActiveWorkOrders;
    const awaitingAction = Number.isFinite(Number(serverStats?.awaiting_action))
      ? Number(serverStats.awaiting_action)
      : localAwaitingAction;
    const resolvedPendingClosure = Number.isFinite(Number(serverStats?.resolved_pending_closure))
      ? Number(serverStats.resolved_pending_closure)
      : localResolvedPendingClosure;
    const openHighPriority = Number.isFinite(Number(serverStats?.open_high_priority))
      ? Number(serverStats.open_high_priority)
      : localOpenHighPriority;

    return {
      openRequests,
      activeWorkOrders,
      awaitingAction,
      resolvedPendingClosure,
      openHighPriority,
      reqByStatus,
      woByStatus,
    };
  }, [requests, workOrders, serverStats]);

  const attentionItems = useMemo(() => {
    const items = [];

    for (const r of requests) {
      const s = String(r.status || "").toLowerCase();
      const p = String(r.priority || "").toLowerCase();
      const ageDays = daysSince(r.updated_at || r.created_at);
      const reqWos = workOrdersByRequestId[r.id] || [];

      if (s === "waiting" && ageDays > 2) {
        items.push({
          key: `wait-${r.id}`,
          severity: "high",
          title: t("maintenance.kpi.attention.waiting48h"),
          detail: r.title || t("maintenance.requestFallbackTitle"),
          property: propertyLabelById[r.property_id] || "",
          timestamp: `Utworzono ${daysSince(r.created_at)} dni temu`,
          linkPath: "/maintenance-inbox",
        });
      }

      if ((p === "high" || p === "urgent") && s !== "closed") {
        items.push({
          key: `prio-${r.id}`,
          severity: "critical",
          title: t("maintenance.kpi.attention.highPriorityOpen"),
          detail: r.title || t("maintenance.requestFallbackTitle"),
          property: propertyLabelById[r.property_id] || "",
          timestamp: `Utworzono ${daysSince(r.created_at)} dni temu`,
          linkPath: "/maintenance-inbox",
        });
      }

      if (s !== "closed" && reqWos.length === 0) {
        items.push({
          key: `no-wo-${r.id}`,
          severity: "medium",
          title: t("maintenance.kpi.attention.noWorkOrder"),
          detail: r.title || t("maintenance.requestFallbackTitle"),
          property: propertyLabelById[r.property_id] || "",
          timestamp: `Utworzono ${daysSince(r.created_at)} dni temu`,
          linkPath: "/maintenance-inbox",
        });
      }
    }

    for (const wo of workOrders) {
      const s = String(wo.status || "").toLowerCase();
      const ageDays = daysSince(wo.updated_at || wo.created_at);
      const req = requestById[wo.maintenance_request_id];
      if (s === "in_progress" && ageDays > 7) {
        items.push({
          key: `wip-${wo.id}`,
          severity: "high",
          title: `Zlecenie w trakcie > 7 dni (${ageDays}d)`,
          detail: req?.title || `WO ${String(wo.id).slice(0, 8)}`,
          property: propertyLabelById[wo.property_id] || "",
          linkPath: `/work-orders/${wo.id}`,
        });
      }
      if (!wo.contractor_user_id && (s === "assigned" || s === "in_progress")) {
        items.push({
          key: `noc-${wo.id}`,
          severity: "medium",
          title: "Zlecenie bez wykonawcy",
          detail: req?.title || `WO ${String(wo.id).slice(0, 8)}`,
          property: propertyLabelById[wo.property_id] || "",
          timestamp: `Utworzono ${daysSince(wo.created_at)} dni temu`,
          linkPath: `/work-orders/${wo.id}`,
        });
      }
    }

    const rank = { critical: 3, high: 2, medium: 1, low: 0 };
    items.sort((a, b) => rank[b.severity] - rank[a.severity]);
    return items.slice(0, 12);
  }, [requests, workOrders, requestById, workOrdersByRequestId, propertyLabelById]);

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

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <StatusBarChart
              title={t("maintenance.kpi.requestsByStatus")}
              rows={Object.entries(kpi.reqByStatus).map(([key, value]) => ({ key, value }))}
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
              labels={{
                assigned: t("status.wo.assigned"),
                in_progress: t("status.wo.in_progress"),
                completed: t("status.wo.completed"),
                cancelled: t("status.wo.cancelled"),
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
                    <Link
                      key={i.key}
                      to={i.linkPath}
                      className="block rounded-lg border border-slate-200 hover:bg-slate-50 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-slate-900">{i.title}</p>
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
