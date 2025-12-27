// src/components/TenantDocumentsSection.jsx
import { useEffect, useState } from "react";
import Card from "./Card";
import {
  fetchDocuments,
  uploadDocument,
  deleteDocument,
  getDocumentPreviewUrl,
  downloadDocument,
} from "../services/documentService";
import { fetchDocumentAudit } from "../services/documentAuditService";
import { supabase } from "../lib/supabase";

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

export default function TenantDocumentsSection({ tenantId }) {
  const [documents, setDocuments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);

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

  /* ---------- UPLOAD ---------- */
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadDocument({ file, tenantId });
      e.target.value = "";
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  /* ---------- ACTIONS ---------- */
  async function handlePreview(doc) {
    if (!canPreview(doc.mime_type)) return;
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
    await loadAll();
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
          <input
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={handleUpload}
          />
        </label>
      </div>

      {/* ---------- LOADING ---------- */}
      {loading && (
        <p className="text-sm text-slate-500">
          Ładowanie dokumentów…
        </p>
      )}

      {/* ---------- EMPTY ---------- */}
      {!loading && documents.length === 0 && (
        <p className="text-sm text-slate-500">
          Brak dokumentów dla tego najemcy
        </p>
      )}

      {/* ---------- DOCUMENT LIST ---------- */}
      {!loading && documents.length > 0 && (
        <div className="divide-y border rounded-lg">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="py-3 px-4 flex justify-between items-center"
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

      {/* ---------- AUDIT LOG ---------- */}
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
    </Card>
  );
}
