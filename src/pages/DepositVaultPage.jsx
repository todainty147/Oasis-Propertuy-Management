import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, FileText, Link2, Lock, Plus, ShieldCheck } from "lucide-react";

import Card from "../components/Card";
import { useAccount } from "../context/AccountContext";
import { useProperties } from "../hooks/useProperties";
import { useTenants } from "../hooks/useTenants";
import {
  addDepositDeduction,
  archiveDepositSettlement,
  buildDepositSettlementStatement,
  calculateSettlementTotals,
  createDepositSettlement,
  generateDepositSettlementStatement,
  linkDeductionEvidence,
  listDepositSettlements,
  lockDepositSettlement,
} from "../services/depositSettlementService";
import { formatCurrencyAmount } from "../utils/currency";

const fieldClass = "rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";
const disabledFieldClass = `${fieldClass} disabled:cursor-not-allowed disabled:opacity-60`;

function isReadOnlySettlement(settlement) {
  return settlement?.status === "locked" || settlement?.status === "archived" || Boolean(settlement?.locked_at || settlement?.archived_at);
}

function statusBadgeClass(status) {
  if (status === "locked") return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100";
  if (status === "archived") return "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
  if (status === "statement_generated") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";
  return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100";
}

function evidenceBadgeClass(missingCount) {
  return missingCount
    ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";
}

function propertyName(properties, id) {
  const property = properties.find((entry) => String(entry.id) === String(id));
  return property?.address || property?.name || "Property not recorded";
}

function tenantName(tenants, id) {
  const tenant = tenants.find((entry) => String(entry.id) === String(id));
  return tenant?.name || tenant?.email || "No tenant linked";
}

export default function DepositVaultPage() {
  const { activeAccountId } = useAccount();
  const { properties } = useProperties({ enabled: true });
  const { tenants } = useTenants({ enabled: true });
  const [settlements, setSettlements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ propertyId: "", tenantId: "", depositHeldAmount: "", currency: "GBP", jurisdiction: "UK", summary: "" });
  const [deduction, setDeduction] = useState({ deductionType: "cleaning", title: "", description: "", amount: "" });
  const [evidence, setEvidence] = useState({ deductionId: "", evidenceType: "note", evidenceLabel: "", notes: "" });

  const selected = useMemo(
    () => settlements.find((settlement) => String(settlement.id) === String(selectedId)) || settlements[0] || null,
    [settlements, selectedId],
  );
  const totals = useMemo(() => calculateSettlementTotals(selected || {}), [selected]);
  const statementPreview = useMemo(() => selected ? buildDepositSettlementStatement(selected) : null, [selected]);
  const selectedIsReadOnly = isReadOnlySettlement(selected);

  const reload = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    setError("");
    try {
      const rows = await listDepositSettlements({ accountId: activeAccountId });
      setSettlements(rows);
      if (!selectedId && rows[0]?.id) setSelectedId(rows[0].id);
    } catch (err) {
      setError(err?.message || "Could not load Deposit Vault.");
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, selectedId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCreateSettlement(event) {
    event.preventDefault();
    if (!form.propertyId) return;
    setError("");
    setMessage("");
    try {
      const row = await createDepositSettlement({
        accountId: activeAccountId,
        propertyId: form.propertyId,
        tenantId: form.tenantId || null,
        depositHeldAmount: form.depositHeldAmount,
        currency: form.currency,
        jurisdiction: form.jurisdiction,
        summary: form.summary,
      });
      setSelectedId(row.id);
      setForm({ propertyId: "", tenantId: "", depositHeldAmount: "", currency: "GBP", jurisdiction: "UK", summary: "" });
      await reload();
      setMessage("Settlement draft created.");
    } catch (err) {
      setError(err?.message || "Could not create settlement.");
    }
  }

  async function handleAddDeduction(event) {
    event.preventDefault();
    if (!selected?.id || !deduction.title || selectedIsReadOnly) return;
    setError("");
    setMessage("");
    try {
      await addDepositDeduction(selected.id, {
        accountId: activeAccountId,
        ...deduction,
      });
      setDeduction({ deductionType: "cleaning", title: "", description: "", amount: "" });
      await reload();
      setMessage("Deduction added.");
    } catch (err) {
      setError(err?.message || "Could not add deduction.");
    }
  }

  async function handleLinkEvidence(event) {
    event.preventDefault();
    if (!evidence.deductionId || selectedIsReadOnly) return;
    setError("");
    setMessage("");
    try {
      await linkDeductionEvidence(evidence.deductionId, { accountId: activeAccountId, ...evidence });
      setEvidence({ deductionId: "", evidenceType: "note", evidenceLabel: "", notes: "" });
      await reload();
      setMessage("Evidence link saved.");
    } catch (err) {
      setError(err?.message || "Could not link evidence.");
    }
  }

  async function runAction(action, successMessage) {
    if (!selected?.id) return;
    setError("");
    setMessage("");
    try {
      await action(selected.id);
      await reload();
      setMessage(successMessage || "Action complete.");
    } catch (err) {
      setError(err?.message || "Action failed.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Finance / Deposit Vault</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">Deposit Vault</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
          Create itemised deposit settlement statements and link deductions to evidence, maintenance records and documents.
        </p>
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Tenaqo helps organise deposit evidence and settlement statements. It does not hold deposit funds or replace legal advice.
        </p>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Settlement list</h2>
            <span className="text-xs text-slate-500">{loading ? "Loading" : `${settlements.length} settlements`}</span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Property</th>
                  <th className="py-2 pr-3">Tenant</th>
                  <th className="py-2 pr-3">Deposit held</th>
                  <th className="py-2 pr-3">Deductions</th>
                  <th className="py-2 pr-3">Return</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {settlements.map((settlement) => {
                  const rowTotals = calculateSettlementTotals(settlement);
                  return (
                    <tr key={settlement.id} className={`cursor-pointer ${selected?.id === settlement.id ? "bg-blue-50/70 dark:bg-blue-950/30" : ""}`} onClick={() => setSelectedId(settlement.id)}>
                      <td className="py-3 pr-3">{propertyName(properties, settlement.property_id)}</td>
                      <td className="py-3 pr-3">{tenantName(tenants, settlement.tenant_id)}</td>
                      <td className="py-3 pr-3">{formatCurrencyAmount(settlement.deposit_held_amount, { currency: settlement.currency })}</td>
                      <td className="py-3 pr-3">{formatCurrencyAmount(rowTotals.proposedDeductionsTotal, { currency: settlement.currency })}</td>
                      <td className="py-3 pr-3">{formatCurrencyAmount(rowTotals.proposedReturnAmount, { currency: settlement.currency })}</td>
                      <td className="py-3 pr-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(settlement.status)}`}>
                          {String(settlement.status || "draft").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${evidenceBadgeClass(rowTotals.missingEvidenceCount)}`}>
                          {rowTotals.missingEvidenceCount ? `${rowTotals.missingEvidenceCount} missing` : "Attached"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!loading && settlements.length === 0 ? (
                  <tr>
                    <td className="py-8 text-center text-sm text-slate-500" colSpan={7}>
                      No deposit settlements yet. Create a draft settlement to start an itemised landlord review.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Create settlement</h2>
          <form className="mt-4 grid gap-3" onSubmit={handleCreateSettlement}>
            <select className={fieldClass} value={form.propertyId} onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value }))}>
              <option value="">Select property</option>
              {properties.map((property) => <option key={property.id} value={property.id}>{property.address || property.name}</option>)}
            </select>
            <select className={fieldClass} value={form.tenantId} onChange={(event) => setForm((current) => ({ ...current, tenantId: event.target.value }))}>
              <option value="">Select tenant</option>
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.email}</option>)}
            </select>
            <div className="grid gap-3 sm:grid-cols-3">
              <input className={fieldClass} placeholder="Deposit held amount" type="number" step="0.01" value={form.depositHeldAmount} onChange={(event) => setForm((current) => ({ ...current, depositHeldAmount: event.target.value }))} />
              <input className={fieldClass} placeholder="Currency" value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} />
              <select className={fieldClass} value={form.jurisdiction} onChange={(event) => setForm((current) => ({ ...current, jurisdiction: event.target.value }))}>
                <option>UK</option>
                <option>Poland</option>
                <option>Other</option>
              </select>
            </div>
            <textarea className={fieldClass} rows={3} placeholder="Summary" value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} />
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" type="submit">
              <Plus size={16} /> Create settlement
            </button>
          </form>
        </Card>
      </div>

      {selected ? (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Settlement detail</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(selected.status)}`}>
                {String(selected.status || "draft").replace(/_/g, " ")}
              </span>
              {selectedIsReadOnly ? (
                <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Read-only
                </span>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Deposit held", formatCurrencyAmount(totals.depositHeldAmount, { currency: selected.currency })],
                ["Deductions total", formatCurrencyAmount(totals.proposedDeductionsTotal, { currency: selected.currency })],
                ["Proposed return", formatCurrencyAmount(totals.proposedReturnAmount, { currency: selected.currency })],
                ["Evidence attached", totals.evidenceAttachedCount],
                ["Missing evidence", totals.missingEvidenceCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                  <p className="text-xs uppercase text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{value}</p>
                </div>
              ))}
            </div>
            {totals.negativeReturnWarning ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Deductions exceed the deposit held. Mark for landlord review before sharing.</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => runAction(generateDepositSettlementStatement, "Statement export generated.")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold">
                <FileText size={15} /> Generate statement
              </button>
              <Link to="/documents/evidence-vault/dispute-packs" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold">
                <ShieldCheck size={15} /> Create dispute pack
              </Link>
              <button type="button" disabled={selectedIsReadOnly} onClick={() => runAction(lockDepositSettlement, "Settlement locked.")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                <Lock size={15} /> Lock settlement
              </button>
              <button type="button" disabled={selected?.status === "archived"} onClick={() => runAction(archiveDepositSettlement, "Settlement archived.")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                <Archive size={15} /> Archive
              </button>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Deduction schedule</h2>
            <div className="mt-3 space-y-2">
              {(selected.deposit_deductions || []).map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-xs uppercase text-slate-500">{item.deduction_type} · {String(item.evidence_status || "missing").replace(/_/g, " ")}</p>
                    </div>
                    <p className="font-semibold">{formatCurrencyAmount(item.amount, { currency: selected.currency })}</p>
                  </div>
                  {item.description ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.description}</p> : null}
                </div>
              ))}
            </div>

            <form className="mt-4 grid gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800" onSubmit={handleAddDeduction}>
              <p className="text-sm font-semibold">Add deduction</p>
              {selectedIsReadOnly ? <p className="text-sm text-slate-500">Locked or archived settlements are read-only.</p> : null}
              <div className="grid gap-3 sm:grid-cols-3">
                <select disabled={selectedIsReadOnly} className={disabledFieldClass} value={deduction.deductionType} onChange={(event) => setDeduction((current) => ({ ...current, deductionType: event.target.value }))}>
                  {["cleaning","damage","missing_keys","rent_arrears","gardening","rubbish_removal","unpaid_bills","repair_invoice","replacement_item","other"].map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <input disabled={selectedIsReadOnly} className={disabledFieldClass} placeholder="Title" value={deduction.title} onChange={(event) => setDeduction((current) => ({ ...current, title: event.target.value }))} />
                <input disabled={selectedIsReadOnly} className={disabledFieldClass} placeholder="Amount" type="number" step="0.01" value={deduction.amount} onChange={(event) => setDeduction((current) => ({ ...current, amount: event.target.value }))} />
              </div>
              <textarea disabled={selectedIsReadOnly} className={disabledFieldClass} rows={2} placeholder="Explanation" value={deduction.description} onChange={(event) => setDeduction((current) => ({ ...current, description: event.target.value }))} />
              <button disabled={selectedIsReadOnly} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" type="submit">
                <Plus size={15} /> Add deduction
              </button>
            </form>

            <form className="mt-4 grid gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800" onSubmit={handleLinkEvidence}>
              <p className="text-sm font-semibold">Evidence links</p>
              {selectedIsReadOnly ? <p className="text-sm text-slate-500">Evidence links are locked with the settlement.</p> : null}
              <select disabled={selectedIsReadOnly} className={disabledFieldClass} value={evidence.deductionId} onChange={(event) => setEvidence((current) => ({ ...current, deductionId: event.target.value }))}>
                <option value="">Select deduction</option>
                {(selected.deposit_deductions || []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <select disabled={selectedIsReadOnly} className={disabledFieldClass} value={evidence.evidenceType} onChange={(event) => setEvidence((current) => ({ ...current, evidenceType: event.target.value }))}>
                  {["evidence_vault_report","evidence_vault_item","inspection_photo","maintenance_request","work_order","invoice_document","quote_document","receipt_document","tenancy_agreement","communication","note","other"].map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <input disabled={selectedIsReadOnly} className={disabledFieldClass} placeholder="Evidence label or reference" value={evidence.evidenceLabel} onChange={(event) => setEvidence((current) => ({ ...current, evidenceLabel: event.target.value }))} />
              </div>
              <textarea disabled={selectedIsReadOnly} className={disabledFieldClass} rows={2} placeholder="Notes" value={evidence.notes} onChange={(event) => setEvidence((current) => ({ ...current, notes: event.target.value }))} />
              <button disabled={selectedIsReadOnly} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" type="submit">
                <Link2 size={15} /> Link evidence
              </button>
            </form>
          </Card>

          <Card className="p-5 xl:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Statement preview</h2>
            <div className="mt-3 rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-800">
              <p className="font-semibold">{statementPreview?.title}</p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">{statementPreview?.property} · {statementPreview?.tenant}</p>
              <p className="mt-3 text-xs text-slate-500">{statementPreview?.disclaimer}</p>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
