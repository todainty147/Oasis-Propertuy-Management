import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { supabase } from "../lib/supabase";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { formatCurrencyAmount } from "../utils/currency";

export default function PropertyMaintenanceCostsCard({ accountId, propertyId }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    if (!accountId || !propertyId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await supabase
        .from("work_orders_with_flags")
        .select("id, status, quote_amount, invoice_amount, maintenance_request_id")
        .eq("account_id", accountId)
        .eq("property_id", propertyId);

      if (queryError) throw queryError;
      setRows(data || []);
    } catch (e) {
      setRows([]);
      setError(e?.message || t("propertyDetails.maintenanceCostsLoadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, propertyId]);

  useRealtimeTables({
    enabled: !!accountId && !!propertyId,
    subscriptions: [
      { channel: `property-maint-wo:${propertyId}`, table: "work_orders", filter: `account_id=eq.${accountId}` },
      { channel: `property-maint-fin:${propertyId}`, table: "work_order_financials" },
    ],
    onChange: load,
  });

  const summary = useMemo(() => {
    const finalStatuses = new Set(["completed", "cancelled"]);
    const requestIds = new Set();
    let quoted = 0;
    let invoiced = 0;
    let active = 0;
    let activeCommitted = 0;

    for (const row of rows || []) {
      const quote = Number(row?.quote_amount || 0);
      const invoice = Number(row?.invoice_amount || 0);
      const status = String(row?.status || "").toLowerCase();
      if (row?.maintenance_request_id) requestIds.add(row.maintenance_request_id);

      quoted += Number.isFinite(quote) ? quote : 0;
      invoiced += Number.isFinite(invoice) ? invoice : 0;

      if (!finalStatuses.has(status)) {
        active += 1;
        activeCommitted += Number.isFinite(invoice) && invoice > 0 ? invoice : Number.isFinite(quote) ? quote : 0;
      }
    }

    return {
      requestCount: requestIds.size,
      workOrderCount: rows.length,
      quoted,
      invoiced,
      active,
      activeCommitted,
    };
  }, [rows]);

  if (loading) {
    return (
      <Card className="p-4 bg-slate-50">
        <Skeleton className="h-5 w-40" />
        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-slate-50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {t("propertyDetails.maintenanceCostsTitle")}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {t("propertyDetails.maintenanceCostsSubtitle")}
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-rose-700">{error}</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">{t("propertyDetails.maintenanceRequestsTracked")}</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{summary.requestCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">{t("propertyDetails.maintenanceQuoted")}</p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {formatCurrencyAmount(summary.quoted)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">{t("propertyDetails.maintenanceInvoiced")}</p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {formatCurrencyAmount(summary.invoiced)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">{t("propertyDetails.maintenanceActiveExposure")}</p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {formatCurrencyAmount(summary.activeCommitted)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {t("propertyDetails.maintenanceActiveOrders", { count: summary.active })}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
