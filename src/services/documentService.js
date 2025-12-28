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

  // UUID v4 fallback (browser-safe)
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
  // Enforce "must attach to either tenant or property"
  if (!propertyId && !tenantId) {
    throw new Error("Dokument musi być przypisany do nieruchomości lub najemcy");
  }
}

function sanitizeFilename(name) {
  // keep it simple and safe for paths
  return String(name || "file")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-()]/g, "_");
}

/* ======================
   UPLOAD + METADATA SAVE
   ====================== */

export async function uploadDocument({
  file,
  propertyId = null,
  tenantId = null,
  tags = [],
}) {
  if (!file) throw new Error("Brak pliku");

  // ---- client validation ----
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

  // ---- storage path ----
  const safeName = sanitizeFilename(file.name);
  const storagePath = `${user.id}/${generateUUID()}-${safeName}`;

  // ---- upload to storage ----
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) throw uploadError;

  // ---- save metadata ----
  // NOTE: schema uses: storage_path, mime_type, size_bytes, uploaded_by, tags
  const { data, error: dbError } = await supabase
    .from("documents")
    .insert({
      owner_id: user.id,
      property_id: propertyId,
      tenant_id: tenantId,
      name: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      tags, // enum[] in DB
      uploaded_by: user.id, // audit
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
  tag = null, // optional single tag filter (e.g. "UMOWA")
} = {}) {
  let query = supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (propertyId) query = query.eq("property_id", propertyId);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  // tags is an array column: filter where tags contains [tag]
  if (tag) query = query.contains("tags", [tag]);

  const { data, error } = await query;
  if (error) throw error;

  return data ?? [];
}

/* ======================
   SHARED DOCS (tenant + property)
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
    .createSignedUrl(storagePath, 60 * 10); // 10 minutes

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
   DELETE DOCUMENT
   ====================== */

export async function deleteDocument(document) {
  if (!document?.id || !document?.storage_path) {
    throw new Error("Nieprawidłowy dokument");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Brak sesji");

  // Client-side guard only (RLS must enforce server-side)
  if (document.owner_id !== user.id) {
    throw new Error("Brak uprawnień do usunięcia dokumentu");
  }

  // storage delete
  const { error: storageError } = await supabase.storage
    .from("documents")
    .remove([document.storage_path]);

  if (storageError) throw storageError;

  // db delete
  const { error: dbError } = await supabase
    .from("documents")
    .delete()
    .eq("id", document.id);

  if (dbError) throw dbError;
}
