// src/components/PropertyDocumentsSection.jsx
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useAuth } from "../context/AuthContext";
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

function shortId(id) {
  return id ? String(id).slice(0, 8) : "—";
}

/* ======================
   COMPONENT
   ====================== */

export default function PropertyDocumentsSection({ propertyId }) {
  const fileInputRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role, loading: authLoading } = useAuth();

  /* ---------- URL FILTER STATE ---------- */
  const filterTags =
    searchParams.get("tags")?.split(",").filter(Boolean) ?? [];

  /* ---------- DATA ---------- */
  const [documents, setDocuments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ---------- UPLOAD TAGS ---------- */
  const [uploadTags, setUploadTags] = useState([]);

  /* ---------- TAG EDIT ---------- */
  const [editingDocId, setEditingDocId] = useState(null);
  const [editingTags, setEditingTags] = useState([]);

  /* ---------- PREVIEW ---------- */
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  /* ---------- LOAD ---------- */
  async function loadAll() {
    if (!propertyId) return;

    setLoading(true);
    try {
      const [docs, auditLog] = await Promise.all([
        fetchDocuments({ propertyId }),
        fetchDocumentAudit({ propertyId }),
      ]);
      setDocuments(docs);
      setAudit(auditLog);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  /* ---------- PERMISSIONS ---------- */
  const canUpload = canUploadDocument(role);

  function canEdit(doc) {
    return canEditDocument({ role, userId: user?.id, doc });
  }

  function canDelete(doc) {
    return canDeleteDocument({ role, userId: user?.id, doc });
  }

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

  /* ---------- UPLOAD ---------- */
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadDocument({
        file,
        propertyId,
        tags: uploadTags,
      });

      setUploadTags([]);
      e.target.value = "";
      await loadAll();
    } catch (err) {
      alert(err?.message ?? "Upload failed");
    }
  }

  /* ---------- TAG EDIT ---------- */
  function startEditTags(doc) {
    setEditingDocId(doc.id);
    setEditingTags(doc.tags ?? []);
  }

  function toggleEditTag(tag) {
    setEditingTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
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
      alert(err?.message ?? "Nie udało się zapisać tagów");
    }
  }

  /* ---------- PREVIEW ---------- */
  async function handlePreview(doc) {
    if (!canPreview(doc.mime_type)) return;

    try {
      setPreviewError(null);
      const url = await getDocumentPreviewUrl(doc.storage_path);
      setPreviewDoc(doc);
      setPreviewUrl(url);
    } catch {
      setPreviewError("Nie udało się załadować podglądu");
    }
  }

  /* ---------- DOWNLOAD ---------- */
  async function handleDownload(doc) {
    try {
      await downloadDocument({
        storagePath: doc.storage_path,
        filename: doc.name,
      });
    } catch (err) {
      alert(err?.message ?? "Nie udało się pobrać pliku");
    }
  }

  /* ---------- DELETE ---------- */
  async function handleDelete(doc) {
    if (!confirm("Usunąć dokument?")) return;

    try {
      await deleteDocument(doc);
      await loadAll();
    } catch (err) {
      alert(err?.message ?? "Nie udało się usunąć dokumentu");
    }
  }

  /* ======================
     RENDER
     ====================== */

  if (authLoading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-slate-500">Ładowanie uprawnień…</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-6">
      {/* ---------- HEADER ---------- */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Dokumenty nieruchomości</h3>

        {canUpload && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg"
            >
              Dodaj dokument
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              onChange={handleUpload}
            />
          </>
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
              {tag.label}
            </button>
          ))}
        </div>
      )}

      {/* ---------- FILTER TAGS ---------- */}
      {documents.some((d) => d.tags?.length) && (
        <div className="flex gap-2 flex-wrap">
          {[...new Set(documents.flatMap((d) => d.tags || []))].map((tag) => (
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
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* ---------- LOADING ---------- */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}

      {/* ---------- EMPTY ---------- */}
      {!loading && documents.length === 0 && (
        <p className="text-sm text-slate-500">
          Brak dokumentów dla tej nieruchomości
        </p>
      )}

      {/* ---------- EMPTY FILTER ---------- */}
      {!loading && filteredDocuments.length === 0 && documents.length > 0 && (
        <p className="text-sm text-slate-500">
          Brak dokumentów dla wybranych tagów
        </p>
      )}

      {/* ---------- DOCUMENT LIST ---------- */}
      {!loading && filteredDocuments.length > 0 && (
        <div className="divide-y border rounded-lg bg-white">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="px-4 py-3 flex justify-between items-start"
            >
              <div>
                <p className="font-medium">{doc.name}</p>

                <p className="text-xs text-slate-500">
                  {doc.mime_type ?? "—"} •{" "}
                  {(doc.size_bytes / 1024).toFixed(1)} KB
                </p>

                {/* TAGS display */}
                {editingDocId !== doc.id && doc.tags?.length > 0 && (
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {doc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded bg-slate-100"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* TAGS edit */}
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
                            onChange={() => toggleEditTag(tag.value)}
                          />
                          {tag.label}
                        </label>
                      ))}
                    </div>

                    <div className="flex gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => saveTags(doc)}
                        className="text-blue-600 hover:underline"
                      >
                        Zapisz
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDocId(null);
                          setEditingTags([]);
                        }}
                        className="text-gray-500 hover:underline"
                      >
                        Anuluj
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 text-sm">
                {canPreview(doc.mime_type) && (
                  <button
                    type="button"
                    onClick={() => handlePreview(doc)}
                    className="text-blue-600 hover:underline"
                  >
                    Podgląd
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDownload(doc)}
                  className="text-slate-600 hover:underline"
                >
                  Pobierz
                </button>

                {canEdit(doc) && editingDocId !== doc.id && (
                  <button
                    type="button"
                    onClick={() => startEditTags(doc)}
                    className="text-xs text-slate-600 hover:underline"
                  >
                    Edytuj tagi
                  </button>
                )}

                {canDelete(doc) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(doc)}
                    className="text-red-600 hover:underline"
                  >
                    Usuń
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ======================
         AUDIT LOG
         ====================== */}
      {audit.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">
            Historia dokumentów
          </h4>

          <div className="divide-y border rounded-lg text-sm">
            {audit.map((a) => (
              <div key={a.id} className="px-4 py-2 flex justify-between">
                <div>
                  <p className="font-medium">
                    {a.action === "UPLOAD" ? "Dodano dokument" : "Usunięto dokument"}
                  </p>
                  <p className="text-xs text-slate-500">{a.name}</p>
                </div>

                <div className="text-right text-xs text-slate-500">
                  <p>{a.actor_id ? `Użytkownik ${shortId(a.actor_id)}` : "—"}</p>
                  <p>{a.created_at ? new Date(a.created_at).toLocaleString() : "—"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================
         PREVIEW MODAL
         ====================== */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-4 py-3 border-b">
              <p className="font-medium truncate">{previewDoc.name}</p>
              <button
                type="button"
                onClick={() => {
                  setPreviewDoc(null);
                  setPreviewUrl(null);
                  setPreviewError(null);
                }}
                className="text-sm text-gray-600 hover:text-black"
              >
                Zamknij ✕
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
    </Card>
  );
}
