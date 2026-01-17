// src/services/paymentService.js
import { supabase } from "../lib/supabase";

/* ======================
   TENANT: READ (RPC-only)
   ====================== */

export async function fetchMyPayments(accountId) {
  if (!accountId) return [];

  const { data, error } = await supabase.rpc("get_my_payments", {
    p_account_id: accountId,
  });

  if (error) throw error;
  return data ?? [];
}

/* ======================
   OWNER/STAFF: CREATE (RPC)
   ====================== */

export async function createPayment({
  accountId,
  propertyId,
  tenantId,
  amount,
  dueDate,
  paidAt = null,
}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!propertyId) throw new Error("Missing propertyId");
  if (!tenantId) throw new Error("Missing tenantId");
  if (!dueDate) throw new Error("Missing dueDate");

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error("Invalid amount");
  }

  const { data, error } = await supabase.rpc("create_payment", {
    p_account_id: accountId,
    p_property_id: propertyId,
    p_tenant_id: tenantId,
    p_amount: amt,
    p_due_date: dueDate,
    p_paid_at: paidAt,
    p_notes: null,
  });

  if (error) throw error;
  return data;
}

/* ======================
   OWNER/STAFF: UPDATE (RPC)
   ====================== */

export async function updatePayment(paymentId, { amount = null, dueDate = null } = {}) {
  if (!paymentId) throw new Error("Missing paymentId");

  const amt = amount === null || amount === undefined ? null : Number(amount);
  if (amt !== null && (!Number.isFinite(amt) || amt <= 0)) {
    throw new Error("Invalid amount");
  }

  const { data, error } = await supabase.rpc("update_payment", {
    p_payment_id: paymentId,
    p_amount: amt,
    p_due_date: dueDate,
    p_notes: null,
  });

  if (error) throw error;
  return data;
}

/* ======================
   OWNER/STAFF: DELETE (RPC)
   ====================== */

export async function deletePayment(paymentId) {
  if (!paymentId) throw new Error("Missing paymentId");

  const { error } = await supabase.rpc("delete_payment", {
    p_payment_id: paymentId,
  });

  if (error) throw error;
}

/* ======================
   OWNER/STAFF: MARK PAID/UNPAID
   ====================== */

export async function markPaymentPaid(paymentId, paidAt = null) {
  if (!paymentId) throw new Error("Missing paymentId");

  const { data, error } = await supabase.rpc("mark_payment_paid", {
    p_payment_id: paymentId,
    p_paid_at: paidAt,
  });

  if (error) throw error;
  return data;
}

export async function markPaymentUnpaid(paymentId) {
  if (!paymentId) throw new Error("Missing paymentId");

  const { data, error } = await supabase.rpc("mark_payment_unpaid", {
    p_payment_id: paymentId,
  });

  if (error) throw error;
  return data;
}
