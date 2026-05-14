import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, FileDown, RefreshCw, ShieldAlert, XCircle } from "lucide-react";

import { usePageTitle } from "../../layout/PageTitleContext";
import {
  completeDataExportRequest,
  listProcessingLog,
  listRootDataDeletionRequests,
  listRootDataExportRequests,
  processDataDeletionRequest,
  requestStatusLabel,
  updateDataDeletionRequest,
} from "../../services/dataPrivacyService";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function summaryText(summary) {
  if (!summary || typeof summary !== "object") return "No processing summary yet";
  const parts = ["delete", "anonymise", "restrict_access", "retain_with_reason", "revoke_token", "remove_membership"]
    .map((key) => `${key}: ${summary[key] || 0}`);
  return parts.join(" · ");
}

export default function RootDataRequestsPage() {
  const { setTitle } = usePageTitle();
  const [tab, setTab] = useState("deletion");
  const [rows, setRows] = useState([]);
  const [exportRows, setExportRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [logRows, setLogRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [rejectedReason, setRejectedReason] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [exportStoragePath, setExportStoragePath] = useState("");

  useEffect(() => {
    setTitle("Data Requests");
  }, [setTitle]);

  const refresh = useCallback(async () => {
    setError("");
    const [{ data }, { data: exports }] = await Promise.all([
      listRootDataDeletionRequests(),
      listRootDataExportRequests(),
    ]);
    setRows(data);
    setExportRows(exports);
    if (selected?.id) {
      const pool = tab === "deletion" ? data : exports;
      const nextSelected = pool.find((row) => row.id === selected.id) || null;
      setSelected(nextSelected);
      if (nextSelected && tab === "deletion") setLogRows(await listProcessingLog(nextSelected.id));
    }
  }, [selected?.id, tab]);

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, [refresh]);

  async function selectRow(row) {
    setSelected(row);
    setLogRows([]);
    setError("");
    try {
      setLogRows(await listProcessingLog(row.id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function runAction(status) {
    if (!selected) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const row = await updateDataDeletionRequest({
        requestId: selected.id,
        status,
        adminNotes,
        rejectedReason,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      });
      setSelected(row);
      setMessage(`Request updated to ${requestStatusLabel(row.status)}.`);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function processSelected() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const row = await processDataDeletionRequest(selected.id);
      setSelected(row);
      setMessage(`Request processed: ${requestStatusLabel(row.status)}.`);
      setLogRows(await listProcessingLog(row.id));
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function completeExport() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const row = await completeDataExportRequest(selected.id, exportStoragePath || null);
      setSelected(row);
      setMessage(`Export marked completed.`);
      setExportStoragePath("");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function downloadReport() {
    if (!selected) return;
    const payload = {
      request: selected,
      processing_log: logRows,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `data-request-${selected.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Root Data Requests</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Review account deletion, workspace closure, tenant erasure, contractor erasure, export, and retention processing outcomes.</p>
          </div>
          <button
            type="button"
            onClick={() => refresh().catch((err) => setError(err.message))}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </section>

      {(error || message) && (
        <div className={`rounded-lg border p-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {error || message}
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800 w-fit">
        {[["deletion", "Deletion requests"], ["export", "Export requests"]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); setSelected(null); setLogRows([]); }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === key ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700"}`}
          >
            {label}
            <span className="ml-2 rounded-full bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 text-xs">
              {key === "deletion" ? rows.length : exportRows.length}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            {tab === "deletion" ? (
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Request</th>
                    <th className="py-2 pr-4">Account</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${selected?.id === row.id ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
                      onClick={() => selectRow(row)}
                    >
                      <td className="py-3 pr-4 font-mono text-xs">{row.id.slice(0, 8)}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{row.account_id || "—"}</td>
                      <td className="py-3 pr-4">{row.request_type}</td>
                      <td className="py-3 pr-4">{requestStatusLabel(row.status)}</td>
                      <td className="py-3 pr-4">{formatDate(row.created_at)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-slate-500">No deletion requests found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Request</th>
                    <th className="py-2 pr-4">Account</th>
                    <th className="py-2 pr-4">Export type</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {exportRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${selected?.id === row.id ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
                      onClick={() => setSelected(row)}
                    >
                      <td className="py-3 pr-4 font-mono text-xs">{row.id.slice(0, 8)}</td>
                      <td className="py-3 pr-4 font-mono text-xs">{row.account_id || "—"}</td>
                      <td className="py-3 pr-4">{row.export_type}</td>
                      <td className="py-3 pr-4">{requestStatusLabel(row.status)}</td>
                      <td className="py-3 pr-4">{formatDate(row.created_at)}</td>
                    </tr>
                  ))}
                  {exportRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-slate-500">No export requests found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {tab === "deletion" ? "Review actions" : "Export actions"}
            </h2>
            {selected ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
                  <p className="font-mono">{selected.id}</p>
                  <p className="mt-2">
                    {tab === "deletion" ? selected.request_type : selected.export_type}
                    {" · "}{requestStatusLabel(selected.status)}
                  </p>
                  {tab === "deletion" && <p className="mt-2 text-slate-500">{summaryText(selected.retention_summary)}</p>}
                  {tab === "export" && selected.storage_path && (
                    <p className="mt-2 break-all text-slate-500">Path: {selected.storage_path}</p>
                  )}
                </div>

                {tab === "deletion" ? (
                  <>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={3}
                      placeholder="Admin notes"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      value={rejectedReason}
                      onChange={(e) => setRejectedReason(e.target.value)}
                      placeholder="Rejected reason"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                    <input
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={() => runAction("identity_verification_required")} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50">
                        <ShieldAlert size={14} /> Verify ID
                      </button>
                      <button type="button" disabled={busy} onClick={() => runAction("approved")} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50">
                        <CheckCircle2 size={14} /> Approve
                      </button>
                      <button type="button" disabled={busy} onClick={() => runAction("scheduled")} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50">
                        <Clock size={14} /> Schedule
                      </button>
                      <button type="button" disabled={busy} onClick={() => runAction("rejected")} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-50">
                        <XCircle size={14} /> Reject
                      </button>
                      <button type="button" disabled={busy} onClick={processSelected} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                        Process
                      </button>
                      <button type="button" disabled={!logRows.length} onClick={downloadReport} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50">
                        <FileDown size={14} /> Report
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <input
                      value={exportStoragePath}
                      onChange={(e) => setExportStoragePath(e.target.value)}
                      placeholder="Storage path (optional)"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      disabled={busy || selected.status === "completed"}
                      onClick={completeExport}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} /> Mark completed
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Select a request to review.</p>
            )}
          </section>

          {tab === "deletion" && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Processing log</h2>
              <div className="mt-4 space-y-3">
                {logRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-slate-100 p-3 text-xs dark:border-slate-800">
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold">{row.action}</span>
                      <span>{row.status}</span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">{row.entity_type}</p>
                    <p className="mt-1 text-slate-500">{row.retention_reason || "—"}</p>
                  </div>
                ))}
                {selected && logRows.length === 0 && <p className="text-sm text-slate-500">No processing rows yet.</p>}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
