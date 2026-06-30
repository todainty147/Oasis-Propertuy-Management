// src/services/workOrderAttachmentsService.js
import { supabase } from "../lib/supabase";
import { assertFiles } from "../utils/validation";

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

function uniq(list = []) {
  return Array.from(new Set(list.filter(Boolean)));
}

function safeBaseName(fileName = "") {
  const base = String(fileName || "")
    .replaceAll("\\", "/")
    .split("/")
    .pop();

  return base
    .replace(/\s+/g, "_")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeStoragePath(bucket, rawPath) {
  const b = String(bucket || "").trim();
  let p = String(rawPath || "").trim().replaceAll("\\", "/");
  if (!p) return "";

  // full URL => extract object key for this bucket
  if (/^https?:\/\//i.test(p)) {
    try {
      const u = new URL(p);
      const pathname = decodeURIComponent(u.pathname || "");
      const signPrefix = `/storage/v1/object/sign/${b}/`;
      const publicPrefix = `/storage/v1/object/public/${b}/`;
      const objectPrefix = `/storage/v1/object/${b}/`;

      if (pathname.includes(signPrefix)) p = pathname.split(signPrefix)[1] || "";
      else if (pathname.includes(publicPrefix)) p = pathname.split(publicPrefix)[1] || "";
      else if (pathname.includes(objectPrefix)) p = pathname.split(objectPrefix)[1] || "";
      else p = pathname.replace(/^\/+/, "");
    } catch {
      // keep original fallback
    }
  }

  // drop leading slash and accidental bucket prefix in key
  p = p.replace(/^\/+/, "");
  if (b && p.startsWith(`${b}/`)) p = p.slice(b.length + 1);

  return p;
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
    .replace(/[^\w.-]+/g, "_")
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
      "id, account_id, work_order_id, uploaded_by, attester_role, file_name, mime_type, file_size, storage_bucket, storage_path, kind, created_at"
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

  const normalized = normalizeStoragePath(bucket, path);

  const variants = uniq([
    normalized,
    decodeURIComponent(normalized),
    encodeURI(normalized),
    // back-compat fallback: legacy DB rows sometimes keep unsanitized names
    normalized.replace(/\s+/g, "_"),
  ]);

  let lastErr = null;
  for (const candidate of variants) {
    // skip obviously invalid values
    if (!candidate || candidate === "." || candidate === "/") continue;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(candidate, expiresIn);
    if (!error) return data?.signedUrl || null;
    lastErr = error;
  }

  throw friendlyError(lastErr, "Nie udało się utworzyć linku do pliku");
}

/**
 * Robust signed URL resolution for an attachment row.
 * Fallback strategy:
 * 1) Try row.storage_path directly
 * 2) If not found, list account/<accountId>/work_orders/<workOrderId>/ and match by filename tail
 */
export async function createAttachmentSignedUrlForRow({
  attachmentRow,
  accountId,
  workOrderId,
  expiresIn = 60,
} = {}) {
  if (!attachmentRow) throw new Error("Brak attachmentRow");

  const bucket = attachmentRow.storage_bucket || BUCKET;
  const directPath = attachmentRow.storage_path;

  try {
    return await createAttachmentSignedUrl(bucket, directPath, expiresIn);
  } catch (directErr) {
    const acct = accountId || attachmentRow.account_id;
    const woId = workOrderId || attachmentRow.work_order_id;
    if (!acct || !woId) throw directErr;

    const folder = `account/${acct}/work_orders/${woId}`;
    const { data: objects, error: listErr } = await supabase.storage.from(bucket).list(folder, {
      limit: 200,
      sortBy: { column: "name", order: "desc" },
    });
    if (listErr) throw friendlyError(listErr, directErr?.message || "Nie udało się odnaleźć pliku");

    const list = objects ?? [];
    if (list.length === 0) throw directErr;

    const rawName = String(attachmentRow.file_name || "").trim();
    const safeName = safeBaseName(rawName);
    const tailCandidates = uniq([
      rawName,
      safeName,
      rawName.replace(/\s+/g, "_"),
      safeName && `_${safeName}`,
      rawName && `_${rawName}`,
    ]);

    const match =
      list.find((o) => tailCandidates.some((t) => t && String(o?.name || "") === t)) ||
      list.find((o) => tailCandidates.some((t) => t && String(o?.name || "").endsWith(t)));

    if (!match?.name) throw directErr;

    const recoveredPath = `${folder}/${match.name}`;
    return await createAttachmentSignedUrl(bucket, recoveredPath, expiresIn);
  }
}

/* ======================
   UPLOAD
   ====================== */

/**
 * Upload multiple files and create DB metadata rows.
 * Returns array of inserted rows (attachments).
 */
export async function uploadWorkOrderAttachments({ accountId, workOrderId, files = [], attesterRole = null, signal } = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!workOrderId) throw new Error("Brak workOrderId");

  const list = assertFiles(files, { maxFiles: 10, maxBytes: 15 * 1024 * 1024 });
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
        attester_role: attesterRole ?? null,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: typeof file.size === "number" ? file.size : null,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        kind,
      })
      .select(
        "id, account_id, work_order_id, uploaded_by, attester_role, file_name, mime_type, file_size, storage_bucket, storage_path, kind, created_at"
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
   ORPHAN CLEANUP (manual)
   ====================== */

/**
 * Manual cleanup helper for orphan storage objects.
 * Pass exact object keys from SQL audit output.
 */
export async function cleanupOrphanAttachmentPaths(orphanPaths = []) {
  const paths = Array.from(orphanPaths || [])
    .map((p) => String(p || "").trim())
    .filter(Boolean);

  if (paths.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase.storage.from(BUCKET).remove(paths);

  return { data, error };
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

  if (!bucket || !path) {
    throw new Error("Brak storage path");
  }

  // DB delete first. RLS is the sole authority on the lock boundary:
  // uploaders cannot delete evidence from completed work orders; account
  // owner/admin/staff can (data-correction path). Using .select('id') makes
  // PostgREST return the deleted rows so we can detect a silent RLS denial
  // (0 rows returned) without an error being raised.
  let del = supabase
    .from("work_order_attachments")
    .delete()
    .eq("id", resolved.id)
    .select("id");

  if (signal) del = del.abortSignal(signal);

  const { data: deleted, error: delErr } = await del;
  if (delErr) throw friendlyError(delErr, "Nie udało się usunąć załącznika");

  if (!deleted || deleted.length === 0) {
    // RLS blocked the delete or the row is already gone. Check existence to
    // distinguish the two cases and surface an actionable message.
    const { data: stillExists } = await supabase
      .from("work_order_attachments")
      .select("id")
      .eq("id", resolved.id)
      .maybeSingle();

    if (stillExists) {
      throw new Error(
        "Evidence from a completed work order cannot be deleted by the uploader. " +
          "This evidence is locked to maintain the integrity of the maintenance record. " +
          "Contact an account administrator for data corrections.",
      );
    }
    // Row is already gone — nothing more to do.
    return true;
  }

  // DB row confirmed deleted — now remove the storage object.
  const { error: storageErr } = await supabase.storage
    .from(bucket)
    .remove([path]);

  if (storageErr) {
    throw friendlyError(storageErr, "Nie udało się usunąć pliku ze storage");
  }

  return true;
}
