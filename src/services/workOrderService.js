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
   CREATE
   ====================== */

export async function createWorkOrder({
  accountId,
  propertyId,
  maintenanceRequestId = null,
  contractorName = null,
  contractorPhone = null,
  contractorUserId = null,
  status = "assigned",
  scheduledAt = null,
  notes = null,
  quoteAmount = null,
  invoiceAmount = null,
} = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!propertyId) throw new Error("Brak propertyId");

  const payload = {
    account_id: accountId,
    property_id: propertyId,
    maintenance_request_id: maintenanceRequestId,
    contractor_name: contractorName,
    contractor_phone: contractorPhone,
    contractor_user_id: contractorUserId,
    status,
    scheduled_at: scheduledAt,
    notes,
    quote_amount: quoteAmount,
    invoice_amount: invoiceAmount,
  };

  const { data, error } = await supabase
    .from("work_orders")
    .insert(payload)
    .select()
    .single();

  if (error) throw friendlyError(error, "Nie udało się utworzyć zlecenia");

  return data;
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
