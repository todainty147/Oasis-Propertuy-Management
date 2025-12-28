// src/components/TenantDocumentsSection.jsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Card from "./Card";
import {
  fetchDocuments,
  uploadDocument,
  deleteDocument,
  updateDocumentTags,
  getDocumentPreviewUrl,
  downloadDocument,
} from "../services/documentService";
import { fetchDocumentAudit } from "../services/documentAuditService";
import { supabase } from "../lib/supabase";
import { DOCUMENT_TAGS } from "../constants/documentTags";

/* ======================
   HELPERS
   ====================== */

function canPreview(mime) {
  return mime?.startsWith("image/") || mime === "application/pdf";
}

/* ======================
   COMPONENT
   ====================== */

export default function TenantDocumentsSection({ tenantId }) {
  const [searchParams, setSearchParams] = useSearchParams();

  /* ---------- URL FILTER STATE ---------- */
  const filterTags =
    searchParams.get("tags")?.split(",").filter(Boolean) ?? [];

  /* ---------- DATA ---------- */
  const [documents, setDocuments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ---------- USER ---------- */
  const [currentUserId, setCurrentUserId] = useState(null);

  /* ---------- UPLOAD TAGS ---------- */
  const [uploadTags, setUploadTags] = useState([]);

  /* ---------- EDIT TAGS ---------- */
  const [editingDocId, setEditingDocId] = useState(null);
  const [editingTags, setEditingTags] = useState([]);

  /* ---------- SESSION ---------- */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data?.user?.id ?? null);
    });
  }, []);

  /* ---------- LOAD ---------- */
  async function loadAll() {
    if (!tenantId) return;

    setLoading(true);
    try {
      const [docs, auditLog] = await Promise.all([
        fetchDocuments({ tenantId }),
        fetchDocumentAudit({ tenantId }),
      ]);
      setDocuments(docs);
      setAudit(auditLog);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [tenantId]);

  /* ---------- URL FILTER TOGGLE ---------- */
  function toggleFilterTag(tag) {
    const next =
      filterTags.includes(tag)
        ? filterTags.filter((t) => t !== tag)
        : [...filterTags, tag];

    const params = new URLSearchParams(searchParams);
    next.length ? params.set("tags", next.join(",")) : params.delete("tags");
    setSearchParams(params, { replace: true });
  }

  /* ---------- FILTERED DOCS ---------- */
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
        tenantId,
        tags: uploadTags,
      });
      setUploadTags([]);
      e.target.value = "";
      loadAll();
    } catch (err) {
      alert(err.message);
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
    await updateDocumentTags({
      documentId: doc.id,
      tags: editingTags,
    });
    setEditingDocId(null);
    setEditingTags([]);
    loadAll();
  }

  /* ======================
     RENDER
     ====================== */

  return (
    <Card className="p-6 space-y-6">
      {/* ---------- HEADER ---------- */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg">Dokumenty najemcy</h3>

        <label className="px-3 py-2 bg-blue-600 text-white rounded-lg cursor-pointer text-sm">
          Dodaj dokument
          <input type="file" className="hidden" onChange={handleUpload} />
        </label>
      </div>

      {/* ---------- UPLOAD TAGS ---------- */}
      <div className="flex gap-2 flex-wrap">
        {DOCUMENT_TAGS.map((tag) => (
          <button
            key={tag.value}
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

      {/* ---------- FILTER TAGS ---------- */}
      {documents.some((d) => d.tags?.length) && (
        <div className="flex gap-2 flex-wrap">
          {[...new Set(documents.flatMap((d) => d.tags || []))].map((tag) => (
            <button
              key={tag}
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

      {/* ---------- DOCUMENT LIST ---------- */}
      {!loading && filteredDocuments.length > 0 && (
        <div className="divide-y border rounded-lg">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="px-4 py-3 flex justify-between items-start"
            >
              <div>
                <p className="font-medium">{doc.name}</p>
                <p className="text-xs text-slate-500">
                  {(doc.size_bytes / 1024).toFixed(1)} KB
                </p>

                {doc.tags?.length > 0 && (
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
              </div>

              <div className="flex gap-3 text-sm">
                {canPreview(doc.mime_type) && (
                  <button
                    onClick={() =>
                      getDocumentPreviewUrl(doc.storage_path).then((url) =>
                        window.open(url, "_blank")
                      )
                    }
                    className="text-blue-600 hover:underline"
                  >
                    Podgląd
                  </button>
                )}

                <button
                  onClick={() =>
                    downloadDocument({
                      storagePath: doc.storage_path,
                      filename: doc.name,
                    })
                  }
                  className="text-slate-600 hover:underline"
                >
                  Pobierz
                </button>

                {currentUserId === doc.owner_id && (
                  <button
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
    </Card>
  );
}
