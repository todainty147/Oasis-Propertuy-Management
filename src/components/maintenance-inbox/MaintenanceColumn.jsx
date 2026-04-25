import MaintenanceRequestCard from "./MaintenanceRequestCard";
import { useI18n } from "../../context/I18nContext";

function titleForStatus(status, t) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") return t("status.req.open");
  if (s === "in_progress") return t("status.req.in_progress");
  if (s === "waiting") return t("status.req.waiting");
  if (s === "resolved") return t("status.req.resolved");
  if (s === "closed") return t("status.req.closed");
  return status || t("common.other");
}

export default function MaintenanceColumn({
  accountId,
  status,
  items = [],
  totalForStatus = 0,
  workOrdersByRequestId = {},
  propertyLabelById = {},
  canManage = false,
  busyRequestId = "",
  onCreateWorkOrder,
  onCloseRequest,
  onAddNote,
  onSetWaitingReason,
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-3 space-y-3 min-h-[240px] shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <h3 className="text-sm font-semibold text-slate-900">{titleForStatus(status, t)}</h3>
        <div className="text-right">
          <div className="text-xs text-slate-700 font-medium">{totalForStatus}</div>
          <div className="text-[10px] text-slate-500">{t("maintenance.inbox.onPage", { count: items.length })}</div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-4 text-xs text-slate-500">
          {t("maintenance.inbox.emptyColumn")}
        </div>
      ) : (
        <div className="space-y-3 rounded-xl">
          {items.map((request) => (
            <div key={request.id}>
              <MaintenanceRequestCard
                accountId={accountId}
                request={request}
                linkedWorkOrders={workOrdersByRequestId[request.id] || []}
                propertyLabel={propertyLabelById[request.property_id] || ""}
                busy={busyRequestId === request.id}
                canManage={canManage}
                onCreateWorkOrder={onCreateWorkOrder}
                onCloseRequest={onCloseRequest}
                onAddNote={onAddNote}
                onSetWaitingReason={onSetWaitingReason}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
