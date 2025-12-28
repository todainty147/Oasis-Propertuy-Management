import { useEffect, useState } from "react";
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

  /* ---------- TAGS ---------- */
  const [selectedTags, setSelectedTags] = useState([]); // upload
  const [activeTags, setActiveTags] = useState([]);     // filter
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

  /* ---------- UPLOAD ---------- */
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadDocument({
        file,
        tenantId,
        tags: selectedTags,
      });

      e.target.value = "";
      setSelectedTags([]);
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  }

  /* ---------- TAG FILTER ---------- */
  function toggleFilterTag(tag) {
    setActiveTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : [...prev, tag]
    );
  }

  const filteredDocuments =
    activeTags.length === 0
      ? documents
      : documents.filter((doc) =>
          doc.tags?.some((t) => activeTags.includes(t))
        );

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
    await updateDocumentTags({
      documentId: doc.id,
      tags: editingTags,
    });

    setEditingDocId(null);
    setEditingTags([]);
    await loadAll();
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

      {/* ---------- UPLOAD TAG SELECTOR ---------- */}
      <div className="flex flex-wrap gap-3">
        {DOCUMENT_TAGS.map((tag) => (
          <label
            key={tag.value}
            className="flex items-center gap-1 text-sm cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selectedTags.includes(tag.value)}
              onChange={() =>
                setSelectedTags((prev) =>
                  prev.includes(tag.value)
                    ? prev.filter((t) => t !== tag.value)
                    : [...prev, tag.value]
                )
              }
            />
            {tag.label}
          </label>
        ))}
      </div>

      {/* ---------- FILTER TAGS ---------- */}
      {documents.some((d) => d.tags?.length) && (
        <div className="flex gap-2 flex-wrap">
          {[...new Set(documents.flatMap((d) => d.tags || []))].map(
            (tag) => (
              <button
                key={tag}
                onClick={() => toggleFilterTag(tag)}
                className={`text-xs px-2 py-1 rounded border ${
                  activeTags.includes(tag)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-300"
                }`}
              >
                {tag}
              </button>
            )
          )}
        </div>
      )}

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
      {!loading && filteredDocuments.length > 0 && (
        <div className="divide-y border rounded-lg">
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              className="py-3 px-4 flex justify-between items-start"
            >
              <div>
                <p className="font-medium">{doc.name}</p>
                <p className="text-xs text-slate-500">
                  {doc.mime_type} •{" "}
                  {(doc.size_bytes / 1024).toFixed(1)} KB
                </p>

                {/* ---------- TAG DISPLAY ---------- */}
                {editingDocId !== doc.id && doc.tags?.length > 0 && (
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

                {/* ---------- TAG EDIT ---------- */}
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
                        onClick={() => saveTags(doc)}
                        className="text-blue-600 hover:underline"
                      >
                        Zapisz
                      </button>
                      <button
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

              {/* ---------- ACTIONS ---------- */}
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

                {currentUserId === doc.owner_id && editingDocId !== doc.id && (
                  <>
                    <button
                      onClick={() => startEditTags(doc)}
                      className="text-slate-600 hover:underline text-xs"
                    >
                      Edytuj tagi
                    </button>

                    <button
                      onClick={() => handleDelete(doc)}
                      className="text-red-600 hover:underline"
                    >
                      Usuń
                    </button>
                  </>
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
                  <p className="text-xs text-slate-500">{a.name}</p>
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
