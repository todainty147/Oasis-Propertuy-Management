import { Download, ShieldAlert } from "lucide-react";
import Card from "../../components/Card";
import Skeleton from "../../components/ui/Skeleton";
import { AuditRow } from "./InvestigationPanel";

export default function AuditLedgerCard({
  filters,
  onUpdateFilter,
  onClearFilters,
  onApplyDatePreset,
  facets,
  total,
  page,
  pageSize,
  totalPages,
  setPage,
  loading,
  rows,
  exporting,
  expandedRows,
  onToggleExpanded,
  onReview,
  onExport,
  activeAccountId,
  activeAccount,
  t,
}) {
  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("securityAudit.filtersTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("securityAudit.filtersSubtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClearFilters}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
          >
            {t("common.clear")}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onApplyDatePreset(7)}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t("securityAudit.presets.last7Days")}
          </button>
          <button
            type="button"
            onClick={() => onApplyDatePreset(30)}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t("securityAudit.presets.last30Days")}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.filters.dateFrom")}
            </span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => onUpdateFilter("dateFrom", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.filters.dateTo")}
            </span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => onUpdateFilter("dateTo", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.filters.action")}
            </span>
            <select
              value={filters.action}
              onChange={(e) => onUpdateFilter("action", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">{t("securityAudit.filters.allActions")}</option>
              {facets.actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.filters.actor")}
            </span>
            <select
              value={filters.actorUserId}
              onChange={(e) => onUpdateFilter("actorUserId", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">{t("securityAudit.filters.allActors")}</option>
              {facets.actorUserIds.map((actorUserId) => (
                <option key={actorUserId} value={actorUserId}>
                  {actorUserId}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.filters.entityType")}
            </span>
            <select
              value={filters.entityType}
              onChange={(e) => onUpdateFilter("entityType", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">{t("securityAudit.filters.allEntityTypes")}</option>
              {facets.entityTypes.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityType}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("securityAudit.filters.entity")}
            </span>
            <select
              value={filters.entityId}
              onChange={(e) => onUpdateFilter("entityId", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">{t("securityAudit.filters.allEntities")}</option>
              {facets.entities
                .filter((entity) => !filters.entityType || entity.type === filters.entityType)
                .map((entity) => (
                  <option key={`${entity.type}:${entity.id}`} value={entity.id}>
                    {entity.label}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("securityAudit.summary.totalEvents")}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("securityAudit.summary.page")}</p>
          <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-300">
            {page}/{totalPages}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("securityAudit.summary.actions")}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{facets.actions.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("securityAudit.summary.entityTypes")}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{facets.entityTypes.length}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("securityAudit.resultsTitle")}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("securityAudit.resultsSubtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {t("securityAudit.pageSize", { count: pageSize })}
            </div>
            <button
              type="button"
              onClick={onExport}
              disabled={exporting || loading || total === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={16} />
              {exporting ? t("securityAudit.exporting") : t("securityAudit.export")}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-950/50">
            <div className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <ShieldAlert size={18} />
            </div>
            <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
              {t("securityAudit.emptyTitle")}
            </p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {t("securityAudit.emptyBody")}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {rows.map((row) => (
              <AuditRow
                key={row.id}
                row={{
                  ...row,
                  entityLabel:
                    row.entity_type === "account" && row.entity_id === activeAccountId
                      ? activeAccount?.name || row.entityLabel
                      : row.entityLabel,
                }}
                expanded={!!expandedRows[row.id]}
                onToggle={onToggleExpanded}
                onReview={onReview}
                t={t}
              />
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("securityAudit.pagination", {
              from: rows.length === 0 ? 0 : (page - 1) * pageSize + 1,
              to: rows.length === 0 ? 0 : Math.min(page * pageSize, total),
              total,
            })}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page <= 1 || loading}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
            >
              {t("common.prev")}
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page >= totalPages || loading}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
            >
              {t("common.next")}
            </button>
          </div>
        </div>
      </Card>
    </>
  );
}
