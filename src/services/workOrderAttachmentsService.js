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

async function sha256Hex(file) {
  if (!file || typeof file.arrayBuffer !== "function") return null;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;

  const buffer = await file.arrayBuffer();
  const digest = await subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
      "id, account_id, work_order_id, uploaded_by, attester_role, file_name, mime_type, file_size, storage_bucket, storage_path, kind, created_at, maintenance_stage, capture_method, work_order_status_at_received, late_upload, content_hash_client_asserted, content_hash_algorithm, content_hash_verified_at, hash_trust, content_hash_server_computed, hash_verification_error, verification_attempted_at, provenance_event_id"
    )
    .eq("account_id", accountId)
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: false });

  if (signal) q = q.abortSignal(signal);

  const { data, error } = await q;
  if (error) throw friendlyError(error, "Nie udało się pobrać załączników");

  return (data ?? []).map((row) => ({
    ...row,
    received_at: row.created_at,
    hash_trust:
      row.hash_trust ||
      (row.content_hash_client_asserted ? "client_asserted_unverified" : "not_available"),
  }));
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
export async function uploadWorkOrderAttachments({
  accountId,
  workOrderId,
  files = [],
  attesterRole = null,
  maintenanceStage = null,
  captureMethod = "uploaded",
  signal,
} = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!workOrderId) throw new Error("Brak workOrderId");

  const list = assertFiles(files, { maxFiles: 10, maxBytes: 15 * 1024 * 1024 });
  if (list.length === 0) return [];

  await getAuthedUser();
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

    // 2) record DB row + provenance atomically in Postgres.
    // Storage is intentionally first: if this RPC fails, the only residue is
    // an orphaned object with no evidence claim. The forbidden direction
    // (anchored row/event pointing at absent bytes) is prevented by the RPC's
    // storage.objects existence check.
    const kind = (file.type || "").startsWith("image/") ? "photo" : "document";
    const contentHashClientAsserted = kind === "photo" ? await sha256Hex(file) : null;

    let ins = supabase.rpc("record_work_order_attachment_received", {
      p_account_id: accountId,
      p_work_order_id: workOrderId,
      p_storage_path: storagePath,
      p_file_name: file.name,
      p_mime_type: file.type || null,
      p_file_size: typeof file.size === "number" ? file.size : null,
      p_kind: kind,
      p_attester_role: attesterRole ?? null,
      p_maintenance_stage: maintenanceStage ?? null,
      p_capture_method: captureMethod || "uploaded",
      p_content_hash_client_asserted: contentHashClientAsserted,
    });

    if (signal) ins = ins.abortSignal(signal);

    const { data: row, error: insErr } = await ins;

    if (insErr) {
      // Best-effort cleanup: remove the uploaded object if DB/provenance insert fails.
      // If cleanup fails, the orphan is harmless because no row/event exists.
      try {
        await supabase.storage.from(BUCKET).remove([storagePath]);
      } catch {
        // ignore cleanup errors
      }
      throw friendlyError(insErr, `Nie udało się zapisać załącznika: ${file.name}`);
    }

    const inserted = Array.isArray(row) ? row[0] : row;
    results.push({
      ...inserted,
      received_at: inserted?.created_at,
      hash_trust:
        inserted?.hash_trust ||
        (inserted?.content_hash_client_asserted ? "client_asserted_unverified" : "not_available"),
    });

    // Async verification trigger (non-blocking, fire-and-forget).
    // Invokes verify-work-order-photo-hash after the anchor commits.
    // Does not gate or delay the upload response.
    if (inserted?.id && inserted?.content_hash_client_asserted) {
      triggerHashVerification(inserted.id);
    }
  }

  return results;
}

/**
 * Fire-and-forget call to the hash verification edge function.
 * Errors are swallowed; the sweep will retry any transient failures.
 * @param {string} attachmentId
 */
function triggerHashVerification(attachmentId) {
  // Using Promise chain (not await) so it never blocks the caller.
  supabase.functions
    .invoke("verify-work-order-photo-hash", {
      body: { attachmentId },
    })
    .catch(() => {
      // Non-fatal; the sweep function handles unverified rows.
    });
}

/**
 * Retry sweep: invokes hash verification for work-order attachments that still
 * have hash_trust='client_asserted_unverified' with a client hash and a recorded
 * transient error (or null server hash after a prior attempt).
 *
 * Terminal states ('verified', 'verification_failed') are never re-verified.
 *
 * @param {string} accountId
 * @param {string} workOrderId
 */
export async function sweepUnverifiedAttachmentHashes({ accountId, workOrderId } = {}) {
  if (!accountId || !workOrderId) return;

  const { data, error } = await supabase
    .from("work_order_attachments")
    .select("id, content_hash_client_asserted, hash_trust, hash_verification_error")
    .eq("account_id", accountId)
    .eq("work_order_id", workOrderId)
    .eq("hash_trust", "client_asserted_unverified")
    .not("content_hash_client_asserted", "is", null);

  if (error || !data) return;

  for (const row of data) {
    triggerHashVerification(row.id);
  }
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
