import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Archive, Camera, CheckCircle2, Download, FileText, Lock, Paperclip, Plus, Save, Upload } from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { getDefaultInspectionRoomNames } from "../../data/inspectionRoomTemplates";
import {
  calculateEvidenceVaultStats,
  calculateInspectionReportCounts,
  CONDITION_RATINGS,
  filterInspectionReportsByStatus,
  formatInspectionType,
  isInspectionReportEditable,
  sortBySortOrder,
} from "../../lib/evidenceVault";
import { fetchDocuments, getDocumentPreviewUrl, uploadDocument } from "../../services/documentService";
import {
  archiveInspectionReport,
  attachInspectionEvidenceFile,
  createInspectionEvidenceItem,
  createInspectionReport,
  getInspectionReportDetails,
  listInspectionAuditEvents,
  listInspectionReports,
  lockInspectionReport,
  recordInspectionSignature,
  updateInspectionEvidenceItem,
} from "../../services/legalSecurityService";

const DEFAULT_ROOM_TYPES = getDefaultInspectionRoomNames();
const REPORT_PAGE_SIZE = 12;

function updateEvidenceItemInReport(report, itemId, patch = {}) {
  if (!report) return report;
  return {
    ...report,
    inspection_rooms: (report.inspection_rooms || []).map((room) => ({
      ...room,
      inspection_evidence_items: (room.inspection_evidence_items || []).map((item) => (
        item.id === itemId ? { ...item, ...patch } : item
      )),
    })),
  };
}

function PhotoThumbnail({ photo, accountId, propertyId, tenantId }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!photo?.document_id) {
      return () => { cancelled = true; };
    }
    getDocumentPreviewUrl({
      documentId: photo.document_id,
      accountId,
      propertyId,
      tenantId,
      scope: propertyId && tenantId ? "shared" : propertyId ? "property" : tenantId ? "tenant" : "account",
      visibility: tenantId ? "tenant" : "staff",
    })
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [accountId, photo?.document_id, propertyId, tenantId]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {url && !failed ? (
        <img src={url} alt={photo.caption || "Evidence photo"} className="h-24 w-full object-cover" />
      ) : (
        <div className="flex h-24 items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-950">
          <Camera size={18} />
        </div>
      )}
      <p className="truncate px-2 py-1 text-xs text-slate-500">{photo.caption || "Evidence file"}</p>
    </div>
  );
}

export default function EvidenceVaultPage({ properties = [], tenants = [] }) {
  const { activeAccountId } = useAccount();
  const navigate = useNavigate();
  const { reportId: routeReportId } = useParams();
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState(routeReportId || "");
  const [selectedReport, setSelectedReport] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [openRooms, setOpenRooms] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [itemDrafts, setItemDrafts] = useState({});
  const [savingRoomId, setSavingRoomId] = useState("");
  const [savingItemId, setSavingItemId] = useState("");
  const [savedItemId, setSavedItemId] = useState("");
  const [uploadingItemId, setUploadingItemId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [reportStatusFilter, setReportStatusFilter] = useState("active");
  const [reportPage, setReportPage] = useState(1);
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
  const builderRef = useRef(null);
  const selectedPropertyId = selectedReport?.property_id || null;
  const selectedTenantId = selectedReport?.tenant_id || null;
  const propertyById = useMemo(() => Object.fromEntries(properties.map((property) => [property.id, property])), [properties]);
  const tenantById = useMemo(() => Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant])), [tenants]);
  const reportStats = useMemo(() => calculateEvidenceVaultStats(reports), [reports]);

  function propertyLabel(propertyId) {
    const property = propertyById[propertyId];
    return property?.address || property?.name || propertyId || "No property selected";
  }

  function tenantLabel(tenantId) {
    const tenant = tenantById[tenantId];
    return tenant?.name || tenant?.email || tenantId || "No tenant linked";
  }

  const loadReportDetail = useCallback(async (reportId) => {
    if (!activeAccountId || !reportId) {
      setSelectedReport(null);
      return null;
    }
    try {
      setDetailLoading(true);
      const [detail, events] = await Promise.all([
        getInspectionReportDetails(activeAccountId, reportId),
        listInspectionAuditEvents(activeAccountId, reportId),
      ]);
      if (mountedRef.current) {
        setSelectedReport(detail);
        setAuditEvents(events);
        setOpenRooms((current) => {
          if (Object.keys(current).length > 0) return current;
          return Object.fromEntries((detail?.inspection_rooms || []).slice(0, 2).map((room) => [room.id, true]));
        });
      }
      return detail;
    } catch (err) {
      if (mountedRef.current) setError(err?.message || "Could not load inspection report details.");
      throw err;
    } finally {
      if (mountedRef.current) setDetailLoading(false);
    }
  }, [activeAccountId]);

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
    if (routeReportId && routeReportId !== selectedReportId) {
      setSelectedReportId(routeReportId);
    }
  }, [routeReportId, selectedReportId]);

  useEffect(() => {
    if (!selectedReportId) {
      setSelectedReport(null);
      setAuditEvents([]);
      return;
    }
    loadReportDetail(selectedReportId).catch(() => {});
  }, [loadReportDetail, selectedReportId]);

  useEffect(() => {
    if (selectedReport?.id) {
      builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedReport?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!activeAccountId || !selectedReport?.id) {
      setDocuments([]);
      return () => { cancelled = true; };
    }

    fetchDocuments({
      accountId: activeAccountId,
      propertyId: selectedPropertyId,
      tenantId: selectedTenantId,
      onlyUploaded: true,
    })
      .then((nextDocuments) => {
        if (!cancelled) setDocuments(nextDocuments);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Could not load documents for evidence linking.");
      });

    return () => { cancelled = true; };
  }, [activeAccountId, selectedPropertyId, selectedTenantId, selectedReport?.id]);

  async function handleCreate(event) {
    event.preventDefault();
    try {
      setError("");
      const report = await createInspectionReport(activeAccountId, form);
      setSelectedReportId(report?.id || "");
      if (report?.id) navigate(`/documents/evidence-vault/${report.id}`);
      await load();
    } catch (err) {
      setError(err?.message || "Could not create inspection report.");
    }
  }

  async function handleLock(report) {
    const confirmed = window.confirm("Lock this report? Editing will be disabled to preserve the evidence record.");
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

  async function handleArchive(report) {
    const confirmed = window.confirm("Archive this inspection report? You can still view it from the archived filter.");
    if (!confirmed) return;
    try {
      setError("");
      await archiveInspectionReport(report.id, activeAccountId);
      if (selectedReportId === report.id) {
        setSelectedReportId("");
        setSelectedReport(null);
        setAuditEvents([]);
        if (routeReportId) navigate("/documents/evidence-vault");
      }
      await load();
    } catch (err) {
      setError(err?.message || "Could not archive inspection report.");
    }
  }

  function updateItemDraft(roomId, patch) {
    setItemDrafts((current) => ({
      ...current,
      [roomId]: { item_label: "", condition_rating: "good", notes: "", ...(current[roomId] || {}), ...patch },
    }));
  }

  async function handleAddEvidenceItem(event, room) {
    event.preventDefault();
    const draft = itemDrafts[room.id] || {};
    try {
      setSavingRoomId(room.id);
      setError("");
      const nextSortOrder = (room.inspection_evidence_items || []).length * 10;
      await createInspectionEvidenceItem(activeAccountId, room.id, { ...draft, sort_order: nextSortOrder });
      setItemDrafts((current) => ({ ...current, [room.id]: { item_label: "", condition_rating: "good", notes: "" } }));
      await loadReportDetail(selectedReportId);
    } catch (err) {
      setError(err?.message || "Could not add evidence item.");
    } finally {
      setSavingRoomId("");
    }
  }

  async function handleUpdateEvidenceItem(item, patch) {
    try {
      setSavingItemId(item.id);
      setSavedItemId("");
      setError("");
      await updateInspectionEvidenceItem(activeAccountId, item.id, patch);
      setSelectedReport((current) => updateEvidenceItemInReport(current, item.id, patch));
      setSavedItemId(item.id);
    } catch (err) {
      setError(err?.message || "Could not update evidence item.");
      await loadReportDetail(selectedReportId).catch(() => {});
    } finally {
      setSavingItemId("");
    }
  }

  async function handleConditionChange(item, condition_rating) {
    const previousReport = selectedReport;
    setSelectedReport((current) => updateEvidenceItemInReport(current, item.id, { condition_rating }));
    try {
      setError("");
      await updateInspectionEvidenceItem(activeAccountId, item.id, { condition_rating });
    } catch (err) {
      setError(err?.message || "Could not update condition rating.");
      setSelectedReport(previousReport);
      await loadReportDetail(selectedReportId).catch(() => {});
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
        tags: ["PROTOKOL"],
      });
      try {
        await attachInspectionEvidenceFile(activeAccountId, item.id, {
          documentId: document.id,
          storagePath: document.storage_path,
          caption: document.name || document.original_filename || file.name,
        });
        await loadReportDetail(selectedReportId);
      } catch {
        setDocuments((current) => [document, ...current.filter((doc) => doc.id !== document.id)]);
        setError("File uploaded but could not be linked. You can attach it via 'Attach existing document'.");
      }
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
      await loadReportDetail(selectedReportId);
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
      await loadReportDetail(selectedReport.id);
    } catch (err) {
      setError(err?.message || "Could not record signature acknowledgement.");
    }
  }

  const filteredReports = useMemo(() => filterInspectionReportsByStatus(reports, reportStatusFilter), [reports, reportStatusFilter]);
  const totalReportPages = Math.max(1, Math.ceil(filteredReports.length / REPORT_PAGE_SIZE));
  const safeReportPage = Math.min(reportPage, totalReportPages);
  const pagedReports = filteredReports.slice((safeReportPage - 1) * REPORT_PAGE_SIZE, safeReportPage * REPORT_PAGE_SIZE);
  const reportRooms = sortBySortOrder(selectedReport?.inspection_rooms || []);
  const selectedReportLocked = !isInspectionReportEditable(selectedReport);

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

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Draft reports", reportStats.draftReports],
          ["Locked reports", reportStats.lockedReports],
          ["Photos captured", reportStats.photosCaptured],
          ["Reports this month", reportStats.reportsThisMonth],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950 dark:text-slate-50">Inspection reports</h2>
            <p className="text-sm text-slate-500">{filteredReports.length} reports shown</p>
          </div>
          <select value={reportStatusFilter} onChange={(event) => { setReportStatusFilter(event.target.value); setReportPage(1); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
            <option value="active">Active reports</option>
            <option value="draft">Draft</option>
            <option value="locked">Locked</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredReports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400 md:col-span-2 xl:col-span-3">
            No inspection reports in this view. Create a draft report or change the status filter.
          </div>
        ) : null}
        {pagedReports.map((report) => {
          const counts = calculateInspectionReportCounts(report);
          return (
          <div key={report.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-950 dark:text-slate-50">{report.title}</h2>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{report.status}</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">{propertyLabel(report.property_id)} · {tenantLabel(report.tenant_id)}</p>
            <p className="mt-1 text-sm text-slate-500">{formatInspectionType(report.inspection_type)} · {report.inspection_date}</p>
            <p className="mt-1 text-xs text-slate-500">Updated {report.updated_at ? new Date(report.updated_at).toLocaleString() : "not recorded"}</p>
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Evidence sections</p>
              {counts.roomCount > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{counts.roomCount} rooms</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{counts.itemCount} checklist items</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{counts.photoCount} photos</span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No evidence sections added yet</p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setSelectedReportId(report.id); navigate(`/documents/evidence-vault/${report.id}`); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700"><FileText size={14} /> Open builder</button>
              <button type="button" disabled={report.status === "locked" || report.status === "archived"} onClick={() => handleLock(report)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><Lock size={14} /> Lock report</button>
              <button type="button" disabled={report.status === "archived"} onClick={() => handleArchive(report)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><Archive size={14} /> Archive</button>
              <Link to={`/documents/evidence-vault/${report.id}/print`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700"><Download size={14} /> Print / save PDF</Link>
            </div>
          </div>
        );})}
      </div>

      {filteredReports.length > REPORT_PAGE_SIZE ? (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <button type="button" disabled={safeReportPage === 1} onClick={() => setReportPage((page) => Math.max(1, page - 1))} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-50 dark:border-slate-700">Previous</button>
          <span className="text-slate-500">Page {safeReportPage} of {totalReportPages}</span>
          <button type="button" disabled={safeReportPage === totalReportPages} onClick={() => setReportPage((page) => Math.min(totalReportPages, page + 1))} className="rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-50 dark:border-slate-700">Next</button>
        </div>
      ) : null}

      {selectedReport ? (
        <section ref={builderRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              {routeReportId ? (
                <Link to="/documents/evidence-vault" className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-300">Back to Evidence Vault</Link>
              ) : null}
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Inspection builder</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-50">{selectedReport.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{propertyLabel(selectedReport.property_id)} · {tenantLabel(selectedReport.tenant_id)}</p>
              <p className="mt-1 text-sm text-slate-500">{formatInspectionType(selectedReport.inspection_type)} · {selectedReport.inspection_date} · {selectedReport.status}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={selectedReportLocked} onClick={() => handleLock(selectedReport)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><Lock size={14} /> Lock report</button>
              <button type="button" disabled={selectedReport?.status === "archived"} onClick={() => handleArchive(selectedReport)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700"><Archive size={14} /> Archive</button>
              <Link to={`/documents/evidence-vault/${selectedReport.id}/print`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700"><Download size={14} /> Print / save PDF</Link>
            </div>
          </div>

          {selectedReportLocked ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              This report is locked. Editing is disabled to preserve the evidence record.
            </div>
          ) : null}

          {detailLoading ? <p className="mt-4 text-sm text-slate-500">Loading report details...</p> : null}

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              {reportRooms.map((room) => {
                const draft = itemDrafts[room.id] || { item_label: "", condition_rating: "good", notes: "" };
                const items = sortBySortOrder(room.inspection_evidence_items || []);
                const roomPhotoCount = items.reduce((total, item) => total + (item.inspection_photos || []).length, 0);
                const ratedCount = items.filter((item) => Boolean(item.condition_rating)).length;
                const isOpen = openRooms[room.id] !== false;
                return (
                  <div key={room.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <button type="button" onClick={() => setOpenRooms((current) => ({ ...current, [room.id]: !isOpen }))} className="flex w-full items-center justify-between gap-3 text-left">
                      <div>
                        <h3 className="font-semibold text-slate-950 dark:text-slate-50">{room.room_name}</h3>
                        <p className="mt-1 text-xs text-slate-500">{ratedCount} of {items.length} items rated · {roomPhotoCount} photos</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-slate-800">{items.length} items</span>
                    </button>

                    {isOpen ? (
                    <>
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
                            <div className="flex flex-wrap gap-1">
                              {CONDITION_RATINGS.map((condition) => (
                                <button
                                  key={condition.value}
                                  type="button"
                                  disabled={selectedReportLocked}
                                  onClick={() => handleConditionChange(item, condition.value)}
                                  className={`rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-60 ${item.condition_rating === condition.value ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
                                >
                                  {condition.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-col gap-2 md:flex-row">
                            <textarea name="notes" disabled={selectedReportLocked} defaultValue={item.notes || ""} onChange={() => setSavedItemId("")} placeholder="Notes" className="min-h-20 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900" />
                            <button type="submit" disabled={selectedReportLocked || savingItemId === item.id} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-60 dark:border-slate-700"><Save size={14} /> {savingItemId === item.id ? "Saving..." : savedItemId === item.id ? "Saved" : "Save notes"}</button>
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
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                              {(item.inspection_photos || []).map((photo) => (
                                <PhotoThumbnail key={photo.id} photo={photo} accountId={activeAccountId} propertyId={selectedReport.property_id} tenantId={selectedReport.tenant_id} />
                              ))}
                            </div>
                          ) : <p className="mt-3 text-xs text-slate-500">No photos added yet. Add photos from your phone during the walkthrough.</p>}
                        </form>
                      ))}
                    </div>

                    <form onSubmit={(event) => handleAddEvidenceItem(event, room)} className="mt-4 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                        <input required disabled={selectedReportLocked} value={draft.item_label} onChange={(event) => updateItemDraft(room.id, { item_label: event.target.value })} placeholder="Item, fixture, meter or key set" className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950" />
                        <select disabled={selectedReportLocked} value={draft.condition_rating} onChange={(event) => updateItemDraft(room.id, { condition_rating: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950">
                          {CONDITION_RATINGS.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}
                        </select>
                      </div>
                      <textarea disabled={selectedReportLocked} value={draft.notes} onChange={(event) => updateItemDraft(room.id, { notes: event.target.value })} placeholder="Condition notes" className="mt-3 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950" />
                      <button type="submit" disabled={selectedReportLocked || savingRoomId === room.id} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"><Plus size={14} /> {savingRoomId === room.id ? "Adding..." : "Add evidence item"}</button>
                    </form>
                    </>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="font-semibold text-slate-950 dark:text-slate-50">Signature acknowledgements</h3>
                <p className="mt-1 text-xs text-slate-500">Record that a party has acknowledged this report in person or on paper. Tenaqo does not capture digital signatures.</p>
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
                  <input required disabled={selectedReportLocked} value={signatureForm.signerName} onChange={(event) => setSignatureForm((current) => ({ ...current, signerName: event.target.value }))} placeholder="Signer name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950" />
                  <button type="submit" disabled={selectedReportLocked} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-60 dark:border-slate-700"><CheckCircle2 size={14} /> Record acknowledgement</button>
                </form>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="font-semibold text-slate-950 dark:text-slate-50">Recent activity</h3>
                <div className="mt-3 space-y-2">
                  {auditEvents.length === 0 ? <p className="text-sm text-slate-500">No recent activity recorded yet.</p> : null}
                  {auditEvents.map((event) => (
                    <div key={event.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{String(event.event_type || "").replace(/_/g, " ")}</p>
                      <p className="mt-1 text-xs text-slate-500">{event.created_at ? new Date(event.created_at).toLocaleString() : "Time not recorded"}</p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </section>
      ) : null}
    </div>
  );
}
