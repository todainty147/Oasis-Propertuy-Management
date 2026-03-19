// src/services/documentService.js
import { supabase } from "../lib/supabase";
import { assertFiles, assertUuid } from "../utils/validation";
import { createSignedStorageUrl } from "./storageUrlService";

/* ======================
   CONFIG
   ====================== */

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/* ======================
   HELPERS
   ====================== */

function sanitizeFilename(name) {
  return String(name || "file")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-()]/g, "_");
}

function friendlyError(err, fallback) {
  return new Error(err?.message ?? fallback);
}

/* ======================
   UPLOAD DOCUMENT (AUTHORITATIVE)
   ====================== */

/**
 * Authoritative upload flow (DB-first):
 * 1) create_document_stub() RPC  -> returns a documents row (includes id + storage_path)
 * 2) upload file to storage at doc.storage_path
 * 3) finalize_document_upload() RPC (sets size/mime/name/tags + upload_status='uploaded')
 *
 * Public API intentionally unchanged.
 */
export async function uploadDocument({
  file,
  accountId, // ✅ REQUIRED
  propertyId = null,
  tenantId = null,
  tags = [],
  // Optional: scope/visibility if you want to control these now
  scope = propertyId && tenantId
    ? "shared"
    : propertyId
      ? "property"
      : tenantId
        ? "tenant"
        : "account",
  visibility = "staff",
}) {
  if (!accountId) throw new Error("Brak accountId przy uploadzie dokumentu");
  if (!file) throw new Error("Brak pliku");
  assertFiles([file], { maxFiles: 1, maxBytes: MAX_FILE_SIZE, allowedMimeTypes: ALLOWED_MIME_TYPES });

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Niedozwolony typ pliku");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Plik jest za duży (max 10MB)");
  }

  const safeFilename = sanitizeFilename(file.name);

  /* ======================
     1) CREATE DOCUMENT STUB (RPC)
     ====================== */
  const { data: doc, error: stubError } = await supabase.rpc(
    "create_document_stub",
    {
      p_account_id: accountId,
      p_scope: scope,
      p_visibility: visibility,
      p_property_id: propertyId,
      p_tenant_id: tenantId,
      p_filename: safeFilename,
      p_mime_type: file.type,
      p_size_bytes: file.size,
      p_tags: tags,
      // p_actor_user_id omitted -> defaults to auth.uid() in RPC
    }
  );

  if (stubError || !doc?.id || !doc?.storage_path) {
    throw friendlyError(stubError, "Nie udało się utworzyć dokumentu (stub)");
  }

  /* ======================
     2) UPLOAD FILE TO STORAGE
     ====================== */
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(doc.storage_path, file, {
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    // Stub will remain; optional mark-failed RPC can be added later.
    throw friendlyError(uploadError, "Błąd uploadu do Storage");
  }

  /* ======================
     3) FINALIZE (RPC)
     ====================== */
  const { data: finalized, error: finalizeError } = await supabase.rpc(
    "finalize_document_upload",
    {
      p_document_id: doc.id,
      p_size_bytes: file.size,
      p_mime_type: file.type,
      p_original_filename: file.name,
      p_tags: tags,
      // p_actor_user_id omitted -> defaults to auth.uid()
    }
  );

  if (finalizeError || !finalized?.id) {
    throw friendlyError(finalizeError, "Nie udało się sfinalizować uploadu");
  }

  return finalized;
}

/* ======================
   FETCH DOCUMENTS
   ====================== */

export async function fetchDocuments({
  accountId,
  propertyId = null,
  tenantId = null,
  tag = null,
  onlyUploaded = true, // ✅ keeps UI clean by default
} = {}) {
  if (!accountId) return [];
  const safeTenantId = tenantId ? assertUuid(tenantId, "Invalid tenant id") : null;
  const safePropertyId = propertyId ? assertUuid(propertyId, "Invalid property id") : null;

  let query = supabase
    .from("documents")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (onlyUploaded) query = query.eq("upload_status", "uploaded");

  if (safePropertyId) query = query.eq("property_id", safePropertyId);

  // Tenant switcher logic (intentional)
  if (safeTenantId) query = query.or(`tenant_id.eq.${safeTenantId},tenant_id.is.null`);

  if (tag) query = query.contains("tags", [tag]);

  const { data, error } = await query;
  if (error) throw error;

  return data ?? [];
}

/* ======================
   SEARCH DOCUMENTS
   ====================== */

export async function searchDocuments({
  accountId,
  query = "",
  tags = [],
  tenantId = null,
  propertyId = null,
  onlyUploaded = true,
} = {}) {
  if (!accountId) return [];
  const safeTenantId = tenantId ? assertUuid(tenantId, "Invalid tenant id") : null;
  const safePropertyId = propertyId ? assertUuid(propertyId, "Invalid property id") : null;

  let q = supabase
    .from("documents")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (onlyUploaded) q = q.eq("upload_status", "uploaded");

  if (query) q = q.ilike("name", `%${query}%`);

  if (tags.length > 0) q = q.contains("tags", tags);

  if (safePropertyId) q = q.eq("property_id", safePropertyId);

  if (safeTenantId) q = q.or(`tenant_id.eq.${safeTenantId},tenant_id.is.null`);

  const { data, error } = await q;
  if (error) throw error;

  return data ?? [];
}

/* ======================
   PREVIEW
   ====================== */

export async function getDocumentPreviewUrl(storagePath) {
  return createSignedStorageUrl("documents", storagePath, 60 * 10);
}

/* ======================
   DOWNLOAD
   ====================== */

export async function downloadDocument({ storagePath, filename }) {
  if (!storagePath) throw new Error("Brak ścieżki dokumentu");

  const { data, error } = await supabase.storage
    .from("documents")
    .download(storagePath);

  if (error) throw error;

  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? "document";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ======================
   UPDATE TAGS (RPC)
   ====================== */

/**
 * Staff-safe tag update (DB-first).
 * Requires RPC: public.set_document_tags(p_document_id, p_tags, p_actor_user_id default auth.uid()).
 */
export async function updateDocumentTags({ documentId, tags }) {
  if (!documentId) throw new Error("Brak ID dokumentu");

  const { data, error } = await supabase.rpc("set_document_tags", {
    p_document_id: documentId,
    p_tags: tags ?? [],
  });

  if (error) throw error;
  return data;
}

/* ======================
   DELETE DOCUMENT (DB-first, audited)
   ====================== */

/**
 * Recommendation applied:
 * - Delete DB record + audit FIRST (keeps DB consistent)
 * - Then best-effort storage delete (avoid leaving broken DB rows if storage fails)
 */
export async function deleteDocument({ id, storagePath }) {
  if (!id || !storagePath) {
    throw new Error("Nieprawidłowy dokument");
  }

  // 1) DB delete via RPC (audited)
  const { error: rpcError } = await supabase.rpc("delete_document_and_audit", {
    p_document_id: id,
  });

  if (rpcError) throw rpcError;

  // 2) Best-effort storage delete
  const { error: storageError } = await supabase.storage
    .from("documents")
    .remove([storagePath]);

  if (storageError) {
    // DB is already consistent; log for later cleanup rather than breaking UX
    console.warn("Storage delete failed:", storageError);
  }
}
