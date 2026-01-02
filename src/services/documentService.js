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
   UPLOAD DOCUMENT
   ====================== */

export async function uploadDocument({
  file,
  accountId,       // ✅ REQUIRED
  propertyId = null,
  tenantId = null,
  tags = [],
}) {
  if (!accountId) {
    throw new Error("Brak accountId przy uploadzie dokumentu");
  }

  if (!file) throw new Error("Brak pliku");

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Niedozwolony typ pliku");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Plik jest za duży (max 10MB)");
  }

  assertScope({ propertyId, tenantId });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const safeName = sanitizeFilename(file.name);
  const storagePath = `${accountId}/${generateUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file);

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("documents")
    .insert({
      account_id: accountId,     // ✅ MULTI-TENANT ROOT
      uploaded_by: user.id,
      property_id: propertyId,
      tenant_id: tenantId,
      name: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      tags,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}


/* ======================
   LIST DOCUMENTS
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

  if (propertyId) query = query.eq("property_id", propertyId);
  if (tenantId) query = query.eq("tenant_id", tenantId);
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
} = {}) {
  if (!accountId) return [];

  let q = supabase
    .from("documents")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (query) q = q.ilike("name", `%${query}%`);
  if (tags.length > 0) q = q.contains("tags", tags);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  if (propertyId) q = q.eq("property_id", propertyId);

  const { data, error } = await q;
  if (error) throw error;

  return data ?? [];
}

/* ======================
   PREVIEW
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

  const { error: storageError } = await supabase.storage
    .from("documents")
    .remove([storagePath]);

  if (storageError) throw storageError;

  const { error: dbError } = await supabase
    .from("documents")
    .delete()
    .eq("id", id);

  if (dbError) throw dbError;
}
