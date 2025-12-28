import { useEffect, useState } from "react";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import {
  searchDocuments,
  downloadDocument,
  getDocumentPreviewUrl,
  deleteDocument,
} from "../services/documentService";
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
   DOCUMENTS (GLOBAL / READ-ONLY)
   ====================== */

export default function Documents() {
  const { setTitle } = usePageTitle();

  /* ---------- STATE ---------- */
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);

  /* ---------- PREVIEW ---------- */
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  /* ---------- PAGE TITLE ---------- */
  useEffect(() => {
    setTitle("Dokumenty");
  }, [setTitle]);

  /* ---------- LOAD / SEARCH ---------- */
  async function loadDocuments() {
    setLoading(true);
    try {
      const data = await searchDocuments({
        query,
        tags: selectedTags,
      });
      setDocuments(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, [query, selectedTags]);

  /* ---------- TAG TOGGLE ---------- */
  function toggleTag(tag) {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]
    );
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

  /* ======================
     RENDER
     ====================== */

  return (
    <div className="space-y-6">
      {/* ======================
         SEARCH + FILTERS
         ====================== */}
      <div className="bg-white border rounded-xl p-4 space-y-4">
        {/* Search */}
        <input
          type="text"
          placeholder="Szukaj dokumentów…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />

        {/* Tags */}
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
      </div>

      {/* ======================
         RESULTS
         ====================== */}
      {loading && <DocumentsSkeleton />}

      {!loading && documents.length === 0 && (
        <div className="text-center py-20">
          <h3 className="text-xl font-semibold text-slate-900">
            Brak dokumentów
          </h3>
          <p className="text-slate-500 mt-2">
            Spróbuj zmienić kryteria wyszukiwania
          </p>
        </div>
      )}

      {!loading && documents.length > 0 && (
        <div className="divide-y bg-white border rounded-xl">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="px-6 py-4 flex justify-between items-center"
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

                <p className="text-sm text-slate-500">
                  {doc.mime_type} •{" "}
                  {(doc.size_bytes / 1024).toFixed(1)} KB
                </p>

                {doc.tags?.length > 0 && (
                  <div className="flex gap-2 mt-1">
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

              <div className="flex gap-4 text-sm">
                {canPreview(doc.mime_type) && (
                  <button
                    onClick={() => handlePreview(doc)}
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

                <button
                  onClick={async () => {
                    if (confirm("Usunąć dokument?")) {
                      await deleteDocument(doc);
                      loadDocuments();
                    }
                  }}
                  className="text-red-600 hover:underline"
                >
                  Usuń
                </button>
              </div>
            </div>
          ))}
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
                <p className="text-red-600 text-sm">{previewError}</p>
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
