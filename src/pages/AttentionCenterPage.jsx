import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { getAttentionCenterData } from "../services/attentionCenterService";
import { formatCurrencyAmount } from "../utils/currency";

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

function itemTitle(item, t) {
  return t(`attentionCenter.kind.${item.kind}`);
}

function itemSubtitle(item, t) {
  const parts = [];
  if (item.tenantLabel) parts.push(item.tenantLabel);
  if (item.propertyLabel) parts.push(item.propertyLabel);
  if (item.entityLabel) parts.push(item.entityLabel);
  if (Number(item.amount || 0) > 0) parts.push(formatCurrencyAmount(item.amount));
  const due = dueLabel(item.dueDays, t);
  const age = hoursLabel(item.ageHours, t);
  if (due) parts.push(due);
  if (age) parts.push(age);
  if (item.contractorLabel) parts.push(`${t("common.contractor")}: ${item.contractorLabel}`);
  if (item.body) parts.push(item.body);
  return parts.filter(Boolean).join(" • ");
}

function SummaryCard({ label, value, hint = "", tone = "blue" }) {
  const tones = {
    blue: "from-blue-600/10 to-cyan-500/10 border-blue-200",
    amber: "from-amber-500/10 to-orange-500/10 border-amber-200",
    rose: "from-rose-500/10 to-red-500/10 border-rose-200",
    violet: "from-violet-500/10 to-indigo-500/10 border-violet-200",
    emerald: "from-emerald-500/10 to-lime-500/10 border-emerald-200",
  };
  return (
    <Card className={`p-4 border bg-gradient-to-br ${tones[tone] || tones.blue}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      {hint ? <p className="text-xs text-slate-500 mt-1">{hint}</p> : null}
    </Card>
  );
}

function Section({ title, items = [], emptyText, t }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500 mt-3">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((item) => {
            const content = (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">
                <p className="text-sm font-medium text-slate-900">{itemTitle(item, t)}</p>
                <p className="text-xs text-slate-600 mt-1">{itemSubtitle(item, t)}</p>
              </div>
            );
            if (!item.linkPath) return <div key={item.id}>{content}</div>;
            return (
              <Link key={item.id} to={item.linkPath} className="block">
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function AttentionCenterPage() {
  const { setTitle } = usePageTitle();
  const { t } = useI18n();
  const { activeAccountId, activeRole } = useAccount();
  const role = useMemo(() => String(activeRole || "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => ["owner", "admin", "staff"].includes(role), [role]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    setTitle(t("attentionCenter.pageTitle"));
  }, [setTitle, t]);

  async function loadData() {
    if (!activeAccountId) return;
    setLoading(true);
    setError("");
    try {
      const next = await getAttentionCenterData(activeAccountId);
      setData(next);
    } catch (e) {
      setData(null);
      setError(e?.message || t("attentionCenter.error"));
    } finally {
      setLoading(false);
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
      { channel: `attention-center-payments:${activeAccountId}`, table: "payments", filter: `account_id=eq.${activeAccountId}` },
      { channel: `attention-center-requests:${activeAccountId}`, table: "maintenance_requests", filter: `account_id=eq.${activeAccountId}` },
      { channel: `attention-center-work-orders:${activeAccountId}`, table: "work_orders", filter: `account_id=eq.${activeAccountId}` },
      { channel: `attention-center-leases:${activeAccountId}`, table: "leases", filter: `account_id=eq.${activeAccountId}` },
      { channel: `attention-center-preventive:${activeAccountId}`, table: "preventive_maintenance_tasks", filter: `account_id=eq.${activeAccountId}` },
      { channel: `attention-center-compliance:${activeAccountId}`, table: "compliance_items", filter: `account_id=eq.${activeAccountId}` },
      { channel: `attention-center-notifications:${activeAccountId}`, table: "notifications", filter: `account_id=eq.${activeAccountId}` },
      { channel: `attention-center-tenants:${activeAccountId}`, table: "tenants", filter: `account_id=eq.${activeAccountId}` },
    ],
    onChange: loadData,
  });

  if (!canManage) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">{t("attentionCenter.accessDenied")}</p>
      </Card>
    );
  }

  const view = data ?? {
    summary: {
      urgentCount: 0,
      actionCount: 0,
      upcomingCount: 0,
      recentCount: 0,
      propertiesWithIssuesCount: 0,
      unreadAlertsCount: 0,
      overdueAmount: 0,
    },
    groups: { urgent: [], action: [], upcoming: [], recent: [] },
    propertyIssues: [],
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <h2 className="text-lg font-semibold text-white">{t("attentionCenter.title")}</h2>
        <p className="text-sm text-slate-200 mt-1">{t("attentionCenter.subtitle")}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
            <SummaryCard label={t("attentionCenter.summary.urgent")} value={view.summary.urgentCount} tone="rose" />
            <SummaryCard label={t("attentionCenter.summary.needsAction")} value={view.summary.actionCount} tone="amber" />
            <SummaryCard label={t("attentionCenter.summary.upcoming")} value={view.summary.upcomingCount} tone="blue" />
            <SummaryCard label={t("attentionCenter.summary.recent")} value={view.summary.recentCount} tone="violet" />
            <SummaryCard label={t("attentionCenter.summary.propertiesWithIssues")} value={view.summary.propertiesWithIssuesCount} tone="emerald" />
            <SummaryCard
              label={t("attentionCenter.summary.overdueAmount")}
              value={formatCurrencyAmount(view.summary.overdueAmount)}
              hint={t("attentionCenter.summary.unreadAlerts", { count: view.summary.unreadAlertsCount })}
              tone="rose"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <Section
              title={t("attentionCenter.section.urgent")}
              items={view.groups.urgent}
              emptyText={t("attentionCenter.empty.urgent")}
              t={t}
            />
            <Section
              title={t("attentionCenter.section.needsAction")}
              items={view.groups.action}
              emptyText={t("attentionCenter.empty.needsAction")}
              t={t}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <Section
              title={t("attentionCenter.section.upcoming")}
              items={view.groups.upcoming}
              emptyText={t("attentionCenter.empty.upcoming")}
              t={t}
            />
            <Section
              title={t("attentionCenter.section.recent")}
              items={view.groups.recent}
              emptyText={t("attentionCenter.empty.recent")}
              t={t}
            />
          </div>

          <Card className="p-4">
            <h3 className="text-sm font-semibold text-slate-900">{t("attentionCenter.section.propertiesWithIssues")}</h3>
            {view.propertyIssues.length === 0 ? (
              <p className="text-sm text-slate-500 mt-3">{t("attentionCenter.empty.properties")}</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                {view.propertyIssues.map((row) => (
                  <div key={row.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-sm font-medium text-slate-900">{row.label}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {t("attentionCenter.meta.issueCount", { count: row.count })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
