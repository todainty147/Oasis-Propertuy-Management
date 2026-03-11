import MaintenanceRequestCard from "./MaintenanceRequestCard";

function titleForStatus(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") return "Nowe";
  if (s === "in_progress") return "W trakcie";
  if (s === "waiting") return "Oczekuje";
  if (s === "resolved") return "Zakończone";
  if (s === "closed") return "Zamknięte";
  return status || "Inne";
}

export default function MaintenanceColumn({
  accountId,
  status,
  items = [],
  totalForStatus = 0,
  workOrderByRequestId = {},
  propertyLabelById = {},
  canManage = false,
  busyRequestId = "",
  onCreateWorkOrder,
  onCloseRequest,
  onAddNote,
  onSetWaitingReason,
}) {
  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-slate-100 p-3 space-y-3 min-h-[240px]">
      <div className="flex items-center justify-between border-b border-slate-300 pb-2">
        <h3 className="text-sm font-semibold text-slate-900">{titleForStatus(status)}</h3>
        <div className="text-right">
          <div className="text-xs text-slate-700 font-medium">{totalForStatus}</div>
          <div className="text-[10px] text-slate-500">{items.length} na stronie</div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">
          Brak zgłoszeń w tej kolumnie.
        </div>
      ) : (
        <div className="divide-y divide-slate-300 rounded-xl border border-slate-300 bg-white">
          {items.map((request) => (
            <div key={request.id} className="p-2">
              <MaintenanceRequestCard
                accountId={accountId}
                request={request}
                linkedWorkOrder={workOrderByRequestId[request.id] || null}
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
