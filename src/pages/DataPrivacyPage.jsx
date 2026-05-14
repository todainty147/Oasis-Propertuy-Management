import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileText, ShieldCheck, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { useAccount } from "../context/AccountContext";
import { useAuth } from "../context/AuthContext";
import { usePageTitle } from "../layout/PageTitleContext";
import {
  listMyDataDeletionRequests,
  requestStatusLabel,
  submitDataDeletionRequest,
  submitDataExportRequest,
} from "../services/dataPrivacyService";

const REQUEST_OPTIONS = [
  { value: "user_account_deletion", label: "Request account deletion", scope: "user" },
  { value: "membership_removal", label: "Remove my membership from this workspace", scope: "user" },
  { value: "tenant_data_erasure", label: "Tenant data erasure request", scope: "tenant" },
  { value: "contractor_data_erasure", label: "Contractor data erasure request", scope: "contractor" },
  { value: "workspace_closure", label: "Request workspace closure", scope: "account" },
];

function Badge({ children }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
      {children}
    </span>
  );
}

export default function DataPrivacyPage() {
  const { user } = useAuth();
  const {
    activeAccountId,
    activeRole,
    isRootOperator,
    tenantContext,
    contractorContext,
  } = useAccount();
  const { setTitle } = usePageTitle();

  const [searchParams] = useSearchParams();
  const role = String(activeRole || "").toLowerCase();
  const canRequestWorkspaceClosure = isRootOperator || role === "owner" || role === "admin";
  const defaultRequestType = useMemo(() => {
    const requested = searchParams.get("request");
    if (!REQUEST_OPTIONS.some((o) => o.value === requested)) return "user_account_deletion";
    if (requested === "workspace_closure" && !canRequestWorkspaceClosure) return "user_account_deletion";
    return requested;
  }, [searchParams, canRequestWorkspaceClosure]);

  const [requestType, setRequestType] = useState(defaultRequestType);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [targetTenantId, setTargetTenantId] = useState(tenantContext?.tenant_id || "");
  const [targetContractorId, setTargetContractorId] = useState(contractorContext?.contractor_id || "");
  const [confirmed, setConfirmed] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    setTitle("Data & Privacy");
  }, [setTitle]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listMyDataDeletionRequests()
      .then((rows) => { if (!cancelled) { setRequests(rows); setLoading(false); } })
      .catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [message]);

  const selected = REQUEST_OPTIONS.find((option) => option.value === requestType) || REQUEST_OPTIONS[0];
  const workspaceClosureBlocked = requestType === "workspace_closure" && !canRequestWorkspaceClosure;
  const canSubmit = confirmed && deleteText === "DELETE" && !busy && !workspaceClosureBlocked;

  async function handleExport() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const row = await submitDataExportRequest({
        accountId: activeAccountId,
        exportType: role === "tenant" ? "tenant" : role === "contractor" ? "contractor" : "user",
      });
      setMessage(`Data export request submitted. Reference: ${row.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const row = await submitDataDeletionRequest({
        accountId: activeAccountId,
        requestType,
        scope: selected.scope,
        targetUserId: requestType === "user_account_deletion" || requestType === "membership_removal" ? user?.id : null,
        targetTenantId: requestType === "tenant_data_erasure" ? (targetTenantId || tenantContext?.tenant_id || null) : null,
        targetContractorId: requestType === "contractor_data_erasure" ? (targetContractorId || contractorContext?.contractor_id || null) : null,
        reason,
        requesterNotes: notes,
      });
      setMessage(`Deletion request submitted. Reference: ${row.id}. Status: ${requestStatusLabel(row.status)}.`);
      setReason("");
      setNotes("");
      setConfirmed(false);
      setDeleteText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Data & Privacy</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              OASIS stores rental operation records such as tenants, documents, finance records, maintenance history, and audit events. Some records may need to be retained for legal, tax, security, fraud prevention, accounting, dispute resolution, or audit reasons. We delete or anonymise personal data where appropriate and explain anything retained.
            </p>
          </div>
          <ShieldCheck className="text-emerald-600" size={28} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 flex items-center gap-3">
            <Trash2 size={20} className="text-rose-600" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Deletion request</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Requests are reviewed before any operational records are changed.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Request type</span>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                {REQUEST_OPTIONS.filter((option) => option.value !== "workspace_closure" || canRequestWorkspaceClosure).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            {requestType === "tenant_data_erasure" && (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Tenant ID</span>
                <input
                  value={targetTenantId}
                  onChange={(e) => setTargetTenantId(e.target.value)}
                  placeholder="Your tenant profile ID"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
            )}

            {requestType === "contractor_data_erasure" && (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Contractor ID</span>
                <input
                  value={targetContractorId}
                  onChange={(e) => setTargetContractorId(e.target.value)}
                  placeholder="Your contractor profile ID"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
            )}

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Reason, optional</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Notes, optional</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
              <span>I understand OASIS may retain finance, legal, tax, compliance, security, dispute, billing, and audit records where required.</span>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Type DELETE to confirm</span>
              <input
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </label>

            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            {message && <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              <Trash2 size={16} />
              Submit request
            </button>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <Download size={18} />
              Download my data
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Create a reviewed export request for your personal or account-scoped data.</p>
            <button
              type="button"
              onClick={handleExport}
              disabled={busy}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Download size={16} />
              Request export
            </button>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <FileText size={18} />
              Retention policy
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Deletion is controlled, auditable, and reviewed against retention obligations.</p>
            <a href="/privacy/delete-account" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300">
              Public deletion page <ExternalLink size={14} />
            </a>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Contact privacy support</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Email privacy@oasisrental.app with your request reference if you need help with identity verification or retention review.</p>
          </section>
        </aside>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Request status</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">Reference</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-6 text-sm text-slate-400">Loading…</td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-sm text-slate-500">No requests yet.</td>
                </tr>
              ) : requests.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-3 pr-4 font-mono text-xs">{row.id}</td>
                  <td className="py-3 pr-4">{row.request_type}</td>
                  <td className="py-3 pr-4"><Badge>{requestStatusLabel(row.status)}</Badge></td>
                  <td className="py-3 pr-4">{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
