import Card from "../../components/Card";
import { ALERT_CLASSIFICATIONS, formatDateTime, summarizeMetadata } from "./utils";
import { alertStatusTone, anomalySeverityTone, buildAnomalyRecommendedAction } from "./hostedEventHelpers";
import { buildAnomalyFlagContext, buildAlertWorkflowSummary } from "./investigationHelpers";
import { DetailField } from "./InvestigationPanel";

export default function AnomalyAlertsCard({
  anomalyAlertsPageSize,
  setAnomalyAlertsPageSize,
  anomalyAlertsPage,
  setAnomalyAlertsPage,
  anomalyAlertsTotal,
  anomalyAlertPages,
  alertStatus,
  onSetAlertStatusFilter,
  anomalyAlerts,
  anomalyEmptyGuidance,
  focusedAlertId,
  alertDrafts,
  alertAssignees,
  alertHistoryById,
  alertBusyKey,
  expandedAlerts,
  onAlertAction,
  onFocusAlert,
  onToggleExpanded,
  onUpdateDraft,
  t,
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("securityAudit.anomaliesTitle")}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("securityAudit.anomaliesSubtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={String(anomalyAlertsPageSize)}
            onChange={(e) => {
              setAnomalyAlertsPageSize(Number(e.target.value));
              setAnomalyAlertsPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
          >
            {[5, 10].map((value) => (
              <option key={value} value={value}>
                {t("securityAudit.pageSize", { count: value })}
              </option>
            ))}
          </select>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
            {t("securityAudit.anomaliesOpenCount", { count: anomalyAlertsTotal })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {["active", "open", "acknowledged", "resolved"].map((value) => {
          const active = alertStatus === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSetAlertStatusFilter(value)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                active
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              {t(`securityAudit.alertStatus.${value}`)}
            </button>
          );
        })}
      </div>

      {anomalyAlerts.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
          <p className="font-medium text-slate-900 dark:text-slate-100">{t("securityAudit.anomaliesEmpty")}</p>
          <p className="mt-2">{anomalyEmptyGuidance.title}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{anomalyEmptyGuidance.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {anomalyEmptyGuidance.checks.map((item) => (
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
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {anomalyAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl border bg-white p-4 dark:bg-slate-900 ${
                  focusedAlertId && focusedAlertId === alert.id
                    ? "border-blue-300 ring-2 ring-blue-200 dark:border-blue-700 dark:ring-blue-900/50"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{alert.title}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{alert.summary}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-1 text-xs ${alertStatusTone(alert.status)}`}>
                      {alert.status}
                    </span>
                    <span className={`rounded-full border px-2 py-1 text-xs ${anomalySeverityTone(alert.severity)}`}>
                      {alert.severity}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <DetailField
                    label={t("securityAudit.columns.actor")}
                    value={alert.actorLabel || alert.actorUserId || t("securityAudit.systemActor")}
                  />
                  <DetailField
                    label={t("securityAudit.columns.entity")}
                    value={alert.entityLabel || alert.entityType || "—"}
                  />
                  <DetailField label={t("securityAudit.anomaly.count")} value={String(alert.alertCount)} />
                  <DetailField label={t("securityAudit.anomaly.lastSeen")} value={formatDateTime(alert.lastSeenAt)} />
                  <DetailField
                    label={t("securityAudit.alert.assignee")}
                    value={alert.assignedToLabel || alert.assignedToUserId || "—"}
                  />
                  <DetailField
                    label={t("securityAudit.alert.classification")}
                    value={alert.classification || "—"}
                  />
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("securityAudit.anomaly.flagContext.title")}
                  </p>
                  <p className="mt-1">
                    {buildAnomalyFlagContext(alert, t) || t("securityAudit.anomaly.flagContext.empty")}
                  </p>
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("securityAudit.alert.workflowSummary.title")}
                  </p>
                  <p className="mt-1">
                    {buildAlertWorkflowSummary(alert, t) || t("securityAudit.alert.workflowSummary.empty")}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[11px] ${anomalySeverityTone(alert.severity)}`}>
                        {t("securityAudit.anomaly.recommendedAction.badge", {
                          severity: String(alert.severity || "info"),
                        })}
                      </span>
                    </div>
                    {buildAnomalyRecommendedAction(alert, t)}
                  </div>
                  <button
                    type="button"
                    onClick={() => onFocusAlert(alert)}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                  >
                    {t("securityAudit.anomaly.focus")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlertAction(alert, "acknowledge")}
                    disabled={alertBusyKey === `${alert.id}:acknowledge` || String(alert.status || "").toLowerCase() !== "open"}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/60"
                  >
                    {t("securityAudit.alert.actions.acknowledge")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleExpanded(alert.id)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
                  >
                    {expandedAlerts[alert.id]
                      ? t("securityAudit.alert.hideWorkflow")
                      : t("securityAudit.alert.showWorkflow")}
                  </button>
                </div>

                {expandedAlerts[alert.id] ? (
                  <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
                    <div className="grid gap-3 md:grid-cols-2">
                      <DetailField
                        label={t("securityAudit.alert.acknowledgedAt")}
                        value={formatDateTime(alert.acknowledgedAt)}
                      />
                      <DetailField
                        label={t("securityAudit.alert.acknowledgedBy")}
                        value={alert.acknowledgedByLabel || alert.acknowledgedByUserId || "—"}
                      />
                      <DetailField
                        label={t("securityAudit.alert.resolvedAt")}
                        value={formatDateTime(alert.resolvedAt)}
                      />
                      <DetailField
                        label={t("securityAudit.alert.resolvedBy")}
                        value={alert.resolvedByLabel || alert.resolvedByUserId || "—"}
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("securityAudit.alert.classification")}
                        </span>
                        <select
                          value={alertDrafts[alert.id]?.classification || ""}
                          onChange={(e) => onUpdateDraft(alert.id, { classification: e.target.value })}
                          disabled={String(alert.status || "").toLowerCase() === "resolved"}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="">{t("securityAudit.alert.classificationPlaceholder")}</option>
                          {ALERT_CLASSIFICATIONS.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("securityAudit.alert.assignee")}
                        </span>
                        <select
                          value={alertDrafts[alert.id]?.assignedToUserId || ""}
                          onChange={(e) => onUpdateDraft(alert.id, { assignedToUserId: e.target.value })}
                          disabled={String(alert.status || "").toLowerCase() === "resolved"}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <option value="">{t("securityAudit.alert.unassigned")}</option>
                          {alertAssignees.map((option) => (
                            <option key={option.userId} value={option.userId}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t("securityAudit.alert.resolutionNote")}
                      </span>
                      <textarea
                        rows={3}
                        value={alertDrafts[alert.id]?.resolutionNote || ""}
                        onChange={(e) => onUpdateDraft(alert.id, { resolutionNote: e.target.value })}
                        placeholder={t("securityAudit.alert.resolutionNotePlaceholder")}
                        disabled={String(alert.status || "").toLowerCase() === "resolved"}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onAlertAction(alert, "acknowledge")}
                        disabled={alertBusyKey === `${alert.id}:acknowledge` || String(alert.status || "").toLowerCase() !== "open"}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                      >
                        {t("securityAudit.alert.actions.acknowledge")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onAlertAction(alert, "classify")}
                        disabled={
                          alertBusyKey === `${alert.id}:classify` ||
                          !alertDrafts[alert.id]?.classification ||
                          String(alert.status || "").toLowerCase() === "resolved"
                        }
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
                      >
                        {t("securityAudit.alert.actions.classify")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onAlertAction(alert, "assign")}
                        disabled={alertBusyKey === `${alert.id}:assign` || String(alert.status || "").toLowerCase() === "resolved"}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
                      >
                        {t("securityAudit.alert.actions.assign")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onAlertAction(alert, "resolve")}
                        disabled={alertBusyKey === `${alert.id}:resolve` || String(alert.status || "").toLowerCase() === "resolved"}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
                      >
                        {t("securityAudit.alert.actions.resolve")}
                      </button>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t("securityAudit.alert.history")}
                      </p>
                      {(alertHistoryById[alert.id] || []).length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {t("securityAudit.alert.historyEmpty")}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {alertHistoryById[alert.id].map((entry) => (
                            <div
                              key={entry.id}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{entry.action}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(entry.created_at)}</p>
                              </div>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {entry.actorLabel || entry.actor_user_id || t("securityAudit.systemActor")}
                              </p>
                              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                {summarizeMetadata(entry.metadata, t)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("securityAudit.pagination", {
                from: anomalyAlertsTotal === 0 ? 0 : (anomalyAlertsPage - 1) * anomalyAlertsPageSize + 1,
                to:
                  anomalyAlertsTotal === 0
                    ? 0
                    : Math.min(anomalyAlertsPage * anomalyAlertsPageSize, anomalyAlertsTotal),
                total: anomalyAlertsTotal,
              })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAnomalyAlertsPage((prev) => Math.max(prev - 1, 1))}
                disabled={anomalyAlertsPage <= 1}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t("common.prev")}
              </button>
              <button
                type="button"
                onClick={() => setAnomalyAlertsPage((prev) => Math.min(prev + 1, anomalyAlertPages))}
                disabled={anomalyAlertsPage >= anomalyAlertPages}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t("common.next")}
              </button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
