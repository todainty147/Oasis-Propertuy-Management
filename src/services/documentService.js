import { supabase } from "../lib/supabase";

/* ======================
   CONFIG
   ====================== */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = [
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
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }
  );
}

/* ======================
   UPLOAD + METADATA SAVE
   ====================== */

export async function uploadDocument({
  file,
  propertyId = null,
  tenantId = null,
}) {
  if (!file) throw new Error("Brak pliku");

  /* ---------- CLIENT VALIDATION ---------- */
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Niedozwolony typ pliku");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Plik jest za duży (max 10MB)");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Brak sesji użytkownika");

  /* ---------- STORAGE PATH ---------- */
  const safeName = file.name.replace(/\s+/g, "_");
  const storagePath = `${user.id}/${generateUUID()}-${safeName}`;

  /* ---------- STORAGE UPLOAD ---------- */
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) throw uploadError;

  /* ---------- METADATA INSERT ---------- */
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

      uploaded_by: user.id, // audit
    })
    .select()
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
} = {}) {
  let query = supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (propertyId) query = query.eq("property_id", propertyId);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
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
  if (!document?.storage_path || !document?.id) {
    throw new Error("Nieprawidłowy dokument");
  }

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
