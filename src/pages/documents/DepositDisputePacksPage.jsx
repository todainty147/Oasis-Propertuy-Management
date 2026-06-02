import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Download, Plus, Trash2 } from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { calculateDeductionTotal, DISPUTE_PACK_ITEM_TYPES, formatDisputePackMoney } from "../../lib/depositDisputePack";
import { calculateInspectionReportCounts } from "../../lib/evidenceVault";
import {
  addDepositDisputePackItem,
  createDepositDisputePack,
  getDepositDisputePackDetails,
  listComplianceSafeItems,
  listDepositDisputePacks,
  listInspectionReports,
  removeDepositDisputePackItem,
  updateDepositDisputePackItem,
  updateDepositDisputePackStatus,
} from "../../services/legalSecurityService";

function initialPackForm() {
  return {
    title: "Deposit dispute pack",
    propertyId: "",
    tenantId: "",
    depositAmount: "",
    proposedDeductionAmount: "",
    summary: "",
  };
}

function initialItemForm() {
  return {
    itemType: "deduction",
    title: "",
    claimedAmount: "",
    description: "",
    evidenceReferenceType: "",
    evidenceReferenceId: "",
  };
}

export default function DepositDisputePacksPage({ properties = [], tenants = [] }) {
  const { activeAccountId } = useAccount();
  const { packId } = useParams();
  const navigate = useNavigate();
  const [packs, setPacks] = useState([]);
  const [selectedPack, setSelectedPack] = useState(null);
  const [reports, setReports] = useState([]);
  const [complianceItems, setComplianceItems] = useState([]);
  const [packForm, setPackForm] = useState(initialPackForm);
  const [itemForm, setItemForm] = useState(initialItemForm);
  const [editingItemId, setEditingItemId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creatingPack, setCreatingPack] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [error, setError] = useState("");
  const loadSeqRef = useRef(0);

  const propertyById = useMemo(() => Object.fromEntries(properties.map((property) => [property.id, property])), [properties]);
  const tenantById = useMemo(() => Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant])), [tenants]);

  const selectedItems = useMemo(
    () => [...(selectedPack?.deposit_dispute_pack_items || [])].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
    [selectedPack]
  );
  const deductionTotal = calculateDeductionTotal(selectedItems);

  const load = useCallback(async (nextPackId, { isCurrent } = {}) => {
    if (!activeAccountId) return;
    const seq = ++loadSeqRef.current;
    const stillCurrent = isCurrent || (() => loadSeqRef.current === seq);
    setLoading(true);
    setError("");
    try {
      const id = nextPackId || "";
      const [nextPacks, nextReports, nextSelected] = await Promise.all([
        listDepositDisputePacks(activeAccountId),
        listInspectionReports(activeAccountId),
        id ? getDepositDisputePackDetails(activeAccountId, id) : Promise.resolve(null),
      ]);
      if (!stillCurrent()) return;
      setPacks(nextPacks);
      setReports(nextReports);
      setSelectedPack(nextSelected);
      if (nextSelected?.property_id) {
        const nextComplianceItems = await listComplianceSafeItems(activeAccountId, {
          propertyId: nextSelected.property_id,
          tenantId: nextSelected.tenant_id || "",
        });
        if (!stillCurrent()) return;
        setComplianceItems(nextComplianceItems);
      } else {
        setComplianceItems([]);
      }
    } catch (err) {
      if (stillCurrent()) setError(err?.message || "Could not load deposit dispute packs.");
    } finally {
      if (stillCurrent()) setLoading(false);
    }
  }, [activeAccountId]);

  useEffect(() => {
    let cancelled = false;
    load(packId, { isCurrent: () => !cancelled });
    return () => { cancelled = true; };
  }, [load, packId]);

  async function handleCreatePack(event) {
    event.preventDefault();
    setCreatingPack(true);
    setError("");
    try {
      const pack = await createDepositDisputePack(activeAccountId, packForm);
      setPackForm(initialPackForm());
      navigate(`/documents/evidence-vault/dispute-packs/${pack.id}`);
    } catch (err) {
      setError(err?.message || "Could not create dispute pack.");
    } finally {
      setCreatingPack(false);
    }
  }

  async function handleAddItem(event) {
    event.preventDefault();
    if (!selectedPack) return;
    setSavingItem(true);
    setError("");
    try {
      if (editingItemId) {
        await updateDepositDisputePackItem(activeAccountId, selectedPack.id, editingItemId, itemForm);
      } else {
        await addDepositDisputePackItem(activeAccountId, selectedPack.id, {
          ...itemForm,
          sortOrder: selectedItems.length * 10,
        });
      }
      setItemForm(initialItemForm());
      setEditingItemId("");
      await load(selectedPack.id);
    } catch (err) {
      setError(err?.message || "Could not add evidence or deduction item.");
    } finally {
      setSavingItem(false);
    }
  }

  async function handleRemoveItem(itemId) {
    if (!selectedPack || !window.confirm("Remove this item from the dispute pack?")) return;
    setSavingItem(true);
    setError("");
    try {
      await removeDepositDisputePackItem(activeAccountId, selectedPack.id, itemId);
      if (editingItemId === itemId) {
        setEditingItemId("");
        setItemForm(initialItemForm());
      }
      await load(selectedPack.id);
    } catch (err) {
      setError(err?.message || "Could not remove dispute pack item.");
    } finally {
      setSavingItem(false);
    }
  }

  async function handleStatusChange(status) {
    if (!selectedPack) return;
    if (status === "locked" && !window.confirm("Lock this dispute pack? Editing will be disabled to preserve the evidence bundle.")) return;
    if (status === "archived" && !window.confirm("Archive this dispute pack? It will be kept for reference but hidden from active work.")) return;
    setSavingStatus(true);
    setError("");
    try {
      await updateDepositDisputePackStatus(activeAccountId, selectedPack.id, status);
      await load(selectedPack.id);
    } catch (err) {
      setError(err?.message || "Could not update dispute pack status.");
    } finally {
      setSavingStatus(false);
    }
  }

  function startEditItem(item) {
    setEditingItemId(item.id);
    setItemForm({
      itemType: item.item_type || "deduction",
      title: item.title || "",
      claimedAmount: item.claimed_amount ?? "",
      description: item.description || "",
      evidenceReferenceType: item.evidence_reference_type || "",
      evidenceReferenceId: item.evidence_reference_id || "",
    });
  }

  function propertyLabel(propertyId) {
    const property = propertyById[propertyId];
    return property?.address || property?.name || propertyId || "No property";
  }

  function tenantLabel(tenantId) {
    const tenant = tenantById[tenantId];
    return tenant?.name || tenant?.email || tenantId || "No tenant linked";
  }

  const suggestedReports = reports
    .filter((report) => !selectedPack || report.property_id === selectedPack.property_id)
    .sort((a, b) => {
      const lockedScore = (b.status === "locked" ? 1 : 0) - (a.status === "locked" ? 1 : 0);
      if (lockedScore) return lockedScore;
      return new Date(b.inspection_date || b.created_at).getTime() - new Date(a.inspection_date || a.created_at).getTime();
    })
    .slice(0, 6);
  const selectedReferenceReport = reports.find((report) => report.id === itemForm.evidenceReferenceId);
  const selectedReferenceMissingFromSuggestions = Boolean(
    editingItemId &&
    itemForm.evidenceReferenceId &&
    !suggestedReports.some((report) => report.id === itemForm.evidenceReferenceId)
  );
  const complianceEvidenceSuggestions = complianceItems
    .filter((item) => {
      const label = String(item.compliance_requirements?.label || "").toLowerCase();
      return Boolean(item.evidence_document_id || item.evidence_source_id) && (
        label.includes("deposit protection") ||
        label.includes("prescribed information") ||
        label.includes("tenancy agreement") ||
        label.includes("inventory") ||
        label.includes("check-in") ||
        label.includes("check in") ||
        label.includes("onboarding acknowledgement")
      );
    })
    .slice(0, 8);

  function disputeItemTypeForComplianceItem(item) {
    const label = String(item.compliance_requirements?.label || "").toLowerCase();
    if (label.includes("tenancy agreement")) return "tenancy_agreement";
    if (label.includes("inventory") || label.includes("check-in") || label.includes("check in")) return "check_in_report";
    return "other";
  }

  async function handleAddComplianceSuggestion(item) {
    if (!selectedPack) return;
    setSavingItem(true);
    setError("");
    try {
      await addDepositDisputePackItem(activeAccountId, selectedPack.id, {
        itemType: disputeItemTypeForComplianceItem(item),
        title: item.compliance_requirements?.label || "Compliance Safe evidence",
        description: "Suggested Compliance Safe evidence selected by the landlord for dispute preparation.",
        evidenceReferenceType: "compliance_safe_item",
        evidenceReferenceId: item.id,
        sortOrder: selectedItems.length * 10,
      });
      await load(selectedPack.id);
    } catch (err) {
      setError(err?.message || "Could not add Compliance Safe evidence.");
    } finally {
      setSavingItem(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-5 p-4 lg:p-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Evidence Vault</p>
              <h1 className="mt-1 text-2xl font-semibold">Deposit Dispute Packs</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                Build an organised evidence bundle for deposit dispute preparation. This does not guarantee the outcome of any deposit dispute and does not replace legal advice.
              </p>
            </div>
            <Link to="/documents/evidence-vault" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200">Back to Evidence Vault</Link>
          </div>
        </div>

        {error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-950/50 p-4 text-sm text-rose-100">{error}</div> : null}

        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
              <h2 className="font-semibold">Create pack</h2>
              <form onSubmit={handleCreatePack} className="mt-4 space-y-3">
                <input required value={packForm.title} onChange={(event) => setPackForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Pack title" />
                <select required value={packForm.propertyId} onChange={(event) => setPackForm((current) => ({ ...current, propertyId: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                  <option value="">Property</option>
                  {properties.map((property) => <option key={property.id} value={property.id}>{property.address || property.name}</option>)}
                </select>
                <select value={packForm.tenantId} onChange={(event) => setPackForm((current) => ({ ...current, tenantId: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                  <option value="">Tenant optional</option>
                  {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.email}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min="0" step="0.01" value={packForm.depositAmount} onChange={(event) => setPackForm((current) => ({ ...current, depositAmount: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Deposit" />
                  <input type="number" min="0" step="0.01" value={packForm.proposedDeductionAmount} onChange={(event) => setPackForm((current) => ({ ...current, proposedDeductionAmount: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Deduction" />
                </div>
                <textarea value={packForm.summary} onChange={(event) => setPackForm((current) => ({ ...current, summary: event.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" rows={3} placeholder="Pack summary" />
                <button type="submit" disabled={creatingPack} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  <Plus size={15} /> Create pack
                </button>
              </form>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
              <h2 className="font-semibold">Packs</h2>
              <div className="mt-3 space-y-2">
                {loading ? <p className="text-sm text-slate-400">Loading...</p> : null}
                {packs.length === 0 && !loading ? <p className="text-sm text-slate-500">No dispute packs yet.</p> : null}
                {packs.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => navigate(`/documents/evidence-vault/dispute-packs/${pack.id}`)}
                    className={`w-full rounded-2xl border p-3 text-left text-sm ${selectedPack?.id === pack.id ? "border-blue-500 bg-blue-500/10" : "border-slate-800 bg-slate-950/70"}`}
                  >
                    <p className="font-semibold text-slate-100">{pack.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{propertyLabel(pack.property_id)}</p>
                    <p className="mt-2 inline-flex rounded-full border border-slate-700 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">{pack.status}</p>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <main className="space-y-4">
            {!selectedPack ? (
              <div className="rounded-3xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
                Select or create a deposit dispute pack to begin compiling supporting evidence.
              </div>
            ) : (
              <>
                <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Pack summary</p>
                      <h2 className="mt-1 text-2xl font-semibold">{selectedPack.title}</h2>
                      <p className="mt-2 text-sm text-slate-400">{propertyLabel(selectedPack.property_id)} · {tenantLabel(selectedPack.tenant_id)}</p>
                      <p className="mt-2 inline-flex rounded-full border border-slate-700 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">{selectedPack.status}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedPack.status !== "ready" && selectedPack.status !== "locked" && selectedPack.status !== "archived" ? (
                        <button type="button" disabled={savingStatus} onClick={() => handleStatusChange("ready")} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold">
                          Mark ready
                        </button>
                      ) : null}
                      {selectedPack.status !== "locked" && selectedPack.status !== "archived" ? (
                        <button type="button" disabled={savingStatus} onClick={() => handleStatusChange("locked")} className="rounded-xl border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-100">
                          Lock
                        </button>
                      ) : null}
                      {selectedPack.status !== "archived" ? (
                        <button type="button" disabled={savingStatus} onClick={() => handleStatusChange("archived")} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold">
                          Archive
                        </button>
                      ) : null}
                      <Link to={`/documents/evidence-vault/dispute-packs/${selectedPack.id}/print`} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold">
                        <Download size={15} /> Generate dispute pack PDF
                      </Link>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Deposit</p>
                      <p className="mt-1 font-semibold">{formatDisputePackMoney(selectedPack.deposit_amount)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Proposed deduction</p>
                      <p className="mt-1 font-semibold">{formatDisputePackMoney(selectedPack.proposed_deduction_amount)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Deduction schedule total</p>
                      <p className="mt-1 font-semibold">{formatDisputePackMoney(deductionTotal)}</p>
                    </div>
                  </div>
                  {selectedPack.summary ? <p className="mt-4 text-sm text-slate-300">{selectedPack.summary}</p> : null}
                </section>

                <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                  <h3 className="font-semibold">Deduction schedule & evidence references</h3>
                  <div className="mt-4 space-y-3">
                    {selectedItems.length === 0 ? <p className="text-sm text-slate-500">No deduction or evidence items added yet.</p> : null}
                    {selectedItems.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="font-semibold">{item.title}</p>
                            <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{item.item_type.replace(/_/g, " ")}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {item.claimed_amount !== null && item.claimed_amount !== undefined ? <p className="font-semibold">{formatDisputePackMoney(item.claimed_amount)}</p> : null}
                            {selectedPack.status !== "locked" && selectedPack.status !== "archived" ? (
                              <>
                                <button type="button" disabled={savingItem} onClick={() => startEditItem(item)} className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 disabled:opacity-60">Edit</button>
                                <button type="button" disabled={savingItem} onClick={() => handleRemoveItem(item.id)} className="rounded-lg border border-rose-400/30 px-3 py-1 text-xs font-semibold text-rose-100 disabled:opacity-60">
                                  <Trash2 size={12} className="inline" /> Remove
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                        {item.description ? <p className="mt-2 text-sm text-slate-400">{item.description}</p> : null}
                        {item.evidence_reference_type ? <p className="mt-2 text-xs text-teal-200">Evidence reference: {item.evidence_reference_type.replace(/_/g, " ")}</p> : null}
                      </div>
                    ))}
                  </div>

                  {selectedPack.status === "locked" || selectedPack.status === "archived" ? (
                    <p className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-950/20 p-4 text-sm text-amber-100">
                      This pack is {selectedPack.status}. Editing is disabled to preserve the evidence bundle.
                    </p>
                  ) : (
                  <form onSubmit={handleAddItem} className="mt-5 rounded-2xl border border-dashed border-slate-700 p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <select value={itemForm.itemType} onChange={(event) => setItemForm((current) => ({ ...current, itemType: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                        {DISPUTE_PACK_ITEM_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                      <input required value={itemForm.title} onChange={(event) => setItemForm((current) => ({ ...current, title: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Issue or evidence title" />
                      <input type="number" min="0" step="0.01" value={itemForm.claimedAmount} onChange={(event) => setItemForm((current) => ({ ...current, claimedAmount: event.target.value }))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Claimed amount optional" />
                      <select value={itemForm.evidenceReferenceId} onChange={(event) => {
                        const report = reports.find((entry) => entry.id === event.target.value);
                        setItemForm((current) => ({
                          ...current,
                          evidenceReferenceId: event.target.value,
                          evidenceReferenceType: report ? "inspection_report" : "",
                        }));
                      }} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                        <option value="">Optional inspection report reference</option>
                        {suggestedReports.map((report) => <option key={report.id} value={report.id}>{report.title} · {report.inspection_date}</option>)}
                      </select>
                      <textarea value={itemForm.description} onChange={(event) => setItemForm((current) => ({ ...current, description: event.target.value }))} className="md:col-span-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" rows={3} placeholder="Explanation, before/after evidence, invoice or quote notes" />
                    </div>
                    {selectedReferenceMissingFromSuggestions ? (
                      <p className="mt-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
                        Linked reference: {selectedReferenceReport ? `${selectedReferenceReport.title} · ${selectedReferenceReport.inspection_date || "No date"}` : "stored inspection report not in current suggestions"}.
                      </p>
                    ) : null}
                    <button type="submit" disabled={savingItem} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60">
                      <Plus size={15} /> {editingItemId ? "Save item" : "Add item"}
                    </button>
                    {editingItemId ? (
                      <button type="button" onClick={() => { setEditingItemId(""); setItemForm(initialItemForm()); }} className="ml-2 mt-3 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold">
                        Cancel edit
                      </button>
                    ) : null}
                  </form>
                  )}
                </section>

                <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                  <h3 className="font-semibold">Suggested evidence</h3>
                  <p className="mt-1 text-sm text-slate-400">Review these suggestions before adding them to the pack. Tenaqo does not auto-include everything.</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {suggestedReports.map((report) => (
                      <div key={report.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                        <p className="font-semibold">{report.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{calculateInspectionReportCounts(report).photoCount} photos captured</p>
                        <p className="mt-1 text-xs text-slate-500">{report.status} · {report.inspection_date}</p>
                      </div>
                    ))}
                    {complianceEvidenceSuggestions.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-teal-400/20 bg-teal-400/10 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-teal-200">Compliance Safe</p>
                        <p className="mt-1 font-semibold">{item.compliance_requirements?.label || "Compliance evidence"}</p>
                        <p className="mt-1 text-xs text-teal-100/70">
                          {item.evidence_source_type === "inspection_report" ? "Linked inspection report" : item.evidence_document_id ? "Document attached" : "Evidence linked"}
                        </p>
                        {selectedPack.status !== "locked" && selectedPack.status !== "archived" ? (
                          <button
                            type="button"
                            disabled={savingItem}
                            onClick={() => handleAddComplianceSuggestion(item)}
                            className="mt-3 inline-flex rounded-lg border border-teal-300/30 px-3 py-1.5 text-xs font-semibold text-teal-100 disabled:opacity-60"
                          >
                            Add to pack
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {suggestedReports.length === 0 && complianceEvidenceSuggestions.length === 0 ? (
                      <p className="text-sm text-slate-500">No suggested evidence found for this property yet.</p>
                    ) : null}
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
