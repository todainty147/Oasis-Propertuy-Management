// src/pages/Finance.jsx
import { useEffect } from "react";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { can } from "../utils/permissions";
import { useI18n } from "../context/I18nContext";

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
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
  const { accountLoading, activeRole } = useAccount();
  const { setTitle } = usePageTitle();
  const { t } = useI18n();

  useEffect(() => {
    setTitle(t("finance.title"));
  }, [setTitle, t]);

  if (loading || accountLoading) return <FinanceSkeleton />;

  // ✅ STAFF: finance visible but read-only
  if (!can(activeRole, "finance", "read")) {
    return (
      <div className="bg-white border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("finance.noAccessTitle")}
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          {t("finance.noAccessBody")}
        </p>
      </div>
    );
  }

  const canCreate = can(activeRole, "finance", "create");
  const canDelete = can(activeRole, "finance", "delete");

  return (
    <div className="space-y-8">
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

      {/* SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard label={t("finance.summary.received")} value={summary?.totalIncome ?? 0} color="text-green-600" />
        <SummaryCard label={t("finance.summary.overdue")} value={summary?.overdueIncome ?? 0} color="text-red-600" />
        <SummaryCard label={t("finance.summary.expected")} value={summary?.expectedIncome ?? 0} color="text-blue-600" />
      </div>

      {/* PROPERTY FINANCE */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold">{t("finance.byProperty")}</h2>
        </div>

        {propertyFinance.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">{t("finance.noPropertyData")}</p>
        ) : (
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
              {propertyFinance.map((p) => (
                <tr key={p.propertyId} className="border-t hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <div className="font-medium">{p.address}</div>
                    <div className="text-xs text-gray-500">{p.city}</div>
                  </td>
                  <td className="px-6 py-3 text-right">{formatCurrency(p.rent)}</td>
                  <td className="px-6 py-3 text-right text-green-600">{formatCurrency(p.paid)}</td>
                  <td className="px-6 py-3 text-right text-red-600">{formatCurrency(p.remaining)}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={p.paymentStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* PAYMENTS */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">{t("payments.title")}</h2>

          {!canCreate && (
            <span className="text-xs text-slate-500">
              {t("finance.readOnly")}
            </span>
          )}
        </div>

        {payments.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">{t("finance.noPaymentsForAccount")}</p>
        ) : (
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
              {payments.map((p) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-6 py-3">{p.tenantName ?? "—"}</td>
                  <td className="px-6 py-3">{p.propertyAddress ?? "—"}</td>
                  <td className="px-6 py-3 text-right">{formatCurrency(p.amount)}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-6 py-3">{p.dueDate}</td>

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
        )}
      </div>
    </div>
  );
}

/* ======================
   HELPERS
   ====================== */

function SummaryCard({ label, value, color }) {
  return (
    <div className="bg-white border rounded-xl p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles =
    status === "Opłacone"
      ? "bg-green-100 text-green-700"
      : status === "Częściowo"
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
}

function formatCurrency(value = 0) {
  return `${Number(value ?? 0).toLocaleString("pl-PL")} zł`;
}
