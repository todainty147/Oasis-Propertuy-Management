import { useEffect, useState } from "react";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { fetchMyPayments } from "../services/paymentService";
import { useI18n } from "../context/I18nContext";
import { formatCurrencyAmount } from "../utils/currency";

function statusBadge(status) {
  const base = "text-xs px-2 py-0.5 rounded border";
  if (status === "paid") return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
  if (status === "overdue") return `${base} bg-rose-50 text-rose-700 border-rose-200`;
  return `${base} bg-amber-50 text-amber-700 border-amber-200`; // due
}

export default function TenantPayments() {
  const { activeAccountId, accountLoading } = useAccount();
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  async function load() {
    if (!activeAccountId) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchMyPayments(activeAccountId);
      setRows(data);
    } catch (e) {
      setErr(e?.message ?? t("payments.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accountLoading && activeAccountId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountLoading, activeAccountId]);

  if (accountLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("payments.title")}</h2>
        <p className="text-sm text-slate-500">{t("payments.myPaymentsSubtitle")}</p>
      </div>

      {err && (
        <Card className="p-4 border border-rose-200 bg-rose-50 text-rose-800">
          {err}
        </Card>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <Card className="p-6">
          <p className="text-sm text-slate-600">{t("payments.empty")}</p>
        </Card>
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-white border rounded-xl divide-y">
          {rows.map((p) => (
            <div key={p.id} className="px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{t("payments.amount")}: {formatCurrencyAmount(p.amount)} </p>
                  <span className={statusBadge(p.status)}>{p.status}</span>
                </div>
                <p className="text-sm text-slate-500">
                  {t("payments.dueDate")}: {p.due_date ?? "—"} {p.paid_at ? `• ${t("payments.paidAt")}: ${p.paid_at}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={load}
                className="text-sm text-blue-600 hover:underline"
              >
                {t("common.refresh")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
