// src/pages/Finance.jsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { can } from "../utils/permissions";
import { useI18n } from "../context/I18nContext";
import { formatCurrencyAmount } from "../utils/currency";
import { sumDueSoon, sumExpected, sumOverdue, sumPaid } from "../utils/finance";
import OnboardingHintCard from "../components/OnboardingHintCard";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import {
  normalizeOccupancyStatus,
  normalizePaymentStatus,
  occupancyStatusLabelKey,
  paymentStatusLabelKey,
} from "../utils/statuses";

/* ======================
   SKELETONS
   ====================== */

function FinanceSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[96px]" />
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-6 py-4 grid grid-cols-5 gap-4">
              <Skeleton className="h-4 col-span-2" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-6 py-4 grid grid-cols-6 gap-4">
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
              <Skeleton className="h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ======================
   FINANCE
   ====================== */

export default function Finance({
  loading = false,
  summary,
  payments = [],
  propertyFinance = [],
  onAddPayment,
  onDeletePayment,
}) {
  const { accountLoading, activePermissionContext, isRootOperator } = useAccount();
  const { setTitle } = usePageTitle();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [propertyPage, setPropertyPage] = useState(1);
  const [propertyPageSize, setPropertyPageSize] = useState(10);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsPageSize, setPaymentsPageSize] = useState(10);

  useEffect(() => {
    setTitle(t("finance.title"));
  }, [setTitle, t]);

  const canCreate = can(activePermissionContext, "finance", "create");
  const canDelete = can(activePermissionContext, "finance", "delete");
  const canRead = isRootOperator || can(activePermissionContext, "finance", "read");

  const statusFilterValues = useMemo(() => {
    const raw = String(searchParams.get("status") || "").toLowerCase().trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s === "due" ? "pending" : normalizePaymentStatus(s)))
      .filter((s) => s !== "other");
  }, [searchParams]);

  const rangeFilter = useMemo(() => String(searchParams.get("range") || "").toLowerCase(), [searchParams]);
  const bucketFilter = useMemo(() => String(searchParams.get("bucket") || "").toLowerCase(), [searchParams]);

  const filteredPayments = (payments || []).filter((p) => {
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 3600000);
    const s = normalizePaymentStatus(p.status);
    if (statusFilterValues.length > 0 && !statusFilterValues.includes(s)) return false;

    const due = p?.dueDate ? new Date(p.dueDate) : null;
    const hasDue = due && !Number.isNaN(due.getTime());

    if (rangeFilter === "7d") {
      if (!hasDue) return false;
      if (s === "paid") return false;
      if (due < now || due > soon) return false;
    }
    if (rangeFilter === "1d") {
      if (!hasDue) return false;
      if (s === "paid") return false;
      const tomorrow = new Date(now.getTime() + 24 * 3600000);
      if (due < now || due > tomorrow) return false;
    }

    if (bucketFilter) {
      if (!hasDue) return false;
      if (s !== "overdue") return false;
      const days = Math.floor((now.getTime() - due.getTime()) / 86400000);
      if (bucketFilter === "0_7" && (days < 0 || days > 7)) return false;
      if (bucketFilter === "8_30" && (days < 8 || days > 30)) return false;
      if (bucketFilter === "30_plus" && days < 31) return false;
    }

    return true;
  });

  const hasActiveFilters = statusFilterValues.length > 0 || !!rangeFilter || !!bucketFilter;

  const filterSummaryLabel = useMemo(() => {
    if (bucketFilter === "0_7") return t("finance.filtered.bucket0_7");
    if (bucketFilter === "8_30") return t("finance.filtered.bucket8_30");
    if (bucketFilter === "30_plus") return t("finance.filtered.bucket30Plus");
    if (rangeFilter === "1d") return t("finance.filtered.dueToday");
    if (rangeFilter === "7d") return t("finance.filtered.dueSoon");
    if (statusFilterValues.length === 1) {
      const [status] = statusFilterValues;
      if (status === "overdue") return t("finance.filtered.overdue");
      if (status === "pending") return t("finance.filtered.pending");
      if (status === "paid") return t("finance.filtered.paid");
      if (status === "partial") return t("finance.filtered.partial");
    }
    if (statusFilterValues.length > 1) return t("finance.filtered.custom");
    return "";
  }, [bucketFilter, rangeFilter, statusFilterValues, t]);

  const summaryView = useMemo(() => {
    if (!hasActiveFilters) return summary;
    return {
      totalIncome: sumPaid(filteredPayments),
      overdueIncome: sumOverdue(filteredPayments),
      dueSoonIncome: sumDueSoon(filteredPayments, 7),
      outstandingIncome: sumExpected(filteredPayments),
    };
  }, [summary, hasActiveFilters, filteredPayments]);

  const propertyFinanceView = useMemo(() => {
    if (!hasActiveFilters) return propertyFinance || [];
    const ids = new Set(filteredPayments.map((p) => String(p.propertyId)));
    return (propertyFinance || []).filter((pf) => ids.has(String(pf.propertyId)));
  }, [propertyFinance, filteredPayments, hasActiveFilters]);

  const propertyTotalPages = Math.max(1, Math.ceil(propertyFinanceView.length / propertyPageSize));
  const paymentsTotalPages = Math.max(1, Math.ceil(filteredPayments.length / paymentsPageSize));
  const visiblePropertyFinance = useMemo(() => {
    const safePage = Math.min(propertyPage, propertyTotalPages);
    const start = (safePage - 1) * propertyPageSize;
    return propertyFinanceView.slice(start, start + propertyPageSize);
  }, [propertyFinanceView, propertyPage, propertyPageSize, propertyTotalPages]);
  const visiblePayments = useMemo(() => {
    const safePage = Math.min(paymentsPage, paymentsTotalPages);
    const start = (safePage - 1) * paymentsPageSize;
    return filteredPayments.slice(start, start + paymentsPageSize);
  }, [filteredPayments, paymentsPage, paymentsPageSize, paymentsTotalPages]);

  if (loading || accountLoading) return <FinanceSkeleton />;

  if (!canRead) {
    return (
      <div className="space-y-6">
        <DashboardBreadcrumbs items={[{ label: t("finance.title") }]} />
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("finance.noAccessTitle")}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {t("finance.noAccessBody")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DashboardBreadcrumbs items={[{ label: t("finance.title") }]} />
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">{t("finance.title")}</h1>
          <p className="text-sm text-gray-500">
            {t("finance.subtitle")}
          </p>
        </div>

        {canCreate && (
          <button
            onClick={onAddPayment}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            {t("finance.addPayment")}
          </button>
        )}
      </div>

      <OnboardingHintCard
        title={t("onboarding.hints.finance.title")}
        body={t("onboarding.hints.finance.body")}
      />

      {hasActiveFilters ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-medium">{t("finance.filtered.title")}</p>
          <p className="mt-1 text-blue-800">
            {filterSummaryLabel || t("finance.filtered.custom")}
          </p>
        </div>
      ) : null}

      {/* SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          label={t("finance.summary.received")}
          value={summaryView?.totalIncome ?? 0}
          color="text-green-600"
          helper={t("finance.summary.receivedHelper")}
        />
        <SummaryCard
          label={t("finance.summary.overdue")}
          value={summaryView?.overdueIncome ?? 0}
          color="text-red-600"
          helper={t("finance.summary.overdueHelper")}
        />
        <SummaryCard
          label={t("finance.summary.dueSoon")}
          value={summaryView?.dueSoonIncome ?? 0}
          color="text-blue-600"
          helper={t("finance.summary.dueSoonHelper")}
        />
        <SummaryCard
          label={t("finance.summary.outstanding")}
          value={summaryView?.outstandingIncome ?? 0}
          color="text-violet-600"
          helper={t("finance.summary.outstandingHelper")}
        />
      </div>

      {/* PROPERTY FINANCE */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold">{t("finance.byProperty")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("finance.byPropertySubtitle")}</p>
        </div>

        {propertyFinanceView.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">{t("finance.noPropertyData")}</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-6 py-3">{t("finance.table.address")}</th>
                  <th className="px-6 py-3 text-right">{t("finance.table.rent")}</th>
                  <th className="px-6 py-3 text-right">{t("finance.table.paid")}</th>
                  <th className="px-6 py-3 text-right">{t("finance.table.remaining")}</th>
                  <th className="px-6 py-3">{t("finance.table.status")}</th>
                </tr>
              </thead>

              <tbody>
                {visiblePropertyFinance.map((p) => (
                  <tr key={p.propertyId} className="border-t hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <div className="font-medium">{p.address}</div>
                      <div className="text-xs text-gray-500">{p.city}</div>
                    </td>
                    <td className="px-6 py-3 text-right">{formatCurrency(p.rent)}</td>
                    <td className="px-6 py-3 text-right text-green-600">{formatCurrency(p.paid)}</td>
                    <td className="px-6 py-3 text-right text-red-600">{formatCurrency(p.remaining)}</td>
                    <td className="px-6 py-3">
                      <StatusBadge status={p.paymentStatus} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <PaginationFooter
              page={Math.min(propertyPage, propertyTotalPages)}
              totalPages={propertyTotalPages}
              totalCount={propertyFinanceView.length}
              pageSize={propertyPageSize}
              onPrev={() => setPropertyPage((p) => Math.max(1, p - 1))}
              onNext={() => setPropertyPage((p) => Math.min(propertyTotalPages, p + 1))}
              onPageSizeChange={(next) => setPropertyPageSize(next)}
              t={t}
            />
          </>
        )}
      </div>

      {/* PAYMENTS */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{t("payments.title")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("finance.paymentsSubtitle")}</p>
          </div>

          {!canCreate && (
            <span className="text-xs text-slate-500">
              {t("finance.readOnly")}
            </span>
          )}
        </div>

        {filteredPayments.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">{t("finance.noPaymentsForAccount")}</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-6 py-3">{t("finance.table.tenant")}</th>
                  <th className="px-6 py-3">{t("finance.table.property")}</th>
                  <th className="px-6 py-3 text-right">{t("payments.amount")}</th>
                  <th className="px-6 py-3">{t("finance.table.status")}</th>
                  <th className="px-6 py-3">{t("payments.dueDate")}</th>
                  <th className="px-6 py-3 text-right"></th>
                </tr>
              </thead>

              <tbody>
                {visiblePayments.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="px-6 py-3">{p.tenantName ?? "—"}</td>
                    <td className="px-6 py-3">{p.propertyAddress ?? "—"}</td>
                    <td className="px-6 py-3 text-right">{formatCurrency(p.amount)}</td>
                    <td className="px-6 py-3">
                      <StatusBadge status={p.status} t={t} />
                    </td>
                    <td className="px-6 py-3">
                      <div>{formatDate(p.dueDate)}</div>
                      {p.paidAt ? (
                        <div className="text-xs text-slate-500">
                          {t("payments.paidAt")}: {formatDate(p.paidAt)}
                        </div>
                      ) : null}
                    </td>

                    <td className="px-6 py-3 text-right">
                      {canDelete ? (
                        <button
                          onClick={() => {
                            if (confirm(t("finance.confirmDeletePayment"))) onDeletePayment(p.id);
                          }}
                          className="text-red-600 hover:underline"
                        >
                          {t("attachments.delete")}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <PaginationFooter
              page={Math.min(paymentsPage, paymentsTotalPages)}
              totalPages={paymentsTotalPages}
              totalCount={filteredPayments.length}
              pageSize={paymentsPageSize}
              onPrev={() => setPaymentsPage((p) => Math.max(1, p - 1))}
              onNext={() => setPaymentsPage((p) => Math.min(paymentsTotalPages, p + 1))}
              onPageSizeChange={(next) => setPaymentsPageSize(next)}
              t={t}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ======================
   HELPERS
   ====================== */

function SummaryCard({ label, value, color, helper = "" }) {
  return (
    <div className="bg-white border rounded-xl p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>
        {formatCurrency(value)}
      </p>
      {helper ? <p className="mt-2 text-sm text-slate-500">{helper}</p> : null}
    </div>
  );
}

function PaginationFooter({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPrev,
  onNext,
  onPageSizeChange,
  t,
}) {
  if (totalCount <= 0) return null;

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-t px-6 py-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">{t("common.perPage")}</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {[10, 20, 30, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrev}
          className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {t("common.prev")}
        </button>
        <span className="text-sm text-slate-600">
          {t("common.page")} <span className="font-medium text-slate-900">{page}</span> {t("common.of")}{" "}
          <span className="font-medium text-slate-900">{totalPages}</span>
          <span className="ml-2 text-xs text-slate-500">({totalCount} {t("common.total").toLowerCase()})</span>
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={onNext}
          className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {t("common.next")}
        </button>
      </div>
    </div>
  );
}

function translatePaymentStatus(status, t) {
  const labelKey = paymentStatusLabelKey(status);
  if (labelKey) return t(labelKey);
  const occupancyLabelKey = occupancyStatusLabelKey(status);
  if (occupancyLabelKey) return t(occupancyLabelKey);
  return status || "—";
}

function StatusBadge({ status, t }) {
  const normalized = normalizePaymentStatus(status);
  const occupancy = normalizeOccupancyStatus(status);
  const styles =
    normalized === "paid"
      ? "bg-green-100 text-green-700"
      : normalized === "partial"
        ? "bg-amber-100 text-amber-700"
        : normalized === "pending"
          ? "bg-blue-100 text-blue-700"
          : normalized === "overdue"
            ? "bg-red-100 text-red-700"
            : occupancy === "vacant"
              ? "bg-slate-100 text-slate-600"
              : "bg-slate-100 text-slate-600";

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles}`}>
      {translatePaymentStatus(status, t)}
    </span>
  );
}

function formatCurrency(value = 0) {
  return formatCurrencyAmount(value);
}

function formatDate(value) {
  if (!value) return "—";
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return String(value);
  return next.toLocaleDateString();
}
