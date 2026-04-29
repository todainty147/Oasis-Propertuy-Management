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
  // canManage, busy, and onCreateWorkOrder kept for API compatibility but
  // the Create Work Order action is now promoted to the card action bar.
}) {
  const { t } = useI18n();
  const items = Array.isArray(workOrders) ? workOrders : [];
  const counts = items.reduce((acc, wo) => {
    const k = statusKey(wo?.status);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-400 text-center">
        {t("maintenance.workOrders.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-slate-700">
          {t("maintenance.workOrders.title", { count: items.length })}
        </h4>
        {items.length > 1 && (
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
            {Object.entries(counts).map(([k, v]) => (
              <span key={k}>
                {v} {statusLabel(k, t)}
              </span>
            ))}
          </div>
        )}
      </div>
      {items.map((wo) => (
        <WorkOrderMiniCard key={wo.id || `${wo.created_at}-${wo.status}`} workOrder={wo} />
      ))}
    </div>
  );
}
