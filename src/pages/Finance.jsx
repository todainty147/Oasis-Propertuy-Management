// src/pages/Finance.jsx
import { useEffect } from "react";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAccount } from "../context/AccountContext";
import { can } from "../utils/permissions";

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

  useEffect(() => {
    setTitle("Finanse");
  }, [setTitle]);

  if (loading || accountLoading) return <FinanceSkeleton />;

  // ✅ STAFF: finance visible but read-only
  if (!can(activeRole, "finance", "read")) {
    return (
      <div className="bg-white border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Brak dostępu
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Nie masz uprawnień do przeglądania finansów dla tego konta.
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
          <h1 className="text-2xl font-semibold">Finanse</h1>
          <p className="text-sm text-gray-500">
            Podsumowanie przychodów i płatności
          </p>
        </div>

        {canCreate && (
          <button
            onClick={onAddPayment}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Dodaj płatność
          </button>
        )}
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard label="Otrzymane" value={summary?.totalIncome ?? 0} color="text-green-600" />
        <SummaryCard label="Zaległe" value={summary?.overdueIncome ?? 0} color="text-red-600" />
        <SummaryCard label="Oczekiwane" value={summary?.expectedIncome ?? 0} color="text-blue-600" />
      </div>

      {/* PROPERTY FINANCE */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold">Finanse wg nieruchomości</h2>
        </div>

        {propertyFinance.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Brak danych finansowych.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-6 py-3">Adres</th>
                <th className="px-6 py-3 text-right">Czynsz</th>
                <th className="px-6 py-3 text-right">Opłacone</th>
                <th className="px-6 py-3 text-right">Pozostało</th>
                <th className="px-6 py-3">Status</th>
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
          <h2 className="font-semibold">Płatności</h2>

          {!canCreate && (
            <span className="text-xs text-slate-500">
              Tryb tylko do odczytu
            </span>
          )}
        </div>

        {payments.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Brak płatności dla tego konta.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-6 py-3">Najemca</th>
                <th className="px-6 py-3">Nieruchomość</th>
                <th className="px-6 py-3 text-right">Kwota</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Termin</th>
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
                          if (confirm("Usunąć tę płatność?")) onDeletePayment(p.id);
                        }}
                        className="text-red-600 hover:underline"
                      >
                        Usuń
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
