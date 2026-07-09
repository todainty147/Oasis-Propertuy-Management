// src/pages/compliance/RentersRightsPage.jsx
//
// Renters' Rights Readiness Pack — Phase 1 + 2
//
// LEGAL DISCLAIMER: This page helps landlords and property managers organise
// records and track operational tasks. It does not provide legal advice and
// does not determine whether any tenancy, notice, rent increase, pet decision,
// possession action, or landlord action is legally valid. Seek advice from a
// qualified professional where needed.

import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Info,
  Plus,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { useI18n } from "../../context/I18nContext";
import {
  listRentersRightsTasks,
  markRrTaskSentAndReconcileObligation,
  setRrTaskNotRequired,
  createRrTasksForActiveTenants,
  generateTenancyReviewPrompts,
  dismissTenancyReviewPrompt,
  parseReviewPromptRow,
  listRentReviewRecords,
  createRentReviewRecord,
  listPetRequests,
  createPetRequest,
  updatePetRequestStatus,
  listActiveTenantsForPetRequest,
  listPropertiesForPetRequest,
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
  { value: null,               labelKey: "rentersRights.filter.all" },
  { value: "required",         labelKey: "rentersRights.informationSheet.status.required" },
  { value: "overdue",          labelKey: "rentersRights.informationSheet.status.overdue" },
  { value: "sent",             labelKey: "rentersRights.informationSheet.status.sent" },
  { value: "evidence_uploaded",labelKey: "rentersRights.informationSheet.status.evidence_uploaded" },
  { value: "reviewed",         labelKey: "rentersRights.informationSheet.status.reviewed" },
  { value: "not_required",     labelKey: "rentersRights.informationSheet.status.not_required" },
];

// Phase 3+ tabs remain as coming-soon placeholders (petRequests is now live).
const PHASE3_TABS = ["possessionEvidence", "timeline"];

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
  // Unknown statuses get a neutral grey rather than a misleading amber "required" colour.
  const cls = cfg[status] ?? "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {t(`rentersRights.informationSheet.status.${status}`, status)}
    </span>
  );
}

// ── Mark Sent Modal ───────────────────────────────────────────────────────────

function bridgeStatusMessage(bridgeStatus, evaluationResult) {
  if (bridgeStatus === "full") {
    return {
      kind: "success",
      text: "Proof pack record created and service evidence recorded. This is an operational record only — not legal proof.",
    };
  }
  if (bridgeStatus === "obligation_only") {
    return {
      kind: "warn",
      text: "Proof pack record created. Service evidence recording incomplete — you can retry from the Proof Packs page.",
    };
  }
  if (bridgeStatus === "not_obligated") {
    const result = evaluationResult ? ` (evaluation: ${evaluationResult})` : "";
    return {
      kind: "info",
      text: `Marked as sent. The tenancy evaluation found no information-sheet obligation for this lease${result}. No proof pack record required.`,
    };
  }
  if (bridgeStatus === "evaluation_failed") {
    return {
      kind: "warn",
      text: "Marked as sent. Proof pack evaluation could not run — you can retry from the Proof Packs page.",
    };
  }
  if (bridgeStatus === "no_lease") {
    return {
      kind: "info",
      text: "Marked as sent. No active lease found for this tenant — proof pack record not created.",
    };
  }
  return null;
}

function MarkSentModal({ task, onClose, onSaved, accountId, t }) {
  const [deliveryMethod, setDeliveryMethod] = useState("email");
  const [sentAt, setSentAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [bridgeResult, setBridgeResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setBridgeResult(null);
    try {
      const result = await markRrTaskSentAndReconcileObligation({
        taskId:        task.id,
        accountId,
        deliveryMethod,
        sentAt:        sentAt ? new Date(sentAt).toISOString() : null,
        notes:         notes || null,
      });
      setBridgeResult(result);
      onSaved(result);
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

          {bridgeResult && (() => {
            const msg = bridgeStatusMessage(bridgeResult.bridgeStatus, bridgeResult.evaluationResult);
            if (!msg) return null;
            const colours = {
              success: "border-green-200 bg-green-50 text-green-800 dark:border-green-800/40 dark:bg-green-900/20 dark:text-green-300",
              warn:    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300",
              info:    "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800/40 dark:bg-blue-900/20 dark:text-blue-300",
            };
            return (
              <p className={`rounded-md border px-3 py-2 text-xs ${colours[msg.kind] || colours.info}`}>
                {msg.text}
              </p>
            );
          })()}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {bridgeResult ? t("common.close") : t("common.cancel")}
            </button>
            {!bridgeResult && (
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {t("rentersRights.informationSheet.markSent")}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Information Sheets Tab ────────────────────────────────────────────────────

function InformationSheetsTab({ tasks, counts, loading, error, accountId, onRefresh, t }) {
  const [statusFilter, setStatusFilter] = useState(null);
  const [markSentTask, setMarkSentTask]   = useState(null);
  const [actionError, setActionError]     = useState(null);
  const [syncing, setSyncing]             = useState(false);
  // Per-task processing state prevents double-submit on "Mark not required".
  const [processingId, setProcessingId]   = useState(null);

  const filtered = useMemo(
    () => statusFilter ? tasks.filter((task) => task.status === statusFilter) : tasks,
    [tasks, statusFilter],
  );

  async function handleSyncTenants() {
    setSyncing(true);
    setActionError(null);
    try {
      await createRrTasksForActiveTenants({ accountId });
      await onRefresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleNotRequired(task) {
    if (processingId) return;
    setProcessingId(task.id);
    setActionError(null);
    try {
      await setRrTaskNotRequired({ taskId: task.id, accountId });
      await onRefresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setProcessingId(null);
    }
  }

  function handleMarkSentSaved(_result) {
    // The modal shows the bridge result inline; we keep it open briefly so the
    // user can read it. Refresh the task list so the sent status updates.
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

      {/* Stats — computed in parent, passed as prop */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("rentersRights.stat.required")} value={counts.required + counts.overdue}
          accent="border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10" />
        <StatCard label={t("rentersRights.stat.overdue")} value={counts.overdue}
          accent="border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10" />
        <StatCard label={t("rentersRights.stat.sent")} value={counts.sent}
          accent="border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-900/10" />
        <StatCard label={t("rentersRights.stat.notRequired")} value={counts.not_required}
          accent="border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50" />
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
                            disabled={processingId === task.id}
                            className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            {processingId === task.id
                              ? <RefreshCw className="h-3 w-3 animate-spin" />
                              : <XCircle className="h-3 w-3" />}
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
      // Only information-sheet tasks belong in this view; tenancy review prompts
      // have their own tab and must not bleed in here with different due dates.
      setTasks(rows.filter((r) => r.requirementType === "renters_rights_information_sheet"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Counts computed once here, passed to Overview and InformationSheets tabs.
  const counts = useMemo(() => ({
    required:    tasks.filter((tk) => tk.status === "required").length,
    overdue:     tasks.filter((tk) => tk.status === "overdue").length,
    sent:        tasks.filter((tk) => ["sent", "evidence_uploaded", "reviewed"].includes(tk.status)).length,
    not_required:tasks.filter((tk) => tk.status === "not_required").length,
  }), [tasks]);

  const allTabs = [
    "overview",
    "informationSheets",
    "tenancyReview",
    "rentReviews",
    "petRequests",
    ...PHASE3_TABS,
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
        <Link
          to="/compliance/renters-rights/proof-pack"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Proof packs
        </Link>
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
              } ${PHASE3_TABS.includes(tab) ? "opacity-60" : ""}`}
            >
              {t(`rentersRights.tab.${tab}`)}
              {PHASE3_TABS.includes(tab) && (
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
              <StatCard label={t("rentersRights.stat.required")} value={counts.required + counts.overdue}
                accent="border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10" />
              <StatCard label={t("rentersRights.stat.overdue")} value={counts.overdue}
                accent="border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-900/10" />
              <StatCard label={t("rentersRights.stat.sent")} value={counts.sent}
                accent="border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-900/10" />
              <StatCard label={t("rentersRights.stat.notRequired")} value={counts.not_required}
                accent="border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50" />
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
            counts={counts}
            loading={loading}
            error={error}
            accountId={activeAccountId}
            onRefresh={loadTasks}
            t={t}
          />
        )}

        {activeTab === "tenancyReview" && (
          <TenancyReviewTab accountId={activeAccountId} t={t} />
        )}

        {activeTab === "rentReviews" && (
          <RentReviewsTab accountId={activeAccountId} t={t} />
        )}

        {activeTab === "petRequests" && (
          <PetRequestsTab accountId={activeAccountId} t={t} />
        )}

        {PHASE3_TABS.includes(activeTab) && (
          <ComingSoonTab tabKey={activeTab} t={t} />
        )}
      </div>
    </div>
  );
}

// ── Tenancy Review Tab ────────────────────────────────────────────────────────

function TenancyReviewTab({ accountId, t }) {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [generating, setGenerating] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listRentersRightsTasks({
        accountId,
        status: null,
        limit: 200,
      });
      const reviewRows = rows
        .filter((r) => r.requirementType === "tenancy_review_prompt")
        .map(parseReviewPromptRow);
      setPrompts(reviewRows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateTenancyReviewPrompts({ accountId });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDismiss(prompt) {
    if (processingId) return;
    setProcessingId(prompt.id);
    try {
      await dismissTenancyReviewPrompt({ taskId: prompt.id, accountId });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  }

  const open     = prompts.filter((p) => p.status === "required");
  const reviewed = prompts.filter((p) => p.status === "reviewed");

  const severityBadge = (sev) => {
    const cfg = {
      high:    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
      info:    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    };
    return <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${cfg[sev] ?? cfg.info}`}>{sev}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{t("rentersRights.tenancyReview.disclaimer")}</p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("rentersRights.tenancyReview.description")}
        </p>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
        >
          <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} />
          {t("rentersRights.tenancyReview.runChecks")}
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>
      ) : open.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
          <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("rentersRights.tenancyReview.empty")}</p>
          <button onClick={handleGenerate} disabled={generating}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900">
            <RefreshCw className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} />
            {t("rentersRights.tenancyReview.runChecks")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {open.map((prompt) => (
            <div key={prompt.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    {severityBadge(prompt.severity)}
                    <span className="text-xs text-slate-400">{prompt.tenantName} · {prompt.propertyAddress}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{prompt.explanation}</p>
                  {prompt.suggestedAction && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{prompt.suggestedAction}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDismiss(prompt)}
                  disabled={processingId === prompt.id}
                  className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
                >
                  {processingId === prompt.id
                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                    : <CheckCircle2 className="h-3 w-3" />}
                  {t("rentersRights.tenancyReview.markReviewed")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <details className="rounded-xl border border-slate-200 dark:border-slate-700">
          <summary className="cursor-pointer px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
            {t("rentersRights.tenancyReview.reviewed")} ({reviewed.length})
          </summary>
          <div className="space-y-2 p-4 pt-0">
            {reviewed.map((p) => (
              <div key={p.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {p.explanation} · {p.tenantName}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Rent Reviews Tab ──────────────────────────────────────────────────────────

const RENT_REVIEW_STATUSES = ["draft","evidence_needed","ready_for_review","sent","challenged","completed","cancelled"];

function RentReviewsTab({ accountId, t }) {
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({
    currentRent: "", proposedRent: "", proposedEffectiveDate: "", notes: "",
  });

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      setRecords(await listRentReviewRecords({ accountId }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createRentReviewRecord({
        accountId,
        currentRent:           form.currentRent  ? Number(form.currentRent)  : null,
        proposedRent:          form.proposedRent ? Number(form.proposedRent) : null,
        proposedEffectiveDate: form.proposedEffectiveDate || null,
        notes:                 form.notes || null,
      });
      setShowForm(false);
      setForm({ currentRent: "", proposedRent: "", proposedEffectiveDate: "", notes: "" });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const statusBadge = (status) => {
    const cfg = {
      draft:            "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
      evidence_needed:  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
      ready_for_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      sent:             "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      challenged:       "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      completed:        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
      cancelled:        "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
    };
    return <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${cfg[status] ?? cfg.draft}`}>{t(`rentersRights.rentReview.status.${status}`, status)}</span>;
  };

  const fmt = (v) => v ? new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString() : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{t("rentersRights.rentReview.disclaimer")}</p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("rentersRights.rentReview.description")}</p>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900">
          <Plus className="h-3.5 w-3.5" />
          {t("rentersRights.rentReview.create")}
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("rentersRights.rentReview.create")}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{t("rentersRights.rentReview.currentRent")}</label>
              <input type="number" min="0" step="0.01" value={form.currentRent}
                onChange={(e) => setForm((f) => ({ ...f, currentRent: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{t("rentersRights.rentReview.proposedRent")}</label>
              <input type="number" min="0" step="0.01" value={form.proposedRent}
                onChange={(e) => setForm((f) => ({ ...f, proposedRent: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{t("rentersRights.rentReview.effectiveDate")}</label>
              <input type="date" value={form.proposedEffectiveDate}
                onChange={(e) => setForm((f) => ({ ...f, proposedEffectiveDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{t("rentersRights.rentReview.notes")}</label>
              <input type="text" value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>
      ) : records.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
          <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("rentersRights.rentReview.empty")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                {["tenant","property","currentRent","proposedRent","effectiveDate","status"].map((c) => (
                  <th key={c} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t(`rentersRights.rentReview.col.${c}`, c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{r.tenantName}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.propertyAddress}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.currentRent != null ? `£${r.currentRent.toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.proposedRent != null ? `£${r.proposedRent.toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{fmt(r.proposedEffectiveDate)}</td>
                  <td className="px-4 py-3">{statusBadge(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Pet Requests Tab ──────────────────────────────────────────────────────────

const PET_TYPES = ["dog", "cat", "bird", "reptile", "other"];

function PetRequestsTab({ accountId, t }) {
  const [requests, setRequests]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [logModal, setLogModal]         = useState(false);
  const [decisionModal, setDecisionModal] = useState(null);
  const [saving, setSaving]             = useState(false);
  const [tenants, setTenants]           = useState([]);
  const [properties, setProperties]     = useState([]);
  const [form, setForm] = useState({
    tenantId: "", propertyId: "", petType: "dog",
    petDescription: "", requestDate: "", notes: "",
  });
  const [decision, setDecision] = useState({
    status: "approved", decisionDate: "", refusalReason: "", insuranceRequired: false,
  });

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      setRequests(await listPetRequests({ accountId }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  async function openLogModal() {
    const today = new Date().toISOString().slice(0, 10);
    const [tList, pList] = await Promise.all([
      listActiveTenantsForPetRequest({ accountId }),
      listPropertiesForPetRequest({ accountId }),
    ]);
    setTenants(tList);
    setProperties(pList);
    setForm({ tenantId: "", propertyId: "", petType: "dog", petDescription: "", requestDate: today, notes: "" });
    setLogModal(true);
  }

  async function handleLogRequest(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createPetRequest({
        accountId,
        tenantId:       form.tenantId       || null,
        propertyId:     form.propertyId     || null,
        petType:        form.petType,
        petDescription: form.petDescription || null,
        requestDate:    form.requestDate    || null,
        notes:          form.notes          || null,
      });
      setLogModal(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordDecision(e) {
    e.preventDefault();
    if (!decisionModal) return;
    setSaving(true);
    setError(null);
    try {
      await updatePetRequestStatus({
        requestId:        decisionModal.id,
        accountId,
        status:           decision.status,
        decisionDate:     decision.decisionDate || null,
        refusalReason:    decision.status === "refused"   ? decision.refusalReason     : null,
        insuranceRequired:decision.status === "approved"  ? decision.insuranceRequired : null,
      });
      setDecisionModal(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const statusBadge = (req) => {
    const cfg = {
      received:     "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      under_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
      approved:     "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      refused:      "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      withdrawn:    "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
    };
    return (
      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${cfg[req.status] ?? cfg.received}`}>
        {req.isOverdue && <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />}
        {t(`rentersRights.petRequest.status.${req.status}`, req.status)}
        {req.isOverdue && ` — ${t("rentersRights.petRequest.overdue")}`}
      </span>
    );
  };

  const fmt = (v) => v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString() : "—";

  const decisionButtons = [
    { key: "approved",  label: t("rentersRights.petRequest.decisionApprove"),  active: "border-green-500 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300" },
    { key: "refused",   label: t("rentersRights.petRequest.decisionRefuse"),   active: "border-red-500 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300" },
    { key: "withdrawn", label: t("rentersRights.petRequest.decisionWithdrawn"), active: "border-slate-500 bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{t("rentersRights.petRequest.disclaimer")}</p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("rentersRights.petRequest.description")}</p>
        <button
          onClick={openLogModal}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("rentersRights.petRequest.logRequest")}
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Log Request Modal */}
      {logModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("rentersRights.petRequest.logRequest")}
            </h3>
            <form onSubmit={handleLogRequest} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t("rentersRights.petRequest.tenant")}
                  </label>
                  <select
                    value={form.tenantId}
                    onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">{t("rentersRights.petRequest.selectTenant")}</option>
                    {tenants.map((tn) => (
                      <option key={tn.id} value={tn.id}>{tn.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t("rentersRights.petRequest.property")}
                  </label>
                  <select
                    value={form.propertyId}
                    onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">{t("rentersRights.petRequest.selectProperty")}</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.address}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t("rentersRights.petRequest.petType")}
                  </label>
                  <select
                    value={form.petType}
                    onChange={(e) => setForm((f) => ({ ...f, petType: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {PET_TYPES.map((pt) => (
                      <option key={pt} value={pt}>{t(`rentersRights.petRequest.petType.${pt}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t("rentersRights.petRequest.requestDate")}
                  </label>
                  <input
                    type="date"
                    required
                    value={form.requestDate}
                    onChange={(e) => setForm((f) => ({ ...f, requestDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t("rentersRights.petRequest.petDescription")}
                  </label>
                  <input
                    type="text"
                    value={form.petDescription}
                    onChange={(e) => setForm((f) => ({ ...f, petDescription: e.target.value }))}
                    placeholder={t("rentersRights.petRequest.petDescriptionPlaceholder")}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t("rentersRights.petRequest.notes")}
                  </label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder={t("rentersRights.petRequest.notesPlaceholder")}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLogModal(false)}
                  className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Decision Modal */}
      {decisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("rentersRights.petRequest.recordDecision")}
            </h3>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              {decisionModal.tenantName} — {decisionModal.propertyAddress}
            </p>
            <form onSubmit={handleRecordDecision} className="space-y-4">
              <div className="flex gap-2">
                {decisionButtons.map(({ key, label, active }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDecision((d) => ({ ...d, status: key }))}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      decision.status === key
                        ? active
                        : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t("rentersRights.petRequest.decisionDate")}
                </label>
                <input
                  type="date"
                  value={decision.decisionDate}
                  onChange={(e) => setDecision((d) => ({ ...d, decisionDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              {decision.status === "refused" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t("rentersRights.petRequest.refusalReason")} *
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={decision.refusalReason}
                    onChange={(e) => setDecision((d) => ({ ...d, refusalReason: e.target.value }))}
                    placeholder={t("rentersRights.petRequest.refusalReasonPlaceholder")}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              )}
              {decision.status === "approved" && (
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={decision.insuranceRequired}
                    onChange={(e) => setDecision((d) => ({ ...d, insuranceRequired: e.target.checked }))}
                    className="rounded"
                  />
                  {t("rentersRights.petRequest.insuranceRequired")}
                </label>
              )}
              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDecisionModal(null)}
                  className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
                >
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">{t("common.loading")}</div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
          <FileText className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("rentersRights.petRequest.empty")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                {["tenant", "property", "petType", "requestDate", "decisionDue", "status"].map((c) => (
                  <th
                    key={c}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {t(`rentersRights.petRequest.col.${c}`, c)}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {requests.map((r) => (
                <tr
                  key={r.id}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                    r.isOverdue ? "bg-amber-50/60 dark:bg-amber-900/10" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{r.tenantName}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{r.propertyAddress}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {t(`rentersRights.petRequest.petType.${r.petType}`, r.petType)}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{fmt(r.requestDate)}</td>
                  <td className={`px-4 py-3 ${r.isOverdue ? "font-medium text-amber-700 dark:text-amber-400" : "text-slate-600 dark:text-slate-400"}`}>
                    {fmt(r.decisionDueDate)}
                  </td>
                  <td className="px-4 py-3">{statusBadge(r)}</td>
                  <td className="px-4 py-3 text-right">
                    {["received", "under_review"].includes(r.status) && (
                      <button
                        onClick={() => {
                          setDecision({
                            status: "approved",
                            decisionDate: new Date().toISOString().slice(0, 10),
                            refusalReason: "",
                            insuranceRequired: false,
                          });
                          setDecisionModal(r);
                        }}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        {t("rentersRights.petRequest.recordDecision")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
