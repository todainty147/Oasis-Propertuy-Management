// src/components/PropertyDocumentsSection.jsx
import { useEffect, useRef, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import {
  fetchDocuments,
  uploadDocument,
  deleteDocument,
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
  if (!mime) return false;
  if (mime.startsWith("image/")) return true;
  if (mime === "application/pdf") return true;
  return false;
}

function shortId(id) {
  return id ? id.slice(0, 8) : "—";
}

/* ======================
   COMPONENT
   ====================== */

export default function PropertyDocumentsSection({ propertyId }) {
  const fileInputRef = useRef(null);

  const [documents, setDocuments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);

  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  const [currentUserId, setCurrentUserId] = useState(null);

  /* ---------- TAGS ---------- */
  const [selectedTags, setSelectedTags] = useState([]);

  function toggleTag(tag) {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]
    );
  }

  /* ---------- SESSION ---------- */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data?.user?.id ?? null);
    });
  }, []);

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
  }, [propertyId]);

  /* ---------- UPLOAD ---------- */
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadDocument({
        file,
        propertyId,
        tags: selectedTags,
      });

      e.target.value = "";
      setSelectedTags([]);
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  /* ---------- ACTIONS ---------- */
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

  async function handleDownload(doc) {
    await downloadDocument({
      storagePath: doc.storage_path,
      filename: doc.name,
    });
  }

  async function handleDelete(doc) {
    if (!confirm("Usunąć dokument?")) return;
    await deleteDocument(doc);
    await loadAll();
  }

  /* ======================
     RENDER
     ====================== */

  return (
    <Card className="p-6 space-y-6">
      {/* ---------- HEADER ---------- */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">
          Dokumenty nieruchomości
        </h3>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg"
        >
          Dodaj dokument
        </button>

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleUpload}
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          className="hidden"
        />
      </div>

      {/* ---------- TAG SELECTOR ---------- */}
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
            {tag.label}
          </label>
        ))}
      </div>

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

      {/* ---------- DOCUMENT LIST ---------- */}
      {!loading && documents.length > 0 && (
        <div className="divide-y border rounded-lg bg-white">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="px-4 py-3 flex justify-between items-center"
            >
              <div>
                <p className="font-medium flex items-center gap-2">
                  {doc.name}

                  {doc.tenant_id && doc.property_id && (
                    <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                      Wspólny
                    </span>
                  )}
                </p>

                <p className="text-xs text-slate-500">
                  {doc.mime_type} •{" "}
                  {(doc.size_bytes / 1024).toFixed(1)} KB
                </p>

                {/* ---------- TAGS ---------- */}
                {doc.tags?.length > 0 && (
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {doc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700"
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
                    onClick={() => handlePreview(doc)}
                    className="text-blue-600 hover:underline"
                  >
                    Podgląd
                  </button>
                )}

                <button
                  onClick={() => handleDownload(doc)}
                  className="text-slate-600 hover:underline"
                >
                  Pobierz
                </button>

                {currentUserId === doc.owner_id ? (
                  <button
                    onClick={() => handleDelete(doc)}
                    className="text-red-600 hover:underline"
                  >
                    Usuń
                  </button>
                ) : (
                  <span
                    className="text-gray-400 cursor-not-allowed"
                    title="Tylko właściciel może usunąć dokument"
                  >
                    Usuń
                  </span>
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
              <div
                key={a.id}
                className="px-4 py-2 flex justify-between"
              >
                <div>
                  <p className="font-medium">
                    {a.action === "UPLOAD"
                      ? "Dodano dokument"
                      : "Usunięto dokument"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {a.name}
                  </p>
                </div>

                <div className="text-right text-xs text-slate-500">
                  <p>
                    {a.actor_id === currentUserId
                      ? "Ty"
                      : `Użytkownik ${shortId(a.actor_id)}`}
                  </p>
                  <p>
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- PREVIEW MODAL ---------- */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-4 py-3 border-b">
              <p className="font-medium truncate">
                {previewDoc.name}
              </p>
              <button
                onClick={() => {
                  setPreviewDoc(null);
                  setPreviewUrl(null);
                }}
                className="text-sm text-gray-600 hover:text-black"
              >
                Zamknij ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {previewError && (
                <p className="text-red-600 text-sm">
                  {previewError}
                </p>
              )}

              {!previewError && previewUrl && (
                <>
                  {previewDoc.mime_type.startsWith("image/") && (
                    <img
                      src={previewUrl}
                      alt={previewDoc.name}
                      className="max-w-full mx-auto"
                    />
                  )}

                  {previewDoc.mime_type ===
                    "application/pdf" && (
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
