import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import Skeleton from "../components/ui/Skeleton";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import {
  getPlaybookAutomationOverview,
  updatePlaybookRuleSetting,
} from "../services/playbookAutomationService";

function OutputBadge({ output, t }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
      {t(`playbooks.output.${output}`)}
    </span>
  );
}

function RunStateBadge({ state, severity, t }) {
  const normalizedState = String(state || "").toLowerCase();
  const normalizedSeverity = String(severity || "").toLowerCase();
  const tone =
    normalizedState === "resolved"
      ? "border-slate-200 bg-slate-50 text-slate-600"
      : normalizedSeverity === "urgent"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span className={`rounded-full border px-2 py-1 text-xs ${tone}`}>
      {normalizedState === "resolved"
        ? t("playbooks.runState.resolved")
        : t("playbooks.runState.open")}
    </span>
  );
}

function formatDateTime(value) {
  const next = value ? new Date(value) : null;
  if (!next || Number.isNaN(next.getTime())) return "—";
  return next.toLocaleString();
}

export default function PlaybooksPage() {
  const { setTitle } = usePageTitle();
  const { t } = useI18n();
  const { activeAccountId, activeRole } = useAccount();
  const role = useMemo(() => String(activeRole || "").toLowerCase(), [activeRole]);
  const canManage = useMemo(() => ["owner", "admin", "staff"].includes(role), [role]);

  const [loading, setLoading] = useState(false);
  const [savingRuleId, setSavingRuleId] = useState("");
  const [error, setError] = useState("");
  const [overview, setOverview] = useState(null);
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    setTitle(t("playbooks.pageTitle"));
  }, [setTitle, t]);

  async function load() {
    if (!activeAccountId) return;
    setLoading(true);
    setError("");
    try {
      const next = await getPlaybookAutomationOverview(activeAccountId);
      setOverview(next);
    } catch (e) {
      setOverview(null);
      setError(e?.message || t("playbooks.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeAccountId || !canManage) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, canManage]);

  useEffect(() => {
    const nextDrafts = {};
    for (const rule of overview?.rules || []) {
      nextDrafts[rule.id] = {
        enabled: rule.enabled !== false,
        config: { ...(rule.config || {}) },
      };
    }
    setDrafts(nextDrafts);
  }, [overview]);

  useRealtimeTables({
    enabled: !!activeAccountId && canManage,
    subscriptions: [
      { channel: `playbooks-payments:${activeAccountId}`, table: "payments", filter: `account_id=eq.${activeAccountId}` },
      { channel: `playbooks-leases:${activeAccountId}`, table: "leases", filter: `account_id=eq.${activeAccountId}` },
      { channel: `playbooks-requests:${activeAccountId}`, table: "maintenance_requests", filter: `account_id=eq.${activeAccountId}` },
      { channel: `playbooks-work-orders:${activeAccountId}`, table: "work_orders", filter: `account_id=eq.${activeAccountId}` },
      { channel: `playbooks-preventive:${activeAccountId}`, table: "preventive_maintenance_tasks", filter: `account_id=eq.${activeAccountId}` },
      { channel: `playbooks-notifications:${activeAccountId}`, table: "notifications", filter: `account_id=eq.${activeAccountId}` },
      { channel: `playbooks-settings:${activeAccountId}`, table: "automation_rule_settings", filter: `account_id=eq.${activeAccountId}` },
      { channel: `playbooks-runs:${activeAccountId}`, table: "automation_runs", filter: `account_id=eq.${activeAccountId}` },
      { channel: `playbooks-executions:${activeAccountId}`, table: "automation_execution_log", filter: `account_id=eq.${activeAccountId}` },
    ],
    onChange: load,
  });

  function updateDraft(ruleId, nextPatch) {
    setDrafts((prev) => ({
      ...prev,
      [ruleId]: {
        enabled: prev?.[ruleId]?.enabled !== false,
        config: { ...(prev?.[ruleId]?.config || {}) },
        ...nextPatch,
      },
    }));
  }

  async function saveRule(rule) {
    if (!activeAccountId || !rule?.id) return;
    const draft = drafts?.[rule.id] || {
      enabled: rule.enabled !== false,
      config: { ...(rule.config || {}) },
    };

    setSavingRuleId(rule.id);
    setError("");
    try {
      await updatePlaybookRuleSetting(activeAccountId, rule.id, draft);
      await load();
    } catch (e) {
      setError(e?.message || t("playbooks.saveError"));
    } finally {
      setSavingRuleId("");
    }
  }

  if (!canManage) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-600">{t("playbooks.accessDenied")}</p>
      </Card>
    );
  }

  const view = overview ?? {
    rules: [],
    recentRuns: [],
    recentExecutions: [],
    storage: {
      settingsAvailable: false,
      runsAvailable: false,
      executionLogAvailable: false,
    },
    summary: {
      enabledRules: 0,
      activeRules: 0,
      totalSignals: 0,
      openRuns: 0,
    },
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <h2 className="text-lg font-semibold text-white">{t("playbooks.title")}</h2>
        <p className="mt-1 text-sm text-slate-200">{t("playbooks.subtitle")}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!loading && (!view.storage.settingsAvailable || !view.storage.runsAvailable) ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t("playbooks.storageHint")}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-slate-500">{t("playbooks.summary.enabledRules")}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{view.summary.enabledRules}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">{t("playbooks.summary.activeRules")}</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{view.summary.activeRules}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">{t("playbooks.summary.totalSignals")}</p>
              <p className="mt-1 text-2xl font-bold text-blue-700">{view.summary.totalSignals}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-500">{t("playbooks.summary.openRuns")}</p>
              <p className="mt-1 text-2xl font-bold text-rose-700">{view.summary.openRuns}</p>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{t("playbooks.rulesTitle")}</h3>
                <p className="mt-1 text-xs text-slate-500">{t("playbooks.rulesSubtitle")}</p>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                {t("playbooks.codeConfigured")}
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {view.rules.map((rule) => {
                const draft = drafts?.[rule.id] || {
                  enabled: rule.enabled !== false,
                  config: { ...(rule.config || {}) },
                };
                return (
                  <div key={rule.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{t(rule.titleKey)}</p>
                        <p className="mt-1 text-sm text-slate-600">{t(rule.descriptionKey)}</p>
                      </div>
                      <div
                        className={`rounded-full border px-2 py-1 text-xs ${
                          rule.currentCount > 0
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {rule.currentCount > 0
                          ? t("playbooks.ruleState.active", { count: rule.currentCount })
                          : t("playbooks.ruleState.clear")}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 text-xs md:grid-cols-3">
                      <div>
                        <p className="text-slate-500">{t("playbooks.triggerLabel")}</p>
                        <p className="mt-1 text-slate-900">{t(rule.triggerKey)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">{t("playbooks.thresholdLabel")}</p>
                        <p className="mt-1 text-slate-900">{t(rule.thresholdKey)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500">{t("playbooks.outputsLabel")}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rule.outputs.map((output) => (
                            <OutputBadge key={output} output={output} t={t} />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={draft.enabled !== false}
                            onChange={(e) => updateDraft(rule.id, { enabled: e.target.checked })}
                          />
                          <span>{t("playbooks.enabledLabel")}</span>
                        </label>

                        <button
                          type="button"
                          disabled={savingRuleId === rule.id}
                          onClick={() => saveRule(rule)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                        >
                          {savingRuleId === rule.id ? t("common.saving") : t("common.save")}
                        </button>
                      </div>

                      {rule.configFields?.length ? (
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                          {rule.configFields.map((field) => (
                            <label key={field.key} className="text-xs">
                              <span className="text-slate-500">{t(field.labelKey)}</span>
                              <div className="mt-1 flex items-center gap-2">
                                <input
                                  type="number"
                                  min={field.min}
                                  max={field.max}
                                  value={draft.config?.[field.key] ?? ""}
                                  onChange={(e) =>
                                    updateDraft(rule.id, {
                                      config: {
                                        ...(draft.config || {}),
                                        [field.key]: e.target.value,
                                      },
                                    })
                                  }
                                  className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                                <span className="text-slate-500">{t(field.unitKey)}</span>
                              </div>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-slate-500">{t("playbooks.systemTiming")}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{t("playbooks.runsTitle")}</h3>
                <p className="mt-1 text-xs text-slate-500">{t("playbooks.runsSubtitle")}</p>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {view.recentRuns.length ? (
                view.recentRuns.map((run) => (
                  <div key={run.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{run.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {t(RULE_DEFS_TO_TITLE_KEY[run.ruleId] || "playbooks.title")}
                        </p>
                      </div>
                      <RunStateBadge state={run.state} severity={run.severity} t={t} />
                    </div>

                    {run.body ? (
                      <p className="mt-2 text-sm text-slate-600">{run.body}</p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>
                        {t("playbooks.lastTriggeredLabel")}: {formatDateTime(run.lastTriggeredAt)}
                      </span>
                      {run.resolvedAt ? (
                        <span>
                          {t("playbooks.resolvedAtLabel")}: {formatDateTime(run.resolvedAt)}
                        </span>
                      ) : null}
                      {run.linkPath ? (
                        <Link className="font-medium text-blue-700 hover:underline" to={run.linkPath}>
                          {t("playbooks.openSource")}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  {t("playbooks.noRuns")}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{t("playbooks.executionsTitle")}</h3>
                <p className="mt-1 text-xs text-slate-500">{t("playbooks.executionsSubtitle")}</p>
              </div>
            </div>

            <div className="mt-3 space-y-3">
              {!view.storage.executionLogAvailable ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  {t("playbooks.executionLogUnavailable")}
                </div>
              ) : view.recentExecutions.length ? (
                view.recentExecutions.map((execution) => (
                  <div key={execution.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {execution.title || t(RULE_DEFS_TO_TITLE_KEY[execution.rule_id] || "playbooks.title")}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {execution.rule_id} • {formatDateTime(execution.executed_at)}
                        </p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                        {execution.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  {t("playbooks.noExecutions")}
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const RULE_DEFS_TO_TITLE_KEY = {
  rent_overdue_watch: "playbooks.rule.rentOverdue.title",
  lease_renewal_watch: "playbooks.rule.leaseRenewal.title",
  maintenance_triage: "playbooks.rule.maintenanceTriage.title",
  contractor_blocked_followup: "playbooks.rule.contractorBlocked.title",
  preventive_due_watch: "playbooks.rule.preventiveDue.title",
};
