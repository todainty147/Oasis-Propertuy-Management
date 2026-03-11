import { Link } from "react-router-dom";
import { useState } from "react";
import MaintenanceTimeline from "./MaintenanceTimeline";

function statusLabel(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") return "Nowe";
  if (s === "in_progress") return "W trakcie";
  if (s === "waiting") return "Oczekuje";
  if (s === "resolved") return "Zakończone";
  if (s === "closed") return "Zamknięte";
  return status || "—";
}

function waitingReasonLabel(waitingReason) {
  const r = String(waitingReason ?? "").toLowerCase();
  if (r === "tenant_response") return "waiting for tenant";
  if (r === "contractor_schedule") return "waiting for contractor";
  if (r === "parts_ordered") return "waiting for materials";
  if (r === "landlord_approval") return "waiting for decision";
  return waitingReason || "";
}

function priorityLabel(priority) {
  const p = String(priority ?? "").toLowerCase();
  if (p === "low") return "Niski";
  if (p === "normal") return "Normalny";
  if (p === "high") return "Wysoki";
  if (p === "critical") return "Krytyczny";
  if (p === "urgent") return "Pilny";
  return priority || "—";
}

function priorityTone(priority) {
  const p = String(priority ?? "").toLowerCase();
  if (p === "urgent" || p === "critical") return "bg-red-100 border-red-300 text-red-700";
  if (p === "high") return "bg-orange-100 border-orange-200 text-orange-700";
  if (p === "low") return "bg-slate-100 border-slate-200 text-slate-600";
  return "bg-slate-100 border-slate-200 text-slate-700";
}

function priorityCardTone(priority) {
  const p = String(priority ?? "").toLowerCase();
  if (p === "urgent" || p === "critical") return "border-red-300 bg-red-50/40";
  if (p === "high") return "border-amber-300 bg-amber-50/30";
  return "border-slate-300 bg-white";
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatAge(createdAt) {
  if (!createdAt) return "—";
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Math.max(0, Date.now() - t);
  const days = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export default function MaintenanceRequestCard({
  accountId,
  request,
  linkedWorkOrder,
  propertyLabel = "",
  busy = false,
  canManage = false,
  onCreateWorkOrder,
  onCloseRequest,
  onAddNote,
  onSetWaitingReason,
}) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const hasAssignedContractor = Boolean(
    linkedWorkOrder?.contractor_user_id ||
      linkedWorkOrder?.contractor_name ||
      linkedWorkOrder?.contractor_phone
  );
  const waitingCtx =
    String(request.status || "").toLowerCase() === "waiting"
      ? waitingReasonLabel(request.waiting_reason)
      : "";

  return (
    <div className={`rounded-xl border-2 p-3 space-y-3 ${priorityCardTone(request.priority)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{request.title || "Bez tytułu"}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {propertyLabel ? `${propertyLabel} • ` : ""}Zgłoszono: {formatDateTime(request.created_at)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Otwarte: {formatAge(request.created_at)}</p>
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
          {waitingCtx ? ` — ${waitingCtx}` : ""}
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

          {linkedWorkOrder && !hasAssignedContractor ? (
            <Link
              to={`/work-orders/${linkedWorkOrder.id}`}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Przypisz wykonawcę
            </Link>
          ) : null}

          {linkedWorkOrder && hasAssignedContractor ? (
            <Link
              to={`/work-orders/${linkedWorkOrder.id}`}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Zobacz zlecenie
            </Link>
          ) : null}

          {String(request.status || "").toLowerCase() !== "closed" && (
            <button
              type="button"
              onClick={() => onCloseRequest(request, linkedWorkOrder || null)}
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

          <button
            type="button"
            onClick={() => onSetWaitingReason(request)}
            disabled={busy}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {String(request.status || "").toLowerCase() === "waiting"
              ? "Edytuj oczekiwanie"
              : "Ustaw oczekiwanie"}
          </button>

          <button
            type="button"
            onClick={() => setTimelineOpen((v) => !v)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            {timelineOpen ? "Ukryj timeline" : "Pokaż timeline"}
          </button>
        </div>
      )}

      {timelineOpen && (
        <MaintenanceTimeline
          accountId={accountId}
          request={request}
          linkedWorkOrder={linkedWorkOrder}
        />
      )}
    </div>
  );
}
