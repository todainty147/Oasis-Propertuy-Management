import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { getTenantTimeline } from "../services/tenantTimelineService";
import { formatCurrencyAmount } from "../utils/currency";
import {
  filterTenantTimelineItems,
  groupTenantTimelineItems,
  tenantTimelineCategoryForType,
} from "../utils/tenantTimelinePresentation";

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

function categoryTone(category) {
  if (category === "payments") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (category === "maintenance") return "bg-amber-50 text-amber-700 border-amber-200";
  if (category === "documents") return "bg-sky-50 text-sky-700 border-sky-200";
  if (category === "lease") return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function EventCard({ event, targetPath, t }) {
  const category = tenantTimelineCategoryForType(event?.type);
  const card = (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:bg-slate-50">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${categoryTone(category)}`}>
              {t(`tenantTimeline.category.${category}`)}
            </span>
            <span className="text-xs text-slate-500">{fmtDate(event.at)}</span>
          </div>
          <p className="text-sm font-medium text-slate-900">{titleForEvent(event, t)}</p>
          {detailForEvent(event, t) ? (
            <p className="text-sm text-slate-600">{detailForEvent(event, t)}</p>
          ) : null}
        </div>
        {targetPath ? (
          <span className="shrink-0 text-sm font-medium text-blue-700">
            {t("tenantTimeline.openLink")}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (!targetPath) return <div>{card}</div>;
  return (
    <Link to={targetPath} className="block">
      {card}
    </Link>
  );
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

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:flex md:justify-end">
        <button
          type="button"
          className="min-h-[44px] rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          onClick={onPrev}
          disabled={page <= 1}
        >
          {t("common.prev")}
        </button>

        <div className="text-center text-sm text-slate-600">
          {t("common.page")} <span className="font-medium text-slate-900">{page}</span> {t("common.of")}{" "}
          <span className="font-medium text-slate-900">{totalPages}</span>
          <span className="ml-2 text-xs text-slate-500">({totalCount} {t("common.total").toLowerCase()})</span>
        </div>

        <button
          type="button"
          className="min-h-[44px] rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
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

const FILTERS = ["all", "maintenance", "payments", "documents", "lease"];
const GROUP_ORDER = ["today", "yesterday", "last7", "earlier"];

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
  const [filter, setFilter] = useState("all");

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
  }, [tenant?.id, pageSize, filter]);

  const latestItem = items[0] || null;
  const filteredItems = useMemo(() => filterTenantTimelineItems(items, filter), [items, filter]);
  const totalCount = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);
  const groupedItems = groupTenantTimelineItems(pagedItems);

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{t("tenantTimeline.title")}</h3>
          <p className="mt-1 text-sm text-slate-500">
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{t("tenantTimeline.followUp.openRequests")}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{summary.openRequests}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{t("tenantTimeline.followUp.overduePayments")}</p>
          <p className="mt-1 text-xl font-semibold text-rose-600">{summary.overduePayments}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{t("tenantTimeline.followUp.leaseWatch")}</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{summary.leaseWatch}</p>
        </div>
      </div>

      {latestItem ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            {t("tenantTimeline.latestUpdate")}
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{titleForEvent(latestItem, t)}</p>
              {detailForEvent(latestItem, t) ? (
                <p className="mt-1 text-sm text-slate-600">{detailForEvent(latestItem, t)}</p>
              ) : null}
            </div>
            <span className="shrink-0 text-xs text-slate-500">{fmtDate(latestItem.at)}</span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((value) => {
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`min-h-[40px] rounded-full border px-3 py-2 text-sm transition ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t(`tenantTimeline.filter.${value}`)}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 text-sm">
        <p className="text-slate-500">
          {t("tenantTimeline.showingCount", { count: totalCount })}
        </p>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <p className="text-sm text-slate-500">{t(filter === "all" ? "tenantTimeline.empty" : "tenantTimeline.emptyFiltered")}</p>
      ) : (
        <div className="space-y-5">
          {GROUP_ORDER.map((groupKey) => {
            const group = groupedItems[groupKey];
            if (!group?.length) return null;

            return (
              <section key={groupKey} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-semibold text-slate-900">{t(`tenantTimeline.group.${groupKey}`)}</h4>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div className="space-y-3">
                  {group.map((event) => (
                    <EventCard
                      key={event.key}
                      event={event}
                      t={t}
                      targetPath={normalizeLinkForViewer(event, viewer, property)}
                    />
                  ))}
                </div>
              </section>
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
