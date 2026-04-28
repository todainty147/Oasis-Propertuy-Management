import { Copy, Download } from "lucide-react";
import Card from "../../components/Card";
import { HOSTED_EVENT_KINDS, formatDateTime, shortenId } from "./utils";
import {
  startCase,
  describeHostedEventSurface,
  describeHostedEventReason,
  describeHostedEventKind,
  hostedEventSeverity,
  hostedEventSeverityTone,
  describeHostedEventSeverity,
  hostedEventKindTone,
  hostedEventRecommendationTone,
  describeHostedEventRecommendation,
  buildHostedEventSummary,
  buildHostedEventContext,
  buildHostedEventRecommendedAction,
  findRelatedAnomalyAlertForHostedEvent,
} from "./hostedEventHelpers";

export default function HostedEventsCard({
  hostedEventFilters,
  setHostedEventFilters,
  hostedEventCategories,
  hostedEventSurfaces,
  hostedEventSummary,
  hostedEventsEmptyGuidance,
  hostedEventCorrelations,
  hostedEvents,
  hostedExporting,
  focusedAlertId,
  focusedHostedEventId,
  anomalyAlerts,
  onCopySql,
  onCopyInvestigationLink,
  onExport,
  onFocusRow,
  t,
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("securityAudit.hostedEvents.title")}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("securityAudit.hostedEvents.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("securityAudit.hostedEvents.retentionNote")}
          </p>
          <div className="inline-flex flex-wrap items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800">
            <button
              type="button"
              onClick={onCopySql}
              className="inline-flex items-center gap-2 border-r border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-50 dark:hover:bg-slate-700"
            >
              <Copy size={16} />
              {t("securityAudit.hostedEvents.copySql")}
            </button>
            <button
              type="button"
              onClick={onCopyInvestigationLink}
              className="inline-flex items-center gap-2 border-r border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-50 dark:hover:bg-slate-700"
            >
              <Copy size={16} />
              {t("securityAudit.investigationContext.copyLink")}
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={hostedExporting || hostedEvents.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-50 dark:hover:bg-slate-700"
            >
              <Download size={16} />
              {hostedExporting ? t("securityAudit.exporting") : t("securityAudit.hostedEvents.export")}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.hostedEvents.filters.category")}
          </span>
          <select
            value={hostedEventFilters.category}
            onChange={(e) =>
              setHostedEventFilters((prev) => ({
                ...prev,
                category: e.target.value,
              }))
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">{t("securityAudit.hostedEvents.filters.allCategories")}</option>
            {hostedEventCategories.map((value) => (
              <option key={value} value={value}>
                {startCase(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.hostedEvents.filters.kind")}
          </span>
          <select
            value={hostedEventFilters.kind}
            onChange={(e) =>
              setHostedEventFilters((prev) => ({
                ...prev,
                kind: e.target.value,
              }))
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">{t("securityAudit.hostedEvents.filters.allKinds")}</option>
            {HOSTED_EVENT_KINDS.map((value) => (
              <option key={value} value={value}>
                {describeHostedEventKind(value, t)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.hostedEvents.filters.surface")}
          </span>
          <select
            value={hostedEventFilters.surface}
            onChange={(e) =>
              setHostedEventFilters((prev) => ({
                ...prev,
                surface: e.target.value,
              }))
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">{t("securityAudit.hostedEvents.filters.allSurfaces")}</option>
            {hostedEventSurfaces.map((value) => (
              <option key={value} value={value}>
                {describeHostedEventSurface(value, t)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.hostedEvents.filters.limit")}
          </span>
          <select
            value={String(hostedEventFilters.limit)}
            onChange={(e) =>
              setHostedEventFilters((prev) => ({
                ...prev,
                limit: Number(e.target.value) || 25,
              }))
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {[10, 25, 50, 100].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.hostedEvents.summary.total")}
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {hostedEventSummary.total}
          </p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/60 dark:bg-rose-950/30">
          <p className="text-xs uppercase tracking-wide text-rose-600 dark:text-rose-200">
            {t("securityAudit.hostedEvents.summary.denied")}
          </p>
          <p className="mt-2 text-2xl font-semibold text-rose-700 dark:text-rose-100">
            {hostedEventSummary.denied}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
          <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-200">
            {t("securityAudit.hostedEvents.summary.unexpected")}
          </p>
          <p className="mt-2 text-2xl font-semibold text-amber-700 dark:text-amber-100">
            {hostedEventSummary.unexpected}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("securityAudit.hostedEvents.summary.topSurface")}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {hostedEventSummary.topSurface
              ? describeHostedEventSurface(hostedEventSummary.topSurface, t)
              : t("securityAudit.hostedEvents.summary.none")}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("securityAudit.hostedEvents.summary.guardDenied", {
              count: hostedEventSummary.guardDenied,
            })}
          </p>
        </div>
      </div>

      {hostedEvents.length > 0 ? (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
          <p className="font-medium">{t("securityAudit.hostedEvents.recommendedAction.title")}</p>
          <p className="mt-1">
            {buildHostedEventRecommendedAction(hostedEvents[0], t)}
          </p>
        </div>
      ) : null}

      {hostedEventCorrelations.length > 0 ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("securityAudit.hostedEvents.correlations.title")}
              </h4>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t("securityAudit.hostedEvents.correlations.subtitle")}
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {hostedEventCorrelations.map((group) => (
              <div
                key={group.key}
                className={`rounded-xl border bg-white p-4 dark:bg-slate-950/40 ${
                  focusedAlertId &&
                  group.latestRow &&
                  findRelatedAnomalyAlertForHostedEvent(group.latestRow, anomalyAlerts)?.id === focusedAlertId
                    ? "border-blue-300 ring-2 ring-blue-200 dark:border-blue-700 dark:ring-blue-900/50"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t("securityAudit.hostedEvents.correlations.pattern", {
                        surface:
                          describeHostedEventSurface(group.surface, t) ||
                          t("securityAudit.hostedEvents.summary.unknownSurface"),
                        entityType:
                          startCase(group.entityType) || t("securityAudit.hostedEvents.summary.unknownEntity"),
                      })}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("securityAudit.hostedEvents.correlations.reason", {
                        reason: describeHostedEventReason(group.reason, t),
                      })}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                      {t("securityAudit.hostedEvents.correlations.count", { count: group.count })}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-1 text-xs ${hostedEventSeverityTone(
                        hostedEventSeverity(group.latestRow),
                      )}`}
                    >
                      {describeHostedEventSeverity(hostedEventSeverity(group.latestRow), t)}
                    </span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  {t("securityAudit.hostedEvents.correlations.latestSeen", {
                    timestamp: formatDateTime(group.latestAt),
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className={`rounded-lg border px-2 py-2 text-xs ${hostedEventRecommendationTone(
                      group.latestRow?.kind,
                    )}`}
                  >
                    {describeHostedEventRecommendation(group.latestRow, t)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onFocusRow(group.latestRow)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {t("securityAudit.hostedEvents.focusLedger")}
                  </button>
                  {group.latestRow?.correlation_id ? (
                    <span className="rounded-lg bg-slate-100 px-2 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {t("securityAudit.hostedEvents.correlations.correlation", {
                        correlationId: shortenId(group.latestRow.correlation_id),
                      })}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {hostedEvents.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
          <p className="font-medium text-slate-900 dark:text-slate-100">{t("securityAudit.hostedEvents.empty")}</p>
          <p className="mt-2">{hostedEventsEmptyGuidance.title}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hostedEventsEmptyGuidance.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {hostedEventsEmptyGuidance.checks.map((item) => (
              <span
                key={item}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-900/70">
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2">{t("securityAudit.columns.timestamp")}</th>
                <th className="px-3 py-2">{t("securityAudit.hostedEvents.columns.summary")}</th>
                <th className="px-3 py-2">{t("securityAudit.hostedEvents.columns.surface")}</th>
                <th className="px-3 py-2">{t("securityAudit.hostedEvents.columns.role")}</th>
                <th className="px-3 py-2">{t("securityAudit.hostedEvents.columns.context")}</th>
                <th className="px-3 py-2">{t("securityAudit.hostedEvents.columns.outcome")}</th>
                <th className="px-3 py-2">{t("securityAudit.hostedEvents.columns.investigate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
              {hostedEvents.map((row) => (
                <tr
                  key={row.id}
                  className={`align-top ${
                    focusedHostedEventId && focusedHostedEventId === row.id
                      ? "bg-blue-50/70 dark:bg-blue-950/20"
                      : ""
                  }`}
                >
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{formatDateTime(row.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-1 text-xs ${hostedEventKindTone(row.kind)}`}>
                          {describeHostedEventKind(row.kind, t)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-1 text-xs ${hostedEventSeverityTone(
                            hostedEventSeverity(row),
                          )}`}
                        >
                          {describeHostedEventSeverity(hostedEventSeverity(row), t)}
                        </span>
                        {row.category ? (
                          <span className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                            {startCase(row.category)}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {buildHostedEventSummary(row, t)}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    <div className="space-y-1">
                      <p>{describeHostedEventSurface(row.surface, t) || "—"}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {describeHostedEventReason(row.reason, t)}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.actor_role || "—"}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{buildHostedEventContext(row, t)}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.outcome || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="space-y-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs ${hostedEventRecommendationTone(
                          row.kind,
                        )}`}
                      >
                        {describeHostedEventRecommendation(row, t)}
                      </span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {buildHostedEventRecommendedAction(row, t)}
                      </p>
                      <button
                        type="button"
                        onClick={() => onFocusRow(row)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {t("securityAudit.hostedEvents.focusLedger")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
