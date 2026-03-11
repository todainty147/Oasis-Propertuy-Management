import { Link } from "react-router-dom";

function statusLabel(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") return "Otwarte";
  if (s === "in_progress") return "W trakcie";
  if (s === "waiting") return "Oczekuje";
  if (s === "resolved") return "Rozwiązane";
  if (s === "closed") return "Zamknięte";
  return status || "—";
}

function priorityLabel(priority) {
  const p = String(priority ?? "").toLowerCase();
  if (p === "low") return "Niski";
  if (p === "normal") return "Normalny";
  if (p === "high") return "Wysoki";
  if (p === "urgent") return "Pilny";
  return priority || "—";
}

function priorityTone(priority) {
  const p = String(priority ?? "").toLowerCase();
  if (p === "urgent") return "bg-rose-50 border-rose-200 text-rose-700";
  if (p === "high") return "bg-amber-50 border-amber-200 text-amber-700";
  if (p === "low") return "bg-slate-50 border-slate-200 text-slate-600";
  return "bg-blue-50 border-blue-200 text-blue-700";
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function MaintenanceRequestCard({
  request,
  linkedWorkOrder,
  propertyLabel = "",
  busy = false,
  canManage = false,
  onCreateWorkOrder,
  onCloseRequest,
  onAddNote,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{request.title || "Bez tytułu"}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {propertyLabel ? `${propertyLabel} • ` : ""}Zgłoszono: {formatDateTime(request.created_at)}
          </p>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded border ${priorityTone(request.priority)}`}>
          {priorityLabel(request.priority)}
        </span>
      </div>

      {request.description ? (
        <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{request.description}</p>
      ) : (
        <p className="text-sm text-slate-400">Brak opisu.</p>
      )}

      <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
        <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50">
          Status: {statusLabel(request.status)}
        </span>
        {linkedWorkOrder ? (
          <span className="px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">
            Zlecenie: {String(linkedWorkOrder.status || "assigned").replaceAll("_", " ")}
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50">Brak zlecenia</span>
        )}
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!linkedWorkOrder && (
            <button
              type="button"
              onClick={() => onCreateWorkOrder(request)}
              disabled={busy}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              Utwórz zlecenie
            </button>
          )}

          {linkedWorkOrder ? (
            <Link
              to={`/work-orders/${linkedWorkOrder.id}`}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Przypisz wykonawcę
            </Link>
          ) : null}

          {String(request.status || "").toLowerCase() !== "closed" && (
            <button
              type="button"
              onClick={() => onCloseRequest(request)}
              disabled={busy}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Zamknij
            </button>
          )}

          <button
            type="button"
            onClick={() => onAddNote(request)}
            disabled={busy}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Dodaj notatkę
          </button>
        </div>
      )}
    </div>
  );
}
