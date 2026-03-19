// src/components/TenantDocumentsSection.jsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Card from "./Card";
import { useAuth } from "../context/AuthContext";
import { useAccount } from "../context/AccountContext"; // ✅ MULTI-TENANT
import {
  fetchDocuments,
  uploadDocument,
  deleteDocument,
  updateDocumentTags,
  getDocumentPreviewUrl,
  downloadDocument,
} from "../services/documentService";
import { fetchDocumentAudit } from "../services/documentAuditService";
import { DOCUMENT_TAGS } from "../constants/documentTags";
import { useI18n } from "../context/I18nContext";

import {
  canUploadDocument,
  canEditDocument,
  canDeleteDocument,
} from "../utils/permissions";

/* ======================
   HELPERS
   ====================== */

function canPreview(mime) {
  return mime?.startsWith("image/") || mime === "application/pdf";
}

function PaginationFooter({ page, totalPages, totalCount, pageSize, onPrev, onNext, onPageSizeChange, t }) {
  if (totalCount <= 0) return null;

  return (
    <div className="flex flex-col gap-3 pt-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">{t("common.perPage")}</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
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

function getDocumentTagLabel(tag, t) {
  const value = String(tag || "").trim().toUpperCase();
  return t(`documents.tag.${value}`, { defaultValue: value || tag || "—" });
}

/* ======================
   COMPONENT
   ====================== */

export default function TenantDocumentsSection({ tenantId }) {
  const { user, loading: authLoading } = useAuth();
  const { activeAccountId, accountLoading } = useAccount(); // ✅ MULTI-TENANT
  const { role } = useAccount(); // ✅ SOURCE OF TRUTH
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  


  /* ---------- URL FILTER STATE ---------- */
  const filterTags =
    searchParams.get("tags")?.split(",").filter(Boolean) ?? [];

  /* ---------- DATA ---------- */
  const [documents, setDocuments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  /* ---------- UPLOAD TAGS ---------- */
  const [uploadTags, setUploadTags] = useState([]);

  /* ---------- TAG EDIT ---------- */
  const [editingDocId, setEditingDocId] = useState(null);
  const [editingTags, setEditingTags] = useState([]);

  /* ---------- LOAD ---------- */
  async function loadAll() {
  if (!tenantId || !activeAccountId) return; // ✅ REQUIRED

  setLoading(true);
  try {
    const [docs, auditLog] = await Promise.all([
      fetchDocuments({
        accountId: activeAccountId, // ✅ CRITICAL
        tenantId,
      }),
      fetchDocumentAudit({
        accountId: activeAccountId, // ✅ if audit is account-scoped
        tenantId,
      }),
    ]);

    setDocuments(docs);
    setAudit(auditLog);
    setPage(1);
  } finally {
    setLoading(false);
  }
}


  useEffect(() => {
    if (!authLoading && !accountLoading) {
      loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, authLoading, accountLoading, activeAccountId]);

  /* ---------- URL FILTER ---------- */
  function toggleFilterTag(tag) {
    const next = filterTags.includes(tag)
      ? filterTags.filter((t) => t !== tag)
      : [...filterTags, tag];

    const params = new URLSearchParams(searchParams);
    next.length ? params.set("tags", next.join(",")) : params.delete("tags");
    setSearchParams(params, { replace: true });
  }

  const filteredDocuments =
    filterTags.length === 0
      ? documents
      : documents.filter((doc) =>
          doc.tags?.some((t) => filterTags.includes(t))
        );

  useEffect(() => {
    setPage(1);
  }, [tenantId, pageSize, searchParams]);

  /* ---------- PERMISSIONS ---------- */
  const canUpload = canUploadDocument(role);

  function canEdit(doc) {
    return canEditDocument({ role, userId: user?.id, doc });
  }

  function canDelete(doc) {
    return canDeleteDocument({ role, userId: user?.id, doc });
  }

  /* ---------- PREVIEW ---------- */
  async function handlePreview(doc) {
    if (!canPreview(doc.mime_type)) return;

    try {
      const url = await getDocumentPreviewUrl(doc.storage_path, {
        accountId: doc.account_id,
        documentId: doc.id,
        propertyId: doc.property_id,
        tenantId: doc.tenant_id,
        scope: doc.scope,
        visibility: doc.visibility,
      });
      window.open(url, "_blank", "noopener");
    } catch {
      alert(t("attachments.previewError"));
    }
  }

  /* ---------- UPLOAD (CRITICAL FIX) ---------- */
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !activeAccountId) return; // ✅ MULTI-TENANT

    try {
      await uploadDocument({
        file,
        accountId: activeAccountId, // ✅ MULTI-TENANT (REQUIRED)
        tenantId,
        tags: uploadTags,
      });

      setUploadTags([]);
      e.target.value = "";
      await loadAll();
    } catch (err) {
      alert(err?.message ?? t("attachments.uploadError"));
    }
  }

  /* ---------- TAG EDIT ---------- */
  function startEditTags(doc) {
    setEditingDocId(doc.id);
    setEditingTags(doc.tags ?? []);
  }

  function toggleEditTag(tag) {
    setEditingTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]
    );
  }

  async function saveTags(doc) {
    try {
      await updateDocumentTags({
        documentId: doc.id,
        tags: editingTags,
      });
      setEditingDocId(null);
      setEditingTags([]);
      await loadAll();
    } catch (err) {
      alert(err?.message ?? t("documents.saveTagsError"));
    }
  }

  /* ---------- DELETE ---------- */
  async function handleDelete(doc) {
    if (!confirm(t("documents.confirmDelete"))) return;

    try {
      await deleteDocument(doc);
      await loadAll();
    } catch (err) {
      alert(err?.message ?? t("documents.deleteError"));
    }
  }

  /* ======================
     RENDER
     ====================== */

  if (authLoading || accountLoading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-500">
          {t("common.loadingPermissions")}
        </p>
      </Card>
    );
  }

  const totalCount = filteredDocuments.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedDocuments = filteredDocuments.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <Card className="p-6 space-y-6">
      {/* ---------- HEADER ---------- */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg">
          {t("documents.tenantTitle")}
        </h3>

        {canUpload && (
          <label className="px-3 py-2 bg-blue-600 text-white rounded-lg cursor-pointer text-sm">
            {t("documents.add")}
            <input
              type="file"
              className="hidden"
              onChange={handleUpload}
            />
          </label>
        )}
      </div>

      {/* ---------- UPLOAD TAGS ---------- */}
      {canUpload && (
        <div className="flex gap-2 flex-wrap">
          {DOCUMENT_TAGS.map((tag) => (
            <button
              key={tag.value}
              type="button"
              onClick={() =>
                setUploadTags((prev) =>
                  prev.includes(tag.value)
                    ? prev.filter((t) => t !== tag.value)
                    : [...prev, tag.value]
                )
              }
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
      )}

      {/* ---------- FILTER TAGS ---------- */}
      {documents.some((d) => d.tags?.length) && (
        <div className="flex gap-2 flex-wrap">
          {[...new Set(documents.flatMap((d) => d.tags || []))].map(
            (tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleFilterTag(tag)}
                className={`text-xs px-2 py-1 rounded border ${
                  filterTags.includes(tag)
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-600 border-slate-300"
                }`}
              >
                {getDocumentTagLabel(tag, t)}
              </button>
            )
          )}
        </div>
      )}

      {/* ---------- DOCUMENT LIST ---------- */}
      {!loading && filteredDocuments.length > 0 && (
        <div className="divide-y border rounded-lg">
          {pagedDocuments.map((doc) => (
            <div
              key={doc.id}
              className="px-4 py-3 flex justify-between items-start"
            >
              <div>
                <p className="font-medium">{doc.name}</p>
                <p className="text-xs text-slate-500">
                  {(doc.size_bytes / 1024).toFixed(1)} KB
                </p>

                {/* TAG DISPLAY */}
                {editingDocId !== doc.id &&
                  doc.tags?.length > 0 && (
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {doc.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 rounded bg-slate-100"
                        >
                          {getDocumentTagLabel(tag, t)}
                        </span>
                      ))}
                    </div>
                  )}

                {/* TAG EDIT */}
                {editingDocId === doc.id && (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-3 flex-wrap">
                      {DOCUMENT_TAGS.map((tag) => (
                        <label
                          key={tag.value}
                          className="flex items-center gap-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={editingTags.includes(tag.value)}
                            onChange={() =>
                              toggleEditTag(tag.value)
                            }
                          />
                          {getDocumentTagLabel(tag.value, t)}
                        </label>
                      ))}
                    </div>

                    <div className="flex gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => saveTags(doc)}
                        className="text-blue-600 hover:underline"
                      >
                        {t("common.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDocId(null);
                          setEditingTags([]);
                        }}
                        className="text-gray-500 hover:underline"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ACTIONS */}
              <div className="flex gap-3 text-sm">
                {canPreview(doc.mime_type) && (
                  <button
                    type="button"
                    onClick={() => handlePreview(doc)}
                    className="text-blue-600 hover:underline"
                  >
                    {t("attachments.preview")}
                  </button>
                )}

                <button
                  type="button"
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

                {canEdit(doc) &&
                  editingDocId !== doc.id && (
                    <button
                    type="button"
                    onClick={() => startEditTags(doc)}
                    className="text-xs text-slate-600 hover:underline"
                  >
                      {t("documents.editTags")}
                    </button>
                  )}

                {canDelete(doc) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(doc)}
                    className="text-red-600 hover:underline"
                  >
                    {t("common.delete")}
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="px-4 py-3">
            <PaginationFooter
              page={safePage}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={pageSize}
              onPrev={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
              onPageSizeChange={(nextSize) => {
                setPageSize(nextSize);
                setPage(1);
              }}
              t={t}
            />
          </div>
        </div>
      )}

      {!loading && filteredDocuments.length === 0 ? (
        <p className="text-sm text-slate-500">
          {filterTags.length ? t("documents.emptyForTags") : t("documents.emptyForTenant")}
        </p>
      ) : null}
    </Card>
  );
}
