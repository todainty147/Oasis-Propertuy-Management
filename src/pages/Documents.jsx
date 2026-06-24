// src/pages/Documents.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Skeleton from "../components/ui/Skeleton";
import { ChevronDown, X } from "lucide-react";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAuth } from "../context/AuthContext";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";
import { useI18n } from "../context/I18nContext";

import {
  fetchDocuments,
  searchDocuments,
  uploadDocument,
  downloadDocument,
  getDocumentPreviewUrl,
  requestDocumentScan,
  deleteDocument,
  updateDocumentTenantHighlight,
} from "../services/documentService";

import { DOCUMENT_TAGS } from "../constants/documentTags";
import { canUploadDocument, canDeleteDocument, canEditDocumentTags } from "../utils/permissions";

import { useProperties } from "../hooks/useProperties";
import { useTenants } from "../hooks/useTenants";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { partitionTenantDocuments } from "../utils/tenantPortal";
import TenantDocumentsOverview from "../components/TenantDocumentsOverview";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import DocumentTemplateLibrary from "../components/DocumentTemplateLibrary";
import DocumentRequestsPanel from "../components/DocumentRequestsPanel";
import DocumentPacketsPanel from "../components/DocumentPacketsPanel";
import DocumentSignatureReadinessPanel from "../components/DocumentSignatureReadinessPanel";
import DocumentExtractionPanel from "../components/DocumentExtractionPanel";

/* ======================
   HELPERS
   ====================== */

function canPreview(mime) {
  return mime?.startsWith("image/") || mime === "application/pdf";
}

function getDocumentTagLabel(tag, t) {
  const value = String(tag || "").trim().toUpperCase();
  return t(`documents.tag.${value}`, { defaultValue: value || tag || "—" });
}

function formatMime(mime) {
  if (!mime) return "—";
  const map = {
    "application/pdf": "PDF",
    "image/jpeg": "JPEG",
    "image/jpg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WebP",
    "image/gif": "GIF",
    "application/msword": "DOC",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  };
  return map[mime] || (mime.split("/")[1] || "").toUpperCase() || "—";
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function normalizeScanStatus(doc) {
  return String(doc?.scan_status || doc?.scanStatus || "legacy_unscanned").trim().toLowerCase();
}

function isDocumentAvailableForAccess(doc) {
  return ["clean", "legacy_unscanned"].includes(normalizeScanStatus(doc));
}

function canRequestScan(doc) {
  return ["pending_scan", "scan_failed"].includes(normalizeScanStatus(doc));
}

function getScanStatusLabel(status, t) {
  const key = {
    clean: "documents.scanStatus.clean",
    pending_scan: "documents.scanStatus.pending",
    flagged: "documents.scanStatus.flagged",
    scan_failed: "documents.scanStatus.failed",
    legacy_unscanned: "documents.scanStatus.legacy",
  }[status] || "documents.scanStatus.unknown";
  return t(key);
}

function getScanStatusClass(status) {
  if (status === "clean") return "bg-emerald-50 text-emerald-700";
  if (status === "legacy_unscanned") return "bg-amber-50 text-amber-700";
  if (status === "pending_scan") return "bg-blue-50 text-blue-700";
  if (status === "flagged") return "bg-rose-50 text-rose-700";
  if (status === "scan_failed") return "bg-orange-50 text-orange-700";
  return "bg-slate-100 text-slate-600";
}

/* ======================
   SKELETON
   ====================== */

function DocumentsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
    </div>
  );
}

/* ======================
   UPLOAD MODAL
   ====================== */

function UploadModal({ open, onClose, properties, tenants, activeAccountId, onUploaded, t }) {
  const [scope, setScope] = useState("property");
  const [propertyId, setPropertyId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [tags, setTags] = useState([]);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const backdropRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setScope("property");
    setPropertyId("");
    setTenantId("");
    setTags([]);
    setFile(null);
    setDragOver(false);
    setError(null);
    setUploading(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function toggleTag(tag) {
    setTags((prev) => prev.includes(tag) ? prev.filter((v) => v !== tag) : [...prev, tag]);
  }

  async function handleSubmit() {
    if (!activeAccountId) return;
    if (scope === "property" && !propertyId) { setError(t("documents.pickPropertyOrTenant")); return; }
    if (scope === "tenant"   && !tenantId)   { setError(t("documents.pickPropertyOrTenant")); return; }
    if (!file) { setError(t("documents.noFileSelected")); return; }
    setUploading(true);
    setError(null);
    try {
      await uploadDocument({
        accountId:  activeAccountId,
        file,
        propertyId: scope === "property" ? propertyId : null,
        tenantId:   scope === "tenant"   ? tenantId   : null,
        tags,
      });
      onUploaded();
      onClose();
    } catch (err) {
      setError(err?.message ?? t("attachments.uploadError"));
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{t("documents.add")}</h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Scope toggle */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">{t("documents.chooseScope")}</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "property", label: t("finance.table.property") },
                { value: "tenant",   label: t("finance.table.tenant")   },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  className={`rounded-xl border py-3 text-sm font-medium transition-colors ${
                    scope === value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Scope select */}
          {scope === "property" ? (
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">{t("documents.selectProperty")}</option>
              {(properties || []).map((p) => (
                <option key={p.id} value={p.id}>{p.address}{p.city ? ` (${p.city})` : ""}</option>
              ))}
            </select>
          ) : (
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">{t("documents.selectTenant")}</option>
              {(tenants || []).map((tn) => (
                <option key={tn.id} value={tn.id}>{tn.name}</option>
              ))}
            </select>
          )}

          {/* Tags */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Tags</p>
            <div className="flex flex-wrap gap-2">
              {DOCUMENT_TAGS.map((tag) => (
                <button
                  key={tag.value}
                  type="button"
                  onClick={() => toggleTag(tag.value)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    tags.includes(tag.value)
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {getDocumentTagLabel(tag.value, t)}
                </button>
              ))}
            </div>
          </div>

          {/* Drop zone */}
          <div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
              onClick={() => fileRef.current?.click()}
              className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
              }`}
            >
              {file ? (
                <p className="text-sm font-medium text-slate-900">{file.name}</p>
              ) : (
                <p className="text-sm text-slate-500">{t("documents.dragOrClick")}</p>
              )}
              <p className="mt-1 text-xs text-slate-400">.pdf .jpg .png .webp .doc .docx</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {t("common.cancel")}
          </button>
          <button type="button" onClick={handleSubmit} disabled={uploading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-400">
            {uploading ? t("attachments.uploading") : t("documents.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================
   ACCORDION SECTION
   ====================== */

function AccordionSection({ title, open, onToggle, children }) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <ChevronDown
          size={18}
          className={`text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-slate-100 space-y-4 p-4">
          {children}
        </div>
      )}
    </div>
  );
}

/* ======================
   DOCUMENTS (GLOBAL)
   ====================== */

export default function Documents({ tenants: tenantsProp = null, properties: propertiesProp = null } = {}) {
  const { setTitle } = usePageTitle();
  const { t } = useI18n();
  const { loading: authLoading } = useAuth();
  const { accounts, activeAccountId, accountLoading, activeRole, activePermissionContext } = useAccount();
  const { activeTenantId } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeAccount = useMemo(() => accounts?.find((a) => a.id === activeAccountId) ?? null, [accounts, activeAccountId]);
  const role = activeRole ?? activeAccount?.role ?? null;
  const permissionContext = activePermissionContext ?? { role };
  const isTenant = String(role ?? "").toLowerCase() === "tenant";

  /* ---------- FALLBACK HOOKS ---------- */
  const useFallback = !tenantsProp || !propertiesProp;
  const { properties: propertiesHook, loading: propertiesLoadingHook } = useProperties({ enabled: !!activeAccountId && useFallback });
  const { tenants: tenantsHook, loading: tenantsLoadingHook } = useTenants({ enabled: !!activeAccountId && useFallback });
  const properties = propertiesProp ?? propertiesHook ?? [];
  const tenants    = tenantsProp  ?? tenantsHook  ?? [];

  /* ---------- SCOPE LOOKUP MAPS ---------- */
  const propertyMap = useMemo(() => new Map((properties || []).map((p) => [String(p.id), p.address])), [properties]);
  const tenantMap   = useMemo(() => new Map((tenants   || []).map((tn) => [String(tn.id), tn.name])),  [tenants]);

  /* ---------- URL STATE ---------- */
  const queryParam = searchParams.get("q") ?? "";
  const tagsParam  = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
  const docParam   = searchParams.get("doc") ?? null;

  const [query, setQuery]               = useState(queryParam);
  const [selectedTags, setSelectedTags] = useState(tagsParam);
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(10);

  /* ---------- DATA ---------- */
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [scanningIds, setScanningIds] = useState(() => new Set());
  const [scanErrorById, setScanErrorById] = useState({});

  /* ---------- UI STATE ---------- */
  const [uploadOpen, setUploadOpen]               = useState(false);
  const [expandedPriorityIds, setExpandedPriorityIds] = useState(new Set());
  const [workflowsOpen, setWorkflowsOpen]         = useState(false);
  const [resourcesOpen, setResourcesOpen]         = useState(false);

  /* ---------- TENANT PRIORITY DRAFTS ---------- */
  const [savingHighlightId, setSavingHighlightId] = useState("");
  const [tenantPriorityDrafts, setTenantPriorityDrafts] = useState({});

  /* ---------- PREVIEW ---------- */
  const [previewDoc, setPreviewDoc]   = useState(null);
  const [previewUrl, setPreviewUrl]   = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const lastAutoOpenedDocRef = useRef(null);

  /* ---------- PAGE TITLE ---------- */
  useEffect(() => { setTitle(t("sidebar.documents")); }, [setTitle, t]);

  /* ---------- SYNC URL → STATE ---------- */
  useEffect(() => {
    setQuery(queryParam);
    setSelectedTags(tagsParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => { setPage(1); }, [query, selectedTags, activeTenantId, pageSize]);

  /* ---------- LOAD DOCUMENTS ---------- */
  const loadDocuments = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    try {
      const data = query || selectedTags.length > 0
        ? await searchDocuments({ accountId: activeAccountId, query, tags: selectedTags, tenantId: activeTenantId ?? null })
        : await fetchDocuments({ accountId: activeAccountId, tenantId: activeTenantId ?? null });
      setDocuments(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, query, selectedTags, activeTenantId]);

  useEffect(() => {
    if (!authLoading && !accountLoading && activeAccountId) loadDocuments();
  }, [loadDocuments, authLoading, accountLoading, activeAccountId]);

  useEffect(() => {
    setTenantPriorityDrafts(
      Object.fromEntries((documents ?? []).map((doc) => [
        doc.id,
        { highlight: doc.tenant_highlight || "standard", note: doc.tenant_highlight_note || "", rank: doc.tenant_highlight_rank || 100 },
      ])),
    );
  }, [documents]);

  useRealtimeTables({
    enabled: !authLoading && !accountLoading && !!activeAccountId,
    subscriptions: [{ channel: `documents:${activeAccountId}`, table: "documents", filter: `account_id=eq.${activeAccountId}` }],
    onChange: loadDocuments,
  });

  /* ---------- URL UPDATE ---------- */
  function updateUrl(nextQuery, nextTags) {
    const params = new URLSearchParams();
    if (nextQuery) params.set("q", nextQuery);
    if (nextTags.length > 0) params.set("tags", nextTags.join(","));
    if (docParam) params.set("doc", docParam);
    setSearchParams(params, { replace: true });
  }

  function handleSearch(value) {
    setQuery(value);
    updateUrl(value, selectedTags);
  }

  function toggleTag(tag) {
    const nextTags = selectedTags.includes(tag)
      ? selectedTags.filter((v) => v !== tag)
      : [...selectedTags, tag];
    setSelectedTags(nextTags);
    updateUrl(query, nextTags);
  }

  /* ---------- TENANT PRIORITY ---------- */
  function getTenantPriorityDraft(doc) {
    return tenantPriorityDrafts[doc.id] || { highlight: doc.tenant_highlight || "standard", note: doc.tenant_highlight_note || "", rank: doc.tenant_highlight_rank || 100 };
  }

  function updateTenantPriorityDraft(docId, patch) {
    setTenantPriorityDrafts((cur) => ({ ...cur, [docId]: { ...(cur[docId] || {}), ...patch } }));
  }

  function togglePriorityExpanded(id) {
    setExpandedPriorityIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleTenantHighlightChange(doc, nextValue) {
    const draft = getTenantPriorityDraft(doc);
    setSavingHighlightId(doc.id);
    try {
      await updateDocumentTenantHighlight({ documentId: doc.id, tenantHighlight: nextValue, tenantHighlightNote: draft.note, tenantHighlightRank: draft.rank });
      await loadDocuments();
    } finally { setSavingHighlightId(""); }
  }

  async function handleTenantPrioritySave(doc) {
    const draft = getTenantPriorityDraft(doc);
    setSavingHighlightId(doc.id);
    try {
      await updateDocumentTenantHighlight({ documentId: doc.id, tenantHighlight: draft.highlight, tenantHighlightNote: draft.note, tenantHighlightRank: draft.rank });
      await loadDocuments();
    } finally { setSavingHighlightId(""); }
  }

  /* ---------- PREVIEW ---------- */
  const handlePreview = useCallback(async (doc) => {
    if (!canPreview(doc.mime_type) || !isDocumentAvailableForAccess(doc)) return;
    try {
      setPreviewError(null);
      const url = await getDocumentPreviewUrl({
        accountId: doc.account_id, documentId: doc.id,
        propertyId: doc.property_id, tenantId: doc.tenant_id,
        scope: doc.scope, visibility: doc.visibility,
      });
      setPreviewDoc(doc);
      setPreviewUrl(url);
    } catch {
      setPreviewError(t("attachments.previewError"));
    }
  }, [t]);

  async function handleRequestScan(doc) {
    if (!doc?.id || !canRequestScan(doc)) return;
    setScanningIds((current) => new Set(current).add(doc.id));
    setScanErrorById((current) => ({ ...current, [doc.id]: null }));
    try {
      await requestDocumentScan({ documentId: doc.id, accountId: doc.account_id });
      await loadDocuments();
    } catch (error) {
      setScanErrorById((current) => ({
        ...current,
        [doc.id]: error?.message || t("documents.scanError"),
      }));
    } finally {
      setScanningIds((current) => {
        const next = new Set(current);
        next.delete(doc.id);
        return next;
      });
    }
  }

  const openPreviewById = useCallback(async (docId) => {
    if (!docId) return;
    const found = documents.find((d) => String(d.id) === String(docId));
    if (!found || !canPreview(found.mime_type)) return;
    await handlePreview(found);
  }, [documents, handlePreview]);

  useEffect(() => {
    if (!docParam || loading || lastAutoOpenedDocRef.current === docParam || previewDoc?.id) return;
    lastAutoOpenedDocRef.current = docParam;
    openPreviewById(docParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docParam, loading, openPreviewById]);

  function closePreview() {
    setPreviewDoc(null);
    setPreviewUrl(null);
    setPreviewError(null);
    lastAutoOpenedDocRef.current = null;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
    setSearchParams(params, { replace: true });
  }

  // Escape key for preview
  useEffect(() => {
    if (!previewDoc) return;
    function onKey(e) { if (e.key === "Escape") closePreview(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewDoc]);

  /* ---------- PAGINATION ---------- */
  const tenantsLoading   = useFallback ? tenantsLoadingHook   : false;
  const propertiesLoading = useFallback ? propertiesLoadingHook : false;
  const totalPages = Math.max(1, Math.ceil(documents.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const visibleDocuments = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return documents.slice(start, start + pageSize);
  }, [documents, safePage, pageSize]);

  const tenantDocumentGroups = useMemo(() => partitionTenantDocuments(documents), [documents]);

  useEffect(() => {
    if (!docParam || documents.length === 0) return;
    const index = documents.findIndex((d) => String(d.id) === String(docParam));
    if (index < 0) return;
    const targetPage = Math.floor(index / pageSize) + 1;
    if (targetPage !== page) setPage(targetPage);
  }, [docParam, documents, page, pageSize]);

  /* ---------- EARLY STATES ---------- */
  if (authLoading || accountLoading || tenantsLoading || propertiesLoading) return <DocumentsSkeleton />;

  /* ---------- RENDER ---------- */
  return (
    <>
      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        properties={properties}
        tenants={tenants}
        activeAccountId={activeAccountId}
        onUploaded={loadDocuments}
        t={t}
      />

      <div className="space-y-4">
        <DashboardBreadcrumbs items={[{ label: t("sidebar.documents") }]} />

        {/* Tenant overview stays near the top for tenant role */}
        {isTenant && <TenantDocumentsOverview groups={tenantDocumentGroups} t={t} />}

        {/* Tenant-facing panels — important for tenants, shown near top */}
        {isTenant && (
          <>
            <DocumentRequestsPanel accountId={activeAccountId} permissionContext={permissionContext} tenants={tenants} t={t} mode="participant" />
            <DocumentPacketsPanel  accountId={activeAccountId} permissionContext={permissionContext} tenants={tenants} t={t} mode="participant" />
          </>
        )}

        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("sidebar.documents")}</h1>
          </div>
          {canUploadDocument(permissionContext) && (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              {t("documents.add")}
            </button>
          )}
        </div>

        {/* SEARCH + TAG PILL FILTERS */}
        <div className="space-y-3">
          <input
            type="text"
            placeholder={t("documents.search")}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <div className="flex flex-wrap gap-2">
            {DOCUMENT_TAGS.map((tag) => (
              <button
                key={tag.value}
                type="button"
                onClick={() => toggleTag(tag.value)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  selectedTags.includes(tag.value)
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                }`}
              >
                {getDocumentTagLabel(tag.value, t)}
              </button>
            ))}
          </div>
        </div>

        {/* DOCUMENT LIST */}
        {loading && <DocumentsSkeleton />}

        {!loading && documents.length === 0 && (
          <div className="text-center py-20">
            <h3 className="text-xl font-semibold text-slate-900">
              {isTenant ? t("tenantPortal.documents.emptyTitle") : t("documents.emptyTitle")}
            </h3>
            <p className="text-slate-500 mt-2">
              {isTenant ? t("tenantPortal.documents.emptyBody") : t("documents.emptySearchHint")}
            </p>
          </div>
        )}

        {!loading && documents.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
            {visibleDocuments.map((doc) => {
              const scopeLabel = doc.property_id
                ? propertyMap.get(String(doc.property_id))
                : doc.tenant_id
                  ? tenantMap.get(String(doc.tenant_id))
                  : null;
              const isPriorityExpanded = expandedPriorityIds.has(doc.id);
              const showPriorityEditor = canEditDocumentTags(permissionContext) && doc.visibility === "tenant";
              const scanStatus = normalizeScanStatus(doc);
              const isAccessReady = isDocumentAvailableForAccess(doc);
              const isScanning = scanningIds.has(doc.id);
              const scanError = scanErrorById[doc.id];

              return (
                <div key={doc.id} className="px-6 py-4 space-y-3">
                  {/* Row: name/meta on left, actions on right */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    {/* Left */}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900 truncate">{doc.name}</p>
                        {scopeLabel && (
                          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {scopeLabel}
                          </span>
                        )}
                        {doc.tenant_id && doc.property_id && (
                          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            {t("documents.shared")}
                          </span>
                        )}
                        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${getScanStatusClass(scanStatus)}`}>
                          {getScanStatusLabel(scanStatus, t)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatMime(doc.mime_type)}
                        {doc.size_bytes ? ` · ${formatFileSize(doc.size_bytes)}` : ""}
                      </p>
                      {!isAccessReady && (
                        <p className="mt-1 text-xs text-slate-500">
                          {t("documents.unavailableUntilClean")}
                        </p>
                      )}
                      {scanError && (
                        <p className="mt-1 text-xs text-rose-600">
                          {scanError}
                        </p>
                      )}
                      {doc.tags?.length > 0 && (
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {doc.tags.map((tag) => (
                            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {getDocumentTagLabel(tag, t)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {canRequestScan(doc) && (
                        <button
                          type="button"
                          onClick={() => handleRequestScan(doc)}
                          disabled={isScanning}
                          className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                        >
                          {isScanning
                            ? t("documents.scanning")
                            : scanStatus === "scan_failed"
                              ? t("documents.retryScan")
                              : t("documents.scan")}
                        </button>
                      )}
                      {canPreview(doc.mime_type) && (
                        <button
                          type="button"
                          onClick={() => handlePreview(doc)}
                          disabled={!isAccessReady}
                          title={!isAccessReady ? t("documents.unavailableUntilClean") : undefined}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {t("attachments.preview")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => downloadDocument({
                          filename: doc.name,
                          accountId: doc.account_id, documentId: doc.id,
                          propertyId: doc.property_id, tenantId: doc.tenant_id,
                          scope: doc.scope, visibility: doc.visibility,
                        })}
                        disabled={!isAccessReady}
                        title={!isAccessReady ? t("documents.unavailableUntilClean") : undefined}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("attachments.download")}
                      </button>
                      <Link
                        to={`/documents/${doc.id}/service-timeline`}
                        className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                      >
                        {t("documents.provenanceTimeline")}
                      </Link>
                      {canDeleteDocument(permissionContext) && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (confirm(t("documents.confirmDelete"))) {
                              await deleteDocument({
                                id: doc.id, storagePath: doc.storage_path,
                                accountId: doc.account_id, propertyId: doc.property_id,
                                tenantId: doc.tenant_id, scope: doc.scope, visibility: doc.visibility,
                              });
                              await loadDocuments();
                            }
                          }}
                          className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          {t("common.delete")}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tenant priority (collapsible) */}
                  {showPriorityEditor && (
                    <div>
                      <button
                        type="button"
                        onClick={() => togglePriorityExpanded(doc.id)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        <ChevronDown size={13} className={`transition-transform duration-150 ${isPriorityExpanded ? "rotate-180" : ""}`} />
                        {t("documents.editVisibility")}
                      </button>
                      {isPriorityExpanded && (
                        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">
                            {t("documents.tenantPriority.title")}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,160px)_80px_minmax(0,220px)_auto] sm:items-center">
                            <select
                              aria-label={t("documents.tenantPriority.title")}
                              value={getTenantPriorityDraft(doc).highlight}
                              onChange={(e) => { updateTenantPriorityDraft(doc.id, { highlight: e.target.value }); handleTenantHighlightChange(doc, e.target.value); }}
                              disabled={savingHighlightId === doc.id}
                              className="rounded border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700"
                            >
                              <option value="standard">{t("tenantPortal.documents.highlight.standard")}</option>
                              <option value="current">{t("tenantPortal.documents.highlight.current")}</option>
                              <option value="action_required">{t("tenantPortal.documents.highlight.actionRequired")}</option>
                            </select>
                            <input
                              type="number" min="1" max="999"
                              value={getTenantPriorityDraft(doc).rank}
                              onChange={(e) => updateTenantPriorityDraft(doc.id, { rank: Math.max(1, Math.min(999, Number(e.target.value || 100))) })}
                              className="rounded border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700"
                              aria-label={t("documents.tenantPriority.rank")}
                            />
                            <input
                              type="text"
                              value={getTenantPriorityDraft(doc).note}
                              onChange={(e) => updateTenantPriorityDraft(doc.id, { note: e.target.value })}
                              placeholder={t("documents.tenantPriority.notePlaceholder")}
                              className="rounded border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700"
                              aria-label={t("documents.tenantPriority.note")}
                            />
                            <button
                              type="button"
                              onClick={() => handleTenantPrioritySave(doc)}
                              disabled={savingHighlightId === doc.id}
                              className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                            >
                              {savingHighlightId === doc.id ? t("documents.tenantPriority.saving") : t("documents.tenantPriority.save")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Extraction panel */}
                  {!isTenant && canUploadDocument(permissionContext) && (
                    <DocumentExtractionPanel accountId={doc.account_id} documentId={doc.id} mimeType={doc.mime_type} />
                  )}
                </div>
              );
            })}

            <PaginationFooter
              page={safePage}
              totalPages={totalPages}
              totalCount={documents.length}
              pageSize={pageSize}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
              onPageSizeChange={(next) => setPageSize(next)}
              t={t}
            />
          </div>
        )}

        {/* Manager-only accordion sections */}
        {!isTenant && (
          <>
            <AccordionSection
              title={t("documents.workflows")}
              open={workflowsOpen}
              onToggle={() => setWorkflowsOpen((o) => !o)}
            >
              <DocumentRequestsPanel accountId={activeAccountId} permissionContext={permissionContext} tenants={tenants} t={t} mode="manager" />
              <DocumentPacketsPanel  accountId={activeAccountId} permissionContext={permissionContext} tenants={tenants} t={t} mode="manager" />
            </AccordionSection>

            <AccordionSection
              title={t("documents.templatesAndSignatures")}
              open={resourcesOpen}
              onToggle={() => setResourcesOpen((o) => !o)}
            >
              <DocumentSignatureReadinessPanel accountId={activeAccountId} t={t} />
              <DocumentTemplateLibrary accountId={activeAccountId} permissionContext={permissionContext} t={t} />
            </AccordionSection>
          </>
        )}
      </div>

      {/* PREVIEW MODAL */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onMouseDown={(e) => { if (e.currentTarget === e.target) closePreview(); }}
        >
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b gap-3">
              <p className="font-medium truncate flex-1">{previewDoc.name}</p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => downloadDocument({
                    filename: previewDoc.name,
                    accountId: previewDoc.account_id, documentId: previewDoc.id,
                    propertyId: previewDoc.property_id, tenantId: previewDoc.tenant_id,
                    scope: previewDoc.scope, visibility: previewDoc.visibility,
                  })}
                  disabled={!isDocumentAvailableForAccess(previewDoc)}
                  title={!isDocumentAvailableForAccess(previewDoc) ? t("documents.unavailableUntilClean") : undefined}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("attachments.download")}
                </button>
                <button type="button" onClick={closePreview}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {previewError && <p className="text-rose-600 text-sm">{previewError}</p>}
              {!previewError && previewUrl && (
                <>
                  {previewDoc.mime_type?.startsWith("image/") && (
                    <img src={previewUrl} alt={previewDoc.name} className="max-w-full mx-auto rounded" />
                  )}
                  {previewDoc.mime_type === "application/pdf" && (
                    <iframe src={previewUrl} title={previewDoc.name} className="w-full h-[70vh] border rounded" />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ======================
   PAGINATION
   ====================== */

function PaginationFooter({ page, totalPages, totalCount, pageSize, onPrev, onNext, onPageSizeChange, t }) {
  if (totalCount <= 0) return null;
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-t border-slate-100 px-6 py-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">{t("common.perPage")}</span>
        <select
          aria-label={t("common.perPage")}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {[10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={onPrev} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">
          {t("common.prev")}
        </button>
        <span className="text-sm text-slate-600">
          {t("common.page")} <span className="font-medium text-slate-900">{page}</span> {t("common.of")}{" "}
          <span className="font-medium text-slate-900">{totalPages}</span>
          <span className="ml-2 text-xs text-slate-500">({totalCount} {t("common.total").toLowerCase()})</span>
        </span>
        <button type="button" disabled={page >= totalPages} onClick={onNext} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">
          {t("common.next")}
        </button>
      </div>
    </div>
  );
}
