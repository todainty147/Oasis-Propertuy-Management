import { useEffect, useRef, useState } from "react";
import MaintenanceTimeline from "./MaintenanceTimeline";
import MaintenanceRequestWorkOrders from "./MaintenanceRequestWorkOrders";
import { useI18n } from "../../context/I18nContext";
import Skeleton from "../ui/Skeleton";
import { formatAttentionInsightTimestamp } from "../../services/attentionInsightService";
import { getMaintenanceTriageInsight } from "../../services/maintenanceTriageInsightService";
import { useAiFeatureAccess } from "../../hooks/useAiFeatureAccess";
import AiUpsellBanner from "../AiUpsellBanner";

// ─── helpers ────────────────────────────────────────────────────────────────

function priorityLabel(priority, t) {
  const p = String(priority ?? "").toLowerCase();
  if (p === "low") return t("priority.low");
  if (p === "normal") return t("priority.normal");
  if (p === "high") return t("priority.high");
  if (p === "critical") return t("priority.critical");
  if (p === "urgent") return t("priority.urgent");
  return priority || "—";
}

function priorityBadgeTone(priority) {
  const p = String(priority ?? "").toLowerCase();
  if (p === "urgent" || p === "critical")
    return "border-rose-300 bg-rose-50 text-rose-700";
  if (p === "high")
    return "border-amber-300 bg-amber-50 text-amber-700";
  if (p === "low")
    return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function priorityLeftBorder(priority) {
  const p = String(priority ?? "").toLowerCase();
  if (p === "urgent" || p === "critical") return "border-l-rose-400";
  if (p === "high") return "border-l-amber-400";
  if (p === "normal") return "border-l-blue-300";
  return "border-l-slate-200";
}

function waitingReasonLabel(waitingReason, t) {
  const r = String(waitingReason ?? "").toLowerCase();
  if (r === "tenant_response") return t("maintenance.waiting.tenant_response");
  if (r === "contractor_schedule") return t("maintenance.waiting.contractor_schedule");
  if (r === "parts_ordered") return t("maintenance.waiting.parts_ordered");
  if (r === "landlord_approval") return t("maintenance.waiting.landlord_approval");
  return waitingReason || "";
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatAge(createdAt) {
  if (!createdAt) return "—";
  const ms = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function ageHours(createdAt) {
  if (!createdAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 3600000));
}

// Compact colored dot for SLA status
function SlaDot({ status, createdAt, className = "" }) {
  const s = String(status || "").toLowerCase();
  const h = ageHours(createdAt);
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
  return <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${color} ${className}`} />;
}

// ─── overflow menu ────────────────────────────────────────────────────────────

function OverflowMenu({ items, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border border-slate-200 bg-white shadow-md">
          {items.map((item, idx) =>
            item ? (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                title={item.title || ""}
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 first:rounded-t-lg last:rounded-b-lg"
              >
                {item.label}
              </button>
            ) : (
              <div key={`divider-${idx}`} className="my-1 border-t border-slate-100" />
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI triage feature gate wrapper ─────────────────────────────────────────

function TriageFeatureGate({ compact, children }) {
  const { allowed, requiredPlan } = useAiFeatureAccess("ai_maintenance_triage");
  const { t } = useI18n();
  if (!allowed) {
    if (compact) {
      // In collapsed mode show a muted pill rather than the full banner
      return (
        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-400">
          ✦ AI · {t("ai.upsell.upgradeButton")}
        </span>
      );
    }
    return (
      <AiUpsellBanner
        featureLabel="Maintenance AI Triage"
        requiredPlan={requiredPlan}
      />
    );
  }
  return children;
}

// ─── AI triage – compact pill shown in collapsed card ────────────────────────

function TriagePill({ insight, loading, error, t }) {
  if (loading && !insight) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] text-cyan-700">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
        {t("common.loading")}
      </span>
    );
  }
  if (error && !insight) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700">
        ⚠ AI
      </span>
    );
  }
  if (!insight) return null;

  const urgencyColors = {
    low: "border-slate-200 bg-slate-50 text-slate-600",
    normal: "border-blue-200 bg-blue-50 text-blue-700",
    high: "border-amber-200 bg-amber-50 text-amber-700",
    urgent: "border-rose-200 bg-rose-50 text-rose-700",
  };
  const color = urgencyColors[insight.urgency] || urgencyColors.normal;
  const trade = insight.suggestedTrade ? ` · ${insight.suggestedTrade}` : "";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${color}`}
      title={t("maintenance.ai.title")}
    >
      ⚡ {t(`maintenance.ai.urgency.${insight.urgency}`)}
      {trade}
    </span>
  );
}

// ─── full AI triage card (shown when card is expanded) ───────────────────────

function MaintenanceTriageCard({ accountId, request, canManage, compact, t }) {
  const requestStatus = String(request?.status || "").toLowerCase();
  const shouldLoad =
    canManage && request?.id && !["closed", "resolved"].includes(requestStatus);
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
      const next = await getMaintenanceTriageInsight({ accountId, requestId: request.id, forceRefresh });
      setInsight(next);
    } catch (e) {
      setError(e?.message || t("maintenance.ai.loadError"));
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

  // Compact mode: show pill only
  if (compact) {
    return (
      <div data-testid={`maintenance-triage-card-${request.id}`}>
        <TriagePill insight={insight} loading={loading} error={error} t={t} />
      </div>
    );
  }

  // Full mode: show complete triage card
  const urgencyClasses = {
    low: "border-slate-200 bg-slate-50 text-slate-700",
    normal: "border-blue-200 bg-blue-50 text-blue-700",
    high: "border-amber-200 bg-amber-50 text-amber-800",
    urgent: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <div
      data-testid={`maintenance-triage-card-${request.id}`}
      className="rounded-xl border border-cyan-200 bg-cyan-50/30 p-3 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-600">
              {t("maintenance.ai.eyebrow")}
            </span>
            {insight ? (
              <>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    urgencyClasses[insight.urgency] || urgencyClasses.normal
                  }`}
                >
                  {t(`maintenance.ai.urgency.${insight.urgency}`)}
                </span>
                {insight.safetyFlag ? (
                  <span className="inline-flex rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                    {t("maintenance.ai.safetyFlag")}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
          <h4 className="mt-1.5 text-sm font-semibold text-slate-900">{t("maintenance.ai.title")}</h4>
        </div>
        <button
          type="button"
          onClick={() => loadInsight(true)}
          disabled={loading}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {t("maintenance.ai.refresh")}
        </button>
      </div>

      {error && !insight ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {error}
        </div>
      ) : null}

      {loading && !insight ? <Skeleton className="h-20" /> : null}

      {insight ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t("maintenance.ai.summary")}
              </p>
              <p className="mt-1.5 text-sm font-medium text-slate-900">
                {insight.category.replaceAll("_", " ")}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">{insight.suggestedTrade}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t("maintenance.ai.generatedLabel")}
              </p>
              <p className="mt-1.5 text-sm text-slate-700">
                {formatAttentionInsightTimestamp(insight.generatedAt)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {t("maintenance.ai.generatedConfidence", {
                  confidence: t(`maintenance.ai.confidence.${insight.confidence}`),
                })}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFactsOpen((v) => !v)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              {factsOpen ? t("maintenance.ai.hideFacts") : t("maintenance.ai.showFacts")}
            </button>
            <button
              type="button"
              onClick={() => setDraftsOpen((v) => !v)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              {draftsOpen ? t("maintenance.ai.hideDrafts") : t("maintenance.ai.showDrafts")}
            </button>
          </div>

          {factsOpen ? (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {t("maintenance.ai.facts")}
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                {(insight.factsUsed || []).map((fact) => (
                  <li key={fact} className="flex gap-2 break-words">
                    <span className="text-slate-400 shrink-0">•</span>
                    <span className="min-w-0 break-words">{fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {draftsOpen ? (
            <div className="grid gap-2">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t("maintenance.ai.tenantAcknowledgement")}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-slate-700 break-words">
                  {insight.tenantAcknowledgement}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {t("maintenance.ai.managerNote")}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-slate-700 break-words">
                  {insight.managerNote}
                </p>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ─── main card ────────────────────────────────────────────────────────────────

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
  const [expanded, setExpanded] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  const finalStatuses = new Set(["completed", "cancelled"]);
  const hasOpenWorkOrders = linkedWorkOrders.some(
    (wo) => !finalStatuses.has(String(wo?.status || "").toLowerCase()),
  );
  const waitingCtx =
    String(request.status || "").toLowerCase() === "waiting"
      ? waitingReasonLabel(request.waiting_reason, t)
      : "";
  const isClosed = String(request.status || "").toLowerCase() === "closed";

  const overflowItems = canManage
    ? [
        {
          label: t("maintenance.card.addNote"),
          onClick: () => onAddNote(request),
          disabled: busy,
        },
        !isClosed && {
          label:
            String(request.status || "").toLowerCase() === "waiting"
              ? t("maintenance.card.editWaiting")
              : t("maintenance.card.setWaiting"),
          onClick: () => onSetWaitingReason(request),
          disabled: busy,
        },
        {
          label: expanded ? t("maintenance.card.hideTimeline") : t("maintenance.card.showTimeline"),
          onClick: () => {
            setExpanded(true);
            setTimelineOpen((v) => !v);
          },
          disabled: false,
        },
        null, // divider
        !isClosed && {
          label: t("maintenance.card.close"),
          onClick: () => onCloseRequest(request, linkedWorkOrders),
          disabled: busy || hasOpenWorkOrders,
          title: hasOpenWorkOrders ? t("maintenance.inbox.closeGuard") : "",
        },
      ].filter(Boolean)
    : [];

  return (
    <div
      data-testid={request?.id ? `maintenance-request-card-${request.id}` : undefined}
      className={`rounded-xl border-l-4 border border-slate-200 bg-white shadow-sm ${priorityLeftBorder(request.priority)}`}
    >
      {/* ── Collapsed header – always visible, click to toggle ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full text-left px-3 pt-3 pb-2"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <SlaDot status={request.status} createdAt={request.created_at} className="mt-0.5" />
              <p className="text-sm font-semibold text-slate-900 truncate">
                {request.title || t("maintenance.card.noTitle")}
              </p>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 truncate">
              {[propertyLabel, formatAge(request.created_at)].filter(Boolean).join(" · ")}
              {waitingCtx ? ` — ${waitingCtx}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`text-[11px] px-2 py-0.5 rounded border ${priorityBadgeTone(request.priority)}`}
            >
              {priorityLabel(request.priority, t)}
            </span>
            <span className="text-xs text-slate-400">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>

        {/* Description – 2-line clamp in collapsed, full in expanded */}
        {request.description ? (
          <p
            className={`mt-2 text-sm text-slate-600 break-words ${
              expanded ? "whitespace-pre-wrap" : "line-clamp-2"
            }`}
          >
            {request.description}
          </p>
        ) : (
          !expanded && (
            <p className="mt-2 text-xs text-slate-400">{t("maintenance.card.noDescription")}</p>
          )
        )}
      </button>

      {/* ── Triage pill (compact) + work order pill – below header, always visible ── */}
      <div className="px-3 pb-2 flex flex-wrap items-center gap-1.5">
        <TriageFeatureGate compact={!expanded}>
          <MaintenanceTriageCard
            accountId={accountId}
            request={request}
            canManage={canManage}
            compact={!expanded}
            t={t}
          />
        </TriageFeatureGate>
        {linkedWorkOrders.length > 0 ? (
          <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] text-blue-700">
            {linkedWorkOrders.length === 1
              ? `${t("maintenance.card.workOrder")}: ${String(
                  linkedWorkOrders[0]?.status || "assigned",
                ).replaceAll("_", " ")}`
              : `${linkedWorkOrders.length} ${t("maintenance.card.workOrders")}`}
          </span>
        ) : (
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500">
            {t("maintenance.card.noWorkOrders")}
          </span>
        )}
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="border-t border-slate-100 px-3 py-3 space-y-3">
          <p className="text-xs text-slate-400">
            {propertyLabel ? `${propertyLabel} · ` : ""}
            {t("maintenance.card.reportedAt")}: {formatDateTime(request.created_at)}
          </p>

          <MaintenanceRequestWorkOrders
            workOrders={linkedWorkOrders}
            canManage={false}
            busy={busy}
            onCreateWorkOrder={() => onCreateWorkOrder(request)}
          />

          {timelineOpen && (
            <MaintenanceTimeline
              accountId={accountId}
              request={request}
              linkedWorkOrders={linkedWorkOrders}
            />
          )}

          {canManage && hasOpenWorkOrders && !isClosed ? (
            <p className="text-[11px] text-amber-600">{t("maintenance.inbox.closeGuard")}</p>
          ) : null}
        </div>
      )}

      {/* ── Action bar – always visible at the bottom ── */}
      {canManage && (
        <div className="flex items-center gap-2 px-3 pb-3 pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onCreateWorkOrder(request)}
            disabled={busy}
            className="flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {t("maintenance.drawer.create")}
          </button>
          <OverflowMenu items={overflowItems} label={t("maintenance.card.moreActions")} />
        </div>
      )}
    </div>
  );
}
