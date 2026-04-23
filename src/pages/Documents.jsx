// src/pages/Documents.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import Skeleton from "../components/ui/Skeleton";
import Card from "../components/Card";
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
  deleteDocument,
  updateDocumentTenantHighlight,
} from "../services/documentService";

import { DOCUMENT_TAGS } from "../constants/documentTags";
import { canUploadDocument, canDeleteDocument, canEditDocumentTags } from "../utils/permissions";

// Optional fallback if you forget to pass props from App.jsx
import { useProperties } from "../hooks/useProperties";
import { useTenants } from "../hooks/useTenants";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { partitionTenantDocuments } from "../utils/tenantPortal";
import TenantDocumentsOverview from "../components/TenantDocumentsOverview";
import DashboardBreadcrumbs from "../components/DashboardBreadcrumbs";
import DocumentTemplateLibrary from "../components/DocumentTemplateLibrary";
import DocumentRequestsPanel from "../components/DocumentRequestsPanel";
import DocumentPacketsPanel from "../components/DocumentPacketsPanel";

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

/* ======================
   SKELETON
   ====================== */

function DocumentsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  );
}

/* ======================
   DOCUMENTS (GLOBAL)
   ====================== */

export default function Documents({
  tenants: tenantsProp = null,
  properties: propertiesProp = null,
} = {}) {
  const { setTitle } = usePageTitle();
  const { t } = useI18n();
  const { loading: authLoading } = useAuth();
  const { accounts, activeAccountId, accountLoading, activeRole, activePermissionContext } = useAccount();
  const { activeTenantId } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();

  // If your AccountContext doesn't expose activeRole yet, fallback to membership lookup
  const activeAccount = useMemo(() => {
    return accounts?.find((a) => a.id === activeAccountId) ?? null;
  }, [accounts, activeAccountId]);

  const role = activeRole ?? activeAccount?.role ?? null;
  const permissionContext = activePermissionContext ?? { role };
  const isTenant = String(role ?? "").toLowerCase() === "tenant";

  /* ---------- FALLBACK HOOKS ---------- */
  const useFallback = !tenantsProp || !propertiesProp;

  const { properties: propertiesHook, loading: propertiesLoadingHook } =
    useProperties({
      enabled: !!activeAccountId && useFallback,
    });

  const { tenants: tenantsHook, loading: tenantsLoadingHook } = useTenants({
    enabled: !!activeAccountId && useFallback,
  });

  const properties = propertiesProp ?? propertiesHook ?? [];
  const tenants = tenantsProp ?? tenantsHook ?? [];

  /* ---------- URL STATE ---------- */
  const queryParam = searchParams.get("q") ?? "";
  const tagsParam = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
  const docParam = searchParams.get("doc") ?? null;

  const [query, setQuery] = useState(queryParam);
  const [selectedTags, setSelectedTags] = useState(tagsParam);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  /* ---------- DATA ---------- */
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ---------- UPLOAD STATE (SCOPED) ---------- */
  const [uploadPropertyId, setUploadPropertyId] = useState("");
  const [uploadTenantId, setUploadTenantId] = useState("");
  const [uploadTags, setUploadTags] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [savingHighlightId, setSavingHighlightId] = useState("");
  const [tenantPriorityDrafts, setTenantPriorityDrafts] = useState({});

  /* ---------- PREVIEW ---------- */
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  // ✅ prevents infinite deep-link loop
  const lastAutoOpenedDocRef = useRef(null);

  /* ---------- PAGE TITLE ---------- */
  useEffect(() => {
    setTitle(t("sidebar.documents"));
  }, [setTitle, t]);

  /* ---------- SYNC URL → STATE (q/tags only) ---------- */
  useEffect(() => {
    setQuery(queryParam);
    setSelectedTags(tagsParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [query, selectedTags, activeTenantId, pageSize]);

  /* ======================
     LOAD DOCUMENTS
     ====================== */

  const loadDocuments = useCallback(async () => {
    if (!activeAccountId) return;

    setLoading(true);
    try {
      const data =
        query || selectedTags.length > 0
          ? await searchDocuments({
              accountId: activeAccountId,
              query,
              tags: selectedTags,
              tenantId: activeTenantId ?? null,
            })
          : await fetchDocuments({
              accountId: activeAccountId,
              tenantId: activeTenantId ?? null,
            });

      setDocuments(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, query, selectedTags, activeTenantId]);

  useEffect(() => {
    if (!authLoading && !accountLoading && activeAccountId) {
      loadDocuments();
    }
  }, [loadDocuments, authLoading, accountLoading, activeAccountId]);

  useEffect(() => {
    setTenantPriorityDrafts(
      Object.fromEntries(
        (documents ?? []).map((doc) => [
          doc.id,
          {
            highlight: doc.tenant_highlight || "standard",
            note: doc.tenant_highlight_note || "",
            rank: doc.tenant_highlight_rank || 100,
          },
        ]),
      ),
    );
  }, [documents]);

  useRealtimeTables({
    enabled: !authLoading && !accountLoading && !!activeAccountId,
    subscriptions: [
      {
        channel: `documents:${activeAccountId}`,
        table: "documents",
        filter: `account_id=eq.${activeAccountId}`,
      },
    ],
    onChange: loadDocuments,
  });

  /* ---------- UPDATE URL (preserve doc param if present) ---------- */
  function updateUrl(nextQuery, nextTags) {
    const params = new URLSearchParams();
    if (nextQuery) params.set("q", nextQuery);
    if (nextTags.length > 0) params.set("tags", nextTags.join(","));
    if (docParam) params.set("doc", docParam);
    setSearchParams(params, { replace: true });
  }

  /* ---------- SEARCH ---------- */
  function handleSearch(value) {
    setQuery(value);
    updateUrl(value, selectedTags);
  }

  /* ---------- TAG TOGGLE (FILTER) ---------- */
  function toggleTag(tag) {
    const nextTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];

    setSelectedTags(nextTags);
    updateUrl(query, nextTags);
  }

  /* ---------- UPLOAD TAG TOGGLE ---------- */
  function toggleUploadTag(tag) {
    setUploadTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function getTenantPriorityDraft(doc) {
    return tenantPriorityDrafts[doc.id] || {
      highlight: doc.tenant_highlight || "standard",
      note: doc.tenant_highlight_note || "",
      rank: doc.tenant_highlight_rank || 100,
    };
  }

  function updateTenantPriorityDraft(docId, patch) {
    setTenantPriorityDrafts((current) => ({
      ...current,
      [docId]: {
        ...(current[docId] || {}),
        ...patch,
      },
    }));
  }

  async function handleTenantHighlightChange(doc, nextValue) {
    const draft = getTenantPriorityDraft(doc);
    setSavingHighlightId(doc.id);
    try {
      await updateDocumentTenantHighlight({
        documentId: doc.id,
        tenantHighlight: nextValue,
        tenantHighlightNote: draft.note,
        tenantHighlightRank: draft.rank,
      });
      await loadDocuments();
    } finally {
      setSavingHighlightId("");
    }
  }

  async function handleTenantPrioritySave(doc) {
    const draft = getTenantPriorityDraft(doc);
    setSavingHighlightId(doc.id);
    try {
      await updateDocumentTenantHighlight({
        documentId: doc.id,
        tenantHighlight: draft.highlight,
        tenantHighlightNote: draft.note,
        tenantHighlightRank: draft.rank,
      });
      await loadDocuments();
    } finally {
      setSavingHighlightId("");
    }
  }

  /* ---------- UPLOAD (SCOPED to tenant OR property) ---------- */
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!activeAccountId) {
      alert(t("documents.noActiveAccount"));
      e.target.value = "";
      return;
    }

    if (!uploadPropertyId && !uploadTenantId) {
      alert(t("documents.pickPropertyOrTenant"));
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      await uploadDocument({
        accountId: activeAccountId,
        file,
        propertyId: uploadPropertyId || null,
        tenantId: uploadTenantId || null,
        tags: uploadTags,
      });

      setUploadTags([]);
      setUploadPropertyId("");
      setUploadTenantId("");
      e.target.value = "";

      await loadDocuments();
    } catch (err) {
      alert(err?.message ?? t("attachments.uploadError"));
      e.target.value = "";
    } finally {
      setUploading(false);
    }
  }

  /* ---------- PREVIEW ---------- */
  const handlePreview = useCallback(async (doc) => {
    if (!canPreview(doc.mime_type)) return;

    try {
      setPreviewError(null);
      const url = await getDocumentPreviewUrl(doc.storage_path, {
        accountId: doc.account_id,
        documentId: doc.id,
        propertyId: doc.property_id,
        tenantId: doc.tenant_id,
        scope: doc.scope,
        visibility: doc.visibility,
      });
      setPreviewDoc(doc);
      setPreviewUrl(url);
    } catch {
      setPreviewError(t("attachments.previewError"));
    }
  }, [t]);

  // ✅ Open preview by id (deep-link). Important: do NOT depend on preview state.
  const openPreviewById = useCallback(
    async (docId) => {
      if (!docId) return;

      const found = documents.find((d) => String(d.id) === String(docId));
      if (!found) return;
      if (!canPreview(found.mime_type)) return;

      await handlePreview(found);
    },
    [documents, handlePreview]
  );

  // ✅ Deep-link: /documents?doc=<uuid> opens preview once after list loads
  useEffect(() => {
    if (!docParam) return;
    if (loading) return;

    // already auto-opened this doc param
    if (lastAutoOpenedDocRef.current === docParam) return;

    // if user manually opened something, don't fight them
    if (previewDoc?.id) return;

    lastAutoOpenedDocRef.current = docParam;
    openPreviewById(docParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docParam, loading, openPreviewById]);

  const tenantsLoading = useFallback ? tenantsLoadingHook : false;
  const propertiesLoading = useFallback ? propertiesLoadingHook : false;
  const totalPages = Math.max(1, Math.ceil(documents.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleDocuments = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return documents.slice(start, start + pageSize);
  }, [documents, safePage, pageSize]);
  const tenantDocumentGroups = useMemo(
    () => partitionTenantDocuments(documents),
    [documents],
  );

  useEffect(() => {
    if (!docParam || documents.length === 0) return;
    const index = documents.findIndex((d) => String(d.id) === String(docParam));
    if (index < 0) return;
    const targetPage = Math.floor(index / pageSize) + 1;
    if (targetPage !== page) setPage(targetPage);
  }, [docParam, documents, page, pageSize]);

  /* ======================
     RENDER
     ====================== */

  if (authLoading || accountLoading || tenantsLoading || propertiesLoading) {
    return <DocumentsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <DashboardBreadcrumbs items={[{ label: t("sidebar.documents") }]} />
      {isTenant ? (
        <TenantDocumentsOverview groups={tenantDocumentGroups} t={t} />
      ) : null}

      <DocumentRequestsPanel
        accountId={activeAccountId}
        permissionContext={permissionContext}
        tenants={tenants}
        t={t}
        mode={isTenant ? "participant" : "manager"}
      />

      <DocumentPacketsPanel
        accountId={activeAccountId}
        permissionContext={permissionContext}
        tenants={tenants}
        t={t}
        mode={isTenant ? "participant" : "manager"}
      />

      {!isTenant ? (
        <DocumentTemplateLibrary
          accountId={activeAccountId}
          permissionContext={permissionContext}
          t={t}
        />
      ) : null}

      {canUploadDocument(permissionContext) && (
        <Card className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{t("documents.add")}</p>
              <p className="text-xs text-slate-500">
                {t("documents.pickTenantOrPropertyIntro")} <b>{t("finance.table.tenant").toLowerCase()}</b> {t("common.or")} <b>{t("finance.table.property").toLowerCase()}</b>, {t("documents.assignSuffix")}
                {" "}{t("attachments.document").toLowerCase()}.
              </p>
            </div>

            <label
              className={`px-3 py-2 rounded-lg cursor-pointer text-sm text-white ${
                uploading ? "bg-slate-400" : "bg-blue-600"
              }`}
            >
              {uploading ? t("attachments.uploading") : t("documents.add")}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>

          <div className="flex gap-4 flex-wrap">
            <select
              value={uploadPropertyId}
              onChange={(e) => {
                const v = e.target.value;
                setUploadPropertyId(v);
                if (v) setUploadTenantId("");
              }}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="">{t("documents.selectProperty")}</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address} ({p.city})
                </option>
              ))}
            </select>

            <span className="text-sm text-slate-400 self-center">{t("common.or")}</span>

            <select
              value={uploadTenantId}
              onChange={(e) => {
                const v = e.target.value;
                setUploadTenantId(v);
                if (v) setUploadPropertyId("");
              }}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="">{t("documents.selectTenant")}</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 flex-wrap">
            {DOCUMENT_TAGS.map((tag) => (
              <button
                key={tag.value}
                type="button"
                onClick={() => toggleUploadTag(tag.value)}
                className={`text-xs px-2 py-1 rounded border ${
                  uploadTags.includes(tag.value)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-300"
                }`}
              >
                {getDocumentTagLabel(tag.value, t)}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="bg-white border rounded-xl p-4 space-y-4">
        <input
          type="text"
          placeholder={t("documents.search")}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />

        <div className="flex flex-wrap gap-3">
          {DOCUMENT_TAGS.map((tag) => (
            <label
              key={tag.value}
              className="flex items-center gap-1 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedTags.includes(tag.value)}
                onChange={() => toggleTag(tag.value)}
              />
              {getDocumentTagLabel(tag.value, t)}
            </label>
          ))}
        </div>
      </div>

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
        <div className="divide-y bg-white border rounded-xl">
          {visibleDocuments.map((doc) => (
            <div
              key={doc.id}
              className="px-6 py-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div>
                <p className="font-medium flex items-center gap-2">
                  {doc.name}
                  {doc.tenant_id && doc.property_id && (
                    <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                      {t("documents.shared")}
                    </span>
                  )}
                </p>

                <p className="text-sm text-slate-500">
                  {doc.mime_type ?? "—"} • {(doc.size_bytes / 1024).toFixed(1)} KB
                </p>

                {doc.tags?.length > 0 && (
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {doc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                      >
                        {getDocumentTagLabel(tag, t)}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 text-sm lg:items-end">
                {canEditDocumentTags(permissionContext) && doc.visibility === "tenant" ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {t("documents.tenantPriority.title")}
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,160px)_92px_minmax(0,220px)_auto] sm:items-center">
                      <select
                        value={getTenantPriorityDraft(doc).highlight}
                        onChange={(event) => {
                          updateTenantPriorityDraft(doc.id, { highlight: event.target.value });
                          handleTenantHighlightChange(doc, event.target.value);
                        }}
                        disabled={savingHighlightId === doc.id}
                        className="rounded border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700"
                      >
                        <option value="standard">{t("tenantPortal.documents.highlight.standard")}</option>
                        <option value="current">{t("tenantPortal.documents.highlight.current")}</option>
                        <option value="action_required">{t("tenantPortal.documents.highlight.actionRequired")}</option>
                      </select>

                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={getTenantPriorityDraft(doc).rank}
                        onChange={(event) =>
                          updateTenantPriorityDraft(doc.id, {
                            rank: Math.max(1, Math.min(999, Number(event.target.value || 100))),
                          })
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700"
                        aria-label={t("documents.tenantPriority.rank")}
                      />

                      <input
                        type="text"
                        value={getTenantPriorityDraft(doc).note}
                        onChange={(event) =>
                          updateTenantPriorityDraft(doc.id, { note: event.target.value })
                        }
                        placeholder={t("documents.tenantPriority.notePlaceholder")}
                        className="rounded border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700"
                        aria-label={t("documents.tenantPriority.note")}
                      />

                      <button
                        type="button"
                        onClick={() => handleTenantPrioritySave(doc)}
                        disabled={savingHighlightId === doc.id}
                        className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingHighlightId === doc.id
                          ? t("documents.tenantPriority.saving")
                          : t("documents.tenantPriority.save")}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex gap-4 text-sm lg:justify-end">
                  {canPreview(doc.mime_type) && (
                    <button
                      onClick={() => handlePreview(doc)}
                      className="text-blue-600 hover:underline"
                    >
                      {t("attachments.preview")}
                    </button>
                  )}

                  <button
                    onClick={() =>
                      downloadDocument({
                        storagePath: doc.storage_path,
                        filename: doc.name,
                        accountId: doc.account_id,
                        documentId: doc.id,
                        propertyId: doc.property_id,
                        tenantId: doc.tenant_id,
                        scope: doc.scope,
                        visibility: doc.visibility,
                      })
                    }
                    className="text-slate-600 hover:underline"
                  >
                    {t("attachments.download")}
                  </button>

                  {canDeleteDocument(permissionContext) && (
                    <button
                      onClick={async () => {
                        if (confirm(t("documents.confirmDelete"))) {
                          await deleteDocument({
                            id: doc.id,
                            storagePath: doc.storage_path,
                            accountId: doc.account_id,
                            propertyId: doc.property_id,
                            tenantId: doc.tenant_id,
                            scope: doc.scope,
                            visibility: doc.visibility,
                          });
                          await loadDocuments();
                        }
                      }}
                      className="text-red-600 hover:underline"
                    >
                      {t("common.delete")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

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

      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-4 py-3 border-b">
              <p className="font-medium truncate">{previewDoc.name}</p>
              <button
                onClick={() => {
                  setPreviewDoc(null);
                  setPreviewUrl(null);
                  setPreviewError(null);

                  lastAutoOpenedDocRef.current = null;

                  // remove doc=... but keep q/tags
                  const params = new URLSearchParams();
                  if (query) params.set("q", query);
                  if (selectedTags.length > 0)
                    params.set("tags", selectedTags.join(","));
                  setSearchParams(params, { replace: true });
                }}
                className="text-sm text-gray-600 hover:text-black"
              >
                {t("common.close")} ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {previewError && (
                <p className="text-red-600 text-sm">{previewError}</p>
              )}

              {!previewError && previewUrl && (
                <>
                  {previewDoc.mime_type?.startsWith("image/") && (
                    <img
                      src={previewUrl}
                      alt={previewDoc.name}
                      className="max-w-full mx-auto"
                    />
                  )}

                  {previewDoc.mime_type === "application/pdf" && (
                    <iframe
                      src={previewUrl}
                      title={previewDoc.name}
                      className="w-full h-[70vh] border rounded"
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaginationFooter({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPrev,
  onNext,
  onPageSizeChange,
  t,
}) {
  if (totalCount <= 0) return null;

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-6 py-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">{t("common.perPage")}</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          {[10, 20, 30, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrev}
          className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {t("common.prev")}
        </button>
        <span className="text-sm text-slate-600">
          {t("common.page")} <span className="font-medium text-slate-900">{page}</span> {t("common.of")}{" "}
          <span className="font-medium text-slate-900">{totalPages}</span>
          <span className="ml-2 text-xs text-slate-500">({totalCount} {t("common.total").toLowerCase()})</span>
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={onNext}
          className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {t("common.next")}
        </button>
      </div>
    </div>
  );
}
