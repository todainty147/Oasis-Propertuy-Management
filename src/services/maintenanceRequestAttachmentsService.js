import { supabase } from "../lib/supabase";
import { createNotifications } from "./notificationService";
import { assertFiles } from "../utils/validation";

export const BUCKET = "maintenance-request-attachments";

function friendlyError(err, fallback) {
  return new Error(err?.message ?? fallback);
}

function safeBaseName(fileName = "") {
  const base = String(fileName || "")
    .replaceAll("\\", "/")
    .split("/")
    .pop();

  return base
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeStoragePath(rawPath = "") {
  let p = String(rawPath || "").trim().replaceAll("\\", "/");
  if (!p) return "";
  p = p.replace(/^\/+/, "");
  if (p.startsWith(`${BUCKET}/`)) p = p.slice(BUCKET.length + 1);
  return p;
}

function buildPath({ accountId, maintenanceRequestId, fileName }) {
  const ts = Date.now();
  const safeName = safeBaseName(fileName || "file");
  return `account/${accountId}/maintenance_requests/${maintenanceRequestId}/${ts}_${safeName || "file"}`;
}

export async function listMaintenanceRequestAttachments({ accountId, maintenanceRequestId } = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!maintenanceRequestId) throw new Error("Brak maintenanceRequestId");

  const folder = `account/${accountId}/maintenance_requests/${maintenanceRequestId}`;
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
    limit: 200,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) throw friendlyError(error, "Nie udało się pobrać załączników zgłoszenia");

  return (data || [])
    .filter((o) => o?.name)
    .map((o) => {
      const storagePath = `${folder}/${o.name}`;
      const bytes = Number(o?.metadata?.size);
      return {
        id: o.id || storagePath,
        file_name: o.name,
        file_size: Number.isFinite(bytes) ? bytes : null,
        created_at: o.created_at || null,
        storage_bucket: BUCKET,
        storage_path: storagePath,
      };
    });
}

export async function createMaintenanceRequestAttachmentSignedUrl({ path, expiresIn = 120 } = {}) {
  const storagePath = normalizeStoragePath(path);
  if (!storagePath) throw new Error("Brak ścieżki pliku");

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw friendlyError(error, "Nie udało się utworzyć linku do pliku");
  return data?.signedUrl || null;
}

export async function uploadMaintenanceRequestAttachments({
  accountId,
  maintenanceRequestId,
  files = [],
} = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!maintenanceRequestId) throw new Error("Brak maintenanceRequestId");

  const list = assertFiles(files, { maxFiles: 10, maxBytes: 15 * 1024 * 1024 });
  if (list.length === 0) return [];

  // Guard: do not allow uploads to closed maintenance requests.
  const { data: reqRow, error: reqErr } = await supabase
    .from("maintenance_requests")
    .select("status")
    .eq("account_id", accountId)
    .eq("id", maintenanceRequestId)
    .single();
  if (reqErr) throw friendlyError(reqErr, "Nie udało się sprawdzić statusu zgłoszenia");
  if (String(reqRow?.status || "").toLowerCase() === "closed") {
    throw new Error("Nie można dodawać załączników do zamkniętego zgłoszenia.");
  }

  const uploaded = [];

  for (const file of list) {
    const storagePath = buildPath({
      accountId,
      maintenanceRequestId,
      fileName: file.name,
    });

    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) {
      throw friendlyError(error, `Nie udało się wgrać pliku: ${file.name}`);
    }

    uploaded.push({
      id: storagePath,
      file_name: file.name,
      file_size: typeof file.size === "number" ? file.size : null,
      created_at: new Date().toISOString(),
      storage_bucket: BUCKET,
      storage_path: storagePath,
    });
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const actorId = user?.id || null;

    const { data: members, error: membersErr } = await supabase
      .from("account_members")
      .select("user_id, role")
      .eq("account_id", accountId);
    if (membersErr) throw membersErr;

    const blockedRoles = new Set(["tenant", "contractor"]);
    const managerRecipients = (members || [])
      .filter((m) => !blockedRoles.has(String(m?.role || "").toLowerCase()))
      .map((m) => m.user_id)
      .filter((id) => id && id !== actorId);

    const { data: contractors } = await supabase
      .from("work_orders")
      .select("contractor_user_id")
      .eq("account_id", accountId)
      .eq("maintenance_request_id", maintenanceRequestId)
      .not("contractor_user_id", "is", null);

    const contractorRecipients = (contractors || [])
      .map((r) => r.contractor_user_id)
      .filter((id) => id && id !== actorId);

    await createNotifications({
      accountId,
      recipientUserIds: Array.from(new Set([...managerRecipients, ...contractorRecipients])),
      type: "maintenance_attachment_uploaded",
      title: "Dodano załącznik do zgłoszenia",
      body: uploaded.length > 1 ? `Dodano ${uploaded.length} plików` : `Dodano plik: ${uploaded[0]?.file_name || "załącznik"}`,
      entityType: "maintenance_request",
      entityId: maintenanceRequestId,
      linkPath: "/maintenance-inbox",
      metadata: {
        maintenance_request_id: maintenanceRequestId,
        files_count: uploaded.length,
      },
    });
  } catch (notifyErr) {
    console.warn("[notifications] maintenance_attachment_uploaded failed", notifyErr);
  }

  return uploaded;
}

export async function deleteMaintenanceRequestAttachment({ path } = {}) {
  const storagePath = normalizeStoragePath(path);
  if (!storagePath) throw new Error("Brak ścieżki pliku");

  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) throw friendlyError(error, "Nie udało się usunąć załącznika");
  return true;
}
