// src/services/workOrderService.js
import { supabase } from "../lib/supabase";

function friendlyError(err, fallback) {
  return new Error(err?.message ?? fallback);
}

function toIsoOrNull(value) {
  if (!value) return null;

  // already ISO
  if (typeof value === "string" && value.includes("T") && value.includes("Z")) {
    return value;
  }

  // datetime-local like "2026-02-07T12:30"
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return null;
  }

  // Date object
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return null;
}
/* ======================
   LIST (by property)
   ====================== */

export async function fetchWorkOrders({
  accountId,
  propertyId,
  maintenanceRequestId = null,

  // ✅ keep old behavior
  limit = 50,

  // ✅ new optional pagination
  page = undefined,       // 1-based
  pageSize = 20,          // used only when page is provided

  signal = undefined, // optional AbortSignal
} = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!propertyId) throw new Error("Brak propertyId");

  const baseSelect = `
    id,
    account_id,
    property_id,
    maintenance_request_id,
    contractor_user_id,
    contractor_name,
    contractor_phone,
    status,
    scheduled_at,
    notes,
    quote_amount,
    invoice_amount,
    created_by,
    created_at,
    updated_at,
    pending_cancel_request,
    last_cancel_request_at,
    last_cancel_request_by,
    last_cancel_resolution_at,
    last_cancel_resolution_action,
    last_cancel_resolution_by,
    maintenance_requests:maintenance_request_id ( id, title, status, priority )
  `;

  let q = supabase
    .from("work_orders_with_flags")
    // ✅ only ask for count when paginating (keeps old calls fast)
    .select(baseSelect, page != null ? { count: "exact" } : undefined)
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  if (maintenanceRequestId) q = q.eq("maintenance_request_id", maintenanceRequestId);

  if (page != null) {
    // ✅ Pagination mode (server-side)
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 20)); // clamp
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;
    q = q.range(from, to);
  } else {
    // ✅ Old mode (limit only)
    q = q.limit(limit);
  }

  if (signal) q = q.abortSignal(signal);

  const { data, error, count } = await q;
  if (error) throw error;

  if (page != null) {
    return {
      data: data ?? [],
      count: count ?? 0,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.max(1, Math.min(200, Number(pageSize) || 20)),
    };
  }

  return data ?? [];
}
/* ======================
   CREATE (RPC-driven)
   ====================== */
/**
 * IMPORTANT:
 * Notifications are DB-driven (authoritative).
 * - work_order_create() does the creation
 * - DB triggers/functions create notifications reliably (even if client disconnects)
 */
export async function createWorkOrder({
  accountId,
  propertyId,
  maintenanceRequestId = null,

  // contractorId from `contractors.id` (not auth.users.id)
  contractorId = null,

  contractorName = null,
  contractorPhone = null,
  scheduledAt = null,
  notes = null,

  signal = undefined, // optional AbortSignal
} = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!propertyId) throw new Error("Brak propertyId");

  const { data: workOrderId, error: rpcError } = await supabase.rpc(
    "work_order_create",
    {
      p_account_id: accountId,
      p_property_id: propertyId,
      p_maintenance_request_id: maintenanceRequestId,
      p_contractor_id: contractorId,
      p_contractor_name: contractorName,
      p_contractor_phone: contractorPhone,
      p_scheduled_at: toIsoOrNull(scheduledAt),
      p_notes: notes,
    },
    signal ? { signal } : undefined
  );

  if (rpcError) throw friendlyError(rpcError, "Nie udało się utworzyć zlecenia");

  // Optional read-back for immediate UI refresh.
  // Use maybeSingle so RLS/view timing returning 0 rows doesn't throw.
  let read = supabase
    .from("work_orders_with_flags")
    .select(
      `
      id,
      account_id,
      property_id,
      maintenance_request_id,
      contractor_user_id,
      contractor_name,
      contractor_phone,
      status,
      scheduled_at,
      notes,
      quote_amount,
      invoice_amount,
      created_by,
      created_at,
      updated_at,
      pending_cancel_request,
      last_cancel_request_at,
      last_cancel_request_by,
      last_cancel_resolution_at,
      last_cancel_resolution_action,
      last_cancel_resolution_by,
      maintenance_requests:maintenance_request_id ( id, title, status, priority )
    `
    )
    .eq("id", workOrderId)
    .maybeSingle();

  if (signal) read = read.abortSignal(signal);

  const { data: row, error: readErr } = await read;

  if (readErr || !row) return { id: workOrderId };
  return row;
}

/* ======================
   UPDATE
   ====================== */
/**
 * IMPORTANT:
 * If you also have DB notifications for status/assignment changes,
 * DO NOT send notifications from the client here (avoids duplicates/loops).
 */
export async function updateWorkOrder(id, patch = {}, { signal } = {}) {
  if (!id) throw new Error("Brak ID zlecenia");

  // Normalize scheduled_at if passed as a datetime-local string/Date
  const nextPatch = { ...patch };
  if ("scheduled_at" in nextPatch) {
    nextPatch.scheduled_at = toIsoOrNull(nextPatch.scheduled_at);
  }

  let q = supabase
    .from("work_orders")
    .update(nextPatch)
    .eq("id", id)
    // keep response lighter & predictable (adjust if you need more fields)
    .select("id, account_id, property_id, contractor_user_id, status, scheduled_at, updated_at")
    .single();

  if (signal) q = q.abortSignal(signal);

  const { data, error } = await q;

  if (error) throw friendlyError(error, "Nie udało się zaktualizować zlecenia");
  return data;
}

/* ======================
   DELETE
   ====================== */

export async function deleteWorkOrder(id, { signal } = {}) {
  if (!id) throw new Error("Brak ID zlecenia");

  let q = supabase.from("work_orders").delete().eq("id", id);

  if (signal) q = q.abortSignal(signal);

  const { error } = await q;
  if (error) throw friendlyError(error, "Nie udało się usunąć zlecenia");
}
