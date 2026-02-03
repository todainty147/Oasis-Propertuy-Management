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
    .from("work_orders")
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
      maintenance_requests (
        id,
        title,
        status,
        priority
      )
    `
    )
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (maintenanceRequestId) {
    q = q.eq("maintenance_request_id", maintenanceRequestId);
  }

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

  // ✅ preferred: contractors directory
  contractorId = null, // <-- public.contractors.id

  // ✅ legacy/manual fallback (only used when contractorId is null)
  contractorName = null,
  contractorPhone = null,

  scheduledAt = null,
  notes = null,
} = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!propertyId) throw new Error("Brak propertyId");

  // 1) Create via RPC (single source of truth)
  const { data: newId, error: createErr } = await supabase.rpc("work_order_create", {
    p_account_id: accountId,
    p_property_id: propertyId,
    p_maintenance_request_id: maintenanceRequestId,
    p_contractor_id: contractorId,
    p_contractor_name: contractorName,
    p_contractor_phone: contractorPhone,
    p_scheduled_at: scheduledAt,
    p_notes: notes,
  });

  if (createErr) throw friendlyError(createErr, "Nie udało się utworzyć zlecenia");

  if (!newId || typeof newId !== "string") {
    throw new Error("RPC work_order_create nie zwrócił poprawnego UUID.");
  }

  // 2) Return a fresh row for UI (consistent with WorkOrdersSection)
  const { data: row, error: fetchErr } = await supabase
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
    .eq("id", newId)
    .single();

  if (fetchErr) {
    throw friendlyError(fetchErr, "Zlecenie utworzono, ale nie udało się odświeżyć danych");
  }

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
