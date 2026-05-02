// src/pages/CommandCenterPage.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { ChevronDown } from "lucide-react";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { getCommandCenterData } from "../services/commandCenterService";
import { formatAttentionInsightTimestamp, getAttentionInsight } from "../services/attentionInsightService";
import { formatCurrencyAmount } from "../utils/currency";
import { isManageRole } from "../utils/permissions";
import OnboardingHintCard from "../components/OnboardingHintCard";
import { localizeNotificationContent } from "../utils/notificationLocalization";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";

/* ======================
   HELPERS
   ====================== */

function hoursLabel(hours, t) {
  if (!Number.isFinite(hours)) return "";
  if (hours >= 24) return t("attentionCenter.meta.daysOpen", { count: Math.floor(hours / 24) });
  return t("attentionCenter.meta.hoursOpen", { count: hours });
}

function dueLabel(days, t) {
  if (!Number.isFinite(days)) return "";
  if (days < 0) return t("attentionCenter.meta.overdueDays", { count: Math.abs(days) });
  if (days === 0) return t("attentionCenter.meta.dueToday");
  return t("attentionCenter.meta.dueInDays", { count: days });
}

function formatCreatedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function localizeOperationalText(value, lang) {
  if (lang !== "de" || !value) return value;
  const replacements = [
    [/Review Overdue rent/gi, "Überfällige Miete prüfen"],
    [/Overdue rent/gi, "Überfällige Miete"],
    [/Finance follow-up/gi, "Finanz-Follow-up"],
    [/Repair stalled without updates/gi, "Reparatur ohne Updates ins Stocken geraten"],
    [/Contractor acknowledgement overdue/gi, "Dienstleisterbestätigung überfällig"],
    [/Compliance calendar not set up/gi, "Compliance-Kalender nicht eingerichtet"],
    [/Long-vacant unit/gi, "Lang leerstehende Einheit"],
    [/urgent items need attention/gi, "dringende Punkte benötigen Aufmerksamkeit"],
    [/Start with/gi, "Beginnen Sie mit"],
    [/amount/gi, "Betrag"],
  ];
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(value));
}

function itemTitle(item, t, lang) {
  if (item.source === "notifications") return localizeNotificationContent(item, t).title;
  if ((item.source === "automation_runs" || item.source === "security_anomaly_alerts") && item.title) {
    if (lang !== "en" && item.kind) return t(`attentionCenter.kind.${item.kind}`);
    return localizeOperationalText(item.title, lang);
  }
  return t(`attentionCenter.kind.${item.kind}`);
}

function itemSubtitle(item, t, lang) {
  const localizedNotification = item.source === "notifications" ? localizeNotificationContent(item, t) : null;
  const parts = [];
  if (item.tenantLabel) parts.push(item.tenantLabel);
  if (item.propertyLabel) parts.push(item.propertyLabel);
  if (item.entityLabel && item.source !== "notifications") parts.push(item.entityLabel);
  if (Number(item.amount || 0) > 0) parts.push(formatCurrencyAmount(item.amount));
  const due = dueLabel(item.dueDays, t);
  const age = hoursLabel(item.ageHours, t);
  if (due) parts.push(due);
  if (age) parts.push(age);
  if (item.contractorLabel) parts.push(`${t("common.contractor")}: ${item.contractorLabel}`);
  if (localizedNotification?.body) parts.push(localizedNotification.body);
  else if (item.body) parts.push(localizeOperationalText(item.body, lang));
  if (item.createdAt) parts.push(formatCreatedAt(item.createdAt));
  return parts.filter(Boolean).join(" • ");
}

function severityBorderClass(severity) {
  if (severity === "urgent") return "border-l-4 border-l-rose-400";
  if (severity === "action") return "border-l-4 border-l-amber-400";
  return "border-l-4 border-l-slate-200";
}

function categoryClasses(category) {
  switch (category) {
    case "finance":     return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "maintenance": return "border-blue-200 bg-blue-50 text-blue-700";
    case "contractor":  return "border-orange-200 bg-orange-50 text-orange-700";
    case "lease":       return "border-violet-200 bg-violet-50 text-violet-700";
    case "compliance":  return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
    case "preventive":  return "border-cyan-200 bg-cyan-50 text-cyan-700";
    case "portfolio":   return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "marketplace": return "border-sky-200 bg-sky-50 text-sky-700";
    case "security":    return "border-rose-200 bg-rose-50 text-rose-700";
    default:            return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function severityClasses(severity) {
  switch (severity) {
    case "urgent": return "border-rose-200 bg-rose-50 text-rose-700";
    case "action": return "border-amber-200 bg-amber-50 text-amber-700";
    default:       return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function isFinancialApprovalItem(item) {
  return item?.kind === "pending_quote_approval" || item?.kind === "invoice_awaiting_approval";
}

const ALL_CATEGORIES = ["finance", "maintenance", "contractor", "lease", "compliance", "preventive", "marketplace", "security"];

/* ======================
   SUB-COMPONENTS
   ====================== */

function CategoryFilter({ active, onChange, counts = {}, t }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("commandCenter.filter.label")}>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
          active == null ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {t("commandCenter.filter.all")} {total > 0 && <span className="ml-1 opacity-70">({total})</span>}
      </button>
      {ALL_CATEGORIES.map((cat) => {
        const count = counts[cat] || 0;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(active === cat ? null : cat)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              active === cat
                ? `${categoryClasses(cat)} ring-1 ring-offset-0`
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t(`commandCenter.category.${cat}`)}
            {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
          </button>
        );
      })}
    </div>
  );
}

function HeroStatCard({ label, value, hint = "", tone = "blue", large = false }) {
  const tones = {
    blue:    "from-blue-600/10 to-cyan-500/10 border-blue-200",
    amber:   "from-amber-500/10 to-orange-500/10 border-amber-200",
    rose:    "from-rose-500/10 to-red-500/10 border-rose-200",
    violet:  "from-violet-500/10 to-indigo-500/10 border-violet-200",
    emerald: "from-emerald-500/10 to-lime-500/10 border-emerald-200",
    indigo:  "from-indigo-500/10 to-sky-500/10 border-indigo-200",
  };
  return (
    <Card className={`border bg-gradient-to-br ${tones[tone] || tones.blue} ${large ? "p-5" : "p-4"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-bold text-slate-900 mt-1 ${large ? "text-3xl" : "text-2xl"}`}>{value}</p>
      {hint ? <p className="text-xs text-slate-500 mt-1">{hint}</p> : null}
    </Card>
  );
}

function ItemCard({ item, t, lang }) {
  const content = (
    <div className={`rounded-lg border border-slate-200 bg-white px-3 py-3 hover:bg-slate-50 ${severityBorderClass(item.severity)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{itemTitle(item, t, lang)}</p>
          <p className="text-xs text-slate-600 mt-0.5">{itemSubtitle(item, t, lang)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1 justify-end shrink-0">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${categoryClasses(item.category)}`}>
            {t(`commandCenter.category.${item.category || "general"}`)}
          </span>
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClasses(item.severity)}`}>
            {t(`commandCenter.severity.${item.severity || "info"}`)}
          </span>
          {item.source === "automation_runs" && (
            <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
              {t("commandCenter.badge.automation")}
            </span>
          )}
          {isFinancialApprovalItem(item) && (
            <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              {t("commandCenter.badge.approval")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
  if (!item.linkPath) return <div key={item.id}>{content}</div>;
  return (
    <Link key={item.id} to={item.linkPath} className="block" data-testid="command-center-item-link">
      {content}
    </Link>
  );
}

function Section({ title, count = 0, items = [], emptyText, tone = "default", t, lang }) {
  const bg = tone === "urgent"
    ? "bg-rose-50/40 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40"
    : tone === "action"
      ? "bg-amber-50/40 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40"
      : "bg-white border border-slate-200";

  return (
    <div className={`rounded-xl ${bg} p-4`}>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {count > 0 && (
          <span className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${
            tone === "urgent" ? "bg-rose-100 text-rose-700" :
            tone === "action" ? "bg-amber-100 text-amber-700" :
            "bg-slate-100 text-slate-600"
          }`}>
            {count}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500 mt-3">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} t={t} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}

function AttentionInsightCard({ insight, loading, expanded, onToggle, onRefresh, t, lang }) {
  if (loading && !insight) {
    return <Skeleton className="h-12" data-testid="attention-insight-card" />;
  }
  if (!insight) return null;

  const priorityClasses = {
    urgent: "border-rose-200 bg-rose-50 text-rose-700",
    high:   "border-amber-200 bg-amber-50 text-amber-700",
    medium: "border-blue-200 bg-blue-50 text-blue-700",
    low:    "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  const sourceLabel = insight.source === "openai" ? t("commandCenter.ai.source.openai") : t("commandCenter.ai.source.fallback");

  return (
    <div data-testid="attention-insight-card" className="rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/60 dark:bg-sky-950/30 overflow-hidden">
      {/* Collapsed strip — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-sky-100/50 transition-colors text-left"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400 shrink-0">
            {t("commandCenter.ai.eyebrow")}
          </span>
          <span className={`shrink-0 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${priorityClasses[insight.priority] || priorityClasses.medium}`}>
            {t(`commandCenter.ai.priority.${insight.priority}`)}
          </span>
          {!expanded && (
            <p className="text-sm text-slate-700 truncate hidden sm:block">
              {localizeOperationalText(insight.summary, lang).slice(0, 100)}
              {insight.summary?.length > 100 ? "…" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-sky-700 font-medium">{expanded ? t("commandCenter.ai.hideInsight") : t("commandCenter.ai.showInsight")}</span>
          <ChevronDown size={16} className={`text-sky-600 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-sky-200 dark:border-sky-900/50 px-4 py-4 bg-white/80 dark:bg-slate-900/80">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                  {t("commandCenter.ai.scope.portfolio")}
                </span>
                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                  {sourceLabel}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-700">{localizeOperationalText(insight.summary, lang)}</p>
              <p className="mt-2 text-xs text-slate-500">
                {t("commandCenter.ai.generatedAt", {
                  time: formatAttentionInsightTimestamp(insight.generatedAt),
                  confidence: t(`commandCenter.ai.confidence.${insight.confidence}`),
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("commandCenter.ai.refresh")}
            </button>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("commandCenter.ai.reasons")}</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {insight.topReasons.map((reason) => (
                  <li key={reason} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    {localizeOperationalText(reason, lang)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("commandCenter.ai.actions")}</p>
              <div className="mt-2 space-y-2">
                {insight.suggestedActions.map((action) => {
                  const content = (
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 transition hover:bg-slate-50">
                      <p className="text-sm font-medium text-slate-900">{localizeOperationalText(action.label, lang)}</p>
                      <p className="mt-1 text-xs text-slate-500">{t(`commandCenter.ai.actionType.${action.actionType}`)}</p>
                    </div>
                  );
                  return action.linkPath ? (
                    <Link key={`${action.entityType}-${action.entityId || action.label}`} to={action.linkPath} className="block" data-testid="attention-insight-action-link">
                      {content}
                    </Link>
                  ) : (
                    <div key={`${action.entityType}-${action.entityId || action.label}`}>{content}</div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ======================
   PAGE
   ====================== */

export default function CommandCenterPage() {
  const { setTitle } = usePageTitle();
  const { lang, t } = useI18n();
  const { activeAccountId, activeRole, isRootOperator } = useAccount();
  const role = useMemo(() => String(activeRole || "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => isManageRole(role, { isRootOperator }), [isRootOperator, role]);

  const [loading, setLoading]           = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [error, setError]               = useState("");
  const [data, setData]                 = useState(null);
  const [insight, setInsight]           = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [insightExpanded, setInsightExpanded] = useState(false);

  useEffect(() => { setTitle(t("commandCenter.pageTitle")); }, [setTitle, t]);

  async function loadData({ forceInsightRefresh = false } = {}) {
    if (!activeAccountId) return;
    setLoading(true);
    setInsightLoading(true);
    setError("");
    try {
      const [dataResult, insightResult] = await Promise.allSettled([
        getCommandCenterData(activeAccountId),
        getAttentionInsight({ accountId: activeAccountId, forceRefresh: forceInsightRefresh }),
      ]);
      if (dataResult.status === "rejected") throw dataResult.reason;
      setData(dataResult.value);
      if (insightResult.status === "fulfilled") setInsight(insightResult.value);
      else setInsight(null);
    } catch (e) {
      setData(null);
      setInsight(null);
      setError(e?.message || t("attentionCenter.error"));
    } finally {
      setLoading(false);
      setInsightLoading(false);
    }
  }

  useEffect(() => {
    if (!activeAccountId || !canManage) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, canManage]);

  useRealtimeTables({
    enabled: !!activeAccountId && canManage,
    subscriptions: [
      { channel: `command-center-payments:${activeAccountId}`, table: "payments", filter: `account_id=eq.${activeAccountId}` },
      { channel: `command-center-requests:${activeAccountId}`, table: "maintenance_requests", filter: `account_id=eq.${activeAccountId}` },
      { channel: `command-center-work-orders:${activeAccountId}`, table: "work_orders", filter: `account_id=eq.${activeAccountId}` },
      { channel: `command-center-work-order-financials:${activeAccountId}`, table: "work_order_financials", filter: `account_id=eq.${activeAccountId}` },
      { channel: `command-center-leases:${activeAccountId}`, table: "leases", filter: `account_id=eq.${activeAccountId}` },
      { channel: `command-center-preventive:${activeAccountId}`, table: "preventive_maintenance_tasks", filter: `account_id=eq.${activeAccountId}` },
      { channel: `command-center-compliance:${activeAccountId}`, table: "compliance_items", filter: `account_id=eq.${activeAccountId}` },
      { channel: `command-center-notifications:${activeAccountId}`, table: "notifications", filter: `account_id=eq.${activeAccountId}` },
      { channel: `command-center-automation-runs:${activeAccountId}`, table: "automation_runs", filter: `account_id=eq.${activeAccountId}` },
      { channel: `command-center-security-alerts:${activeAccountId}`, table: "security_anomaly_alerts", filter: `account_id=eq.${activeAccountId}` },
      { channel: `command-center-tenants:${activeAccountId}`, table: "tenants", filter: `account_id=eq.${activeAccountId}` },
      { channel: `command-center-marketplace:${activeAccountId}`, table: "external_marketplace_jobs", filter: `account_id=eq.${activeAccountId}` },
      { channel: `command-center-properties:${activeAccountId}`, table: "properties", filter: `account_id=eq.${activeAccountId}` },
    ],
    onChange: loadData,
  });

  if (!canManage) {
    return (
      <div className="space-y-4">
        <DashboardBreadcrumbs items={[{ label: t("commandCenter.pageTitle") }]} />
        <Card className="p-6">
          <p className="text-sm text-slate-600">{t("commandCenter.accessDenied")}</p>
        </Card>
      </div>
    );
  }

  const view = data ?? {
    summary: { urgentCount: 0, actionCount: 0, upcomingCount: 0, recentCount: 0, automationCount: 0, propertiesWithIssuesCount: 0, unreadAlertsCount: 0, overdueAmount: 0 },
    groups: { urgent: [], action: [], upcoming: [], recent: [] },
    propertyIssues: [],
  };

  // Per-category item counts for filter pill badges
  const categoryCounts = useMemo(() => {
    const all = [...view.groups.urgent, ...view.groups.action, ...view.groups.upcoming, ...view.groups.recent];
    return ALL_CATEGORIES.reduce((acc, cat) => {
      acc[cat] = all.filter((item) => item.category === cat).length;
      return acc;
    }, {});
  }, [view.groups]);

  // Apply category filter to each group
  function filterGroup(items) {
    return activeCategory ? items.filter((item) => item.category === activeCategory) : items;
  }

  const urgentItems   = filterGroup(view.groups.urgent);
  const actionItems   = filterGroup(view.groups.action);
  const upcomingItems = filterGroup(view.groups.upcoming);
  const recentItems   = filterGroup(view.groups.recent);
  const topIssues     = view.propertyIssues.slice(0, 3);

  return (
    <div className="space-y-4">
      <DashboardBreadcrumbs items={[{ label: t("commandCenter.pageTitle") }]} />

      {/* HEADER */}
      <div className="rounded-xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">{t("dashboard.hub.title")}</p>
        <h2 className="text-lg font-semibold text-white mt-0.5">{t("commandCenter.title")}</h2>
        <p className="text-sm text-slate-300 mt-1">{t("commandCenter.subtitle")}</p>
      </div>

      <OnboardingHintCard
        title={t("pageHints.commandCenter.title")}
        body={t("pageHints.commandCenter.body")}
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          {/* ── SUMMARY STATS ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
            {/* Hero cards — span 2 columns each on xl */}
            <div className="col-span-2">
              <HeroStatCard
                label={t("attentionCenter.summary.urgent")}
                value={view.summary.urgentCount}
                tone="rose"
                large
              />
            </div>
            <div className="col-span-2">
              <HeroStatCard
                label={t("attentionCenter.summary.overdueAmount")}
                value={formatCurrencyAmount(view.summary.overdueAmount)}
                hint={t("attentionCenter.summary.unreadAlerts", { count: view.summary.unreadAlertsCount })}
                tone="rose"
                large
              />
            </div>
            {/* Compact secondary cards */}
            <HeroStatCard label={t("attentionCenter.summary.needsAction")} value={view.summary.actionCount} tone="amber" />
            <HeroStatCard label={t("attentionCenter.summary.upcoming")} value={view.summary.upcomingCount} tone="blue" />
            <HeroStatCard label={t("commandCenter.summary.automation")} value={view.summary.automationCount} tone="indigo" />
            <HeroStatCard label={t("attentionCenter.summary.propertiesWithIssues")} value={view.summary.propertiesWithIssuesCount} tone="emerald" />
          </div>

          {/* ── COMPACT PROPERTY RISK STRIP ────────────────────────────────── */}
          {topIssues.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t("attentionCenter.section.propertiesWithIssues")}
                </p>
                {view.propertyIssues.length > 3 && (
                  <Link to="/properties" className="text-xs text-blue-600 hover:underline">
                    {t("common.viewAll")} ({view.propertyIssues.length}) ↗
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {topIssues.map((row) => (
                  <Link
                    key={row.id || row.label}
                    to={row.linkPath || "/properties"}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm hover:bg-slate-100 transition-colors"
                  >
                    <span className="font-medium text-slate-900 truncate max-w-[140px]">{row.label}</span>
                    {row.score != null && (
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        row.category === "high_risk" ? "bg-rose-100 text-rose-700" :
                        row.category === "attention_needed" ? "bg-amber-100 text-amber-700" :
                        "bg-emerald-100 text-emerald-700"
                      }`}>
                        {row.score}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">↗</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── CATEGORY FILTER ─────────────────────────────────────────────── */}
          <CategoryFilter active={activeCategory} onChange={setActiveCategory} counts={categoryCounts} t={t} />

          {/* ── AI INSIGHT (collapsible) ─────────────────────────────────────── */}
          <AttentionInsightCard
            insight={insight}
            loading={insightLoading}
            expanded={insightExpanded}
            onToggle={() => setInsightExpanded((v) => !v)}
            onRefresh={() => loadData({ forceInsightRefresh: true })}
            t={t}
            lang={lang}
          />

          {/* ── URGENT (full-width, rose tint) ──────────────────────────────── */}
          <Section
            title={t("attentionCenter.section.urgent")}
            count={urgentItems.length}
            items={urgentItems}
            emptyText={t("attentionCenter.empty.urgent")}
            tone="urgent"
            t={t}
            lang={lang}
          />

          {/* ── NEEDS ACTION (full-width, amber tint) ───────────────────────── */}
          <Section
            title={t("attentionCenter.section.needsAction")}
            count={actionItems.length}
            items={actionItems}
            emptyText={t("attentionCenter.empty.needsAction")}
            tone="action"
            t={t}
            lang={lang}
          />

          {/* ── UPCOMING + RECENT (2-col) ───────────────────────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <Section
              title={t("attentionCenter.section.upcoming")}
              count={upcomingItems.length}
              items={upcomingItems}
              emptyText={t("attentionCenter.empty.upcoming")}
              t={t}
              lang={lang}
            />
            <Section
              title={t("attentionCenter.section.recent")}
              count={recentItems.length}
              items={recentItems}
              emptyText={t("attentionCenter.empty.recent")}
              t={t}
              lang={lang}
            />
          </div>

          {/* ── FULL PROPERTY ISSUES GRID ───────────────────────────────────── */}
          {view.propertyIssues.length > 3 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-slate-900">{t("attentionCenter.section.propertiesWithIssues")}</h3>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                {view.propertyIssues.map((row) => (
                  <Link
                    key={row.id || row.label}
                    to={row.linkPath || "/properties"}
                    className="block rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{row.label}</p>
                      {row.score != null && (
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          row.category === "high_risk" ? "border-rose-200 bg-rose-50 text-rose-700" :
                          row.category === "attention_needed" ? "border-amber-200 bg-amber-50 text-amber-700" :
                          "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}>
                          {t("attentionCenter.meta.healthScore", { value: row.score })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {t("attentionCenter.meta.issueCount", { count: row.count })}
                      {row.category ? ` • ${t(`propertyHealth.status.${row.category}`)}` : ""}
                    </p>
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
