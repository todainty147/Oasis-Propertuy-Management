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

function statusAccent(status) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") return "border-t-blue-400";
  if (s === "in_progress") return "border-t-amber-400";
  if (s === "waiting") return "border-t-purple-400";
  if (s === "resolved") return "border-t-emerald-400";
  if (s === "closed") return "border-t-slate-300";
  return "border-t-slate-200";
}

// Mini SLA bar: renders up to 8 colored dots summarising age distribution
function SlaBar({ items }) {
  if (!items.length) return null;
  const dots = items.slice(0, 8).map((item) => {
    const h = item.created_at
      ? Math.max(0, Math.floor((Date.now() - new Date(item.created_at).getTime()) / 3600000))
      : 0;
    const s = String(item.status || "").toLowerCase();
    let color;
    if (s === "closed" || s === "resolved") {
      color = "bg-emerald-400";
    } else if (h > 48) {
      color = "bg-rose-500";
    } else if (h > 24) {
      color = "bg-amber-400";
    } else {
      color = "bg-emerald-400";
    }
    return color;
  });

  return (
    <div className="flex items-center gap-0.5 mt-1">
      {dots.map((color, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${color}`} />
      ))}
    </div>
  );
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
    <div
      className={`rounded-xl border border-slate-200 border-t-4 bg-slate-50 p-3 space-y-3 min-h-[240px] ${statusAccent(
        status,
      )}`}
    >
      <div className="flex items-start justify-between border-b border-slate-200 pb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{titleForStatus(status, t)}</h3>
          <SlaBar items={items} />
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-900">{totalForStatus}</div>
          <div className="text-[10px] text-slate-400">
            {t("maintenance.inbox.onPage", { count: items.length })}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-xs text-slate-400 text-center">
          {t("maintenance.inbox.emptyColumn")}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((request) => (
            <MaintenanceRequestCard
              key={request.id}
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
          ))}
        </div>
      )}
    </div>
  );
}
