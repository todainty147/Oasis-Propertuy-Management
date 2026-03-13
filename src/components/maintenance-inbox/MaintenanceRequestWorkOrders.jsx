import WorkOrderMiniCard from "./WorkOrderMiniCard";
import { useI18n } from "../../context/I18nContext";

function statusKey(status) {
  return String(status ?? "").toLowerCase();
}

function statusLabel(status, t) {
  const s = statusKey(status);
  if (s === "assigned") return t("status.wo.assigned").toLowerCase();
  if (s === "in_progress") return t("status.wo.in_progress").toLowerCase();
  if (s === "completed") return t("status.wo.completed").toLowerCase();
  if (s === "cancelled") return t("status.wo.cancelled").toLowerCase();
  return s || t("common.other").toLowerCase();
}

export default function MaintenanceRequestWorkOrders({
  workOrders = [],
  canManage = false,
  busy = false,
  onCreateWorkOrder,
}) {
  const { t } = useI18n();
  const items = Array.isArray(workOrders) ? workOrders : [];
  const counts = items.reduce((acc, wo) => {
    const k = statusKey(wo?.status);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{t("maintenance.workOrders.title", { count: items.length })}</h4>
          <p className="text-xs text-slate-500">{t("maintenance.workOrders.subtitle")}</p>
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={onCreateWorkOrder}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
          >
            {t("maintenance.drawer.create")}
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
          {t("maintenance.workOrders.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {items.length > 1 ? (
            <div className="text-xs text-slate-600 flex flex-wrap gap-3">
              {Object.entries(counts).map(([k, v]) => (
                <span key={k}>
                  {v} {statusLabel(k, t)}
                </span>
              ))}
            </div>
          ) : null}
          {items.map((wo) => (
            <WorkOrderMiniCard key={wo.id || `${wo.created_at}-${wo.status}`} workOrder={wo} />
          ))}
        </div>
      )}
    </div>
  );
}
