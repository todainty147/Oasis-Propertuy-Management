// src/pages/Documents.jsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Skeleton from "../components/ui/Skeleton";
import Card from "../components/Card";
import { usePageTitle } from "../layout/PageTitleContext";
import { useAuth } from "../context/AuthContext";
import { useAccount } from "../context/AccountContext";
import { useTenant } from "../context/TenantContext";

import {
  fetchDocuments,
  searchDocuments,
  uploadDocument,
  downloadDocument,
  getDocumentPreviewUrl,
  deleteDocument,
} from "../services/documentService";

import { DOCUMENT_TAGS } from "../constants/documentTags";
import { canUploadDocument, canDeleteDocument } from "../utils/permissions";

// Optional fallback if you forget to pass props from App.jsx
import { useProperties } from "../hooks/useProperties";
import { useTenants } from "../hooks/useTenants";

/* ======================
   HELPERS
   ====================== */

function canPreview(mime) {
  return mime?.startsWith("image/") || mime === "application/pdf";
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
   DOCUMENTS (GLOBAL)
   ====================== */

export default function Documents({
  tenants: tenantsProp = null,
  properties: propertiesProp = null,
} = {}) {
  const { setTitle } = usePageTitle();
  const { user, loading: authLoading } = useAuth();
  const { accounts, activeAccountId, accountLoading, activeRole } = useAccount();
  const { activeTenantId } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();

  // If your AccountContext doesn't expose activeRole yet, fallback to membership lookup
  const activeAccount = useMemo(() => {
    return accounts?.find((a) => a.id === activeAccountId) ?? null;
  }, [accounts, activeAccountId]);

  const role = activeRole ?? activeAccount?.role ?? null;

  /* ---------- FALLBACK HOOKS ---------- */
  const useFallback = !tenantsProp || !propertiesProp;

  const { properties: propertiesHook, loading: propertiesLoadingHook } =
    useProperties({
      enabled: !!activeAccountId && useFallback,
    });

  const { tenants: tenantsHook, loading: tenantsLoadingHook } = useTenants({
    enabled: !!activeAccountId && useFallback,
  });

  const properties = propertiesProp ?? propertiesHook ?? [];
  const tenants = tenantsProp ?? tenantsHook ?? [];

  /* ---------- URL STATE ---------- */
  const queryParam = searchParams.get("q") ?? "";
  const tagsParam = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];

  const [query, setQuery] = useState(queryParam);
  const [selectedTags, setSelectedTags] = useState(tagsParam);

  /* ---------- DATA ---------- */
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ---------- UPLOAD STATE (SCOPED) ---------- */
  const [uploadPropertyId, setUploadPropertyId] = useState("");
  const [uploadTenantId, setUploadTenantId] = useState("");
  const [uploadTags, setUploadTags] = useState([]);
  const [uploading, setUploading] = useState(false);

  /* ---------- PREVIEW ---------- */
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  /* ---------- PAGE TITLE ---------- */
  useEffect(() => {
    setTitle("Dokumenty");
  }, [setTitle]);

  /* ---------- SYNC URL → STATE ---------- */
  useEffect(() => {
    setQuery(queryParam);
    setSelectedTags(tagsParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* ======================
     LOAD DOCUMENTS
     ====================== */

  async function loadDocuments() {
    if (!activeAccountId) return;

    setLoading(true);
    try {
      const data =
        query || selectedTags.length > 0
          ? await searchDocuments({
              accountId: activeAccountId,
              query,
              tags: selectedTags,
              tenantId: activeTenantId ?? null, // ✅ tenant switch filter
            })
          : await fetchDocuments({
              accountId: activeAccountId,
              tenantId: activeTenantId ?? null, // ✅ tenant switch filter
            });

      setDocuments(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && !accountLoading && activeAccountId) {
      loadDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedTags, authLoading, accountLoading, activeAccountId, activeTenantId]);

  /* ---------- UPDATE URL ---------- */
  function updateUrl(nextQuery, nextTags) {
    const params = new URLSearchParams();
    if (nextQuery) params.set("q", nextQuery);
    if (nextTags.length > 0) params.set("tags", nextTags.join(","));
    setSearchParams(params, { replace: true });
  }

  /* ---------- SEARCH ---------- */
  function handleSearch(value) {
    setQuery(value);
    updateUrl(value, selectedTags);
  }

  /* ---------- TAG TOGGLE (FILTER) ---------- */
  function toggleTag(tag) {
    const nextTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];

    setSelectedTags(nextTags);
    updateUrl(query, nextTags);
  }

  /* ---------- UPLOAD TAG TOGGLE ---------- */
  function toggleUploadTag(tag) {
    setUploadTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  /* ---------- UPLOAD (SCOPED to tenant OR property) ---------- */
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!activeAccountId) {
      alert("Brak aktywnego konta");
      e.target.value = "";
      return;
    }

    // Must choose either tenant OR property
    if (!uploadPropertyId && !uploadTenantId) {
      alert("Wybierz nieruchomość lub najemcę");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      await uploadDocument({
        accountId: activeAccountId,
        file,
        propertyId: uploadPropertyId || null,
        tenantId: uploadTenantId || null,
        tags: uploadTags,
      });

      // reset UI
      setUploadTags([]);
      setUploadPropertyId("");
      setUploadTenantId("");
      e.target.value = "";

      await loadDocuments();
    } catch (err) {
      alert(err?.message ?? "Błąd uploadu");
      e.target.value = "";
    } finally {
      setUploading(false);
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

  const tenantsLoading = useFallback ? tenantsLoadingHook : false;
  const propertiesLoading = useFallback ? propertiesLoadingHook : false;

  /* ======================
     RENDER
     ====================== */

  if (authLoading || accountLoading || tenantsLoading || propertiesLoading) {
    return <DocumentsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* ======================
         UPLOAD (GLOBAL, SCOPED)
         ====================== */}
      {canUploadDocument(role) && (
        <Card className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Dodaj dokument</p>
              <p className="text-xs text-slate-500">
                Wybierz <b>najemcę</b> lub <b>nieruchomość</b>, aby przypisać
                dokument.
              </p>
            </div>

            <label
              className={`px-3 py-2 rounded-lg cursor-pointer text-sm text-white ${
                uploading ? "bg-slate-400" : "bg-blue-600"
              }`}
            >
              {uploading ? "Wysyłanie…" : "Dodaj dokument"}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>

          {/* Scope selects */}
          <div className="flex gap-4 flex-wrap">
            <select
              value={uploadPropertyId}
              onChange={(e) => {
                const v = e.target.value;
                setUploadPropertyId(v);
                if (v) setUploadTenantId("");
              }}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="">— Wybierz nieruchomość —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address} ({p.city})
                </option>
              ))}
            </select>

            <span className="text-sm text-slate-400 self-center">lub</span>

            <select
              value={uploadTenantId}
              onChange={(e) => {
                const v = e.target.value;
                setUploadTenantId(v);
                if (v) setUploadPropertyId("");
              }}
              className="border rounded px-3 py-2 text-sm"
            >
              <option value="">— Wybierz najemcę —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Upload tags */}
          <div className="flex gap-2 flex-wrap">
            {DOCUMENT_TAGS.map((tag) => (
              <button
                key={tag.value}
                type="button"
                onClick={() => toggleUploadTag(tag.value)}
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
        </Card>
      )}

      {/* ======================
         SEARCH + FILTERS
         ====================== */}
      <div className="bg-white border rounded-xl p-4 space-y-4">
        <input
          type="text"
          placeholder="Szukaj dokumentów…"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />

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
                  {doc.mime_type ?? "—"} •{" "}
                  {(doc.size_bytes / 1024).toFixed(1)} KB
                </p>

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

                {canDeleteDocument(role) && (
                  <button
                    onClick={async () => {
                      if (confirm("Usunąć dokument?")) {
                        await deleteDocument({
                          id: doc.id,
                          storagePath: doc.storage_path,
                        });
                        await loadDocuments();
                      }
                    }}
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
    </div>
  );
}
