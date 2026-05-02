import Card from "../../components/Card";

export default function AuditSettingsCard({
  securitySettingsDraft,
  settingsSaving,
  onSave,
  onChangeSetting,
  t,
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("securityAudit.settings.title")}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("securityAudit.settings.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={settingsSaving || !securitySettingsDraft}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {settingsSaving ? t("common.saving") : t("common.save")}
        </button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("securityAudit.settings.roleChanges.title")}
          </h4>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("securityAudit.settings.roleChanges.subtitle")}
          </p>
          <div className="mt-3 grid gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("securityAudit.settings.roleChanges.targetThreshold")}
              </span>
              <input
                type="number"
                min="2"
                max="20"
                value={securitySettingsDraft?.role_change_target_threshold ?? ""}
                onChange={(e) => onChangeSetting("role_change_target_threshold", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("securityAudit.settings.roleChanges.accountThreshold")}
              </span>
              <input
                type="number"
                min="3"
                max="50"
                value={securitySettingsDraft?.role_change_account_threshold ?? ""}
                onChange={(e) => onChangeSetting("role_change_account_threshold", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("securityAudit.settings.roleChanges.window")}
              </span>
              <input
                type="number"
                min="5"
                max="240"
                value={securitySettingsDraft?.role_change_window_minutes ?? ""}
                onChange={(e) => onChangeSetting("role_change_window_minutes", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("securityAudit.settings.documentDeletes.title")}
          </h4>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("securityAudit.settings.documentDeletes.subtitle")}
          </p>
          <div className="mt-3 grid gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("securityAudit.settings.documentDeletes.actorThreshold")}
              </span>
              <input
                type="number"
                min="2"
                max="50"
                value={securitySettingsDraft?.document_delete_actor_threshold ?? ""}
                onChange={(e) => onChangeSetting("document_delete_actor_threshold", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("securityAudit.settings.documentDeletes.accountThreshold")}
              </span>
              <input
                type="number"
                min="3"
                max="100"
                value={securitySettingsDraft?.document_delete_account_threshold ?? ""}
                onChange={(e) => onChangeSetting("document_delete_account_threshold", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("securityAudit.settings.documentDeletes.window")}
              </span>
              <input
                type="number"
                min="5"
                max="240"
                value={securitySettingsDraft?.document_delete_window_minutes ?? ""}
                onChange={(e) => onChangeSetting("document_delete_window_minutes", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("securityAudit.settings.exports.title")}
          </h4>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t("securityAudit.settings.exports.subtitle")}
          </p>
          <div className="mt-3 grid gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("securityAudit.settings.exports.retention")}
              </span>
              <input
                type="number"
                min="1"
                max="90"
                value={securitySettingsDraft?.export_retention_days ?? ""}
                onChange={(e) => onChangeSetting("export_retention_days", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50"
              />
            </label>

            <label className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/50">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("securityAudit.settings.commandCenter.surface")}
              </span>
              <div className="mt-2">
                <input
                  type="checkbox"
                  checked={Boolean(securitySettingsDraft?.surface_security_alerts_in_command_center)}
                  onChange={(e) =>
                    onChangeSetting("surface_security_alerts_in_command_center", e.target.checked)
                  }
                />
              </div>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("securityAudit.settings.commandCenter.minSeverity")}
              </span>
              <select
                value={String(securitySettingsDraft?.security_command_center_min_severity || "urgent")}
                onChange={(e) => onChangeSetting("security_command_center_min_severity", e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="urgent">{t("securityAudit.settings.commandCenter.severity.urgent")}</option>
                <option value="action">{t("securityAudit.settings.commandCenter.severity.action")}</option>
              </select>
            </label>

            <label className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/50">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("securityAudit.settings.commandCenter.includeSuspicious")}
              </span>
              <div className="mt-2">
                <input
                  type="checkbox"
                  checked={Boolean(securitySettingsDraft?.security_command_center_include_suspicious)}
                  onChange={(e) =>
                    onChangeSetting("security_command_center_include_suspicious", e.target.checked)
                  }
                />
              </div>
            </label>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        {t("securityAudit.settings.note")}
      </p>
    </Card>
  );
}
