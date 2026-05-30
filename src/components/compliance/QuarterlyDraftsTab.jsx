import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileJson, Lock, RefreshCw } from "lucide-react";

import { DEFAULT_TAX_YEAR, TAX_YEAR_OPTIONS, formatCurrency } from "../../utils/taxTools";
import {
  archiveDraft,
  createQuarterlyDraft,
  downloadQuarterlyDraftCsv,
  exportDraftSummary,
  generateQuarterlyDraftLinesCsv,
  generateQuarterlyDraftSummaryCsv,
  getQuarterlyDraft,
  listQuarterlyDrafts,
  lockDraft,
  markDraftReadyForAccountant,
  markDraftReviewed,
  rebuildQuarterlyDraft,
  setDraftLineIncluded,
} from "../../services/mtdQuarterlyDraftService";
import { getHmrcConnectionStatus } from "../../services/hmrcMtdService";

const EMPTY_FORM = {
  taxYear: DEFAULT_TAX_YEAR,
  periodStart: "2026-04-06",
  periodEnd: "2026-07-05",
  periodLabel: "Q1 2026-27",
  obligationId: "",
};

function Panel({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
}

function statusClass(status) {
  if (status === "locked" || status === "reviewed") return "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200";
  if (status === "needs_review") return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200";
  if (status === "archived") return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200";
}

function propertyLabel(properties, propertyId) {
  const property = properties.find((row) => row.id === propertyId);
  return property?.address || property?.name || propertyId || "No property";
}

function summaryValue(summary, key) {
  return Number(summary?.[key] || 0);
}

function checkSucceeded(check) {
  return ["success", "no_data"].includes(String(check?.status || "").toLowerCase());
}

function formatSignedCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export default function QuarterlyDraftsTab({ accountId, properties = [] }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [drafts, setDrafts] = useState([]);
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hmrcStatus, setHmrcStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextDraftId = selectedDraftId) => {
    if (!accountId) return;
    try {
      setLoading(true);
      setError("");
      const [nextDrafts, detail] = await Promise.all([
        listQuarterlyDrafts({ accountId }),
        nextDraftId ? getQuarterlyDraft(nextDraftId) : Promise.resolve(null),
      ]);
      setDrafts(nextDrafts);
      setSelectedDraft(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quarterly drafts.");
    } finally {
      setLoading(false);
    }
  }, [accountId, selectedDraftId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (!accountId) return undefined;
    getHmrcConnectionStatus(accountId)
      .then((status) => { if (!cancelled) setHmrcStatus(status); })
      .catch(() => { if (!cancelled) setHmrcStatus(null); });
    return () => { cancelled = true; };
  }, [accountId]);

  const validation = selectedDraft?.validation_summary || {};
  const netResult = summaryValue(validation, "incomeTotal") - summaryValue(validation, "expenseTotal");
  const issueLines = useMemo(
    () => (selectedDraft?.lines || []).filter((line) => line.issue_status && line.issue_status !== "ok"),
    [selectedDraft],
  );
  const latestCheck = useCallback((checkType) => {
    return (hmrcStatus?.readinessChecks || []).find((check) => check.check_type === checkType);
  }, [hmrcStatus]);

  async function handleCreate(event) {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      const draft = await createQuarterlyDraft({
        accountId,
        taxYear: form.taxYear,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        periodLabel: form.periodLabel,
        obligationId: form.obligationId,
      });
      setSelectedDraftId(draft.id);
      setSelectedDraft(draft);
      await load(draft.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create quarterly draft.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action, failure) {
    if (!selectedDraft?.id) return;
    try {
      setBusy(true);
      setError("");
      const nextDraft = await action(selectedDraft.id);
      setSelectedDraft(nextDraft);
      await load(nextDraft?.id || selectedDraft.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleLine(line) {
    await runAction(
      () => setDraftLineIncluded(selectedDraft.id, line.id, !line.include_in_draft),
      "Could not update the draft line.",
    );
  }

  async function handleExport(kind) {
    if (!selectedDraft) return;
    if (kind === "summary") {
      downloadQuarterlyDraftCsv(generateQuarterlyDraftSummaryCsv(selectedDraft), "mtd-quarterly-draft-summary.csv");
    } else if (kind === "lines") {
      downloadQuarterlyDraftCsv(generateQuarterlyDraftLinesCsv(selectedDraft.lines || []), "mtd-quarterly-source-records.csv");
    } else {
      const exports = await exportDraftSummary(selectedDraft.id);
      downloadQuarterlyDraftCsv(exports.summaryCsv, "mtd-quarterly-draft-summary.csv");
    }
  }

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Quarterly Update Drafts</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Prepare HMRC-ready quarterly summaries from existing Tenaqo tax records, expense classifications, and finance-cost context.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            HMRC submission disabled
          </span>
        </div>
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
          This screen prepares draft totals only. Tenaqo will not submit anything to HMRC from this phase.
        </div>
      </Panel>

      <Panel>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">HMRC read-only status</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          {[
            ["Connection", hmrcStatus?.connection?.status === "connected" ? "Connected" : "Not connected"],
            ["Business Details", latestCheck("business_details")?.status === "success" ? "Verified" : "Not verified"],
            ["Obligations", checkSucceeded(latestCheck("obligations_income_and_expenditure")) ? "Checked" : "Not checked"],
            ["Property Business", checkSucceeded(latestCheck("property_business_read")) ? "Checked" : "Not checked"],
            ["Live submission", "Disabled"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <p className="text-xs uppercase text-slate-500">{label}</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{value}</p>
            </div>
          ))}
        </div>
      </Panel>

      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="rounded px-1 text-lg leading-none hover:bg-rose-100 dark:hover:bg-rose-900/60" aria-label="Dismiss error">
            ×
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Panel>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Create draft</h3>
            <form onSubmit={handleCreate} className="mt-4 space-y-3">
              <Field label="Tax year">
                <select value={form.taxYear} onChange={(e) => setForm((f) => ({ ...f, taxYear: e.target.value }))} className={inputClass()}>
                  {TAX_YEAR_OPTIONS.map((year) => <option key={year}>{year}</option>)}
                </select>
              </Field>
              <Field label="Period label">
                <input value={form.periodLabel} onChange={(e) => setForm((f) => ({ ...f, periodLabel: e.target.value }))} className={inputClass()} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Field label="Period start">
                  <input type="date" required value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} className={inputClass()} />
                </Field>
                <Field label="Period end">
                  <input type="date" required value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} className={inputClass()} />
                </Field>
              </div>
              <Field label="Obligation ID (optional)">
                <input value={form.obligationId} onChange={(e) => setForm((f) => ({ ...f, obligationId: e.target.value }))} className={inputClass()} />
              </Field>
              <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
                {busy ? "Creating..." : "Create draft"}
              </button>
            </form>
          </Panel>

          <Panel>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Drafts</h3>
            <div className="mt-3 space-y-2">
              {loading ? <p className="text-sm text-slate-500">Loading drafts...</p> : null}
              {!loading && drafts.length === 0 ? <p className="text-sm text-slate-500">No quarterly drafts yet.</p> : null}
              {drafts.map((draft) => {
                const selected = draft.id === selectedDraftId;
                const summary = draft.validation_summary || {};
                return (
                  <button key={draft.id} type="button" onClick={() => { setSelectedDraftId(draft.id); load(draft.id); }}
                    className={`w-full rounded-xl border p-3 text-left text-sm transition ${selected ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30" : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-slate-900 dark:text-slate-100">{draft.period_label || `${draft.period_start} to ${draft.period_end}`}</strong>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(draft.status)}`}>{draft.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{draft.tax_year} · {formatCurrency(summary.incomeTotal || 0)} income · {summary.issueCount || 0} issues</p>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        {!selectedDraft ? (
          <Panel>
            <p className="text-sm text-slate-500">Select or create a quarterly draft to review source records and category totals.</p>
          </Panel>
        ) : (
          <div className="space-y-5">
            <Panel>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Draft detail</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{selectedDraft.period_label}</h3>
                  <p className="text-sm text-slate-500">{selectedDraft.period_start} to {selectedDraft.period_end} · {selectedDraft.tax_year}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy || selectedDraft.status === "locked" || selectedDraft.status === "archived"} onClick={() => runAction(rebuildQuarterlyDraft, "Could not rebuild draft.")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><RefreshCw size={14} /> Rebuild</button>
                  <button type="button" disabled={busy || selectedDraft.status === "locked" || selectedDraft.status === "archived"} onClick={() => runAction(markDraftReadyForAccountant, "Could not mark draft ready.")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><CheckCircle2 size={14} /> Ready</button>
                  <button type="button" disabled={busy || selectedDraft.status === "locked" || selectedDraft.status === "archived"} onClick={() => runAction(markDraftReviewed, "Could not mark draft reviewed.")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><CheckCircle2 size={14} /> Reviewed</button>
                  <button type="button" disabled={busy || selectedDraft.status === "locked" || selectedDraft.status === "archived"} onClick={() => runAction(lockDraft, "Could not lock draft.")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><Lock size={14} /> Lock</button>
                  <button type="button" disabled={busy || selectedDraft.status === "archived"} onClick={() => runAction(archiveDraft, "Could not archive draft.")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700">Archive</button>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {[
                  ["Income", formatCurrency(validation.incomeTotal || 0)],
                  ["Expenses", formatCurrency(validation.expenseTotal || 0)],
                  ["Adjustments", formatCurrency(validation.adjustmentTotal || 0)],
                  ["Net result", formatSignedCurrency(netResult)],
                  ["Issues", validation.issueCount || 0],
                  ["Included", validation.includedLines || 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                    <p className="text-xs uppercase text-slate-500">{label}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Category totals</h3>
                <button type="button" onClick={() => handleExport("summary")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700"><Download size={14} /> Summary CSV</button>
              </div>
              <div className="mt-3 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Category</th><th>Direction</th><th>Total</th><th>Records</th><th>Issues</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(selectedDraft.category_totals || []).map((row) => (
                      <tr key={row.categoryKey}><td className="py-2">{row.categoryKey}</td><td>{row.direction}</td><td>{formatCurrency(row.total)}</td><td>{row.count}</td><td>{row.issueCount}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Source records</h3>
                <button type="button" onClick={() => handleExport("lines")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700"><Download size={14} /> Source CSV</button>
              </div>
              <div className="mt-3 max-h-[520px] overflow-auto">
                {(selectedDraft.lines || []).length === 0 ? <p className="text-sm text-slate-500">No source records collected for this period.</p> : (
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Date</th><th>Property</th><th>Description</th><th>Source</th><th>Source ref</th><th>Category</th><th>Amount</th><th>Issue</th><th>Included</th></tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedDraft.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="py-2">{line.transaction_date}</td>
                          <td>{propertyLabel(properties, line.property_id)}</td>
                          <td>{line.description}</td>
                          <td>{line.source_type}</td>
                          <td>
                            <span className="block text-xs text-slate-500">{line.source_table || "No table"}</span>
                            <span className="block max-w-40 truncate text-xs text-slate-400">{line.source_id || "No source id"}</span>
                          </td>
                          <td>{line.hmrc_category_key || line.mtd_category || "Unmapped"}</td>
                          <td>{formatCurrency(line.amount)}</td>
                          <td><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${line.issue_status === "ok" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"}`}>{line.issue_status}</span></td>
                          <td>
                            <button type="button" disabled={busy || selectedDraft.status === "locked" || selectedDraft.status === "archived"} onClick={() => handleToggleLine(line)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:opacity-50 dark:border-slate-700">
                              {line.include_in_draft ? "Included" : "Excluded"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Panel>

            <div className="grid gap-5 xl:grid-cols-2">
              <Panel>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Issues</h3>
                <div className="mt-3 space-y-2">
                  {issueLines.length === 0 ? <p className="text-sm text-slate-500">No issues detected.</p> : issueLines.slice(0, 10).map((line) => (
                    <div key={line.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      <div className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> <strong>{line.issue_status}</strong></div>
                      <p className="mt-1">{line.description}</p>
                      <p className="mt-1 text-xs opacity-80">{line.issue_reason}</p>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Payload preview</h3>
                  <button type="button" onClick={() => handleExport("record")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700"><FileJson size={14} /> Record export</button>
                </div>
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                  This is a preview only. It is not submitted to HMRC.
                </div>
                <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(selectedDraft.payload_preview || {}, null, 2)}</pre>
                <button type="button" disabled className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 opacity-70 dark:border-slate-700">
                  HMRC submission disabled
                </button>
              </Panel>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
