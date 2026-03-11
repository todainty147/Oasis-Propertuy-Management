import MaintenanceRequestCard from "./MaintenanceRequestCard";

function titleForStatus(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") return "Otwarte";
  if (s === "in_progress") return "W trakcie";
  if (s === "waiting") return "Oczekuje";
  if (s === "resolved") return "Rozwiązane";
  if (s === "closed") return "Zamknięte";
  return status || "Inne";
}

export default function MaintenanceColumn({
  status,
  items = [],
  workOrderByRequestId = {},
  propertyLabelById = {},
  canManage = false,
  busyRequestId = "",
  onCreateWorkOrder,
  onCloseRequest,
  onAddNote,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3 min-h-[240px]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{titleForStatus(status)}</h3>
        <span className="text-xs text-slate-500">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">
          Brak zgłoszeń w tej kolumnie.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((request) => (
            <MaintenanceRequestCard
              key={request.id}
              request={request}
              linkedWorkOrder={workOrderByRequestId[request.id] || null}
              propertyLabel={propertyLabelById[request.property_id] || ""}
              busy={busyRequestId === request.id}
              canManage={canManage}
              onCreateWorkOrder={onCreateWorkOrder}
              onCloseRequest={onCloseRequest}
              onAddNote={onAddNote}
            />
          ))}
        </div>
      )}
    </div>
  );
}
