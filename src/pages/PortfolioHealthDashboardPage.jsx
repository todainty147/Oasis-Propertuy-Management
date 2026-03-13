import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { useI18n } from "../context/I18nContext";
import { supabase } from "../lib/supabase";

function normalizePaymentStatus(status) {
  const s = String(status || "").toLowerCase();
  if (["paid", "oplacone", "opłacone"].includes(s)) return "paid";
  if (["due", "oczekujace", "oczekujące", "pending"].includes(s)) return "due";
  if (["overdue", "zalegle", "zaległe"].includes(s)) return "overdue";
  return "other";
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString();
}

function hoursSince(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 3600000));
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

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
  let start = 0;
  const segments = rows.map((r, idx) => {
    const pct = total > 0 ? (Number(r.value || 0) / total) * 100 : 0;
    const from = start;
    const to = start + pct;
    start = to;
    return { ...r, pct, color: palette[idx % palette.length], from, to };
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

export default function PortfolioHealthDashboardPage({
  properties = [],
  payments = [],
  occupiedCount = 0,
  vacantCount = 0,
  occupancyRate = 0,
  longVacantProperties = [],
}) {
  const { setTitle } = usePageTitle();
  const { activeRole, activeAccountId } = useAccount();
  const { activeTenantId } = useTenant();
  const { t } = useI18n();

  const role = useMemo(() => String(activeRole || "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => ["owner", "admin", "staff"].includes(role), [role]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reqRows, setReqRows] = useState([]);
  const [woRows, setWoRows] = useState([]);

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
        const [reqRes, woRes] = await Promise.all([
          supabase
            .from("maintenance_requests")
            .select("id, title, status, priority, created_at, property_id")
            .eq("account_id", activeAccountId)
            .order("created_at", { ascending: false })
            .limit(400),
          supabase
            .from("work_orders_with_flags")
            .select("id, status, contractor_user_id, created_at, property_id")
            .eq("account_id", activeAccountId)
            .order("created_at", { ascending: false })
            .limit(400),
        ]);

        if (reqRes.error) throw reqRes.error;
        if (woRes.error) throw woRes.error;
        if (dead) return;

        setReqRows(reqRes.data ?? []);
        setWoRows(woRes.data ?? []);
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
  }, [activeAccountId, canManage, t]);

  const paymentStats = useMemo(() => {
    let paid = 0;
    let due = 0;
    let overdue = 0;
    let dueSoon = 0;

    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    for (const p of payments ?? []) {
      const amount = Number(p.amount || 0);
      const status = normalizePaymentStatus(p.status);
      if (status === "paid") paid += amount;
      else if (status === "due") due += amount;
      else if (status === "overdue") overdue += amount;

      const dueDate = parseDate(p.dueDate);
      if (status !== "paid" && dueDate && dueDate >= now && dueDate <= soon) {
        dueSoon += amount;
      }
    }

    return { paid, due, overdue, dueSoon, outstanding: due + overdue };
  }, [payments]);

  const maintenanceStats = useMemo(() => {
    const openReq = reqRows.filter((r) => !["closed", "zamkniete"].includes(String(r.status || "").toLowerCase()));
    const highOpen = openReq.filter((r) => ["high", "critical", "wysoki", "krytyczny"].includes(String(r.priority || "").toLowerCase()));
    const waiting48h = openReq.filter((r) => {
      const h = hoursSince(r.created_at);
      return Number.isFinite(h) && h > 48;
    });
    const activeWO = woRows.filter((w) => ["assigned", "in_progress", "blocked"].includes(String(w.status || "").toLowerCase()));
    const woWithoutContractor = activeWO.filter((w) => !w.contractor_user_id);
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 3600 * 1000;
    const fourteenDaysMs = 14 * 24 * 3600 * 1000;

    const recentOpenCreated = reqRows.filter((r) => {
      const created = parseDate(r.created_at);
      if (!created) return false;
      return now - created.getTime() <= sevenDaysMs;
    }).length;
    const prevOpenCreated = reqRows.filter((r) => {
      const created = parseDate(r.created_at);
      if (!created) return false;
      const age = now - created.getTime();
      return age > sevenDaysMs && age <= fourteenDaysMs;
    }).length;

    return {
      openReq: openReq.length,
      highOpen: highOpen.length,
      waiting48h: waiting48h.length,
      activeWO: activeWO.length,
      woWithoutContractor: woWithoutContractor.length,
      recentOpenCreated,
      prevOpenCreated,
    };
  }, [reqRows, woRows]);

  const occupancyRows = useMemo(
    () => [
      { key: "occupied", value: Number(occupiedCount || 0) },
      { key: "vacant", value: Number(vacantCount || 0) },
    ],
    [occupiedCount, vacantCount]
  );

  const maintenanceRows = useMemo(
    () => [
      { key: "open", value: maintenanceStats.openReq },
      { key: "high", value: maintenanceStats.highOpen },
      { key: "waiting48h", value: maintenanceStats.waiting48h },
      { key: "woNoContractor", value: maintenanceStats.woWithoutContractor },
    ],
    [maintenanceStats]
  );

  const arrearsAgingRows = useMemo(() => {
    let b0_7 = 0;
    let b8_30 = 0;
    let b30p = 0;
    const now = new Date();
    for (const p of payments ?? []) {
      const status = normalizePaymentStatus(p.status);
      if (status === "paid") continue;
      const dueDate = parseDate(p.dueDate);
      if (!dueDate || dueDate > now) continue;
      const days = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 3600 * 1000));
      const amount = Number(p.amount || 0);
      if (days <= 7) b0_7 += amount;
      else if (days <= 30) b8_30 += amount;
      else b30p += amount;
    }
    return [
      { key: "overdue_0_7", value: Math.round(b0_7) },
      { key: "overdue_8_30", value: Math.round(b8_30) },
      { key: "overdue_30_plus", value: Math.round(b30p) },
    ];
  }, [payments]);

  const financeRows = useMemo(
    () => [
      { key: "paid", value: Math.round(paymentStats.paid) },
      { key: "due", value: Math.round(paymentStats.due) },
      { key: "overdue", value: Math.round(paymentStats.overdue) },
    ],
    [paymentStats]
  );

  const attentionItems = useMemo(() => {
    const items = [];

    const vacant = (properties || [])
      .filter((p) => ["wolne", "vacant"].includes(String(p.status || "").toLowerCase()))
      .slice(0, 4);
    for (const p of vacant) {
      items.push({
        key: `vacant-${p.id}`,
        title: t("portfolio.attention.vacant"),
        subtitle: `${p.address || "—"}`,
        to: `/properties?status=vacant`,
      });
    }

    for (const p of longVacantProperties.slice(0, 4)) {
      items.push({
        key: `vac-${p.id}`,
        title: t("portfolio.attention.vacantLong"),
        subtitle: `${p.address || "—"} (${p.daysVacant || 0}d)`,
        to: `/properties?status=vacant&aging=14d`,
      });
    }

    const overdue = (payments || [])
      .filter((p) => normalizePaymentStatus(p.status) === "overdue")
      .slice(0, 4);

    for (const p of overdue) {
      items.push({
        key: `ovd-${p.id}`,
        title: t("portfolio.attention.overduePayment"),
        subtitle: `${money(p.amount)} PLN`,
        to: "/finance?status=overdue",
      });
    }

    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const dueSoon = (payments || [])
      .filter((p) => normalizePaymentStatus(p.status) !== "paid")
      .filter((p) => {
        const d = parseDate(p.dueDate);
        return d && d >= now && d <= soon;
      })
      .slice(0, 4);
    for (const p of dueSoon) {
      items.push({
        key: `soon-${p.id}`,
        title: t("portfolio.attention.dueSoon"),
        subtitle: `${money(p.amount)} PLN`,
        to: "/finance?status=due&range=7d",
      });
    }

    const highReq = reqRows
      .filter((r) => ["high", "critical", "wysoki", "krytyczny"].includes(String(r.priority || "").toLowerCase()))
      .filter((r) => !["closed", "zamkniete"].includes(String(r.status || "").toLowerCase()))
      .slice(0, 4);

    for (const r of highReq) {
      items.push({
        key: `req-${r.id}`,
        title: t("portfolio.attention.highPriority"),
        subtitle: r.title || r.id,
        to: "/maintenance-inbox?priority=high,critical",
      });
    }

    return items.slice(0, 10);
  }, [longVacantProperties, payments, properties, reqRows, t]);

  const openTrend = useMemo(
    () => maintenanceStats.recentOpenCreated - maintenanceStats.prevOpenCreated,
    [maintenanceStats]
  );

  const outstandingDeltaPct = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const prevMonthDate = new Date(thisYear, thisMonth - 1, 1);
    const prevMonth = prevMonthDate.getMonth();
    const prevYear = prevMonthDate.getFullYear();

    let currentOutstanding = 0;
    let previousOutstanding = 0;

    for (const p of payments || []) {
      if (normalizePaymentStatus(p.status) === "paid") continue;
      const due = parseDate(p.dueDate);
      if (!due) continue;
      const amount = Number(p.amount || 0);
      if (due.getFullYear() === thisYear && due.getMonth() === thisMonth) currentOutstanding += amount;
      if (due.getFullYear() === prevYear && due.getMonth() === prevMonth) previousOutstanding += amount;
    }

    return pctDelta(currentOutstanding, previousOutstanding);
  }, [payments]);

  if (!canManage) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">{t("portfolio.accessDenied")}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 border bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-800 text-white shadow-lg">
        <h2 className="text-lg font-semibold">{t("portfolio.title")}</h2>
        <p className="text-sm text-slate-200 mt-1">{t("portfolio.subtitle")}</p>
        {activeTenantId ? (
          <p className="text-xs text-cyan-100 mt-2">{t("portfolio.scopeFiltered")}</p>
        ) : null}
      </Card>

      {error ? (
        <Card className="p-4 border border-rose-200 bg-rose-50 text-rose-700 text-sm">{error}</Card>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard title={t("portfolio.kpi.properties")} value={properties.length} to="/properties" tone="blue" />
        <StatCard title={t("portfolio.kpi.occupancyRate")} value={`${occupancyRate}%`} hint={`${occupiedCount}/${properties.length || 0}`} to="/properties?status=occupied" tone="emerald" />
        <StatCard title={t("portfolio.kpi.collected")} value={`${money(paymentStats.paid)} PLN`} to="/finance" tone="violet" />
        <StatCard
          title={t("portfolio.kpi.outstanding")}
          value={`${money(paymentStats.outstanding)} PLN`}
          hint={outstandingDeltaPct == null ? "" : t("portfolio.kpi.trendVsPrevMonth", { value: outstandingDeltaPct })}
          to="/finance?status=overdue,due"
          tone="rose"
        />
        <StatCard
          title={t("portfolio.kpi.openMaintenance")}
          value={maintenanceStats.openReq}
          hint={t("portfolio.kpi.trendVsPrev7d", { value: openTrend })}
          to="/maintenance-inbox?status=open,in_progress,waiting,resolved"
          tone="amber"
        />
        <StatCard title={t("portfolio.kpi.dueSoon")} value={`${money(paymentStats.dueSoon)} PLN`} to="/finance?status=due&range=7d" tone="amber" />
        <StatCard title={t("portfolio.kpi.activeWorkOrders")} value={maintenanceStats.activeWO} to="/maintenance-inbox?status=in_progress" tone="blue" />
        <StatCard title={t("portfolio.kpi.waitingOver48h")} value={maintenanceStats.waiting48h} to="/maintenance-inbox?status=waiting&aging=48h" tone="amber" />
        <StatCard title={t("portfolio.kpi.withoutContractor")} value={maintenanceStats.woWithoutContractor} to="/maintenance-kpi?filter=no-contractor" tone="rose" />
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
            }}
            toByKey={{
              open: "/maintenance-inbox?status=open,in_progress,waiting,resolved",
              high: "/maintenance-inbox?priority=high,critical",
              waiting48h: "/maintenance-inbox?status=waiting&aging=48h",
              woNoContractor: "/maintenance-kpi?filter=no-contractor",
            }}
          />
        </div>
      )}

      <Card className="p-4 border shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">{t("portfolio.attention.title")}</h3>
        {attentionItems.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">{t("portfolio.attention.empty")}</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {attentionItems.map((item) => (
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
