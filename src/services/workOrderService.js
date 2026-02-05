// src/services/workOrderService.js
import { supabase } from "../lib/supabase";

function friendlyError(err, fallback) {
  return new Error(err?.message ?? fallback);
}

/* ======================
   LIST (by property)
   ====================== */

export async function fetchWorkOrders({
  accountId,
  propertyId,
  maintenanceRequestId = null,
  limit = 50,
} = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!propertyId) throw new Error("Brak propertyId");

  let q = supabase
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
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (maintenanceRequestId) q = q.eq("maintenance_request_id", maintenanceRequestId);

  const { data, error } = await q;
  if (error) throw error;

  return data ?? [];
}
/* ======================
   CREATE (RPC-driven, matches your DB function)
   ====================== */

export async function createWorkOrder({
  accountId,
  propertyId,
  maintenanceRequestId = null,

  // NEW: contractorId from `contractors.id` (not auth.users.id)
  contractorId = null,

  contractorName = null,
  contractorPhone = null,
  scheduledAt = null,
  notes = null,
} = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!propertyId) throw new Error("Brak propertyId");

  // Use RPC so DB assigns contractor_user_id properly when contractorId is provided
  const { data: workOrderId, error: rpcError } = await supabase.rpc("work_order_create", {
    p_account_id: accountId,
    p_property_id: propertyId,
    p_maintenance_request_id: maintenanceRequestId,
    p_contractor_id: contractorId, // ✅ important
    p_contractor_name: contractorName,
    p_contractor_phone: contractorPhone,
    p_scheduled_at: scheduledAt,
    p_notes: notes,
  });

  if (rpcError) throw friendlyError(rpcError, "Nie udało się utworzyć zlecenia");

  // Optional: return the created row (nice for immediate UI refresh without full reload)
  const { data: row, error: readErr } = await supabase
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
    .single();

  // If the read fails due to RLS/view timing, still return id so caller can reload
  if (readErr) return { id: workOrderId };

  return row;
}

/* ======================
   UPDATE
   ====================== */

export async function updateWorkOrder(id, patch = {}) {
  if (!id) throw new Error("Brak ID zlecenia");

  const { data, error } = await supabase
    .from("work_orders")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw friendlyError(error, "Nie udało się zaktualizować zlecenia");
  return data;
}


/* ======================
   DELETE
   ====================== */

export async function deleteWorkOrder(id) {
  if (!id) throw new Error("Brak ID zlecenia");

  const { error } = await supabase.from("work_orders").delete().eq("id", id);
  if (error) throw friendlyError(error, "Nie udało się usunąć zlecenia");
}
