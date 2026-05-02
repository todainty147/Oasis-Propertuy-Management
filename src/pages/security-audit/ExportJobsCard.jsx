import { Download, X } from "lucide-react";
import Card from "../../components/Card";
import { formatDateTime, formatBytes, shortenId } from "./utils";
import { DetailField } from "./InvestigationPanel";

export default function ExportJobsCard({
  shouldRecommendBackendExport,
  exportJobsPageSize,
  setExportJobsPageSize,
  exportJobsPage,
  setExportJobsPage,
  exportJobsTotal,
  exportJobPages,
  hiddenExportJobIds,
  onRestoreHidden,
  backendExportLabel,
  onChangeExportLabel,
  onBackendExport,
  backendExporting,
  loading,
  exportJobs,
  visibleExportJobs,
  onDismissJob,
  onDownloadJob,
  downloadingJobId,
  t,
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("securityAudit.backendExportsTitle")}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {shouldRecommendBackendExport
              ? t("securityAudit.backendExportsRecommended")
              : t("securityAudit.backendExportsSubtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={String(exportJobsPageSize)}
            onChange={(e) => {
              setExportJobsPageSize(Number(e.target.value));
              setExportJobsPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
          >
            {[5, 10].map((value) => (
              <option key={value} value={value}>
                {t("securityAudit.pageSize", { count: value })}
              </option>
            ))}
          </select>
          {hiddenExportJobIds.length > 0 ? (
            <button
              type="button"
              onClick={onRestoreHidden}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
            >
              {t("securityAudit.backendExportsShowHidden", { count: hiddenExportJobIds.length })}
            </button>
          ) : null}
          <input
            type="text"
            value={backendExportLabel}
            onChange={(e) => onChangeExportLabel(e.target.value)}
            placeholder={t("securityAudit.backendExportLabelPlaceholder")}
            maxLength={80}
            className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-300"
          />
          <button
            type="button"
            onClick={onBackendExport}
            disabled={backendExporting || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
          >
            <Download size={16} />
            {backendExporting ? t("securityAudit.backendExportRunning") : t("securityAudit.backendExport")}
          </button>
        </div>
      </div>

      {exportJobs.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
          {t("securityAudit.backendExportsEmpty")}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {visibleExportJobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-300">
              {t("securityAudit.backendExportsPageHidden")}
            </div>
          ) : null}
          {visibleExportJobs.map((job) => (
            <div
              key={job.id}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {job.displayLabel || t("securityAudit.backendExportJobLabel", { id: shortenId(job.id) })}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("securityAudit.backendExportJobMeta", {
                      status: job.status,
                      createdAt: formatDateTime(job.createdAt),
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onDismissJob(job.id)}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    aria-label={t("securityAudit.backendExportDismiss")}
                    title={t("securityAudit.backendExportDismiss")}
                  >
                    <X size={14} />
                  </button>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                    {job.status}
                  </span>
                  {job.status === "completed" && job.artifactPath ? (
                    <button
                      type="button"
                      onClick={() => onDownloadJob(job)}
                      disabled={downloadingJobId === job.id}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      {downloadingJobId === job.id
                        ? t("securityAudit.backendExportDownloading")
                        : t("securityAudit.backendExportDownload")}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <DetailField
                  label={t("securityAudit.columns.actor")}
                  value={job.requestedByLabel || job.requestedByUserId || t("securityAudit.systemActor")}
                />
                <DetailField
                  label={t("securityAudit.backendExportRows")}
                  value={job.rowCount > 0 ? String(job.rowCount) : "—"}
                />
                <DetailField
                  label={t("securityAudit.backendExportSize")}
                  value={formatBytes(job.fileSizeBytes)}
                />
                <DetailField
                  label={t("securityAudit.backendExportExpires")}
                  value={formatDateTime(job.expiresAt)}
                />
              </div>

              {job.errorSummary ? (
                <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{job.errorSummary}</p>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("securityAudit.pagination", {
                from: exportJobsTotal === 0 ? 0 : (exportJobsPage - 1) * exportJobsPageSize + 1,
                to: exportJobsTotal === 0 ? 0 : Math.min(exportJobsPage * exportJobsPageSize, exportJobsTotal),
                total: exportJobsTotal,
              })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExportJobsPage((prev) => Math.max(prev - 1, 1))}
                disabled={exportJobsPage <= 1}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
              >
                {t("common.prev")}
              </button>
              <button
                type="button"
                onClick={() => setExportJobsPage((prev) => Math.min(prev + 1, exportJobPages))}
                disabled={exportJobsPage >= exportJobPages}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700"
              >
                {t("common.next")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
