import { Copy, X } from "lucide-react";
import Card from "../../components/Card";
import Skeleton from "../../components/ui/Skeleton";
import { formatDateTime } from "./utils";
import { describeHostedEventReason } from "./hostedEventHelpers";
import { DetailField } from "./InvestigationPanel";

export default function AuditEventDrawer({
  selectedEvent,
  detailLoading,
  onClose,
  onCopyJson,
  copying,
  activeAccountId,
  activeAccount,
  t,
}) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t("securityAudit.investigationTitle")}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {selectedEvent?.action || t("securityAudit.detailLoading")}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label={t("common.close")}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {detailLoading || !selectedEvent ? (
            detailLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-40" />
              </div>
            ) : (
              <Card className="p-4">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {t("securityAudit.detailNotFound")}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t("securityAudit.detailNotFoundBody")}
                </p>
              </Card>
            )
          ) : (
            <>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t("securityAudit.investigationSummary")}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {selectedEvent.action}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onCopyJson}
                      disabled={copying}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Copy size={16} />
                      {copying ? t("securityAudit.copying") : t("securityAudit.copyJson")}
                    </button>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailField label={t("securityAudit.columns.timestamp")} value={formatDateTime(selectedEvent.created_at)} />
                  <DetailField label={t("securityAudit.columns.action")} value={selectedEvent.action} />
                  <DetailField
                    label={t("securityAudit.columns.actor")}
                    value={selectedEvent.actorLabel || selectedEvent.actor_user_id || t("securityAudit.systemActor")}
                  />
                  <DetailField label={t("securityAudit.detail.actorId")} value={selectedEvent.actor_user_id} />
                  <DetailField label={t("securityAudit.detail.account")} value={activeAccount?.name || activeAccountId} />
                  <DetailField label={t("securityAudit.detail.accountId")} value={activeAccountId} />
                  <DetailField label={t("securityAudit.detail.entityType")} value={selectedEvent.entity_type} />
                  <DetailField label={t("securityAudit.detail.entity")} value={selectedEvent.entityLabel || selectedEvent.entity_id} />
                  <DetailField label={t("securityAudit.detail.entityId")} value={selectedEvent.entity_id} />
                  <DetailField label={t("securityAudit.detail.eventId")} value={selectedEvent.id} />
                  <DetailField
                    label={t("securityAudit.detail.reason")}
                    value={describeHostedEventReason(selectedEvent.metadata?.reason || selectedEvent.metadata?.code, t)}
                  />
                  <DetailField
                    label={t("securityAudit.detail.correlationId")}
                    value={selectedEvent.metadata?.correlation_id || "—"}
                  />
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t("securityAudit.metadataTitle")}
                    </h4>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("securityAudit.metadataSubtitle")}
                    </p>
                  </div>
                </div>
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                  {JSON.stringify(selectedEvent.metadata || {}, null, 2)}
                </pre>
              </Card>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
