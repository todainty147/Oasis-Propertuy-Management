// src/pages/Finance.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { can } from "../utils/permissions";
import { useI18n } from "../context/I18nContext";
import {
  DEFAULT_COUNTRY_CODE,
  DEFAULT_CURRENCY,
  formatCurrencyAmount,
  getLocaleForCountry,
} from "../utils/currency";
import OnboardingHintCard from "../components/OnboardingHintCard";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import TenantPaymentCollectionSettingsCard from "../components/finance/TenantPaymentCollectionSettingsCard";
import { getOverdueExpectedChargesSummary } from "../services/expectedChargeService";
import { buildFinancePaymentDisplayRows, isAdjustedFinancePayment } from "../utils/financePayments";
import {
  normalizeOccupancyStatus,
  normalizePaymentStatus,
  occupancyStatusLabelKey,
  paymentStatusLabelKey,
} from "../utils/statuses";
import FinanceActivationDrawer from "../components/finance/FinanceActivationDrawer";
import { BALANCE_REASON_COPY } from "../types/finance";

/* ======================
   SKELETON
   ====================== */

function FinanceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div><Skeleton className="h-8 w-32" /><Skeleton className="h-4 w-64 mt-2" /></div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[96px]" />)}
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b"><Skeleton className="h-5 w-48" /></div>
        <div className="divide-y">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 sm:px-6 py-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
              <Skeleton className="h-4 col-span-2" /><Skeleton className="h-4" /><Skeleton className="h-4" /><Skeleton className="h-4" />
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

const VALID_TABS = ["overview", "payments", "settings"];

export default function Finance({
  loading = false,
  summary,
  payments = [],
  propertyFinance = [],
  onAddPayment,
  onEditPayment,
  onDeletePayment,
  onMarkPaid,
  onVoidPayment,
  onRefresh,
  mutating = false,
  mutationError = null,
}) {
  const navigate = useNavigate();
  const { accountLoading, activeAccountId, activePermissionContext, isRootOperator,
          activeCurrency, activeCountryCode } = useAccount();
  const { setTitle } = usePageTitle();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const [propertyPage, setPropertyPage] = useState(1);
  const [propertyPageSize, setPropertyPageSize] = useState(10);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsPageSize, setPaymentsPageSize] = useState(10);
  const [paymentQuery, setPaymentQuery] = useState("");
  // B-5: inline delete confirmation — stores the payment id pending confirmation
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [pendingVoidId, setPendingVoidId] = useState(null);
  // P0-E: activation drawer — stores the property being activated, or null
  const [activationDrawerProperty, setActivationDrawerProperty] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [overdueCharges, setOverdueCharges] = useState(null);

  useEffect(() => { setTitle(t("finance.title")); }, [setTitle, t]);

  useEffect(() => {
    if (!activeAccountId) return;
    getOverdueExpectedChargesSummary({ accountId: activeAccountId })
      .then(setOverdueCharges)
      .catch(() => {}); // non-critical — silently ignore
  }, [activeAccountId]);

  const canCreate = can(activePermissionContext, "finance", "create");
  // B-1: update permission governs mark-paid (it is an update, not a delete)
  const canUpdate = isRootOperator || can(activePermissionContext, "finance", "update");
  const canReversePayment = isRootOperator || can(activePermissionContext, "finance", "reverse_payment");
  const canDelete = can(activePermissionContext, "finance", "delete");
  const canRead   = isRootOperator || can(activePermissionContext, "finance", "read");
  const canManageCollectionSettings = isRootOperator || can(activePermissionContext, "finance", "update");

  // ── URL-based filter params ──────────────────────────────────────────────────

  const statusFilterValues = useMemo(() => {
    const raw = String(searchParams.get("status") || "").toLowerCase().trim();
    if (!raw) return [];
    return raw.split(",").map((s) => s.trim()).filter(Boolean)
      .map((s) => (s === "due" ? "pending" : normalizePaymentStatus(s)))
      .filter((s) => s !== "other");
  }, [searchParams]);

  const rangeFilter  = useMemo(() => String(searchParams.get("range")  || "").toLowerCase(), [searchParams]);
  const bucketFilter = useMemo(() => String(searchParams.get("bucket") || "").toLowerCase(), [searchParams]);

  const hasActiveFilters = statusFilterValues.length > 0 || !!rangeFilter || !!bucketFilter;

  // ── Tab state ────────────────────────────────────────────────────────────────

  const rawTab    = searchParams.get("tab");
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : (hasActiveFilters ? "payments" : "overview");

  // ── URL helpers ──────────────────────────────────────────────────────────────

  function setTabInUrl(tab) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
    setPendingDeleteId(null);
    setPendingVoidId(null);
    setVoidReason("");
  }

  function setStatusFilter(status) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "payments");
    next.set("status", status);
    next.delete("range");
    next.delete("bucket");
    setSearchParams(next, { replace: true });
  }

  function setRangeFilter(range) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "payments");
    next.set("range", range);
    next.delete("status");
    next.delete("bucket");
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams);
    next.delete("status");
    next.delete("range");
    next.delete("bucket");
    setSearchParams(next, { replace: true });
  }

  function goToPaymentsWithFilter({ status, range } = {}) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "payments");
    if (status) { next.set("status", status); next.delete("range"); next.delete("bucket"); }
    if (range)  { next.set("range",  range);  next.delete("status"); next.delete("bucket"); }
    if (!status && !range) { next.delete("status"); next.delete("range"); next.delete("bucket"); }
    setSearchParams(next, { replace: true });
  }

  // ── Filtered + searched payments ─────────────────────────────────────────────
  // Plain computed values — the React Compiler auto-memoizes these.
  // Date-based range filters are intentionally computed from the current time on
  // each render; explicit useMemo would conflict with the React Compiler purity rules.

  const now  = new Date();
  // Use start-of-today (local midnight) as the lower bound for date-range filters
  // so that payments due *today* are included regardless of their stored time
  // component. This matches the SQL snapshots which use current_date (midnight).
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const soon = new Date(todayStart.getTime() + 8 * 24 * 3600000); // exclusive: midnight day 8
  const propertyFinanceList = useMemo(() => propertyFinance || [], [propertyFinance]);
  const displayPayments = buildFinancePaymentDisplayRows(payments, propertyFinanceList, { today: now });

  const searchedPayments = (displayPayments || []).filter((p) => {
    const s   = normalizePaymentStatus(p.status);
    if (statusFilterValues.length > 0 && !statusFilterValues.includes(s)) return false;
    const due    = p?.dueDate ? new Date(p.dueDate) : null;
    const hasDue = due && !Number.isNaN(due.getTime());
    if (rangeFilter === "7d") {
      if (!hasDue || s === "paid" || due < todayStart || due >= soon) return false;
    }
    if (rangeFilter === "1d") {
      if (!hasDue || s === "paid") return false;
      const tomorrowStart = new Date(todayStart.getTime() + 24 * 3600000);
      if (due < todayStart || due >= tomorrowStart) return false;
    }
    if (bucketFilter) {
      if (!hasDue || s !== "overdue") return false;
      const days = Math.floor((now.getTime() - due.getTime()) / 86400000);
      if (bucketFilter === "0_7"    && (days < 0  || days > 7))  return false;
      if (bucketFilter === "8_30"   && (days < 8  || days > 30)) return false;
      if (bucketFilter === "30_plus" && days < 31)                return false;
    }
    const q = paymentQuery.trim().toLowerCase();
    if (q && !(
      String(p.tenantName || "").toLowerCase().includes(q) ||
      String(p.propertyAddress || "").toLowerCase().includes(q)
    )) return false;
    return true;
  });

  useEffect(() => { setPaymentsPage(1); }, [paymentQuery, statusFilterValues.join(","), rangeFilter, bucketFilter]); // eslint-disable-line react-hooks/exhaustive-deps,react-hooks/set-state-in-effect
  useEffect(() => { setPropertyPage(1); }, [propertyPageSize]); // eslint-disable-line react-hooks/set-state-in-effect

  // ── Filter label ──────────────────────────────────────────────────────────────

  const filterSummaryLabel = useMemo(() => {
    if (bucketFilter === "0_7")    return t("finance.filtered.bucket0_7");
    if (bucketFilter === "8_30")   return t("finance.filtered.bucket8_30");
    if (bucketFilter === "30_plus") return t("finance.filtered.bucket30Plus");
    if (rangeFilter === "1d")      return t("finance.filtered.dueToday");
    if (rangeFilter === "7d")      return t("finance.filtered.dueSoon");
    if (statusFilterValues.length === 1) {
      const [s] = statusFilterValues;
      if (s === "overdue") return t("finance.filtered.overdue");
      if (s === "pending") return t("finance.filtered.pending");
      if (s === "paid")    return t("finance.filtered.paid");
      if (s === "partial") return t("finance.filtered.partial");
    }
    if (statusFilterValues.length > 1) return t("finance.filtered.custom");
    return "";
  }, [bucketFilter, rangeFilter, statusFilterValues, t]);

  // ── Pagination ────────────────────────────────────────────────────────────────

  const propertyTotalPages   = Math.max(1, Math.ceil(propertyFinanceList.length / propertyPageSize));
  const paymentsTotalPages   = Math.max(1, Math.ceil(searchedPayments.length / paymentsPageSize));

  const visiblePropertyFinance = useMemo(() => {
    const safePage = Math.min(propertyPage, propertyTotalPages);
    const start    = (safePage - 1) * propertyPageSize;
    return propertyFinanceList.slice(start, start + propertyPageSize);
  }, [propertyFinanceList, propertyPage, propertyPageSize, propertyTotalPages]);

  const visiblePayments = useMemo(() => {
    const safePage = Math.min(paymentsPage, paymentsTotalPages);
    const start    = (safePage - 1) * paymentsPageSize;
    return searchedPayments.slice(start, start + paymentsPageSize);
  }, [searchedPayments, paymentsPage, paymentsPageSize, paymentsTotalPages]);

  // ── Delete confirmation (I-3: inline two-click, no window.confirm) ───────────

  function handleDeleteClick(paymentId) {
    setPendingDeleteId((prev) => {
      if (prev === paymentId) {
        onDeletePayment(paymentId);
        return null;
      }
      setPendingVoidId(null);
      setVoidReason("");
      return paymentId;
    });
  }

  function handleVoidClick(paymentId) {
    if (pendingVoidId === paymentId) {
      onVoidPayment(paymentId, voidReason.trim());
      setPendingVoidId(null);
      setVoidReason("");
      return;
    }

    setPendingDeleteId(null);
    setVoidReason("");
    setPendingVoidId(paymentId);
  }

  // ── Status pills ──────────────────────────────────────────────────────────────

  const STATUS_PILLS = [
    {
      id: "all",
      label: t("common.all"),
      isActive: !hasActiveFilters,
      onClick: clearFilters,
    },
    {
      id: "paid",
      label: t("payments.status.paid"),
      isActive: statusFilterValues.length === 1 && statusFilterValues[0] === "paid" && !rangeFilter && !bucketFilter,
      onClick: () => setStatusFilter("paid"),
    },
    {
      id: "overdue",
      label: t("payments.status.overdue"),
      isActive: statusFilterValues.length === 1 && statusFilterValues[0] === "overdue" && !rangeFilter && !bucketFilter,
      onClick: () => setStatusFilter("overdue"),
    },
    {
      id: "pending",
      label: t("payments.status.pending"),
      isActive: statusFilterValues.length === 1 && statusFilterValues[0] === "pending" && !rangeFilter && !bucketFilter,
      onClick: () => setStatusFilter("pending"),
    },
    {
      id: "7d",
      label: t("finance.summary.dueSoon"),
      isActive: rangeFilter === "7d" && statusFilterValues.length === 0 && !bucketFilter,
      onClick: () => setRangeFilter("7d"),
    },
  ];

  // ── Early states ──────────────────────────────────────────────────────────────

  if (loading || accountLoading) return <FinanceSkeleton />;

  if (!canRead) {
    return (
      <div className="space-y-6">
        <DashboardBreadcrumbs items={[{ label: t("finance.title") }]} />
        <div className="bg-white border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900">{t("finance.noAccessTitle")}</h2>
          <p className="text-sm text-slate-600 mt-1">{t("finance.noAccessBody")}</p>
        </div>
      </div>
    );
  }

  // ── Tab definitions ───────────────────────────────────────────────────────────

  const TABS = [
    { id: "overview",  label: t("finance.tab.overview")  },
    { id: "payments",  label: t("finance.tab.payments")  },
    { id: "settings",  label: t("finance.tab.settings")  },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <DashboardBreadcrumbs items={[{ label: t("finance.title") }]} />

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("finance.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("finance.subtitle")}</p>
        </div>
        {canCreate && (
          <button
            onClick={onAddPayment}
            className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            {t("finance.addPayment")}
          </button>
        )}
      </div>

      <OnboardingHintCard
        title={t("onboarding.hints.finance.title")}
        body={t("onboarding.hints.finance.body")}
      />

      {/* B-5: global mutation error banner */}
      {mutationError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {mutationError}
        </div>
      )}

      {/* TAB NAV */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex overflow-x-auto" aria-label="Finance sections">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTabInUrl(tab.id)}
              className={`shrink-0 border-b-2 px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* A-5: Restructured summary cards — MTD received + clear overlap note on Total Owed */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <SummaryCard
              label={t("finance.summary.received")}
              value={summary?.totalIncome ?? 0}
              color="text-emerald-600"
              helper={t("finance.summary.receivedHelper")}
              onClick={() => goToPaymentsWithFilter({ status: "paid" })}
              currency={activeCurrency} countryCode={activeCountryCode}
            />
            <SummaryCard
              label={t("finance.summary.overdue")}
              value={summary?.overdueIncome ?? 0}
              color="text-rose-600"
              helper={t("finance.summary.overdueHelper")}
              onClick={() => goToPaymentsWithFilter({ status: "overdue" })}
              accent="rose"
              currency={activeCurrency} countryCode={activeCountryCode}
            />
            <SummaryCard
              label={t("finance.summary.dueSoon")}
              value={summary?.dueSoonIncome ?? 0}
              color="text-blue-600"
              helper={t("finance.summary.dueSoonHelper")}
              onClick={() => goToPaymentsWithFilter({ range: "7d" })}
              currency={activeCurrency} countryCode={activeCountryCode}
            />
            <SummaryCard
              label={t("finance.summary.totalOwed")}
              value={summary?.outstandingIncome ?? 0}
              color="text-violet-600"
              helper={t("finance.summary.totalOwedHelper")}
              onClick={() => goToPaymentsWithFilter()}
              currency={activeCurrency} countryCode={activeCountryCode}
            />
          </div>

          {/* P0: unknown tenancy count notice */}
          {(summary?.unknownTenancyCount ?? 0) > 0 && (
            <div data-testid="finance-unknown-notice" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-medium">
                Balance unavailable for {summary.unknownTenancyCount}{" "}
                {summary.unknownTenancyCount === 1 ? "tenancy" : "tenancies"}
              </span>
              {" — "}
              finance tracking has not been set up. Outstanding totals above exclude these.
            </div>
          )}

          {/* By Property */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b">
              <h2 className="font-semibold text-slate-900">{t("finance.byProperty")}</h2>
              <p className="mt-1 text-sm text-slate-500">{t("finance.byPropertySubtitle")}</p>
            </div>

            {propertyFinanceList.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">{t("finance.noPropertyData")}</p>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="md:hidden divide-y" data-testid="property-finance-cards">
                  {visiblePropertyFinance.map((p) => (
                    <div key={p.propertyId} className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => navigate(`/properties/${p.propertyId}?tab=financials`)}
                        className="w-full text-left"
                      >
                        <p className="text-sm font-semibold text-slate-900">{p.address}</p>
                        {p.city && <p className="mt-0.5 text-xs text-slate-500">{p.city}</p>}
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-slate-400">{t("finance.table.rent")}</p>
                            <p className="mt-0.5 text-sm font-medium text-slate-900">{formatCurrency(p.rent, activeCurrency, activeCountryCode)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-slate-400">{t("finance.table.paid")}</p>
                            <p className="mt-0.5 text-sm font-medium text-emerald-700">
                              {p.balanceState === "known"
                                ? formatCurrency(p.paid, activeCurrency, activeCountryCode)
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-slate-400">{t("finance.table.remaining")}</p>
                            {p.balanceState === "known" ? (
                              <p className="mt-0.5 text-sm font-medium text-rose-600">{formatCurrency(p.remaining, activeCurrency, activeCountryCode)}</p>
                            ) : (
                              <p className="mt-0.5 text-xs text-slate-400 italic">
                                {(p.reasonCode && BALANCE_REASON_COPY[p.reasonCode]?.primary) || "Balance unavailable"}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-slate-400">{t("finance.table.status")}</p>
                            <div className="mt-1"><StatusBadge status={p.paymentStatus} t={t} /></div>
                          </div>
                        </div>
                      </button>
                      {/* P0-E / E-170: ended-tenancy note or activation prompt.
                          Ended tenancies show neutral copy — no balance inference.
                          Active tenancies without tracking show the setup CTA. */}
                      {p.isTenancyEnded ? (
                        <div data-testid="finance-tenancy-ended-note" className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <strong className="font-medium text-slate-700">Tenancy ended</strong>
                          <span className="block mt-0.5">No ongoing balance is being tracked.</span>
                        </div>
                      ) : (
                        p.balanceState !== "known" && p.paymentStatus !== "vacant" && (
                          <button
                            type="button"
                            onClick={() => setActivationDrawerProperty({ id: p.propertyId, address: p.address, city: p.city })}
                            className="mt-3 w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            Set up finance tracking →
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto" data-testid="property-finance-table">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{t("finance.table.address")}</th>
                        <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">{t("finance.table.rent")}</th>
                        <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">{t("finance.table.paid")}</th>
                        <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">{t("finance.table.remaining")}</th>
                        <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{t("finance.table.status")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visiblePropertyFinance.map((p) => (
                        <tr
                          key={p.propertyId}
                          data-testid={`finance-prop-row-${p.propertyId}`}
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                          onClick={() => navigate(`/properties/${p.propertyId}?tab=financials`)}
                        >
                          <td className="px-6 py-3">
                            <div className="font-medium text-slate-900">{p.address}</div>
                            <div className="text-xs text-slate-500">{p.city}</div>
                            {/* P0-E / E-170: ended-tenancy note or activation prompt.
                                Ended tenancies show neutral copy — no balance inference.
                                Active tenancies without tracking show the setup CTA. */}
                            {p.isTenancyEnded ? (
                              <div data-testid="finance-tenancy-ended-note" className="mt-1 text-xs text-slate-500">
                                <strong className="font-medium text-slate-600">Tenancy ended</strong>
                                <span className="block">No ongoing balance is being tracked.</span>
                              </div>
                            ) : (
                              p.balanceState !== "known" && p.paymentStatus !== "vacant" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActivationDrawerProperty({ id: p.propertyId, address: p.address, city: p.city });
                                  }}
                                  className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  Set up finance tracking →
                                </button>
                              )
                            )}
                          </td>
                          <td className="px-6 py-3 text-right text-slate-900">{formatCurrency(p.rent, activeCurrency, activeCountryCode)}</td>
                          <td className="px-6 py-3 text-right font-medium">
                            {p.balanceState === "known"
                              ? <span className="text-emerald-700">{formatCurrency(p.paid, activeCurrency, activeCountryCode)}</span>
                              : <span className="text-slate-400">—</span>
                            }
                          </td>
                          <td data-testid={`finance-remaining-${p.propertyId}`} className="px-6 py-3 text-right font-medium">
                            {p.balanceState === "known"
                              ? <span className="text-rose-600">{formatCurrency(p.remaining, activeCurrency, activeCountryCode)}</span>
                              : <span className="text-xs text-slate-400 italic">
                                  {(p.reasonCode && BALANCE_REASON_COPY[p.reasonCode]?.primary) || "Balance unavailable"}
                                </span>
                            }
                          </td>
                          <td data-testid={`finance-status-${p.propertyId}`} className="px-6 py-3"><StatusBadge status={p.paymentStatus} t={t} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <PaginationFooter
                  page={Math.min(propertyPage, propertyTotalPages)}
                  totalPages={propertyTotalPages}
                  totalCount={propertyFinanceList.length}
                  pageSize={propertyPageSize}
                  onPrev={() => setPropertyPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPropertyPage((p) => Math.min(propertyTotalPages, p + 1))}
                  onPageSizeChange={(next) => setPropertyPageSize(next)}
                  t={t}
                />
              </>
            )}
          </div>

          {/* Rent engine arrears summary — only shown when overdue expected charges exist */}
          {overdueCharges?.count > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                  {t("finance.arrears.title", { count: overdueCharges.count })}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  {overdueCharges.currency} {overdueCharges.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {t("finance.arrears.subtitle")}
                </p>
              </div>
              <Link
                to="/finance/rent-plans?charges=1"
                className="shrink-0 rounded-lg bg-amber-700 px-3 py-2 text-xs font-medium text-white hover:bg-amber-800 transition-colors"
              >
                {t("finance.arrears.cta")}
              </Link>
            </div>
          )}

          {/* Rent Plans entry point */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-900">{t("rentPlans.pageTitle")}</p>
              <p className="text-sm text-slate-500 mt-0.5">{t("rentPlans.pageSubtitle")}</p>
            </div>
            <Link
              to="/finance/rent-plans"
              className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            >
              {t("rentPlans.pageTitle")} →
            </Link>
          </div>
        </div>
      )}

      {/* ── PAYMENTS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === "payments" && (
        <div className="space-y-4">
          {/* Filter banner */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
              <div>
                <span className="font-medium text-blue-900">{t("finance.filtered.title")}: </span>
                <span className="text-blue-800">{filterSummaryLabel || t("finance.filtered.custom")}</span>
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
              >
                {t("finance.clearFilters")}
              </button>
            </div>
          )}

          {/* Search + status pills */}
          <div className="space-y-3">
            <input
              type="text"
              value={paymentQuery}
              onChange={(e) => setPaymentQuery(e.target.value)}
              placeholder={t("finance.searchPayments")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
            <div className="flex flex-wrap gap-2">
              {STATUS_PILLS.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={pill.onClick}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    pill.isActive
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
              {!canCreate && (
                <span className="ml-auto self-center text-xs text-slate-500">{t("finance.readOnly")}</span>
              )}
            </div>
          </div>

          {/* Payments table */}
          <div className="bg-white rounded-xl border overflow-hidden">
            {searchedPayments.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">{t("finance.noPaymentsForAccount")}</p>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="md:hidden divide-y" data-testid="payments-cards">
                  {visiblePayments.map((p) => (
                    <PaymentCard
                      key={p.id}
                      payment={p}
                      activeCurrency={activeCurrency}
                      activeCountryCode={activeCountryCode}
                      canDelete={canDelete}
                      canReversePayment={canReversePayment}
                      canUpdate={canUpdate}
                      mutating={mutating}
                      onEditPayment={onEditPayment}
                      onMarkPaid={onMarkPaid}
                      onVoidPayment={onVoidPayment}
                      pendingDeleteId={pendingDeleteId}
                      pendingVoidId={pendingVoidId}
                      voidReason={voidReason}
                      setVoidReason={setVoidReason}
                      handleDeleteClick={handleDeleteClick}
                      handleVoidClick={handleVoidClick}
                      t={t}
                    />
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto" data-testid="payments-table">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{t("finance.table.tenant")}</th>
                        <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{t("finance.table.property")}</th>
                        <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide text-right">{t("payments.amount")}</th>
                        <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{t("finance.table.status")}</th>
                        <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">{t("payments.dueDate")}</th>
                        <th className="px-6 py-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visiblePayments.map((p) => (
                        <PaymentRow
                          key={p.id}
                          payment={p}
                          activeCurrency={activeCurrency}
                          activeCountryCode={activeCountryCode}
                          canDelete={canDelete}
                          canReversePayment={canReversePayment}
                          canUpdate={canUpdate}
                          mutating={mutating}
                          onEditPayment={onEditPayment}
                          onMarkPaid={onMarkPaid}
                          onVoidPayment={onVoidPayment}
                          pendingDeleteId={pendingDeleteId}
                          pendingVoidId={pendingVoidId}
                          voidReason={voidReason}
                          setVoidReason={setVoidReason}
                          handleDeleteClick={handleDeleteClick}
                          handleVoidClick={handleVoidClick}
                          t={t}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                <PaginationFooter
                  page={Math.min(paymentsPage, paymentsTotalPages)}
                  totalPages={paymentsTotalPages}
                  totalCount={searchedPayments.length}
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
      )}

      {/* ── SETTINGS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === "settings" && (
        <TenantPaymentCollectionSettingsCard
          accountId={activeAccountId}
          canManage={canManageCollectionSettings}
          t={t}
        />
      )}

      {/* P0-E: Finance activation drawer */}
      <FinanceActivationDrawer
        isOpen={activationDrawerProperty !== null}
        onClose={() => setActivationDrawerProperty(null)}
        onActivated={() => {
          onRefresh?.();
          setActivationDrawerProperty(null);
        }}
        property={activationDrawerProperty ?? { id: "", address: "" }}
        currency={activeCurrency}
      />
    </div>
  );
}

function paymentIsVoid(payment) {
  return normalizePaymentStatus(payment?.status) === "void";
}

function paymentIsPaid(payment) {
  return !!payment?.paidAt || normalizePaymentStatus(payment?.status) === "paid";
}

function PaymentActions({
  payment,
  canDelete,
  canReversePayment,
  canUpdate,
  mutating,
  onEditPayment,
  onMarkPaid,
  onVoidPayment,
  pendingDeleteId,
  pendingVoidId,
  voidReason,
  setVoidReason,
  handleDeleteClick,
  handleVoidClick,
  t,
  compact = false,
}) {
  const isVoid = paymentIsVoid(payment);
  const isPaid = paymentIsPaid(payment);
  const canMarkPaid = canUpdate
    && !isAdjustedFinancePayment(payment)
    && !isVoid
    && !isPaid
    && onMarkPaid;
  const canVoid = canReversePayment && isPaid && !isVoid && onVoidPayment;
  const canEditPayment = canUpdate && !isVoid && onEditPayment;
  const canDeletePayment = canDelete && !isPaid && !isVoid;
  const baseClass = compact
    ? "rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50"
    : "rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors";

  return (
    <>
      {canMarkPaid && (
        <button
          data-testid={`mark-paid-${payment.id}`}
          disabled={mutating}
          onClick={() => onMarkPaid(payment.id)}
          className={`${baseClass} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
        >
          {t("payments.markPaid")}
        </button>
      )}
      {canVoid && (
        <>
          {pendingVoidId === payment.id && (
            <input
              type="text"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder={t("payments.voidReasonPlaceholder")}
              className={`${compact ? "col-span-2" : "w-48"} rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-300`}
            />
          )}
          <button
            data-testid={`void-payment-${payment.id}`}
            disabled={mutating || (pendingVoidId === payment.id && !voidReason.trim())}
            onClick={() => handleVoidClick(payment.id)}
            className={`${baseClass} ${
              pendingVoidId === payment.id
                ? "border-amber-400 bg-amber-600 text-white"
                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            {pendingVoidId === payment.id ? t("payments.confirmVoid") : t("payments.void")}
          </button>
        </>
      )}
      {canEditPayment && (
        <button
          onClick={() => onEditPayment(payment)}
          className={`${baseClass} border-slate-200 ${compact ? "bg-slate-50" : "bg-white"} text-slate-700 hover:bg-slate-100`}
        >
          {t("common.edit")}
        </button>
      )}
      {canDeletePayment && (
        <button
          disabled={mutating}
          onClick={() => handleDeleteClick(payment.id)}
          className={`${baseClass} ${
            pendingDeleteId === payment.id
              ? "border-rose-400 bg-rose-600 text-white"
              : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
          }`}
        >
          {pendingDeleteId === payment.id ? t("finance.confirmDeletePayment") : t("attachments.delete")}
        </button>
      )}
      {!canMarkPaid && !canVoid && !canEditPayment && !canDeletePayment && !compact && (
        <span className="text-xs text-slate-400">—</span>
      )}
    </>
  );
}

function PaymentCard({
  payment: p,
  activeCurrency,
  activeCountryCode,
  canDelete,
  canReversePayment,
  canUpdate,
  mutating,
  onEditPayment,
  onMarkPaid,
  onVoidPayment,
  pendingDeleteId,
  pendingVoidId,
  voidReason,
  setVoidReason,
  handleDeleteClick,
  handleVoidClick,
  t,
}) {
  return (
    <div className="px-4 py-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 break-words min-w-0">{p.tenantName ?? "—"}</span>
                        <div className="shrink-0"><StatusBadge status={p.status} t={t} /></div>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{p.propertyAddress ?? "—"}</p>
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">{formatCurrency(p.amount, activeCurrency, activeCountryCode)}</span>
                        {isAdjustedFinancePayment(p) && (
                          <span className="ml-1 text-xs text-slate-500">
                            ({t("tenantDetails.partialCredit", {
                              original: formatCurrency(p.originalAmount, activeCurrency, activeCountryCode),
                              paid: formatCurrency(p.paidAgainstRunningBalance, activeCurrency, activeCountryCode),
                            })})
                          </span>
                        )}
                        <span className="mx-1.5 text-slate-300">·</span>
                        {p.paidAt ? (
                          <span className="text-slate-500">{t("payments.paidAt")}: {formatDate(p.paidAt)}</span>
                        ) : (
                          <span className="text-slate-500">{t("payments.dueDate")}: {formatDate(p.dueDate)}</span>
                        )}
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <PaymentActions
                          payment={p}
                          canDelete={canDelete}
                          canReversePayment={canReversePayment}
                          canUpdate={canUpdate}
                          mutating={mutating}
                          onEditPayment={onEditPayment}
                          onMarkPaid={onMarkPaid}
                          onVoidPayment={onVoidPayment}
                          pendingDeleteId={pendingDeleteId}
                          pendingVoidId={pendingVoidId}
                          voidReason={voidReason}
                          setVoidReason={setVoidReason}
                          handleDeleteClick={handleDeleteClick}
                          handleVoidClick={handleVoidClick}
                          t={t}
                          compact
                        />
                      </div>
                    </div>
  );
}

function PaymentRow({
  payment: p,
  activeCurrency,
  activeCountryCode,
  canDelete,
  canReversePayment,
  canUpdate,
  mutating,
  onEditPayment,
  onMarkPaid,
  onVoidPayment,
  pendingDeleteId,
  pendingVoidId,
  voidReason,
  setVoidReason,
  handleDeleteClick,
  handleVoidClick,
  t,
}) {
  return (
    <tr className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-3 font-medium text-slate-900">{p.tenantName ?? "—"}</td>
                          <td className="px-6 py-3 text-slate-600">{p.propertyAddress ?? "—"}</td>
                          <td className="px-6 py-3 text-right font-semibold text-slate-900">
                            <div>{formatCurrency(p.amount, activeCurrency, activeCountryCode)}</div>
                            {isAdjustedFinancePayment(p) && (
                              <div className="text-xs font-normal text-slate-500">
                                {t("tenantDetails.partialCredit", {
                                  original: formatCurrency(p.originalAmount, activeCurrency, activeCountryCode),
                                  paid: formatCurrency(p.paidAgainstRunningBalance, activeCurrency, activeCountryCode),
                                })}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3"><StatusBadge status={p.status} t={t} /></td>
                          <td className="px-6 py-3 text-slate-600">
                            <div>{formatDate(p.dueDate)}</div>
                            {p.paidAt && (
                              <div className="text-xs text-slate-500">{t("payments.paidAt")}: {formatDate(p.paidAt)}</div>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <PaymentActions
                                payment={p}
                                canDelete={canDelete}
                                canReversePayment={canReversePayment}
                                canUpdate={canUpdate}
                                mutating={mutating}
                                onEditPayment={onEditPayment}
                                onMarkPaid={onMarkPaid}
                                onVoidPayment={onVoidPayment}
                                pendingDeleteId={pendingDeleteId}
                                pendingVoidId={pendingVoidId}
                                voidReason={voidReason}
                                setVoidReason={setVoidReason}
                                handleDeleteClick={handleDeleteClick}
                                handleVoidClick={handleVoidClick}
                                t={t}
                              />
                            </div>
                          </td>
                        </tr>
  );
}

/* ======================
   HELPER COMPONENTS
   ====================== */

function SummaryCard({ label, value, color, helper = "", onClick, accent, currency, countryCode }) {
  const accentBorder = accent === "rose" && value > 0 ? "border-rose-200" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full text-left bg-white border rounded-xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all ${accentBorder}`}
    >
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{formatCurrency(value, currency, countryCode)}</p>
      {helper && <p className="mt-2 text-xs text-slate-600 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-300">{helper}</p>}
      <p className="mt-2 text-xs text-slate-600 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-300" aria-hidden="true">↗</p>
    </button>
  );
}

function PaginationFooter({ page, totalPages, totalCount, pageSize, onPrev, onNext, onPageSizeChange, t }) {
  if (totalCount <= 0) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t px-4 sm:px-6 py-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">{t("common.perPage")}</span>
        <select
          aria-label={t("common.perPage")}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={onPrev} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">
          {t("common.prev")}
        </button>
        <span className="text-sm text-slate-600">
          {t("common.page")} <span className="font-medium text-slate-900">{page}</span>{" "}
          {t("common.of")} <span className="font-medium text-slate-900">{totalPages}</span>
          <span className="ml-2 text-xs text-slate-500">({totalCount} {t("common.total").toLowerCase()})</span>
        </span>
        <button type="button" disabled={page >= totalPages} onClick={onNext} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">
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
  const occupancy  = normalizeOccupancyStatus(status);
  const styles =
    normalized === "paid"    ? "bg-emerald-100 text-emerald-700" :
    normalized === "partial" ? "bg-amber-100 text-amber-700"     :
    normalized === "pending" ? "bg-blue-100 text-blue-700"       :
    normalized === "overdue" ? "bg-rose-100 text-rose-700"       :
    normalized === "void"    ? "bg-slate-200 text-slate-700"     :
    occupancy  === "vacant"  ? "bg-slate-100 text-slate-600"     :
                               "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${styles}`}>
      {translatePaymentStatus(status, t)}
    </span>
  );
}

function formatCurrency(value = 0, currency, countryCode) {
  return formatCurrencyAmount(value, {
    currency: currency || DEFAULT_CURRENCY,
    locale:   getLocaleForCountry(countryCode || DEFAULT_COUNTRY_CODE),
  });
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}
