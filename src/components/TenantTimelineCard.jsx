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
  const key = `tenantTimeline.type.${type}`;
  const translated = t(key);
  return translated === key ? event?.title || type : translated;
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

function PaginationFooter({ page, totalPages, totalCount, pageSize, onPrev, onNext, onPageSizeChange, t }) {
  if (totalCount <= 0) return null;

  return (
    <div className="flex flex-col gap-3 pt-2 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">{t("common.perPage")}</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
        >
          {[10, 20, 30, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-3 md:justify-end">
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          onClick={onPrev}
          disabled={page <= 1}
        >
          {t("common.prev")}
        </button>

        <div className="text-sm text-slate-600">
          {t("common.page")} <span className="font-medium text-slate-900">{page}</span> {t("common.of")}{" "}
          <span className="font-medium text-slate-900">{totalPages}</span>
          <span className="ml-2 text-xs text-slate-500">({totalCount} {t("common.total").toLowerCase()})</span>
        </div>

        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          onClick={onNext}
          disabled={page >= totalPages}
        >
          {t("common.next")}
        </button>
      </div>
    </div>
  );
}

function normalizeLinkForViewer(event, viewer, property) {
  if (viewer !== "tenant") return event?.linkPath || "";
  const type = String(event?.type || "").toLowerCase();
  if (type.startsWith("payment_")) return "/tenant/payments";
  if (type.startsWith("document_")) return "/documents";
  if (type.includes("maintenance") || type.includes("work_order") || type.includes("request_status") || type.includes("contractor_assigned")) {
    return property?.id ? `/properties/${property.id}` : "";
  }
  return "";
}

export default function TenantTimelineCard({ accountId, tenant, property, viewer = "manager" }) {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    openRequests: 0,
    overduePayments: 0,
    leaseWatch: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function loadTimeline() {
    if (!accountId || !tenant?.id) {
      setItems([]);
      setPage(1);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await getTenantTimeline({ accountId, tenant, property, limit: 120 });
      setItems(result?.items || []);
      setSummary(result?.summary || {
        openRequests: 0,
        overduePayments: 0,
        leaseWatch: 0,
      });
      setPage(1);
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

  useEffect(() => {
    setPage(1);
  }, [tenant?.id, pageSize]);

  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t("tenantTimeline.title")}</h3>
          <p className="text-sm text-slate-500 mt-1">
            {viewer === "tenant" ? t("tenantTimeline.portalSubtitle") : t("tenantTimeline.subtitle")}
          </p>
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
          {pagedItems.map((event) => {
            const content = (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{titleForEvent(event, t)}</p>
                    {detailForEvent(event, t) ? (
                      <p className="mt-1 text-sm text-slate-600">{detailForEvent(event, t)}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{fmtDate(event.at)}</span>
                </div>
              </div>
            );

            const targetPath = normalizeLinkForViewer(event, viewer, property);
            if (!targetPath) return <div key={event.key}>{content}</div>;
            return (
              <Link key={event.key} to={targetPath} className="block">
                {content}
              </Link>
            );
          })}

          <PaginationFooter
            page={safePage}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={pageSize}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setPage(1);
            }}
            t={t}
          />
        </div>
      )}
    </Card>
  );
}
