// src/services/paymentService.js
import { supabase } from "../lib/supabase";
import { parseMyPaymentRow, parsePaymentRow, parseRpcRows } from "./rpcContracts";

const MAX_PAYMENT_AMOUNT = 1_000_000;

function parsePaymentListRow(row) {
  const payment = parsePaymentRow(row);
  return {
    id: payment.id,
    amount: payment.amount,
    status: payment.status,
    dueDate: payment.due_date,
    paidAt: payment.paid_at,
    tenantId: payment.tenant_id,
    propertyId: payment.property_id,
    tenantName: row?.tenants?.name ?? "—",
    propertyAddress: row?.properties?.address ?? "—",
  };
}

export async function listAccountPayments(accountId) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .from("payments")
    .select(
      `
      id,
      account_id,
      property_id,
      tenant_id,
      owner_id,
      amount,
      due_date,
      paid_at,
      created_at,
      status,
      tenants ( name ),
      properties ( address )
    `,
    )
    .eq("account_id", accountId)
    .order("due_date", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(parsePaymentListRow);
}

/* ======================
   TENANT: READ (RPC-only)
   ====================== */

export async function fetchMyPayments(accountId) {
  if (!accountId) return [];

  const { data, error } = await supabase.rpc("get_my_payments", {
    p_account_id: accountId,
  });

  if (error) throw error;
  return parseRpcRows(data || [], parseMyPaymentRow, "get_my_payments rows");
}

/* ======================
   OWNER/ADMIN: CREATE (RPC)
   ====================== */

export async function createPayment({
  accountId,
  propertyId,
  tenantId,
  amount,
  dueDate,
  paidAt = null,
  notes = null,
}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!propertyId) throw new Error("Missing propertyId");
  if (!tenantId) throw new Error("Missing tenantId");
  if (!dueDate) throw new Error("Missing dueDate");

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error("Invalid amount");
  }
  if (amt > MAX_PAYMENT_AMOUNT) {
    throw new Error("Payment amount exceeds allowed maximum");
  }

  if (isNaN(new Date(dueDate).getTime())) {
    throw new Error("Invalid dueDate: must be a valid date string");
  }

  const { data, error } = await supabase.rpc("create_payment", {
    p_account_id: accountId,
    p_property_id: propertyId,
    p_tenant_id: tenantId,
    p_amount: amt,
    p_due_date: dueDate,
    p_paid_at: paidAt,
    p_notes: notes ?? null,
  });

  if (error) throw error;
  return parsePaymentRow(data);
}

/* ======================
   OWNER/ADMIN: UPDATE (RPC)
   ====================== */

export async function updatePayment(paymentId, { accountId = null, amount = null, dueDate = null, notes = null } = {}) {
  if (!paymentId) throw new Error("Missing paymentId");
  if (!accountId) throw new Error("Missing accountId");

  const amt = amount === null || amount === undefined ? null : Number(amount);
  if (amt !== null && (!Number.isFinite(amt) || amt <= 0)) {
    throw new Error("Invalid amount");
  }
  if (amt !== null && amt > MAX_PAYMENT_AMOUNT) {
    throw new Error("Payment amount exceeds allowed maximum");
  }

  if (dueDate !== null && isNaN(new Date(dueDate).getTime())) {
    throw new Error("Invalid dueDate: must be a valid date string");
  }

  const { data, error } = await supabase.rpc("update_payment", {
    p_account_id: accountId,
    p_payment_id: paymentId,
    p_amount: amt,
    p_due_date: dueDate,
    p_notes: notes ?? null,
  });

  if (error) throw error;
  return parsePaymentRow(data);
}

/* ======================
   OWNER: DELETE (RPC)
   ====================== */

export async function deletePayment(paymentId, accountId = null) {
  if (!paymentId) throw new Error("Missing paymentId");
  if (!accountId) throw new Error("Missing accountId");

  const { error } = await supabase.rpc("delete_payment", {
    p_account_id: accountId,
    p_payment_id: paymentId,
  });

  if (error) throw error;
}

/* ======================
   OWNER/ADMIN: MARK PAID/UNPAID
   ====================== */

export async function markPaymentPaid(paymentId, paidAt = null, accountId = null) {
  if (!paymentId) throw new Error("Missing paymentId");
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("mark_payment_paid", {
    p_account_id: accountId,
    p_payment_id: paymentId,
    p_paid_at: paidAt,
  });

  if (error) throw error;
  return parsePaymentRow(data);
}

export async function markPaymentUnpaid(paymentId, accountId = null) {
  if (!paymentId) throw new Error("Missing paymentId");
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("mark_payment_unpaid", {
    p_account_id: accountId,
    p_payment_id: paymentId,
  });

  if (error) throw error;
  return parsePaymentRow(data);
}
