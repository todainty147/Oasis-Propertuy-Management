import { useState } from "react";
import MaintenanceTimeline from "./MaintenanceTimeline";
import MaintenanceRequestWorkOrders from "./MaintenanceRequestWorkOrders";
import { useI18n } from "../../context/I18nContext";

function statusLabel(status, t) {
  const s = String(status ?? "").toLowerCase();
  if (s === "open") return t("status.req.open");
  if (s === "in_progress") return t("status.req.in_progress");
  if (s === "waiting") return t("status.req.waiting");
  if (s === "resolved") return t("status.req.resolved");
  if (s === "closed") return t("status.req.closed");
  return status || "—";
}

function waitingReasonLabel(waitingReason, t) {
  const r = String(waitingReason ?? "").toLowerCase();
  if (r === "tenant_response") return t("maintenance.waiting.tenant_response");
  if (r === "contractor_schedule") return t("maintenance.waiting.contractor_schedule");
  if (r === "parts_ordered") return t("maintenance.waiting.parts_ordered");
  if (r === "landlord_approval") return t("maintenance.waiting.landlord_approval");
  return waitingReason || "";
}

function priorityLabel(priority, t) {
  const p = String(priority ?? "").toLowerCase();
  if (p === "low") return t("priority.low");
  if (p === "normal") return t("priority.normal");
  if (p === "high") return t("priority.high");
  if (p === "critical") return t("priority.critical");
  if (p === "urgent") return t("priority.urgent");
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

function ageHours(createdAt) {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 3600000));
}

function slaMeta(status, createdAt, t) {
  const s = String(status || "").toLowerCase();
  if (s === "closed" || s === "resolved") {
    return {
      level: "green",
      label: t("maintenance.sla.green"),
      className: "bg-emerald-50 border-emerald-200 text-emerald-700",
    };
  }

  const h = ageHours(createdAt);
  if (h > 48) {
    return {
      level: "red",
      label: t("maintenance.sla.red"),
      className: "bg-rose-50 border-rose-200 text-rose-700",
    };
  }
  if (h > 24) {
    return {
      level: "yellow",
      label: t("maintenance.sla.yellow"),
      className: "bg-amber-50 border-amber-200 text-amber-700",
    };
  }
  return {
    level: "green",
    label: t("maintenance.sla.green"),
    className: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };
}

export default function MaintenanceRequestCard({
  accountId,
  request,
  linkedWorkOrders = [],
  propertyLabel = "",
  busy = false,
  canManage = false,
  onCreateWorkOrder,
  onCloseRequest,
  onAddNote,
  onSetWaitingReason,
}) {
  const { t } = useI18n();
  const [timelineOpen, setTimelineOpen] = useState(false);
  const primaryWorkOrder = linkedWorkOrders[0] || null;
  const finalStatuses = new Set(["completed", "cancelled"]);
  const hasOpenWorkOrders = linkedWorkOrders.some(
    (wo) => !finalStatuses.has(String(wo?.status || "").toLowerCase())
  );
  const closedWorkOrdersCount = linkedWorkOrders.filter((wo) =>
    finalStatuses.has(String(wo?.status || "").toLowerCase())
  ).length;
  const openWorkOrdersCount = linkedWorkOrders.length - closedWorkOrdersCount;
  const waitingCtx =
    String(request.status || "").toLowerCase() === "waiting"
      ? waitingReasonLabel(request.waiting_reason, t)
      : "";
  const sla = slaMeta(request.status, request.created_at, t);

  return (
    <div className={`rounded-xl border-2 p-3 space-y-3 ${priorityCardTone(request.priority)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{request.title || t("maintenance.card.noTitle")}</p>
          <p className="text-xs text-slate-500 mt-0.5">
          {propertyLabel ? `${propertyLabel} • ` : ""}{t("maintenance.card.reportedAt")}: {formatDateTime(request.created_at)}
          </p>
          <div className="mt-0.5 flex items-center flex-wrap gap-2">
            <p className="text-xs text-slate-500">{t("maintenance.card.openFor")}: {formatAge(request.created_at)}</p>
            <span className={`text-[11px] px-2 py-0.5 rounded border ${sla.className}`}>
              {t("maintenance.sla.short")}: {sla.label}
            </span>
          </div>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded border ${priorityTone(request.priority)}`}>
          {priorityLabel(request.priority, t)}
        </span>
      </div>

      {request.description ? (
        <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{request.description}</p>
      ) : (
        <p className="text-sm text-slate-400">{t("maintenance.card.noDescription")}</p>
      )}

      <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
        <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50">
          {t("maintenance.card.status")}: {statusLabel(request.status, t)}
          {waitingCtx ? ` — ${waitingCtx}` : ""}
        </span>
        {linkedWorkOrders.length > 0 ? (
          linkedWorkOrders.length === 1 ? (
            <span className="px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">
              {t("maintenance.card.workOrder")}: {String(primaryWorkOrder?.status || "assigned").replaceAll("_", " ")}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">
              {t("maintenance.card.workOrders")}: {linkedWorkOrders.length} ({closedWorkOrdersCount} {t("maintenance.card.closed")}, {openWorkOrdersCount} {t("maintenance.card.open")})
            </span>
          )
        ) : (
          <span className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50">{t("maintenance.card.noWorkOrders")}</span>
        )}
      </div>

      <MaintenanceRequestWorkOrders
        workOrders={linkedWorkOrders}
        canManage={canManage}
        busy={busy}
        onCreateWorkOrder={() => onCreateWorkOrder(request)}
      />

      {canManage && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {String(request.status || "").toLowerCase() !== "closed" && (
            <button
              type="button"
              onClick={() => onCloseRequest(request, linkedWorkOrders)}
              disabled={busy || hasOpenWorkOrders}
              title={
                hasOpenWorkOrders
                  ? t("maintenance.inbox.closeGuard")
                  : ""
              }
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {t("maintenance.card.close")}
            </button>
          )}

          <button
            type="button"
            onClick={() => onAddNote(request)}
            disabled={busy}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("maintenance.card.addNote")}
          </button>

          {String(request.status || "").toLowerCase() !== "closed" && (
            <button
              type="button"
              onClick={() => onSetWaitingReason(request)}
              disabled={busy}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {String(request.status || "").toLowerCase() === "waiting"
                ? t("maintenance.card.editWaiting")
                : t("maintenance.card.setWaiting")}
            </button>
          )}

          <button
            type="button"
            onClick={() => setTimelineOpen((v) => !v)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            {timelineOpen ? t("maintenance.card.hideTimeline") : t("maintenance.card.showTimeline")}
          </button>
        </div>
      )}

      {canManage && String(request.status || "").toLowerCase() !== "closed" && hasOpenWorkOrders ? (
        <p className="text-[11px] text-amber-700">
          {t("maintenance.inbox.closeGuard")}
        </p>
      ) : null}

      {timelineOpen && (
        <MaintenanceTimeline
          accountId={accountId}
          request={request}
          linkedWorkOrders={linkedWorkOrders}
        />
      )}
    </div>
  );
}
