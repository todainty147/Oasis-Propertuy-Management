import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Archive, Camera, CheckCircle2, Download, FileText, Lock, Plus, X } from "lucide-react";

import CreateReportModal from "../../components/documents/CreateReportModal";
import EvidenceItemRow from "../../components/documents/EvidenceItemRow";
import RoomTab from "../../components/documents/RoomTab";
import { useAccount } from "../../context/AccountContext";
import { getDefaultInspectionRoomNames } from "../../data/inspectionRoomTemplates";
import {
  calculateEvidenceVaultStats,
  calculateInspectionCompletion,
  calculateInspectionReportCounts,
  CONDITION_RATINGS,
  filterInspectionReportsByStatus,
  formatInspectionType,
  getFirstIncompleteRoomId,
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
  populateInspectionReportDefaults,
  recordInspectionSignature,
  updateInspectionEvidenceItem,
} from "../../services/legalSecurityService";

const DEFAULT_ROOM_TYPES = getDefaultInspectionRoomNames();
const REPORT_PAGE_SIZE = 12;

function createInitialReportForm() {
  return {
    title: "Check-in inspection",
    propertyId: "",
    tenantId: "",
    inspectionType: "check_in",
    inspectionDate: new Date().toISOString().slice(0, 10),
  };
}

function normalizeScanStatus(document) {
  return String(document?.scan_status || document?.scanStatus || "legacy_unscanned").trim().toLowerCase();
}

function isDocumentPreviewReady(document) {
  return Boolean(document) && ["clean", "legacy_unscanned"].includes(normalizeScanStatus(document));
}

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

function PhotoThumbnail({ photo, document, accountId, propertyId, tenantId }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const previewReady = isDocumentPreviewReady(document);

  useEffect(() => {
    let cancelled = false;
    if (!photo?.document_id || !previewReady) {
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
  }, [accountId, photo?.document_id, previewReady, propertyId, tenantId]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      {url && !failed ? (
        <img src={url} alt={photo.caption || "Evidence photo"} className="h-24 w-full object-cover" />
      ) : (
        <div className="flex h-24 flex-col items-center justify-center gap-1 bg-slate-900 px-2 text-center text-slate-500">
          <Camera size={18} />
          <span className="text-[11px]">{previewReady ? "Preview unavailable" : "Preview pending"}</span>
        </div>
      )}
      <p className="truncate px-2 py-1 text-xs text-slate-500">{photo.caption || "Evidence file"}</p>
    </div>
  );
}

function ListPanel({
  reports,
  stats,
  selectedReportId,
  statusFilter,
  onStatusFilterChange,
  onSelectReport,
  onNewReport,
  onLock,
  onArchive,
  propertyLabel,
  tenantLabel,
  page,
  totalPages,
  onPageChange,
}) {
  return (
    <aside className="flex min-h-0 flex-col border-slate-800 bg-slate-950/30 lg:border-r">
      <div className="shrink-0 border-b border-slate-800 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Documents</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-50">Evidence Vault</h1>
            <p className="mt-1 text-xs text-slate-400">Room-by-room inspection evidence records.</p>
          </div>
          <button
            type="button"
            onClick={onNewReport}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
          >
            <Plus size={14} /> New
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[
            ["Draft", stats.draftReports],
            ["Locked", stats.lockedReports],
            ["Photos", stats.photosCaptured],
            ["Month", stats.reportsThisMonth],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/70 px-2 py-2">
              <p className="text-sm font-semibold text-slate-50">{value}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
            </div>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value)}
          className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          <option value="active">Active reports</option>
          <option value="draft">Draft</option>
          <option value="locked">Locked</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {reports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">
            No inspection reports yet. Create a check-in, check-out or mid-tenancy report to start capturing room-by-room evidence.
            <button
              type="button"
              onClick={onNewReport}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
            >
              <Plus size={14} /> Create first report
            </button>
          </div>
        ) : null}
        {reports.map((report) => {
          const counts = calculateInspectionReportCounts(report);
          const selected = report.id === selectedReportId;
          return (
            <div
              key={report.id}
              className={`rounded-2xl border p-4 transition ${
                selected
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-slate-800 bg-slate-900/70 hover:border-slate-700"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-50">{report.title}</h2>
                  <p className="mt-1 truncate text-xs text-slate-400">{propertyLabel(report.property_id)}</p>
                </div>
                <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300">
                  {report.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {formatInspectionType(report.inspection_type)} · {report.inspection_date}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">{tenantLabel(report.tenant_id)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-300">{counts.roomCount} rooms</span>
                <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-300">{counts.itemCount} items</span>
                <span className="rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-300">{counts.photoCount} photos</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onSelectReport(report.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200"
                >
                  <FileText size={12} /> Open
                </button>
                <button
                  type="button"
                  disabled={["locked", "archived"].includes(report.status)}
                  onClick={() => onLock(report)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 disabled:opacity-40"
                >
                  <Lock size={12} /> Lock
                </button>
                <button
                  type="button"
                  disabled={report.status === "archived"}
                  onClick={() => onArchive(report)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 disabled:opacity-40"
                >
                  <Archive size={12} /> Archive
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 ? (
        <div className="flex shrink-0 items-center justify-between border-t border-slate-800 p-3 text-xs text-slate-400">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-40"
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            type="button"
            disabled={page === totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className="rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}
    </aside>
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
  const [activeRoomId, setActiveRoomId] = useState("");
  const [expandedItemIds, setExpandedItemIds] = useState(() => new Set());
  const [bottomStripTab, setBottomStripTab] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [itemDrafts, setItemDrafts] = useState({});
  const [savingRoomId, setSavingRoomId] = useState("");
  const [populatingDefaults, setPopulatingDefaults] = useState(false);
  const [savingItemId, setSavingItemId] = useState("");
  const [savedItemId, setSavedItemId] = useState("");
  const [uploadingItemId, setUploadingItemId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [reportStatusFilter, setReportStatusFilter] = useState("active");
  const [reportPage, setReportPage] = useState(1);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creatingReport, setCreatingReport] = useState(false);
  const [signatureForm, setSignatureForm] = useState({ signerType: "landlord", signerName: "" });
  const [form, setForm] = useState(createInitialReportForm);
  const [error, setError] = useState("");
  const selectedPropertyId = selectedReport?.property_id || null;
  const selectedTenantId = selectedReport?.tenant_id || null;
  const propertyById = useMemo(() => Object.fromEntries(properties.map((property) => [property.id, property])), [properties]);
  const tenantById = useMemo(() => Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant])), [tenants]);
  const documentById = useMemo(() => Object.fromEntries(documents.map((document) => [String(document.id), document])), [documents]);
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
      setSelectedReport(detail);
      setAuditEvents(events);
      setExpandedItemIds(() => {
        const ids = new Set();
        for (const room of detail?.inspection_rooms || []) {
          for (const item of room.inspection_evidence_items || []) {
            if (item.notes || (item.inspection_photos || []).length > 0) ids.add(item.id);
          }
        }
        return ids;
      });
      setActiveRoomId((current) => {
        const rooms = detail?.inspection_rooms || [];
        return rooms.some((room) => room.id === current) ? current : getFirstIncompleteRoomId(rooms);
      });
      return detail;
    } catch (err) {
      setError(err?.message || "Could not load inspection report details.");
      throw err;
    } finally {
      setDetailLoading(false);
    }
  }, [activeAccountId]);

  const load = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      const nextReports = await listInspectionReports(activeAccountId);
      setReports(nextReports);
    } catch (err) {
      setError(err?.message || "Could not load inspection reports.");
      throw err;
    }
  }, [activeAccountId]);

  useEffect(() => {
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
    return () => { cancelled = true; };
  }, [activeAccountId]);

  useEffect(() => {
    if (routeReportId && routeReportId !== selectedReportId) {
      setSelectedReportId(routeReportId);
    } else if (!routeReportId && selectedReportId) {
      setSelectedReportId("");
    }
  }, [routeReportId, selectedReportId]);

  useEffect(() => {
    if (!selectedReportId) {
      setSelectedReport(null);
      setAuditEvents([]);
      setActiveRoomId("");
      return;
    }
    loadReportDetail(selectedReportId).catch(() => {});
  }, [loadReportDetail, selectedReportId]);

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
      setCreatingReport(true);
      setError("");
      const report = await createInspectionReport(activeAccountId, form);
      setCreateModalOpen(false);
      setForm(createInitialReportForm());
      setSelectedReportId(report?.id || "");
      if (report?.id) navigate(`/documents/evidence-vault/${report.id}`);
      await load();
    } catch (err) {
      setError(err?.message || "Could not create inspection report.");
    } finally {
      setCreatingReport(false);
    }
  }

  async function handleLock(report) {
    if (!report || ["locked", "archived"].includes(report.status)) return;
    const confirmed = window.confirm("Lock this report? Editing will be disabled to preserve the evidence record.");
    if (!confirmed) return;
    try {
      setError("");
      await lockInspectionReport(report.id, activeAccountId);
      await load();
      await loadReportDetail(report.id);
    } catch (err) {
      setError(err?.message || "Could not lock inspection report.");
    }
  }

  async function handleArchive(report) {
    if (!report || report.status === "archived") return;
    const confirmed = window.confirm("Archive this inspection report? You can still view it from the archived filter.");
    if (!confirmed) return;
    try {
      setError("");
      await archiveInspectionReport(report.id, activeAccountId);
      if (selectedReportId === report.id) {
        setSelectedReportId("");
        setSelectedReport(null);
        setAuditEvents([]);
        setActiveRoomId("");
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

  function toggleExpandedItem(itemId) {
    setExpandedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
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

  async function handlePopulateDefaults() {
    if (!selectedReportId) return;
    try {
      setPopulatingDefaults(true);
      setError("");
      await populateInspectionReportDefaults(activeAccountId, selectedReportId);
      await load();
      await loadReportDetail(selectedReportId);
    } catch (err) {
      setError(err?.message || "Could not add default rooms and checklist items.");
    } finally {
      setPopulatingDefaults(false);
    }
  }

  async function handleUpdateEvidenceItem(item, patch) {
    try {
      setSavingItemId(item.id);
      setSavedItemId("");
      setError("");
      setSelectedReport((current) => updateEvidenceItemInReport(current, item.id, patch));
      await updateInspectionEvidenceItem(activeAccountId, item.id, patch);
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
      setExpandedItemIds((current) => new Set(current).add(item.id));
      const document = await uploadDocument({
        file,
        accountId: activeAccountId,
        propertyId: selectedReport.property_id || null,
        tenantId: selectedReport.tenant_id || null,
        tags: ["PROTOKOL"],
      });
      setDocuments((current) => [document, ...current.filter((doc) => doc.id !== document.id)]);
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
      setExpandedItemIds((current) => new Set(current).add(item.id));
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

  function handleSignatureFormChange(patch) {
    setSignatureForm((current) => ({ ...current, ...patch }));
  }

  const filteredReports = useMemo(() => filterInspectionReportsByStatus(reports, reportStatusFilter), [reports, reportStatusFilter]);
  const totalReportPages = Math.max(1, Math.ceil(filteredReports.length / REPORT_PAGE_SIZE));
  const safeReportPage = Math.min(reportPage, totalReportPages);
  const pagedReports = filteredReports.slice((safeReportPage - 1) * REPORT_PAGE_SIZE, safeReportPage * REPORT_PAGE_SIZE);
  const reportRooms = sortBySortOrder(selectedReport?.inspection_rooms || []);
  const activeRoom = reportRooms.find((room) => room.id === activeRoomId) || reportRooms[0] || null;
  const selectedReportLocked = !isInspectionReportEditable(selectedReport);
  const completion = calculateInspectionCompletion(selectedReport || {});

  return (
    <div className="min-h-[calc(100vh-5rem)] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-100">
      {error ? (
        <div className="flex items-start justify-between gap-3 border-b border-rose-500/30 bg-rose-950/60 px-4 py-3 text-sm text-rose-100">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
            className="rounded-md p-1 text-rose-100 hover:bg-rose-900/70"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <CreateReportModal
        open={createModalOpen}
        form={form}
        onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreate}
        properties={properties}
        tenants={tenants}
        roomTypes={DEFAULT_ROOM_TYPES}
        busy={creatingReport}
      />

      <div className="grid min-h-[calc(100vh-5rem)] grid-cols-1 overflow-hidden lg:grid-cols-[336px_minmax(0,1fr)]">
        <div className={`${selectedReportId ? "hidden lg:block" : "block"}`}>
          <ListPanel
            reports={pagedReports}
            stats={reportStats}
            selectedReportId={selectedReportId}
            statusFilter={reportStatusFilter}
            onStatusFilterChange={(value) => { setReportStatusFilter(value); setReportPage(1); }}
            onSelectReport={(reportId) => {
              setSelectedReportId(reportId);
              navigate(`/documents/evidence-vault/${reportId}`);
            }}
            onNewReport={() => setCreateModalOpen(true)}
            onLock={handleLock}
            onArchive={handleArchive}
            propertyLabel={propertyLabel}
            tenantLabel={tenantLabel}
            page={safeReportPage}
            totalPages={totalReportPages}
            onPageChange={setReportPage}
          />
        </div>

        <main className={`${selectedReportId ? "block" : "hidden lg:block"} min-h-0 overflow-y-auto bg-slate-950`}>
          {!selectedReport ? (
            <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center p-6">
              <div className="max-w-md rounded-2xl border border-dashed border-slate-700 p-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Evidence Vault</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-50">Choose a report</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Select an inspection report from the list or create a new draft to start capturing evidence.
                </p>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  <Plus size={16} /> New report
                </button>
              </div>
            </div>
          ) : (
            <section className="flex min-h-[calc(100vh-5rem)] flex-col">
              <div className="shrink-0 border-b border-slate-800 bg-slate-950/95 px-4 py-4 lg:px-6">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedReportId("");
                    navigate("/documents/evidence-vault");
                  }}
                  className="mb-3 inline-flex text-sm font-semibold text-blue-300 hover:text-blue-200 lg:hidden"
                >
                  Back to Evidence Vault
                </button>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Inspection builder</p>
                    <h2 className="mt-1 truncate text-2xl font-semibold text-slate-50">{selectedReport.title}</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      {propertyLabel(selectedReport.property_id)} · {tenantLabel(selectedReport.tenant_id)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatInspectionType(selectedReport.inspection_type)} · {selectedReport.inspection_date} · {selectedReport.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={selectedReportLocked}
                      onClick={() => handleLock(selectedReport)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
                        completion.percent >= 80 ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100" : "border-slate-700 text-slate-200"
                      }`}
                    >
                      <Lock size={14} /> {completion.percent >= 80 ? "Ready to lock" : "Lock report"}
                    </button>
                    <button
                      type="button"
                      disabled={selectedReport?.status === "archived"}
                      onClick={() => handleArchive(selectedReport)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 disabled:opacity-50"
                    >
                      <Archive size={14} /> Archive
                    </button>
                    <Link
                      to={`/documents/evidence-vault/${selectedReport.id}/print`}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200"
                    >
                      <Download size={14} /> Print / save PDF
                    </Link>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                    <span>{completion.percent}% complete</span>
                    <span>{completion.ratedCount} of {completion.itemCount} items rated</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-teal-400" style={{ width: `${completion.percent}%` }} />
                  </div>
                </div>

                {selectedReportLocked ? (
                  <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                    This report is locked. Editing is disabled to preserve the evidence record.
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {detailLoading ? <p className="p-6 text-sm text-slate-400">Loading report details...</p> : null}

                {reportRooms.length === 0 ? (
                  <div className="m-6 rounded-2xl border border-dashed border-slate-700 p-5 text-sm">
                    <h3 className="font-semibold text-slate-50">No room sections yet</h3>
                    <p className="mt-1 text-slate-400">
                      Add the default Evidence Vault rooms and checklist items for this inspection record.
                    </p>
                    <button
                      type="button"
                      disabled={selectedReportLocked || populatingDefaults}
                      onClick={handlePopulateDefaults}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                    >
                      <Plus size={14} /> {populatingDefaults ? "Adding..." : "Add default rooms and checklist items"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950 px-4 pt-3">
                      {reportRooms.map((room) => (
                        <RoomTab
                          key={room.id}
                          room={room}
                          active={activeRoom?.id === room.id}
                          onClick={() => setActiveRoomId(room.id)}
                        />
                      ))}
                    </div>

                    {activeRoom ? (
                      <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="min-w-0 space-y-3">
                          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <h3 className="text-lg font-semibold text-slate-50">{activeRoom.room_name}</h3>
                                <p className="mt-1 text-sm text-slate-400">
                                  {(activeRoom.inspection_evidence_items || []).filter((item) => Boolean(item.condition_rating)).length} of {(activeRoom.inspection_evidence_items || []).length} items rated
                                </p>
                              </div>
                              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                                {(activeRoom.inspection_evidence_items || []).reduce((total, item) => total + (item.inspection_photos || []).length, 0)} photos
                              </span>
                            </div>
                          </div>

                          {sortBySortOrder(activeRoom.inspection_evidence_items || []).map((item) => {
                            const expanded = expandedItemIds.has(item.id);
                            return (
                              <EvidenceItemRow
                                key={item.id}
                                item={item}
                                locked={selectedReportLocked}
                                expanded={expanded}
                                onToggleExpanded={() => toggleExpandedItem(item.id)}
                                onConditionChange={handleConditionChange}
                                onSaveNotes={(nextItem, notes) => handleUpdateEvidenceItem(nextItem, { notes })}
                                onUploadFile={handleUploadEvidenceFile}
                                onAttachDocument={handleAttachExistingDocument}
                                documents={documents}
                                uploading={uploadingItemId === item.id}
                                saving={savingItemId === item.id}
                                saved={savedItemId === item.id}
                                renderPhoto={(photo) => (
                                  <PhotoThumbnail
                                    key={photo.id}
                                    photo={photo}
                                    document={documentById[String(photo.document_id)]}
                                    accountId={activeAccountId}
                                    propertyId={selectedReport.property_id}
                                    tenantId={selectedReport.tenant_id}
                                  />
                                )}
                              />
                            );
                          })}

                          <form onSubmit={(event) => handleAddEvidenceItem(event, activeRoom)} className="rounded-2xl border border-dashed border-slate-700 p-3">
                            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_120px]">
                              <input
                                required
                                disabled={selectedReportLocked}
                                value={(itemDrafts[activeRoom.id] || {}).item_label || ""}
                                onChange={(event) => updateItemDraft(activeRoom.id, { item_label: event.target.value })}
                                placeholder="Add item, fixture, meter or key set"
                                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 disabled:opacity-60"
                              />
                              <select
                                disabled={selectedReportLocked}
                                value={(itemDrafts[activeRoom.id] || {}).condition_rating || "good"}
                                onChange={(event) => updateItemDraft(activeRoom.id, { condition_rating: event.target.value })}
                                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 disabled:opacity-60"
                              >
                                {CONDITION_RATINGS.map((condition) => <option key={condition.value} value={condition.value}>{condition.label}</option>)}
                              </select>
                              <button
                                type="submit"
                                disabled={selectedReportLocked || savingRoomId === activeRoom.id}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                              >
                                <Plus size={14} /> {savingRoomId === activeRoom.id ? "Adding..." : "Add"}
                              </button>
                            </div>
                          </form>
                        </div>

                        <div className="hidden xl:block">
                          <EvidenceVaultSidePanel
                            selectedReport={selectedReport}
                            auditEvents={auditEvents}
                            signatureForm={signatureForm}
                            onSignatureFormChange={handleSignatureFormChange}
                            handleRecordSignature={handleRecordSignature}
                            selectedReportLocked={selectedReportLocked}
                          />
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div className="shrink-0 border-t border-slate-800 bg-slate-950 xl:hidden">
                <div className="flex">
                  <button
                    type="button"
                    onClick={() => setBottomStripTab((current) => current === "signatures" ? "" : "signatures")}
                    className={`flex-1 border-r border-slate-800 px-4 py-3 text-sm font-semibold ${bottomStripTab === "signatures" ? "border-t-2 border-t-blue-400 text-blue-300" : "text-slate-200"}`}
                  >
                    Signatures ({(selectedReport.inspection_signatures || []).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomStripTab((current) => current === "activity" ? "" : "activity")}
                    className={`flex-1 px-4 py-3 text-sm font-semibold ${bottomStripTab === "activity" ? "border-t-2 border-t-blue-400 text-blue-300" : "text-slate-200"}`}
                  >
                    Activity ({auditEvents.length})
                  </button>
                </div>
                {bottomStripTab ? (
                  <div className="max-h-72 overflow-y-auto p-4">
                    <EvidenceVaultSidePanel
                      selectedReport={selectedReport}
                      auditEvents={auditEvents}
                      signatureForm={signatureForm}
                      onSignatureFormChange={handleSignatureFormChange}
                      handleRecordSignature={handleRecordSignature}
                      selectedReportLocked={selectedReportLocked}
                      tab={bottomStripTab}
                    />
                  </div>
                ) : null}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function EvidenceVaultSidePanel({
  selectedReport,
  auditEvents,
  signatureForm,
  onSignatureFormChange,
  handleRecordSignature,
  selectedReportLocked,
  tab = "",
}) {
  const showSignatures = !tab || tab === "signatures";
  const showActivity = !tab || tab === "activity";

  return (
    <aside className="space-y-4">
      {showSignatures ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-slate-50">Signature acknowledgements</h3>
          <p className="mt-1 text-xs text-slate-500">
            Record that a party has acknowledged this report in person or on paper. Tenaqo does not capture digital signatures.
          </p>
          <div className="mt-3 space-y-2">
            {(selectedReport.inspection_signatures || []).length === 0 ? <p className="text-sm text-slate-500">No acknowledgements recorded.</p> : null}
            {(selectedReport.inspection_signatures || []).map((signature) => (
              <div key={signature.id} className="rounded-xl bg-slate-950 p-3 text-sm">
                <p className="font-medium text-slate-100">{signature.signer_name}</p>
                <p className="text-xs text-slate-500">{signature.signer_type} · {new Date(signature.signed_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
          <form onSubmit={handleRecordSignature} className="mt-4 space-y-3">
            <select
              disabled={selectedReportLocked}
              value={signatureForm.signerType}
              onChange={(event) => onSignatureFormChange({ signerType: event.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-60"
            >
              <option value="landlord">Landlord</option>
              <option value="tenant">Tenant</option>
              <option value="agent">Agent</option>
            </select>
            <input
              required
              disabled={selectedReportLocked}
              value={signatureForm.signerName}
              onChange={(event) => onSignatureFormChange({ signerName: event.target.value })}
              placeholder="Signer name"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={selectedReportLocked}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-60"
            >
              <CheckCircle2 size={14} /> Record acknowledgement
            </button>
          </form>
        </div>
      ) : null}

      {showActivity ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-semibold text-slate-50">Recent activity</h3>
          <div className="mt-3 space-y-2">
            {auditEvents.length === 0 ? <p className="text-sm text-slate-500">No recent activity recorded yet.</p> : null}
            {auditEvents.map((event) => (
              <div key={event.id} className="rounded-xl bg-slate-950 p-3 text-sm">
                <p className="font-medium text-slate-100">{String(event.event_type || "").replace(/_/g, " ")}</p>
                <p className="mt-1 text-xs text-slate-500">{event.created_at ? new Date(event.created_at).toLocaleString() : "Time not recorded"}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
