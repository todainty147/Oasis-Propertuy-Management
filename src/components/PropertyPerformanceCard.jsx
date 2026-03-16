import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { supabase } from "../lib/supabase";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { formatCurrencyAmount } from "../utils/currency";
import {
  getPropertyFinancialProfile,
  listPropertyOperatingExpenses,
} from "../services/propertyOperationsService";
import { sumExpected, sumOverdue, sumPaid } from "../utils/finance";

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPaidLike(payment) {
  if (!payment) return false;
  if (payment.paidAt) return true;
  return String(payment.status || "").toLowerCase() === "paid" || payment.status === "Opłacone";
}

function isOverdueLike(payment) {
  if (!payment || isPaidLike(payment)) return false;
  const status = String(payment.status || "").toLowerCase();
  if (status === "overdue" || payment.status === "Zaległe") return true;
  const due = toDate(payment.dueDate);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function normalizeRequestStatus(status) {
  const s = String(status || "").toLowerCase();
  if (["closed", "zamkniete", "zamknięte"].includes(s)) return "closed";
  return "open";
}

function normalizeWorkOrderStatus(status) {
  const s = String(status || "").toLowerCase();
  if (["completed", "cancelled", "closed", "zakonczone", "zakończone", "anulowane"].includes(s)) {
    return "final";
  }
  return "active";
}

function toneForAttention({ overdueRent = 0, openRequests = 0, activeWorkOrders = 0 }) {
  if (Number(overdueRent || 0) > 0) return "rose";
  if (Number(openRequests || 0) > 0 || Number(activeWorkOrders || 0) > 0) return "amber";
  return "emerald";
}

function daysAgo(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildRecentMonths(count = 4) {
  const now = new Date();
  const months = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push({
      key: monthKey(d),
      label: d.toLocaleDateString(undefined, { month: "short" }),
      date: d,
    });
  }
  return months;
}

export default function PropertyPerformanceCard({
  accountId,
  property,
  payments = [],
  tenantCount = 0,
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [requestRows, setRequestRows] = useState([]);
  const [workOrderRows, setWorkOrderRows] = useState([]);
  const [operatingExpenseRows, setOperatingExpenseRows] = useState([]);
  const [financialProfile, setFinancialProfile] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    if (!accountId || !property?.id) {
      setRequestRows([]);
      setWorkOrderRows([]);
      setOperatingExpenseRows([]);
      setFinancialProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [requestsRes, workOrdersRes, operatingExpenses, profile] = await Promise.all([
        supabase
          .from("maintenance_requests")
          .select("id, status, created_at")
          .eq("account_id", accountId)
          .eq("property_id", property.id),
        supabase
          .from("work_orders_with_flags")
          .select("id, status, quote_amount, invoice_amount, created_at, updated_at, maintenance_request_id")
          .eq("account_id", accountId)
          .eq("property_id", property.id),
        listPropertyOperatingExpenses({ accountId, propertyId: property.id, limit: 120 }),
        getPropertyFinancialProfile({ accountId, propertyId: property.id }),
      ]);

      if (requestsRes.error) throw requestsRes.error;
      if (workOrdersRes.error) throw workOrdersRes.error;

      setRequestRows(requestsRes.data || []);
      setWorkOrderRows(workOrdersRes.data || []);
      setOperatingExpenseRows(operatingExpenses || []);
      setFinancialProfile(profile || null);
    } catch (e) {
      setRequestRows([]);
      setWorkOrderRows([]);
      setOperatingExpenseRows([]);
      setFinancialProfile(null);
      setError(e?.message || t("propertyDetails.performanceLoadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, property?.id]);

  useRealtimeTables({
    enabled: !!accountId && !!property?.id,
    subscriptions: [
      { channel: `property-performance-payments:${property?.id}`, table: "payments", filter: `account_id=eq.${accountId}` },
      { channel: `property-performance-requests:${property?.id}`, table: "maintenance_requests", filter: `account_id=eq.${accountId}` },
      { channel: `property-performance-workorders:${property?.id}`, table: "work_orders", filter: `account_id=eq.${accountId}` },
      { channel: `property-performance-financials:${property?.id}`, table: "work_order_financials" },
      { channel: `property-performance-tenants:${property?.id}`, table: "tenants", filter: `account_id=eq.${accountId}` },
      { channel: `property-performance-opex:${property?.id}`, table: "property_operating_expenses", filter: `account_id=eq.${accountId}` },
      { channel: `property-performance-fin-profile:${property?.id}`, table: "property_financial_profiles", filter: `account_id=eq.${accountId}` },
    ],
    onChange: load,
  });

  const summary = useMemo(() => {
    const monthlyRent = Number(property?.rent || 0);
    const collectedToDate = sumPaid(payments);
    const overdueRent = sumOverdue(payments);
    const outstandingRent = sumExpected(payments);
    const billedToDate = collectedToDate + outstandingRent;

    let openRequests = 0;
    for (const row of requestRows || []) {
      if (normalizeRequestStatus(row?.status) !== "closed") openRequests += 1;
    }

    let activeWorkOrders = 0;
    let maintenanceInvoiced = 0;
    let maintenanceCommitted = 0;
    let operatingExpenses = 0;
    for (const row of workOrderRows || []) {
      const quote = Number(row?.quote_amount || 0);
      const invoice = Number(row?.invoice_amount || 0);
      const status = normalizeWorkOrderStatus(row?.status);

      maintenanceInvoiced += Number.isFinite(invoice) ? invoice : 0;

      if (status === "active") {
        activeWorkOrders += 1;
        maintenanceCommitted += Number.isFinite(invoice) && invoice > 0
          ? invoice
          : Number.isFinite(quote) ? quote : 0;
      }
    }

    for (const row of operatingExpenseRows || []) {
      operatingExpenses += Number(row?.amount || 0);
    }

    const totalOperatingCosts = maintenanceInvoiced + operatingExpenses;
    const netOperatingSnapshot = collectedToDate - totalOperatingCosts;
    const occupancyStatus = tenantCount > 0 ? "occupied" : "vacant";
    const attentionTone = toneForAttention({ overdueRent, openRequests, activeWorkOrders });
    const annualizedRent = monthlyRent > 0 ? monthlyRent * 12 : 0;
    const grossYield =
      Number(financialProfile?.estimated_market_value || 0) > 0 && annualizedRent > 0
        ? (annualizedRent / Number(financialProfile.estimated_market_value)) * 100
        : null;

    let attentionLabel = t("propertyDetails.performanceHealthy");
    if (overdueRent > 0) attentionLabel = t("propertyDetails.performanceOverdueAttention");
    else if (openRequests > 0 || activeWorkOrders > 0) attentionLabel = t("propertyDetails.performanceOperationalAttention");

    return {
      monthlyRent,
      billedToDate,
      collectedToDate,
      overdueRent,
      outstandingRent,
      openRequests,
      activeWorkOrders,
      maintenanceInvoiced,
      maintenanceCommitted,
      operatingExpenses,
      totalOperatingCosts,
      netOperatingSnapshot,
      occupancyStatus,
      attentionTone,
      attentionLabel,
      annualizedRent,
      estimatedMarketValue: Number(financialProfile?.estimated_market_value || 0),
      grossYield,
    };
  }, [financialProfile?.estimated_market_value, operatingExpenseRows, payments, property?.rent, requestRows, tenantCount, t, workOrderRows]);

  const trendView = useMemo(() => {
    const windows = [30, 90].map((days) => {
      const cutoff = daysAgo(days);
      const inWindow = (payments || []).filter((payment) => {
        const due = toDate(payment?.dueDate);
        return due && due >= cutoff;
      });
      const billed = inWindow.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const collected = inWindow
        .filter(isPaidLike)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const overdue = inWindow
        .filter(isOverdueLike)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      return {
        days,
        billed,
        collected,
        overdue,
        collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : null,
      };
    });

    const requests30 = (requestRows || []).filter((row) => {
      const created = toDate(row?.created_at);
      return created && created >= daysAgo(30);
    }).length;
    const requests90 = (requestRows || []).filter((row) => {
      const created = toDate(row?.created_at);
      return created && created >= daysAgo(90);
    }).length;

    const months = buildRecentMonths(4);
    const monthlyMaintenance = months.map((month) => {
      const start = startOfMonth(month.date);
      const end = new Date(month.date.getFullYear(), month.date.getMonth() + 1, 1);
      let amount = 0;
      for (const row of workOrderRows || []) {
        const basis = toDate(row?.updated_at || row?.created_at);
        if (!basis || basis < start || basis >= end) continue;
        amount += Number(row?.invoice_amount || 0);
      }
      return {
        ...month,
        amount,
      };
    });

    const maxMaintenanceAmount = Math.max(1, ...monthlyMaintenance.map((row) => Number(row.amount || 0)));

    const flags = [];
    if (requests90 >= 3) {
      flags.push({
        key: "repeat-maintenance",
        tone: "amber",
        label: t("propertyDetails.performanceFlagRepeatMaintenance"),
      });
    }
    if ((summary.totalOperatingCosts >= summary.monthlyRent && summary.monthlyRent > 0) || summary.maintenanceCommitted >= summary.monthlyRent) {
      flags.push({
        key: "high-cost-unit",
        tone: "rose",
        label: t("propertyDetails.performanceFlagHighCost"),
      });
    }
    if (summary.overdueRent > 0) {
      flags.push({
        key: "rent-at-risk",
        tone: "rose",
        label: t("propertyDetails.performanceFlagRentRisk"),
      });
    }
    if (flags.length === 0) {
      flags.push({
        key: "stable",
        tone: "emerald",
        label: t("propertyDetails.performanceFlagStable"),
      });
    }

    return {
      windows,
      requests30,
      requests90,
      monthlyMaintenance,
      maxMaintenanceAmount,
      flags,
    };
  }, [payments, requestRows, summary.maintenanceCommitted, summary.monthlyRent, summary.overdueRent, summary.totalOperatingCosts, t, workOrderRows]);

  if (loading) {
    return (
      <Card className="p-4 bg-slate-50">
        <Skeleton className="h-5 w-52" />
        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, idx) => (
            <Skeleton key={idx} className="h-16" />
          ))}
        </div>
      </Card>
    );
  }

  const toneClasses =
    summary.attentionTone === "rose"
      ? "border-rose-200 bg-rose-50/50 text-rose-700"
      : summary.attentionTone === "amber"
        ? "border-amber-200 bg-amber-50/50 text-amber-700"
        : "border-emerald-200 bg-emerald-50/50 text-emerald-700";

  return (
    <Card className="p-4 bg-slate-50">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {t("propertyDetails.performanceTitle")}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {t("propertyDetails.performanceSubtitle")}
          </p>
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${toneClasses}`}>
          {summary.attentionLabel}
        </span>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-rose-700">{error}</p>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceMonthlyRent")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrencyAmount(summary.monthlyRent)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceCollected")}</p>
              <p className="text-lg font-bold text-emerald-700 mt-1">{formatCurrencyAmount(summary.collectedToDate)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceOverdue")}</p>
              <p className="text-lg font-bold text-rose-700 mt-1">{formatCurrencyAmount(summary.overdueRent)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceOutstanding")}</p>
              <p className="text-lg font-bold text-amber-700 mt-1">{formatCurrencyAmount(summary.outstandingRent)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceOccupancy")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{t(`status.${summary.occupancyStatus}`)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceOpenRequests")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{summary.openRequests}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceActiveWorkOrders")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{summary.activeWorkOrders}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceMaintenanceInvoiced")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrencyAmount(summary.maintenanceInvoiced)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceBilledToDate")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrencyAmount(summary.billedToDate)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceMaintenanceCommitted")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrencyAmount(summary.maintenanceCommitted)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceOperatingExpenses")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrencyAmount(summary.operatingExpenses)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceTotalOperatingCosts")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrencyAmount(summary.totalOperatingCosts)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceEstimatedValue")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {summary.estimatedMarketValue > 0 ? formatCurrencyAmount(summary.estimatedMarketValue) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceGrossYield")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {summary.grossYield != null ? `${summary.grossYield.toFixed(2)}%` : "—"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceNetOperating")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrencyAmount(summary.netOperatingSnapshot)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("propertyDetails.performanceAnnualizedRent")}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrencyAmount(summary.annualizedRent)}</p>
              <p className="text-xs text-slate-500 mt-1">{t("propertyDetails.performanceAnnualizedRentHint")}</p>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            {t("propertyDetails.performanceFootnote")}
          </p>

          <div className="border-t border-slate-200 pt-4 space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">{t("propertyDetails.performanceTrendsTitle")}</h4>
              <p className="text-xs text-slate-500 mt-1">{t("propertyDetails.performanceTrendsSubtitle")}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {trendView.windows.map((window) => (
                <div key={window.days} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">
                      {t("propertyDetails.performanceCollectionWindow", { days: window.days })}
                    </p>
                    <span className="text-xs text-slate-500">
                      {window.collectionRate == null
                        ? t("propertyDetails.performanceNoBilling")
                        : t("propertyDetails.performanceCollectionRate", { value: window.collectionRate })}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">{t("propertyDetails.performanceBilled")}</p>
                      <p className="font-semibold text-slate-900 mt-1">{formatCurrencyAmount(window.billed)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">{t("propertyDetails.performanceCollectedShort")}</p>
                      <p className="font-semibold text-emerald-700 mt-1">{formatCurrencyAmount(window.collected)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">{t("propertyDetails.performanceOverdueShort")}</p>
                      <p className="font-semibold text-rose-700 mt-1">{formatCurrencyAmount(window.overdue)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">{t("propertyDetails.performanceMaintenanceTrend")}</p>
                  <span className="text-xs text-slate-500">{t("propertyDetails.performanceLastMonths")}</span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 items-end">
                  {trendView.monthlyMaintenance.map((month) => {
                    const height = Math.max(12, Math.round((Number(month.amount || 0) / trendView.maxMaintenanceAmount) * 96));
                    return (
                      <div key={month.key} className="text-center">
                        <div className="mx-auto flex h-28 w-full max-w-[56px] items-end justify-center rounded-lg bg-slate-100">
                          <div
                            className="w-8 rounded-t-md bg-gradient-to-t from-rose-500 to-amber-400"
                            style={{ height }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{month.label}</p>
                        <p className="text-xs font-medium text-slate-900">{formatCurrencyAmount(month.amount, { maximumFractionDigits: 0 })}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-medium text-slate-900">{t("propertyDetails.performanceIssueFrequency")}</p>
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">{t("propertyDetails.performanceIssues30")}</p>
                    <p className="text-lg font-bold text-slate-900 mt-1">{trendView.requests30}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">{t("propertyDetails.performanceIssues90")}</p>
                    <p className="text-lg font-bold text-slate-900 mt-1">{trendView.requests90}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">{t("propertyDetails.performanceAttentionFlags")}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {trendView.flags.map((flag) => {
                        const tone =
                          flag.tone === "rose"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : flag.tone === "amber"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700";
                        return (
                          <span key={flag.key} className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
                            {flag.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
