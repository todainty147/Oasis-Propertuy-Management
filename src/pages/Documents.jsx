import { useEffect, useRef, useState } from "react";
import Skeleton from "../components/ui/Skeleton";
import { usePageTitle } from "../layout/PageTitleContext";
import {
  uploadDocument,
  downloadDocument,
  getDocumentPreviewUrl,
  deleteDocument,
} from "../services/documentService";

/* ======================
   SKELETON
   ====================== */

function DocumentsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  );
}

/* ======================
   DOCUMENTS
   ====================== */

export default function Documents({
  loading = false,
  documents = [],
  onRefetch,
}) {
  const { setTitle } = usePageTitle();
  const fileInputRef = useRef(null);

  /* ---------- PREVIEW STATE ---------- */
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  /* ---------- PAGE TITLE ---------- */
  useEffect(() => {
    setTitle("Dokumenty");
  }, [setTitle]);

  /* ---------- UPLOAD ---------- */
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadDocument({ file });
      e.target.value = "";
      onRefetch?.();
    } catch (err) {
      alert(err.message); // UI-visible error (as requested)
    }
  }

  /* ---------- PREVIEW ---------- */
  async function handlePreview(doc) {
    try {
      setPreviewError(null);
      const url = await getDocumentPreviewUrl(doc.path);
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

  /* ---------- EMPTY STATE ---------- */
  if (documents.length === 0) {
    return (
      <div className="text-center py-20">
        <h3 className="text-xl font-semibold text-slate-900">
          Brak dokumentów
        </h3>
        <p className="text-slate-500 mt-2">
          Dodaj pierwszy dokument
        </p>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
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
    );
  }

  /* ---------- CONTENT ---------- */
  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex justify-end">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg"
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

      {/* Documents list */}
      <div className="divide-y bg-white border rounded-xl">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="px-6 py-4 flex justify-between items-center"
          >
            <div>
              <p className="font-medium">{doc.name}</p>
              <p className="text-sm text-slate-500">
                {doc.mime_type} • {(doc.size / 1024).toFixed(1)} KB
              </p>
            </div>

            <div className="flex gap-4 text-sm">
              <button
                onClick={() => handlePreview(doc)}
                className="text-blue-600 hover:underline"
              >
                Podgląd
              </button>

              <button
                onClick={() =>
                  downloadDocument(doc.path, doc.name)
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
            {/* Header */}
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

            {/* Content */}
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

                  {!previewDoc.mime_type.startsWith("image/") &&
                    previewDoc.mime_type !== "application/pdf" && (
                      <p className="text-sm text-gray-500">
                        Podgląd niedostępny dla tego typu pliku.
                      </p>
                    )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t flex justify-end">
              <button
                onClick={() =>
                  downloadDocument(previewDoc.path, previewDoc.name)
                }
                className="text-sm text-blue-600 hover:underline"
              >
                Pobierz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
