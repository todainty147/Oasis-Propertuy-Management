import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { getTenantTimeline } from "../services/tenantTimelineService";
import { formatCurrencyAmount } from "../utils/currency";

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function titleForEvent(event, t) {
  const type = String(event?.type || "");
  return t(`tenantTimeline.type.${type}`) || event?.title || type;
}

function detailForEvent(event, t) {
  const parts = [];
  if (event?.detail) {
    const paymentType = String(event?.type || "").startsWith("payment_");
    parts.push(paymentType && !Number.isNaN(Number(event.detail)) ? formatCurrencyAmount(event.detail) : event.detail);
  }
  if (event?.status) parts.push(t("tenantTimeline.statusWithValue", { value: event.status }));
  return parts.join(" • ");
}

export default function TenantTimelineCard({ accountId, tenant, property }) {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    openRequests: 0,
    overduePayments: 0,
    leaseWatch: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadTimeline() {
    if (!accountId || !tenant?.id) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await getTenantTimeline({ accountId, tenant, property, limit: 40 });
      setItems(result?.items || []);
      setSummary(result?.summary || {
        openRequests: 0,
        overduePayments: 0,
        leaseWatch: 0,
      });
    } catch (e) {
      setItems([]);
      setSummary({
        openRequests: 0,
        overduePayments: 0,
        leaseWatch: 0,
      });
      setError(e?.message || t("tenantTimeline.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, tenant?.id, property?.id]);

  useRealtimeTables({
    enabled: !!accountId && !!tenant?.id,
    subscriptions: [
      { channel: `tenant-timeline-tenants:${tenant?.id}`, table: "tenants", filter: `id=eq.${tenant?.id}` },
      { channel: `tenant-timeline-payments:${tenant?.id}`, table: "payments", filter: `tenant_id=eq.${tenant?.id}` },
      { channel: `tenant-timeline-requests:${tenant?.id}`, table: "maintenance_requests", filter: `reported_by_tenant_id=eq.${tenant?.id}` },
      { channel: `tenant-timeline-work-orders:${tenant?.id}`, table: "work_orders", filter: `account_id=eq.${accountId}` },
      { channel: `tenant-timeline-documents:${tenant?.id}`, table: "documents", filter: `tenant_id=eq.${tenant?.id}` },
      { channel: `tenant-timeline-activity:${tenant?.id}`, table: "activity_log", filter: `account_id=eq.${accountId}` },
      { channel: `tenant-timeline-leases:${tenant?.id}`, table: "leases", filter: `tenant_id=eq.${tenant?.id}` },
    ],
    onChange: loadTimeline,
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t("tenantTimeline.title")}</h3>
          <p className="text-sm text-slate-500 mt-1">{t("tenantTimeline.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={loadTimeline}
          disabled={loading}
          className="px-3 py-2 text-sm rounded-lg border bg-white hover:bg-slate-50 disabled:opacity-50"
        >
          {t("common.refresh")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{t("tenantTimeline.followUp.openRequests")}</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{summary.openRequests}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{t("tenantTimeline.followUp.overduePayments")}</p>
          <p className="text-xl font-semibold text-rose-600 mt-1">{summary.overduePayments}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{t("tenantTimeline.followUp.leaseWatch")}</p>
          <p className="text-xl font-semibold text-slate-900 mt-1">{summary.leaseWatch}</p>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">{t("tenantTimeline.empty")}</p>
      ) : (
        <div className="space-y-3">
          {items.map((event) => {
            const content = (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{titleForEvent(event, t)}</p>
                    {detailForEvent(event, t) ? (
                      <p className="text-sm text-slate-600 mt-1">{detailForEvent(event, t)}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{fmtDate(event.at)}</span>
                </div>
              </div>
            );

            if (!event.linkPath) return <div key={event.key}>{content}</div>;
            return (
              <Link key={event.key} to={event.linkPath} className="block">
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
