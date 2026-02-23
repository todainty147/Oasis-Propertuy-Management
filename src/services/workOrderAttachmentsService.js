// src/services/workOrderAttachmentsService.js
import { supabase } from "../lib/supabase";

/**
 * Work Order Attachments (Photos/Docs) v1
 * - Upload to Storage first
 * - Insert authoritative metadata row into `work_order_attachments`
 * - List + signed URLs + delete
 *
 * NOTE:
 * - Storage RLS depends on the path format returned by buildPath().
 *   Deterministic format:
 *   account/<accountId>/work_orders/<workOrderId>/...
 */

/* ======================
   CONFIG
   ====================== */

/**
 * ✅ MUST match the bucket id in Supabase Storage exactly.
 */
export const BUCKET = "work-order-attachments";

/* ======================
   HELPERS
   ====================== */

function friendlyError(err, fallback) {
  return new Error(err?.message ?? fallback);
}

/**
 * ✅ Policy-friendly path:
 * account/<accountId>/work_orders/<workOrderId>/<ts>_<safeFileName>
 *
 * IMPORTANT:
 * - Avoid spaces in object keys to reduce "400 Bad Request" edge cases across clients/proxies.
 */
export function buildPath({ accountId, workOrderId, fileName }) {
  const base = String(fileName || "file")
    .replaceAll("\\", "/")
    .split("/")
    .pop();

  const safeName = base
    // replace spaces first
    .replace(/\s+/g, "_")
    // replace anything sketchy
    .replace(/[^\w.\-]+/g, "_")
    // avoid accidental "__"
    .replace(/_+/g, "_")
    // trim underscores
    .replace(/^_+|_+$/g, "");

  const ts = Date.now();
  return `account/${accountId}/work_orders/${workOrderId}/${ts}_${safeName || "file"}`;
}

async function getAuthedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Brak zalogowanego użytkownika");
  return data.user;
}

/* ======================
   LIST
   ====================== */

export async function listWorkOrderAttachments({ accountId, workOrderId, signal } = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!workOrderId) throw new Error("Brak workOrderId");

  let q = supabase
    .from("work_order_attachments")
    .select(
      "id, account_id, work_order_id, uploaded_by, file_name, mime_type, file_size, storage_bucket, storage_path, kind, created_at"
    )
    .eq("account_id", accountId)
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: false });

  if (signal) q = q.abortSignal(signal);

  const { data, error } = await q;
  if (error) throw friendlyError(error, "Nie udało się pobrać załączników");

  return data ?? [];
}

/* ======================
   SIGNED URL
   ====================== */

/**
 * Creates a signed URL for a stored file (private bucket supported).
 * @param {string} bucket
 * @param {string} path
 * @param {number} expiresIn seconds (default 60)
 */
export async function createAttachmentSignedUrl(bucket, path, expiresIn = 60) {
  if (!bucket) throw new Error("Brak bucket");
  if (!path) throw new Error("Brak path");

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw friendlyError(error, "Nie udało się utworzyć linku do pliku");

  return data?.signedUrl || null;
}

/* ======================
   UPLOAD
   ====================== */

/**
 * Upload multiple files and create DB metadata rows.
 * Returns array of inserted rows (attachments).
 */
export async function uploadWorkOrderAttachments({ accountId, workOrderId, files = [], signal } = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!workOrderId) throw new Error("Brak workOrderId");

  const list = Array.from(files || []).filter(Boolean);
  if (list.length === 0) return [];

  const user = await getAuthedUser();
  const results = [];

  for (const file of list) {
    const storagePath = buildPath({
      accountId,
      workOrderId,
      fileName: file.name,
    });

    // 1) upload to storage (RLS enforced in storage.objects)
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (upErr) {
      throw friendlyError(upErr, `Nie udało się wgrać pliku: ${file.name}`);
    }

    // 2) insert DB row (authoritative)
    const kind = (file.type || "").startsWith("image/") ? "photo" : "document";

    let ins = supabase
      .from("work_order_attachments")
      .insert({
        account_id: accountId,
        work_order_id: workOrderId,
        uploaded_by: user.id,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: typeof file.size === "number" ? file.size : null,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        kind,
      })
      .select(
        "id, account_id, work_order_id, uploaded_by, file_name, mime_type, file_size, storage_bucket, storage_path, kind, created_at"
      )
      .single();

    if (signal) ins = ins.abortSignal(signal);

    const { data: row, error: insErr } = await ins;

    if (insErr) {
      // Best-effort cleanup: remove the uploaded object if DB insert fails
      try {
        await supabase.storage.from(BUCKET).remove([storagePath]);
      } catch {
        // ignore cleanup errors
      }
      throw friendlyError(insErr, `Nie udało się zapisać załącznika: ${file.name}`);
    }

    results.push(row);
  }

  return results;
}

/* ======================
   DELETE
   ====================== */

/**
 * Deletes attachment row and the storage object.
 * Accepts either the attachment row (recommended) or (id + lookups).
 */
export async function deleteWorkOrderAttachment({ attachmentId, attachmentRow, signal } = {}) {
  let resolved = attachmentRow || null;

  if (!resolved) {
    if (!attachmentId) throw new Error("Brak attachmentId");

    let q = supabase
      .from("work_order_attachments")
      .select("id, storage_bucket, storage_path")
      .eq("id", attachmentId)
      .single();

    if (signal) q = q.abortSignal(signal);

    const { data, error } = await q;
    if (error) throw friendlyError(error, "Nie udało się pobrać załącznika");
    resolved = data;
  }

  const bucket = resolved?.storage_bucket || BUCKET;
  const path = resolved?.storage_path;

  // 1) delete DB row first (authoritative)
  let del = supabase.from("work_order_attachments").delete().eq("id", resolved.id);
  if (signal) del = del.abortSignal(signal);

  const { error: delErr } = await del;
  if (delErr) throw friendlyError(delErr, "Nie udało się usunąć załącznika");

  // 2) best-effort delete storage object
  if (bucket && path) {
    try {
      await supabase.storage.from(bucket).remove([path]);
    } catch {
      // ignore storage delete errors (row already deleted)
    }
  }

  return true;
}