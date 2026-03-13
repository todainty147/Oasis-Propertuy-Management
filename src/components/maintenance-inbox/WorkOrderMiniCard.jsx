import { Link } from "react-router-dom";

function workOrderStatusLabel(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "assigned") return "Przypisane";
  if (s === "in_progress") return "W trakcie";
  if (s === "completed") return "Zakończone";
  if (s === "cancelled") return "Anulowane";
  return status || "—";
}

function workOrderStatusTone(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s === "cancelled") return "border-slate-300 bg-slate-100 text-slate-600";
  if (s === "in_progress") return "border-blue-200 bg-blue-50 text-blue-700";
  if (s === "assigned") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function fmt(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function WorkOrderMiniCard({ workOrder }) {
  const wo = workOrder || {};
  const contractor = wo.contractor_name || "Nie przypisano";
  const title = wo.title || `Zlecenie ${String(wo.id || "").slice(0, 8)}`;

  return (
    <div className="rounded-lg border border-slate-200 p-3 flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-slate-900 truncate">{title}</p>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className={`px-2 py-0.5 rounded border ${workOrderStatusTone(wo.status)}`}>
            {workOrderStatusLabel(wo.status)}
          </span>
          <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
            Wykonawca: {contractor}
          </span>
          <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
            Utworzono: {fmt(wo.created_at)}
          </span>
        </div>
      </div>

      {wo.id ? (
        <Link
          to={`/work-orders/${wo.id}`}
          className="shrink-0 px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          Otwórz zlecenie
        </Link>
      ) : null}
    </div>
  );
}
