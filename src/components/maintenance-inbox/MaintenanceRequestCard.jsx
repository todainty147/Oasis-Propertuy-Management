import { useEffect, useState } from "react";
import MaintenanceTimeline from "./MaintenanceTimeline";
import MaintenanceRequestWorkOrders from "./MaintenanceRequestWorkOrders";
import { useI18n } from "../../context/I18nContext";
import Skeleton from "../ui/Skeleton";
import { formatAttentionInsightTimestamp } from "../../services/attentionInsightService";
import { getMaintenanceTriageInsight } from "../../services/maintenanceTriageInsightService";

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
  if (p === "urgent" || p === "critical") return "bg-rose-950/70 border-rose-500/70 text-rose-100";
  if (p === "high") return "bg-amber-950/70 border-amber-500/70 text-amber-100";
  if (p === "low") return "bg-slate-800 border-slate-700 text-slate-300";
  return "bg-slate-800 border-slate-700 text-slate-200";
}

function priorityCardTone(priority) {
  const p = String(priority ?? "").toLowerCase();
  if (p === "urgent" || p === "critical") return "border-rose-500/70 bg-slate-900 ring-1 ring-rose-400/20";
  if (p === "high") return "border-amber-500/70 bg-slate-900 ring-1 ring-amber-400/15";
  return "border-slate-700 bg-slate-900";
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
      className: "bg-emerald-950/60 border-emerald-700 text-emerald-100",
    };
  }

  const h = ageHours(createdAt);
  if (h > 48) {
    return {
      level: "red",
      label: t("maintenance.sla.red"),
      className: "bg-rose-950/70 border-rose-700 text-rose-100",
    };
  }
  if (h > 24) {
    return {
      level: "yellow",
      label: t("maintenance.sla.yellow"),
      className: "bg-amber-950/70 border-amber-700 text-amber-100",
    };
  }
  return {
    level: "green",
    label: t("maintenance.sla.green"),
    className: "bg-emerald-950/60 border-emerald-700 text-emerald-100",
  };
}

function MaintenanceTriageCard({ accountId, request, canManage, t }) {
  const requestStatus = String(request?.status || "").toLowerCase();
  const shouldLoad = canManage && request?.id && !["closed", "resolved"].includes(requestStatus);
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState(null);
  const [error, setError] = useState("");
  const [factsOpen, setFactsOpen] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);

  async function loadInsight(forceRefresh = false) {
    if (!shouldLoad) return;
    setLoading(true);
    setError("");
    try {
      const nextInsight = await getMaintenanceTriageInsight({
        accountId,
        requestId: request.id,
        forceRefresh,
      });
      setInsight(nextInsight);
    } catch (nextError) {
      setError(nextError?.message || t("maintenance.ai.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!shouldLoad) {
      setInsight(null);
      setError("");
      setLoading(false);
      setFactsOpen(false);
      setDraftsOpen(false);
      return;
    }
    loadInsight(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldLoad, accountId, request?.id]);

  if (!shouldLoad) return null;

  const urgencyClasses = {
    low: "border-slate-700 bg-slate-800 text-slate-200",
    normal: "border-blue-700 bg-blue-950/60 text-blue-200",
    high: "border-amber-600 bg-amber-950/60 text-amber-100",
    urgent: "border-rose-600 bg-rose-950/70 text-rose-100",
  };

  if (loading && !insight) {
    return (
      <div data-testid={`maintenance-triage-card-${request.id}`}>
        <Skeleton className="h-40 bg-slate-800/80" />
      </div>
    );
  }

  return (
    <div
      data-testid={`maintenance-triage-card-${request.id}`}
      className="rounded-xl border border-cyan-900/70 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-3 shadow-sm space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
              {t("maintenance.ai.eyebrow")}
            </span>
            {insight ? (
              <>
                <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${urgencyClasses[insight.urgency] || urgencyClasses.normal}`}>
                  {t(`maintenance.ai.urgency.${insight.urgency}`)}
                </span>
                <span className="inline-flex rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300">
                  {insight.source === "openai" ? t("maintenance.ai.source.openai") : t("maintenance.ai.source.fallback")}
                </span>
                {insight.safetyFlag ? (
                  <span className="inline-flex rounded-full border border-rose-500/60 bg-rose-950/60 px-2 py-1 text-[11px] font-medium text-rose-100">
                    {t("maintenance.ai.safetyFlag")}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
          <h4 className="mt-2 text-sm font-semibold text-slate-100">{t("maintenance.ai.title")}</h4>
          <p className="mt-1 text-xs text-slate-400">
            {t("maintenance.ai.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadInsight(true)}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-60"
        >
          {t("maintenance.ai.refresh")}
        </button>
      </div>

      {error && !insight ? (
        <div className="rounded-lg border border-amber-500/50 bg-amber-950/50 px-3 py-2 text-xs text-amber-100">
          {error}
        </div>
      ) : null}

      {insight ? (
        <>
          <div className="grid gap-2">
            <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {t("maintenance.ai.summary")}
              </p>
              <p className="mt-2 text-sm font-medium text-slate-100 break-words">
                {insight.category.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-sm text-slate-300 break-words">{insight.suggestedTrade}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {t("maintenance.ai.generatedLabel")}
              </p>
              <p className="mt-2 text-sm text-slate-200">
                {formatAttentionInsightTimestamp(insight.generatedAt)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {t("maintenance.ai.generatedConfidence", {
                  confidence: t(`maintenance.ai.confidence.${insight.confidence}`),
                })}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFactsOpen((open) => !open)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
            >
              {factsOpen ? t("maintenance.ai.hideFacts") : t("maintenance.ai.showFacts")}
            </button>
            <button
              type="button"
              onClick={() => setDraftsOpen((open) => !open)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
            >
              {draftsOpen ? t("maintenance.ai.hideDrafts") : t("maintenance.ai.showDrafts")}
            </button>
          </div>

          {factsOpen ? (
            <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("maintenance.ai.facts")}
              </p>
              <ul className="mt-2 space-y-2 text-sm text-slate-200">
                {(insight.factsUsed || []).map((fact) => (
                  <li key={fact} className="flex gap-2 break-words">
                    <span className="text-slate-500">•</span>
                    <span className="min-w-0 break-words">{fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {draftsOpen ? (
            <div className="grid gap-3">
              <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("maintenance.ai.tenantAcknowledgement")}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-200 break-words">{insight.tenantAcknowledgement}</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t("maintenance.ai.managerNote")}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-200 break-words">{insight.managerNote}</p>
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
            <p className="text-xs text-slate-400">
              {t("maintenance.ai.generatedAt", {
                value: formatAttentionInsightTimestamp(insight.generatedAt),
                confidence: t(`maintenance.ai.confidence.${insight.confidence}`),
              })}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
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
    <div className={`rounded-xl border-2 p-3 space-y-3 shadow-sm ${priorityCardTone(request.priority)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 break-words">{request.title || t("maintenance.card.noTitle")}</p>
          <p className="text-xs text-slate-400 mt-1 break-words">
          {propertyLabel ? `${propertyLabel} • ` : ""}{t("maintenance.card.reportedAt")}: {formatDateTime(request.created_at)}
          </p>
          <div className="mt-0.5 flex items-center flex-wrap gap-2">
            <p className="text-xs text-slate-400">{t("maintenance.card.openFor")}: {formatAge(request.created_at)}</p>
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
        <p className="text-sm leading-6 text-slate-200 whitespace-pre-wrap break-words">{request.description}</p>
      ) : (
        <p className="text-sm text-slate-500">{t("maintenance.card.noDescription")}</p>
      )}

      <MaintenanceTriageCard
        accountId={accountId}
        request={request}
        canManage={canManage}
        t={t}
      />

      <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
        <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-800">
          {t("maintenance.card.status")}: {statusLabel(request.status, t)}
          {waitingCtx ? ` — ${waitingCtx}` : ""}
        </span>
        {linkedWorkOrders.length > 0 ? (
          linkedWorkOrders.length === 1 ? (
            <span className="px-2 py-0.5 rounded border border-blue-800 bg-blue-950/60 text-blue-200">
              {t("maintenance.card.workOrder")}: {String(primaryWorkOrder?.status || "assigned").replaceAll("_", " ")}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded border border-blue-800 bg-blue-950/60 text-blue-200">
              {t("maintenance.card.workOrders")}: {linkedWorkOrders.length} ({closedWorkOrdersCount} {t("maintenance.card.closed")}, {openWorkOrdersCount} {t("maintenance.card.open")})
            </span>
          )
        ) : (
          <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-800">{t("maintenance.card.noWorkOrders")}</span>
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
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            >
              {t("maintenance.card.close")}
            </button>
          )}

          <button
            type="button"
            onClick={() => onAddNote(request)}
            disabled={busy}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:opacity-50"
          >
            {t("maintenance.card.addNote")}
          </button>

          {String(request.status || "").toLowerCase() !== "closed" && (
            <button
              type="button"
              onClick={() => onSetWaitingReason(request)}
              disabled={busy}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:opacity-50"
            >
              {String(request.status || "").toLowerCase() === "waiting"
                ? t("maintenance.card.editWaiting")
                : t("maintenance.card.setWaiting")}
            </button>
          )}

          <button
            type="button"
            onClick={() => setTimelineOpen((v) => !v)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
          >
            {timelineOpen ? t("maintenance.card.hideTimeline") : t("maintenance.card.showTimeline")}
          </button>
        </div>
      )}

      {canManage && String(request.status || "").toLowerCase() !== "closed" && hasOpenWorkOrders ? (
        <p className="text-[11px] text-amber-300">
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
