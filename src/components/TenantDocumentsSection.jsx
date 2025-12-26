// src/components/TenantDocumentsSection.jsx
import { useEffect, useState } from "react";
import {
  fetchDocuments,
  uploadDocument,
  deleteDocument,
  getDocumentPreviewUrl,
  downloadDocument,
} from "../services/documentService";
import Card from "./Card";

export default function TenantDocumentsSection({ tenantId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadDocuments() {
    setLoading(true);
    try {
      const data = await fetchDocuments({ tenantId });
      setDocuments(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tenantId) loadDocuments();
  }, [tenantId]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadDocument({
      file,
      tenantId,
    });

    e.target.value = "";
    await loadDocuments();
  }

  async function handlePreview(doc) {
    const url = await getDocumentPreviewUrl(doc.storage_path);
    window.open(url, "_blank", "noopener");
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
    await loadDocuments();
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg">Dokumenty najemcy</h3>

        <label className="px-3 py-2 bg-blue-600 text-white rounded-lg cursor-pointer text-sm">
          Dodaj dokument
          <input
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={handleUpload}
          />
        </label>
      </div>

      {loading && (
        <p className="text-sm text-slate-500">Ładowanie dokumentów…</p>
      )}

      {!loading && documents.length === 0 && (
        <p className="text-sm text-slate-500">
          Brak dokumentów dla tego najemcy
        </p>
      )}

      <div className="divide-y">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="py-3 flex justify-between items-center"
          >
            <div>
              <p className="font-medium">{doc.name}</p>
              <p className="text-xs text-slate-500">
                {doc.mime_type} • {(doc.size_bytes / 1024).toFixed(1)} KB
              </p>
            </div>

            <div className="flex gap-3 text-sm">
              <button
                onClick={() => handlePreview(doc)}
                className="text-blue-600 hover:underline"
              >
                Podgląd
              </button>

              <button
                onClick={() => handleDownload(doc)}
                className="text-slate-600 hover:underline"
              >
                Pobierz
              </button>

              <button
                onClick={() => handleDelete(doc)}
                className="text-red-600 hover:underline"
              >
                Usuń
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
