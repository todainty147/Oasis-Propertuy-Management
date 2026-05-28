import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, Lock, Paperclip, Plus, Save, Upload } from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { ENTITLEMENT_FEATURES } from "../../lib/entitlements";
import { fetchDocuments, uploadDocument } from "../../services/documentService";
import {
  attachInspectionEvidenceFile,
  createInspectionEvidenceItem,
  createInspectionReport,
  getInspectionReportDetails,
  listInspectionReports,
  lockInspectionReport,
  recordInspectionSignature,
  updateInspectionEvidenceItem,
} from "../../services/legalSecurityService";

const DEFAULT_ROOM_TYPES = ["Entrance / hallway", "Kitchen", "Living room", "Bedroom", "Bathroom", "Garden / exterior", "Meters", "Keys", "Appliances"];
const CONDITION_OPTIONS = ["excellent", "good", "fair", "poor", "damaged", "needs_review"];

function sortByOrder(rows = []) {
  return rows.slice().sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

export default function EvidenceVaultPage({ properties = [], tenants = [] }) {
  const { activeAccountId, hasEntitlement } = useAccount();
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [itemDrafts, setItemDrafts] = useState({});
  const [savingRoomId, setSavingRoomId] = useState("");
  const [uploadingItemId, setUploadingItemId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [signatureForm, setSignatureForm] = useState({ signerType: "landlord", signerName: "" });
  const [form, setForm] = useState({
    title: "Check-in inspection",
    propertyId: "",
    tenantId: "",
    inspectionType: "check_in",
    inspectionDate: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");
  const mountedRef = useRef(false);

  const loadReportDetail = useCallback(async (reportId = selectedReportId) => {
    if (!activeAccountId || !reportId) {
      setSelectedReport(null);
      return null;
    }
    try {
      setDetailLoading(true);
      const detail = await getInspectionReportDetails(activeAccountId, reportId);
      if (mountedRef.current) setSelectedReport(detail);
      return detail;
    } catch (err) {
      if (mountedRef.current) setError(err?.message || "Could not load inspection report details.");
      throw err;
    } finally {
      if (mountedRef.current) setDetailLoading(false);
    }
  }, [activeAccountId, selectedReportId]);

  const load = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      const nextReports = await listInspectionReports(activeAccountId);
      if (mountedRef.current) setReports(nextReports);
    } catch (err) {
      if (mountedRef.current) setError(err?.message || "Could not load inspection reports.");
      throw err;
    }
  }, [activeAccountId]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function loadInitial() {
      if (!activeAccountId) return;
      try {
        const nextReports = await listInspectionReports(activeAccountId);
        if (!cancelled) setReports(nextReports);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Could not load inspection reports.");
      }
    }

    loadInitial();
    return () => { cancelled = true; mountedRef.current = false; };
  }, [activeAccountId]);

  useEffect(() => {
    if (!selectedReportId) {
      setSelectedReport(null);
      return;
    }
    loadReportDetail(selectedReportId).catch(() => {});
  }, [loadReportDetail, selectedReportId]);

  useEffect(() => {
    let cancelled = false;
    if (!activeAccountId || !selectedReport) {
      setDocuments([]);
      return () => { cancelled = true; };
    }

    fetchDocuments({
      accountId: activeAccountId,
      propertyId: selectedReport.property_id || null,
      tenantId: selectedReport.tenant_id || null,
      onlyUploaded: true,
    })
      .then((nextDocuments) => {
        if (!cancelled) setDocuments(nextDocuments);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Could not load documents for evidence linking.");
      });

    return () => { cancelled = true; };
  }, [activeAccountId, selectedReport]);

  async function handleCreate(event) {
    event.preventDefault();
    try {
      setError("");
      const report = await createInspectionReport(activeAccountId, form);
      setSelectedReportId(report?.id || "");
      setSelectedReport(report || null);
      await load();
    } catch (err) {
      setError(err?.message || "Could not create inspection report.");
    }
  }

  async function handleLock(report) {
    const confirmed = window.confirm("Lock this inspection report? Locked reports cannot be edited.");
    if (!confirmed) return;
    try {
      setError("");
      await lockInspectionReport(report.id, activeAccountId);
      await load();
      await loadReportDetail(report.id);
    } catch (err) {
      if (mountedRef.current) setError(err?.message || "Could not lock inspection report.");
    }
  }

  function updateItemDraft(roomId, patch) {
    setItemDrafts((current) => ({
      ...current,
      [roomId]: { itemLabel: "", conditionRating: "good", notes: "", ...(current[roomId] || {}), ...patch },
    }));
  }

  async function handleAddEvidenceItem(event, room) {
    event.preventDefault();
    const draft = itemDrafts[room.id] || {};
    try {
      setSavingRoomId(room.id);
      setError("");
      const nextSortOrder = (room.inspection_evidence_items || []).length * 10;
      await createInspectionEvidenceItem(activeAccountId, room.id, { ...draft, sortOrder: nextSortOrder });
      setItemDrafts((current) => ({ ...current, [room.id]: { itemLabel: "", conditionRating: "good", notes: "" } }));
      await loadReportDetail();
    } catch (err) {
      setError(err?.message || "Could not add evidence item.");
    } finally {
      setSavingRoomId("");
    }
  }

  async function handleUpdateEvidenceItem(item, patch) {
    try {
      setError("");
      await updateInspectionEvidenceItem(activeAccountId, item.id, patch);
      await loadReportDetail();
    } catch (err) {
      setError(err?.message || "Could not update evidence item.");
    }
  }

  async function handleUploadEvidenceFile(item, file) {
    if (!file || !selectedReport) return;
    try {
      setUploadingItemId(item.id);
      setError("");
      const document = await uploadDocument({
        file,
        accountId: activeAccountId,
        propertyId: selectedReport.property_id || null,
        tenantId: selectedReport.tenant_id || null,
        tags: ["evidence-vault", selectedReport.inspection_type],
      });
      await attachInspectionEvidenceFile(activeAccountId, item.id, {
        documentId: document.id,
        storagePath: document.storage_path,
        caption: document.name || document.original_filename || file.name,
      });
      await loadReportDetail();
    } catch (err) {
      setError(err?.message || "Could not upload evidence file.");
    } finally {
      setUploadingItemId("");
    }
  }

  async function handleAttachExistingDocument(item, documentId) {
    if (!documentId) return;
    const document = documents.find((doc) => String(doc.id) === String(documentId));
    try {
      setUploadingItemId(item.id);
      setError("");
      await attachInspectionEvidenceFile(activeAccountId, item.id, {
        documentId,
        storagePath: document?.storage_path || null,
        caption: document?.name || document?.original_filename || "Linked document",
      });
      await loadReportDetail();
    } catch (err) {
      setError(err?.message || "Could not attach document.");
    } finally {
      setUploadingItemId("");
    }
  }

  async function handleRecordSignature(event) {
    event.preventDefault();
    if (!selectedReport) return;
    try {
      setError("");
      await recordInspectionSignature(activeAccountId, selectedReport.id, signatureForm);
      setSignatureForm({ signerType: "landlord", signerName: "" });
      await loadReportDetail();
    } catch (err) {
      setError(err?.message || "Could not record signature acknowledgement.");
    }
  }

  const reportRooms = sortByOrder(selectedReport?.inspection_rooms || []);
  const selectedReportLocked = selectedReport?.status === "locked";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-teal-50 p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Documents</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">Evidence Vault</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Create structured check-in, check-out, mid-tenancy, and maintenance evidence reports. Evidence is captured by you as inspection rooms, notes, condition ratings, photos, and signatures; Tenaqo does not provide legal advice.</p>
      </div>

      <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-slate-950 dark:text-slate-50">Create report</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Start by choosing a property and inspection type. New draft reports are pre-filled with common room sections so evidence can be logged room by room.</p>
        {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
          <select required value={form.propertyId} onChange={(e) => setForm((f) => ({ ...f, propertyId: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="">Property</option>
            {properties.map((property) => <option key={property.id} value={property.id}>{property.address || property.id}</option>)}
          </select>
          <select value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="">Tenant optional</option>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.email || tenant.id}</option>)}
          </select>
          <select value={form.inspectionType} onChange={(e) => setForm((f) => ({ ...f, inspectionType: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="check_in">Check-in</option>
            <option value="check_out">Check-out</option>
            <option value="mid_tenancy">Mid-tenancy</option>
            <option value="maintenance_evidence">Maintenance evidence</option>
          </select>
          <input type="date" value={form.inspectionDate} onChange={(e) => setForm((f) => ({ ...f, inspectionDate: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
        </div>
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rooms added to new reports</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            {DEFAULT_ROOM_TYPES.map((room) => <span key={room} className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">{room}</span>)}
          </div>
        </div>
        <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"><Plus size={16} /> Create draft report</button>
      </form>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400 md:col-span-2 xl:col-span-3">
            No inspection reports yet. Create a draft report to start an evidence record for a property.
          </div>
        ) : null}
        {reports.map((report) => (
          <div key={report.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-950 dark:text-slate-50">{report.title}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{report.status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">{report.inspection_type} · {report.inspection_date}</p>
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Evidence sections</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(report.inspection_rooms || [])
                  .slice()
                  .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
                  .map((room) => (
                    <span key={room.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {room.room_name}
                    </span>
                  ))}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedReportId(report.id)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700"><FileText size={14} /> Open builder</button>
              <button type="button" disabled={report.status === "locked"} onClick={() => handleLock(report)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><Lock size={14} /> Lock report</button>
              <button type="button" disabled={!hasEntitlement(ENTITLEMENT_FEATURES.EVIDENCE_VAULT_PDF_EXPORT)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><Download size={14} /> Print/PDF placeholder</button>
            </div>
          </div>
        ))}
      </div>

      {selectedReport ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Inspection builder</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-50">{selectedReport.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{selectedReport.inspection_type} · {selectedReport.inspection_date} · {selectedReport.status}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={selectedReportLocked} onClick={() => handleLock(selectedReport)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><Lock size={14} /> Lock report</button>
              <button type="button" disabled={!hasEntitlement(ENTITLEMENT_FEATURES.EVIDENCE_VAULT_PDF_EXPORT)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><Download size={14} /> Print/PDF placeholder</button>
            </div>
          </div>

          {detailLoading ? <p className="mt-4 text-sm text-slate-500">Loading report details...</p> : null}

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              {reportRooms.map((room) => {
                const draft = itemDrafts[room.id] || { itemLabel: "", conditionRating: "good", notes: "" };
                const items = sortByOrder(room.inspection_evidence_items || []);
                return (
                  <div key={room.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-slate-950 dark:text-slate-50">{room.room_name}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-slate-800">{items.length} items</span>
                    </div>

                    <div className="mt-3 space-y-3">
                      {items.length === 0 ? <p className="text-sm text-slate-500">No evidence items logged for this room yet.</p> : null}
                      {items.map((item) => (
                        <form key={item.id} onSubmit={(event) => {
                          event.preventDefault();
                          handleUpdateEvidenceItem(item, { notes: event.currentTarget.elements.notes.value });
                        }} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100">{item.item_label}</p>
                              <p className="text-xs text-slate-500">Evidence files linked: {(item.inspection_photos || []).length}</p>
                            </div>
                            <select disabled={selectedReportLocked} value={item.condition_rating || ""} onChange={(event) => handleUpdateEvidenceItem(item, { condition_rating: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900">
                              <option value="">Condition</option>
                              {CONDITION_OPTIONS.map((condition) => <option key={condition} value={condition}>{condition.replace("_", " ")}</option>)}
                            </select>
                          </div>
                          <div className="mt-3 flex flex-col gap-2 md:flex-row">
                            <textarea name="notes" disabled={selectedReportLocked} defaultValue={item.notes || ""} placeholder="Notes" className="min-h-20 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900" />
                            <button type="submit" disabled={selectedReportLocked} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-60 dark:border-slate-700"><Save size={14} /> Save notes</button>
                          </div>
                          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium dark:border-slate-700">
                              <Upload size={14} />
                              {uploadingItemId === item.id ? "Uploading..." : "Upload photo/file"}
                              <input
                                type="file"
                                accept="image/*,.pdf,.doc,.docx"
                                capture="environment"
                                disabled={selectedReportLocked || uploadingItemId === item.id}
                                className="sr-only"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = "";
                                  handleUploadEvidenceFile(item, file);
                                }}
                              />
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <Paperclip size={14} className="text-slate-500" />
                              <select disabled={selectedReportLocked || uploadingItemId === item.id} value="" onChange={(event) => handleAttachExistingDocument(item, event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900">
                                <option value="">Attach existing document</option>
                                {documents.map((document) => <option key={document.id} value={document.id}>{document.name || document.original_filename || document.id}</option>)}
                              </select>
                            </label>
                          </div>
                          {(item.inspection_photos || []).length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(item.inspection_photos || []).map((photo) => (
                                <span key={photo.id} className="rounded-full bg-white px-3 py-1 text-xs text-slate-500 dark:bg-slate-900">
                                  {photo.caption || photo.storage_path || photo.document_id || "Evidence file"}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </form>
                      ))}
                    </div>

                    <form onSubmit={(event) => handleAddEvidenceItem(event, room)} className="mt-4 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                        <input disabled={selectedReportLocked} value={draft.itemLabel} onChange={(event) => updateItemDraft(room.id, { itemLabel: event.target.value })} placeholder="Item, fixture, meter or key set" className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950" />
                        <select disabled={selectedReportLocked} value={draft.conditionRating} onChange={(event) => updateItemDraft(room.id, { conditionRating: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950">
                          {CONDITION_OPTIONS.map((condition) => <option key={condition} value={condition}>{condition.replace("_", " ")}</option>)}
                        </select>
                      </div>
                      <textarea disabled={selectedReportLocked} value={draft.notes} onChange={(event) => updateItemDraft(room.id, { notes: event.target.value })} placeholder="Condition notes" className="mt-3 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950" />
                      <button type="submit" disabled={selectedReportLocked || savingRoomId === room.id} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"><Plus size={14} /> {savingRoomId === room.id ? "Adding..." : "Add evidence item"}</button>
                    </form>
                  </div>
                );
              })}
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="font-semibold text-slate-950 dark:text-slate-50">Signature acknowledgements</h3>
                <div className="mt-3 space-y-2">
                  {(selectedReport.inspection_signatures || []).length === 0 ? <p className="text-sm text-slate-500">No acknowledgements recorded.</p> : null}
                  {(selectedReport.inspection_signatures || []).map((signature) => (
                    <div key={signature.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                      <p className="font-medium">{signature.signer_name}</p>
                      <p className="text-xs text-slate-500">{signature.signer_type} · {new Date(signature.signed_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleRecordSignature} className="mt-4 space-y-3">
                  <select disabled={selectedReportLocked} value={signatureForm.signerType} onChange={(event) => setSignatureForm((current) => ({ ...current, signerType: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950">
                    <option value="landlord">Landlord</option>
                    <option value="tenant">Tenant</option>
                    <option value="agent">Agent</option>
                  </select>
                  <input disabled={selectedReportLocked} value={signatureForm.signerName} onChange={(event) => setSignatureForm((current) => ({ ...current, signerName: event.target.value }))} placeholder="Signer name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950" />
                  <button type="submit" disabled={selectedReportLocked} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-60 dark:border-slate-700"><CheckCircle2 size={14} /> Record acknowledgement</button>
                </form>
              </div>
            </aside>
          </div>
        </section>
      ) : null}
    </div>
  );
}
