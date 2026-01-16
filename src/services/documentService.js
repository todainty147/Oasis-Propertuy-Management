// src/services/documentService.js
import { supabase } from "../lib/supabase";

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

/* ======================
   UPLOAD DOCUMENT (AUTHORITATIVE)
   ====================== */

/**
 * Uploads a document using the ONLY allowed flow:
 * 1) create_document_stub() RPC
 * 2) upload file to storage using returned storage_path
 * 3) update metadata (property, tenant, tags, mime, size)
 *
 * Public API intentionally unchanged.
 */
export async function uploadDocument({
  file,
  accountId,           // ✅ REQUIRED
  propertyId = null,
  tenantId = null,
  tags = [],
}) {
  if (!accountId) {
    throw new Error("Brak accountId przy uploadzie dokumentu");
  }

  if (!file) {
    throw new Error("Brak pliku");
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Niedozwolony typ pliku");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Plik jest za duży (max 10MB)");
  }

  const safeFilename = sanitizeFilename(file.name);

  /* ======================
     1️⃣ CREATE DOCUMENT STUB (RPC)
     ====================== */

  const { data: stubData, error: stubError } =
    await supabase.rpc("create_document_stub", {
      p_account_id: accountId,
      p_filename: safeFilename,
    });

  if (stubError || !stubData?.length) {
    throw new Error(
      stubError?.message ?? "Nie udało się utworzyć dokumentu"
    );
  }

  const { document_id, storage_path } = stubData[0];

  /* ======================
     2️⃣ UPLOAD FILE TO STORAGE
     ====================== */

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storage_path, file);

  if (uploadError) {
    // Important: if upload fails, the stub remains.
    // This is acceptable and auditable; cleanup can be added later.
    throw uploadError;
  }

  /* ======================
     3️⃣ UPDATE METADATA
     ====================== */

  const { data: updatedDoc, error: updateError } = await supabase
    .from("documents")
    .update({
      property_id: propertyId,
      tenant_id: tenantId,
      name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      tags,
    })
    .eq("id", document_id)
    .select()
    .single();

  if (updateError) {
    throw updateError;
  }

  return updatedDoc;
}

/* ======================
   FETCH DOCUMENTS
   ====================== */

export async function fetchDocuments({
  accountId,
  propertyId = null,
  tenantId = null,
  tag = null,
} = {}) {
  if (!accountId) return [];

  let query = supabase
    .from("documents")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (propertyId) {
    query = query.eq("property_id", propertyId);
  }

  // Tenant switcher logic (intentional)
  if (tenantId) {
    query = query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
  }

  if (tag) {
    query = query.contains("tags", [tag]);
  }

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
} = {}) {
  if (!accountId) return [];

  let q = supabase
    .from("documents")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (query) {
    q = q.ilike("name", `%${query}%`);
  }

  if (tags.length > 0) {
    q = q.contains("tags", tags);
  }

  if (propertyId) {
    q = q.eq("property_id", propertyId);
  }

  if (tenantId) {
    q = q.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
  }

  const { data, error } = await q;
  if (error) throw error;

  return data ?? [];
}

/* ======================
   PREVIEW
   ====================== */

export async function getDocumentPreviewUrl(storagePath) {
  if (!storagePath) {
    throw new Error("Brak ścieżki dokumentu");
  }

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 60 * 10);

  if (error) throw error;
  return data.signedUrl;
}

/* ======================
   DOWNLOAD
   ====================== */

export async function downloadDocument({ storagePath, filename }) {
  if (!storagePath) {
    throw new Error("Brak ścieżki dokumentu");
  }

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
   UPDATE TAGS
   ====================== */

export async function updateDocumentTags({ documentId, tags }) {
  if (!documentId) {
    throw new Error("Brak ID dokumentu");
  }

  const { data, error } = await supabase
    .from("documents")
    .update({ tags })
    .eq("id", documentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* ======================
   DELETE DOCUMENT
   ====================== */

export async function deleteDocument({ id, storagePath }) {
  if (!id || !storagePath) {
    throw new Error("Nieprawidłowy dokument");
  }

  // Storage first (RLS-enforced)
  const { error: storageError } = await supabase.storage
    .from("documents")
    .remove([storagePath]);

  if (storageError) throw storageError;

  // Then DB
  const { error: dbError } = await supabase
    .from("documents")
    .delete()
    .eq("id", id);

  if (dbError) throw dbError;
}
