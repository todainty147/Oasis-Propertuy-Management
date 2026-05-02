import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatDateTime, shortenId, summarizeMetadata } from "./utils";
import {
  anomalySeverityTone,
  hostedEventSeverity,
  hostedEventSeverityTone,
  describeHostedEventSeverity,
} from "./hostedEventHelpers";
import { timelineTone } from "./investigationHelpers";

export function AuditRow({ row, expanded, onToggle, onReview, t }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="grid gap-3 px-4 py-3 md:grid-cols-[1.3fr_1fr_1fr_1.2fr_auto] md:items-start">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.columns.timestamp")}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            {formatDateTime(row.created_at)}
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.columns.action")}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{row.action}</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.columns.actor")}
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            {row.actor_user_id ? row.actorLabel || shortenId(row.actor_user_id) : t("securityAudit.systemActor")}
          </p>
          {row.actor_user_id && row.actorLabel ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{shortenId(row.actor_user_id)}</p>
          ) : null}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.columns.entity")}
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            {row.entityLabel || row.entity_type || "—"}
          </p>
          {row.entity_id ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{shortenId(row.entity_id)}</p>
          ) : null}
        </div>

        <div className="flex md:justify-end">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => onReview(row.id)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {t("securityAudit.review")}
            </button>
            <button
              type="button"
              onClick={() => onToggle(row.id)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span>{expanded ? t("securityAudit.hideDetails") : t("securityAudit.showDetails")}</span>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
        <p>{summarizeMetadata(row.metadata, t)}</p>
      </div>

      {expanded ? (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-200">
            {JSON.stringify(row.metadata || {}, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 break-all text-sm text-slate-900 dark:text-slate-100">{value || "—"}</p>
    </div>
  );
}

export function InvestigationContextStrip({
  summary,
  focusedHostedEvent,
  focusedAnomalyAlert,
  selectedEvent,
  onClear,
  onAcknowledgeAlert,
  onResolveAlert,
  onShowWorkflow,
  busyAlertAction,
  t,
}) {
  const alertStatus = String(focusedAnomalyAlert?.status || "").toLowerCase();
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/60 dark:bg-blue-950/30">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-200">
            {t("securityAudit.investigationContext.title")}
          </p>
          <p className="mt-1 text-sm text-blue-900 dark:text-blue-100">
            {summary || t("securityAudit.investigationContext.empty")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {focusedHostedEvent ? (
              <span
                className={`rounded-full border px-2 py-1 text-xs ${hostedEventSeverityTone(
                  hostedEventSeverity(focusedHostedEvent),
                )}`}
              >
                {describeHostedEventSeverity(hostedEventSeverity(focusedHostedEvent), t)}
              </span>
            ) : null}
            {focusedAnomalyAlert ? (
              <span className={`rounded-full border px-2 py-1 text-xs ${anomalySeverityTone(focusedAnomalyAlert.severity)}`}>
                {t("securityAudit.investigationContext.badgeAnomaly", {
                  severity: String(focusedAnomalyAlert.severity || "info"),
                })}
              </span>
            ) : null}
            {selectedEvent ? (
              <span className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                {t("securityAudit.investigationContext.badgeLedger")}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {focusedAnomalyAlert ? (
            <>
              <button
                type="button"
                onClick={onShowWorkflow}
                className="rounded-lg border border-blue-300 bg-white/70 px-3 py-2 text-sm text-blue-700 transition hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-100 dark:hover:bg-blue-900/60"
              >
                {t("securityAudit.investigationContext.showAlertWorkflow")}
              </button>
              <button
                type="button"
                onClick={onAcknowledgeAlert}
                disabled={!onAcknowledgeAlert || busyAlertAction === "acknowledge" || alertStatus !== "open"}
                className="rounded-lg border border-blue-300 bg-white/70 px-3 py-2 text-sm text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-100 dark:hover:bg-blue-900/60"
              >
                {t("securityAudit.alert.actions.acknowledge")}
              </button>
              <button
                type="button"
                onClick={onResolveAlert}
                disabled={!onResolveAlert || busyAlertAction === "resolve" || alertStatus === "resolved"}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
              >
                {t("securityAudit.alert.actions.resolve")}
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-blue-300 bg-white/70 px-3 py-2 text-sm text-blue-700 transition hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-100 dark:hover:bg-blue-900/60"
          >
            {t("securityAudit.investigationContext.clear")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InvestigationTimeline({ items, t }) {
  if (!items.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("securityAudit.timeline.title")}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("securityAudit.timeline.subtitle")}
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/40"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.detail || "—"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {item.badge ? (
                  <span className={`rounded-full border px-2 py-1 text-xs ${timelineTone(item.type)}`}>
                    {item.badge}
                  </span>
                ) : null}
                <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(item.timestamp)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InvestigationEntityPanel({ details, t }) {
  if (!details.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t("securityAudit.entityContext.title")}
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("securityAudit.entityContext.subtitle")}
        </p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {details.map((item) => (
          <DetailField key={`${item.label}:${item.value}`} label={item.label} value={item.value} />
        ))}
      </div>
    </div>
  );
}

export function InvestigationRelatedLinks({ links, t }) {
  if (!links.length) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t("securityAudit.relatedLinks.title")}
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("securityAudit.relatedLinks.subtitle")}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((item) => (
          <Link
            key={`${item.to}:${item.label}`}
            to={item.to}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
