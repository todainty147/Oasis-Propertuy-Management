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
   UUID (SAFE FALLBACK)
   ====================== */

function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ======================
   HELPERS
   ====================== */

function assertScope({ propertyId, tenantId }) {
  if (!propertyId && !tenantId) {
    throw new Error(
      "Dokument musi być przypisany do nieruchomości lub najemcy"
    );
  }
}

function sanitizeFilename(name) {
  return String(name || "file")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-()]/g, "_");
}

/* ======================
   UPLOAD + METADATA SAVE
   ====================== */

export async function uploadDocument({
  file,
  accountId, // ✅ REQUIRED for multi-tenancy
  propertyId = null,
  tenantId = null,
  tags = [],
}) {
  if (!file) throw new Error("Brak pliku");

  // ✅ Multi-tenant: must always know which account owns this doc
  if (!accountId) {
    throw new Error("Brak accountId (kontekst konta nie jest ustawiony)");
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Niedozwolony typ pliku");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Plik jest za duży (max 10MB)");
  }

  assertScope({ propertyId, tenantId });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Brak sesji użytkownika");

  const safeName = sanitizeFilename(file.name);

  // ✅ Multi-tenant storage path: scope by account first
  // Keeps storage policies simple: folder == account_id
  const storagePath = `${accountId}/${user.id}/${generateUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) throw uploadError;

  const { data, error: dbError } = await supabase
    .from("documents")
    .insert({
      account_id: accountId, // ✅ MULTI-TENANT (CRITICAL)
      owner_id: user.id, // keep legacy semantics (creator/owner); RLS controls visibility
      property_id: propertyId,
      tenant_id: tenantId,
      name: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      tags, // document_tag[]
      uploaded_by: user.id,
    })
    .select("*")
    .single();

  if (dbError) throw dbError;

  return data;
}

/* ======================
   LIST DOCUMENTS
   ====================== */

export async function fetchDocuments({
  propertyId = null,
  tenantId = null,
  tag = null,
} = {}) {
  let query = supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  // ✅ rely on RLS for account scoping
  if (propertyId) query = query.eq("property_id", propertyId);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  if (tag) query = query.contains("tags", [tag]);

  const { data, error } = await query;
  if (error) throw error;

  return data ?? [];
}

/* ======================
   GLOBAL SEARCH
   ====================== */

export async function searchDocuments({
  query = "",
  tags = [],
  tenantId = null,
  propertyId = null,
} = {}) {
  let q = supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  // ✅ rely on RLS for account scoping
  if (query) q = q.ilike("name", `%${query}%`);
  if (tags.length > 0) q = q.contains("tags", tags);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  if (propertyId) q = q.eq("property_id", propertyId);

  const { data, error } = await q;
  if (error) throw error;

  return data ?? [];
}

/* ======================
   SHARED DOCUMENTS
   ====================== */

export async function fetchSharedDocuments({ tenantId, propertyId }) {
  if (!tenantId || !propertyId) return [];

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/* ======================
   PREVIEW (SIGNED URL)
   ====================== */

export async function getDocumentPreviewUrl(storagePath) {
  if (!storagePath) throw new Error("Brak ścieżki dokumentu");

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
   UPDATE TAGS
   ====================== */

export async function updateDocumentTags({ documentId, tags }) {
  if (!documentId) {
    throw new Error("Brak ID dokumentu");
  }

  // ✅ Session check (optional but fine to keep)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Brak sesji");

  // ✅ Multi-tenant: do NOT hardcode owner_id checks in client code.
  // Let RLS decide whether this user can update.
  const { data, error } = await supabase
    .from("documents")
    .update({ tags })
    .eq("id", documentId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/* ======================
   DELETE DOCUMENT
   ====================== */

export async function deleteDocument(document) {
  if (!document?.id || !document?.storage_path) {
    throw new Error("Nieprawidłowy dokument");
  }

  // ✅ Session check (optional but fine to keep)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Brak sesji");

  // ✅ Multi-tenant: don't pre-block by owner_id here.
  // UI permissions + RLS/storage policies are the source of truth.
  const { error: storageError } = await supabase.storage
    .from("documents")
    .remove([document.storage_path]);

  if (storageError) throw storageError;

  const { error: dbError } = await supabase
    .from("documents")
    .delete()
    .eq("id", document.id);

  if (dbError) throw dbError;
}
