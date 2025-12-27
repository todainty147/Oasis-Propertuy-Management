import { useEffect, useRef, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import {
  uploadDocument,
  fetchDocuments,
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
   PROPERTY DOCUMENTS
   ====================== */

export default function PropertyDocumentsSection({ propertyId }) {
  const fileInputRef = useRef(null);

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);

  /* ---------- PREVIEW STATE ---------- */
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  /* ---------- LOAD DOCUMENTS ---------- */
  async function loadDocuments() {
    if (!propertyId) return;

    setLoading(true);
    try {
      const data = await fetchDocuments({ propertyId });
      setDocuments(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, [propertyId]);

  /* ---------- ESC TO CLOSE PREVIEW ---------- */
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setPreviewDoc(null);
        setPreviewUrl(null);
        setPreviewError(null);
      }
    }

    if (previewDoc) {
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewDoc]);

  /* ---------- UPLOAD ---------- */
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadDocument({
        file,
        propertyId,
      });

      e.target.value = "";
      loadDocuments();
    } catch (err) {
      alert(err.message); // UI-visible error
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

  /* ======================
     RENDER
     ====================== */

  return (
    <Card className="p-6 space-y-4">
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
          Brak dokumentów dla tej nieruchomości.
        </p>
      )}

      {/* ---------- LIST ---------- */}
      {!loading && documents.length > 0 && (
        <div className="divide-y border rounded-lg bg-white">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="px-4 py-3 flex justify-between items-center"
            >
              <div>
                <p className="font-medium">{doc.name}</p>
                <p className="text-xs text-slate-500">
                  {doc.mime_type} •{" "}
                  {(doc.size_bytes / 1024).toFixed(1)} KB
                </p>
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

      {/* ---------- PREVIEW MODAL ---------- */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3 border-b">
              <p className="font-medium truncate">
                {previewDoc.name}
              </p>
              <button
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

            {/* Content */}
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
