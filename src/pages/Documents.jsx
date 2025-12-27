import { useEffect, useState } from "react";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import {
  downloadDocument,
  getDocumentPreviewUrl,
  deleteDocument,
} from "../services/documentService";

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
    <div className="space-y-6">
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}

/* ======================
   DOCUMENTS (READ-ONLY)
   ====================== */

export default function Documents({
  loading = false,
  documents = [],
  onRefetch,
}) {
  const { setTitle } = usePageTitle();

  /* ---------- PREVIEW STATE ---------- */
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  /* ---------- PAGE TITLE ---------- */
  useEffect(() => {
    setTitle("Dokumenty");
  }, [setTitle]);

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

  /* ---------- LOADING ---------- */
  if (loading) {
    return <DocumentsSkeleton />;
  }

  /* ---------- EMPTY ---------- */
  if (documents.length === 0) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-semibold text-slate-900">
          Brak dokumentów
        </h3>
        <p className="text-slate-500 mt-2">
          Dokumenty pojawią się po dodaniu ich do najemców lub nieruchomości
        </p>
      </div>
    );
  }

  /* ---------- CONTENT ---------- */
  return (
    <div className="space-y-6">
      <div className="divide-y bg-white border rounded-xl">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="px-6 py-4 flex justify-between items-center"
          >
            <div>
              <p className="font-medium">{doc.name}</p>
              <p className="text-sm text-slate-500">
                {doc.mime_type} • {(doc.size_bytes / 1024).toFixed(1)} KB
              </p>
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
                    onRefetch?.();
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

      {/* ---------- PREVIEW MODAL ---------- */}
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
