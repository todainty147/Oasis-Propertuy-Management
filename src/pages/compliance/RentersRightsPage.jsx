// src/pages/compliance/RentersRightsPage.jsx
//
// Renters' Rights Readiness Pack — Phase 1: Information Sheet Tracker
//
// LEGAL DISCLAIMER: This page helps landlords and property managers organise
// records and track operational tasks. It does not provide legal advice and
// does not determine whether any tenancy, notice, rent increase, pet decision,
// possession action, or landlord action is legally valid. Seek advice from a
// qualified professional where needed.

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Info,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { useI18n } from "../../context/I18nContext";
import {
  listRentersRightsTasks,
  markRrTaskSent,
  setRrTaskNotRequired,
  createRrTasksForActiveTenants,
} from "../../services/rentersRightsService";

// ── Constants ─────────────────────────────────────────────────────────────────

const DELIVERY_METHODS = [
  "email",
  "sms",
  "printed_hand_delivery",
  "post",
  "other",
];

const STATUS_FILTERS = [
  { value: null,             labelKey: "rentersRights.filter.all" },
  { value: "required",       labelKey: "rentersRights.informationSheet.status.required" },
  { value: "overdue",        labelKey: "rentersRights.informationSheet.status.overdue" },
  { value: "sent",           labelKey: "rentersRights.informationSheet.status.sent" },
  { value: "evidence_uploaded", labelKey: "rentersRights.informationSheet.status.evidence_uploaded" },
  { value: "reviewed",       labelKey: "rentersRights.informationSheet.status.reviewed" },
  { value: "not_required",   labelKey: "rentersRights.informationSheet.status.not_required" },
];

const PHASE2_TABS = ["tenancyReview", "rentReviews", "petRequests", "possessionEvidence", "timeline"];

// ── Sub-components ────────────────────────────────────────────────────────────

function JurisdictionBadge({ t }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
      {t("rentersRights.jurisdictionBadge")}
    </span>
  );
}

function DisclaimerBanner({ t }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{t("rentersRights.disclaimer")}</p>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className={`rounded-xl border p-4 ${accent}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function StatusBadge({ status, t }) {
  const cfg = {
    required:         "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    overdue:          "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    sent:             "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    evidence_uploaded:"bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    reviewed:         "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    not_required:     "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cfg[status] || cfg.required}`}>
      {t(`rentersRights.informationSheet.status.${status}`, status)}
    </span>
  );
}

// ── Mark Sent Modal ───────────────────────────────────────────────────────────

function MarkSentModal({ task, onClose, onSaved, accountId, t }) {
  const [deliveryMethod, setDeliveryMethod] = useState("email");
  const [sentAt, setSentAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await markRrTaskSent({
        taskId:         task.id,
        accountId,
        deliveryMethod,
        sentAt:         sentAt ? new Date(sentAt).toISOString() : null,
        notes:          notes || null,
      });
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">
          {t("rentersRights.informationSheet.markSent")}
        </h3>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {task.tenantName} · {task.propertyAddress}
        </p>

        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300">
          <span className="font-medium">{t("rentersRights.informationSheet.govUkNotice")}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t("rentersRights.informationSheet.deliveryMethodLabel")}
            </label>
            <select
              value={deliveryMethod}
              onChange={(e) => setDeliveryMethod(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            >
              {DELIVERY_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`rentersRights.informationSheet.deliveryMethod.${m}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t("rentersRights.informationSheet.sentDateLabel")}
            </label>
            <input
              type="date"
              value={sentAt}
              onChange={(e) => setSentAt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t("rentersRights.informationSheet.notesLabel")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              placeholder={t("rentersRights.informationSheet.notesPlaceholder")}
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {t("rentersRights.informationSheet.markSent")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Information Sheets Tab ────────────────────────────────────────────────────

function InformationSheetsTab({ tasks, loading, error, accountId, onRefresh, t }) {
  const [statusFilter, setStatusFilter] = useState(null);
  const [markSentTask, setMarkSentTask] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const filtered = statusFilter
    ? tasks.filter((task) => task.status === statusFilter)
    : tasks;

  const counts = {
    required:         tasks.filter((t) => t.status === "required").length,
    overdue:          tasks.filter((t) => t.status === "overdue").length,
    sent:             tasks.filter((t) => ["sent", "evidence_uploaded", "reviewed"].includes(t.status)).length,
    not_required:     tasks.filter((t) => t.status === "not_required").length,
  };

  async function handleSyncTenants() {
    setSyncing(true);
    setActionError(null);
    try {
      const created = await createRrTasksForActiveTenants({ accountId });
      await onRefresh();
      if (created === 0) setActionError(null);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleNotRequired(task) {
    setActionError(null);
    try {
      await setRrTaskNotRequired({ taskId: task.id, accountId });
      await onRefresh();
    } catch (err) {
      setActionError(err.message);
    }
  }

  function handleMarkSentSaved() {
    setMarkSentTask(null);
    onRefresh();
  }

  function formatDate(val) {
    if (!val) return "—";
    const d = new Date(`${String(val).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
  }

  return (
    <>
      {/* GOV.UK notice */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-800/40 dark:bg-blue-900/20">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <div className="text-blue-800 dark:text-blue-300">
          <span className="font-medium">{t("rentersRights.informationSheet.govUkNotice")}</span>{" "}
          <a
            href="https://www.gov.uk/government/publications/renters-rights-bill-information-for-tenants"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 underline"
          >
            GOV.UK <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={t("rentersRights.stat.required")}
          value={counts.required + counts.overdue}
          accent="border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10"
        />
        <StatCard
          label={t("rentersRights.stat.overdue")}
          value={counts.overdue}
          accent="border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10"
        />
        <StatCard
          label={t("rentersRights.stat.sent")}
          value={counts.sent}
          accent="border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-900/10"
        />
        <StatCard
          label={t("rentersRights.stat.notRequired")}
          value={counts.not_required}
          accent="border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map(({ value, labelKey }) => (
            <button
              key={String(value)}
              onClick={() => setStatusFilter(value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === value
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "border border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300"
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button
            onClick={handleSyncTenants}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {syncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {t("rentersRights.informationSheet.syncTenants")}
          </button>
        </div>
      </div>

      {actionError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {actionError}
        </p>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>
      ) : error ? (
        <div className="py-12 text-center text-sm text-red-500">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
          <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {tasks.length === 0
              ? t("rentersRights.informationSheet.emptySync")
              : t("rentersRights.informationSheet.emptyFilter")}
          </p>
          {tasks.length === 0 && (
            <button
              onClick={handleSyncTenants}
              disabled={syncing}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {t("rentersRights.informationSheet.syncTenants")}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                {["tenant", "property", "status", "dueDate", "deliveryMethod", "actions"].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t(`rentersRights.table.${col}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {filtered.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {task.tenantName}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {task.propertyAddress}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={task.status} t={t} />
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {formatDate(task.dueDate)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {task.deliveryMethod
                      ? t(`rentersRights.informationSheet.deliveryMethod.${task.deliveryMethod}`, task.deliveryMethod)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {["required", "overdue"].includes(task.status) && (
                        <>
                          <button
                            onClick={() => setMarkSentTask(task)}
                            className="flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
                          >
                            <Send className="h-3 w-3" />
                            {t("rentersRights.informationSheet.markSent")}
                          </button>
                          <button
                            onClick={() => handleNotRequired(task)}
                            className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            <XCircle className="h-3 w-3" />
                            {t("rentersRights.informationSheet.markNotRequired")}
                          </button>
                        </>
                      )}
                      {task.status === "sent" && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle2 className="h-3 w-3" />
                          {formatDate(task.sentAt)}
                        </span>
                      )}
                      {task.status === "evidence_uploaded" && (
                        <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <FileText className="h-3 w-3" />
                          {t("rentersRights.informationSheet.evidenceLinked")}
                        </span>
                      )}
                      {task.status === "not_required" && (
                        <span className="text-xs text-slate-400">
                          {t("rentersRights.informationSheet.status.not_required")}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {markSentTask && (
        <MarkSentModal
          task={markSentTask}
          accountId={accountId}
          onClose={() => setMarkSentTask(null)}
          onSaved={handleMarkSentSaved}
          t={t}
        />
      )}
    </>
  );
}

// ── Coming Soon Placeholder ───────────────────────────────────────────────────

function ComingSoonTab({ tabKey, t }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
      <Clock className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
        {t(`rentersRights.tab.${tabKey}`)}
      </p>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        {t("rentersRights.comingSoon")}
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RentersRightsPage() {
  const { activeAccountId } = useAccount();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState("informationSheets");
  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const loadTasks = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listRentersRightsTasks({ accountId: activeAccountId });
      setTasks(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const allTabs = [
    "overview",
    "informationSheets",
    ...PHASE2_TABS,
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {t("rentersRights.title")}
          </h1>
          <JurisdictionBadge t={t} />
        </div>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t("rentersRights.subtitle")}
      </p>

      <DisclaimerBanner t={t} />

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {allTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              } ${PHASE2_TABS.includes(tab) ? "opacity-60" : ""}`}
            >
              {t(`rentersRights.tab.${tab}`)}
              {PHASE2_TABS.includes(tab) && (
                <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs dark:bg-slate-700">
                  {t("rentersRights.soon")}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === "overview" && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t("rentersRights.overview.description")}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(() => {
                const req   = tasks.filter((t) => t.status === "required").length;
                const ovd   = tasks.filter((t) => t.status === "overdue").length;
                const sent  = tasks.filter((t) => ["sent","evidence_uploaded","reviewed"].includes(t.status)).length;
                const notReq= tasks.filter((t) => t.status === "not_required").length;
                return (
                  <>
                    <StatCard label={t("rentersRights.stat.required")} value={req + ovd}
                      accent="border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10" />
                    <StatCard label={t("rentersRights.stat.overdue")} value={ovd}
                      accent="border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10" />
                    <StatCard label={t("rentersRights.stat.sent")} value={sent}
                      accent="border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-900/10" />
                    <StatCard label={t("rentersRights.stat.notRequired")} value={notReq}
                      accent="border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50" />
                  </>
                );
              })()}
            </div>
            <button
              onClick={() => setActiveTab("informationSheets")}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
            >
              {t("rentersRights.tab.informationSheets")} →
            </button>
          </div>
        )}

        {activeTab === "informationSheets" && (
          <InformationSheetsTab
            tasks={tasks}
            loading={loading}
            error={error}
            accountId={activeAccountId}
            onRefresh={loadTasks}
            t={t}
          />
        )}

        {PHASE2_TABS.includes(activeTab) && (
          <ComingSoonTab tabKey={activeTab} t={t} />
        )}
      </div>
    </div>
  );
}
