// src/services/paymentService.js
import { supabase } from "../lib/supabase";
import { parseMyPaymentRow, parsePaymentRow, parseRpcRows } from "./rpcContracts";
import { createNotifications } from "./notificationService";

async function notifyTenantPaymentDue({ paymentId, amount, dueDate, tenantId, accountId }) {
  if (!tenantId || !accountId) return;
  try {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("user_id")
      .eq("id", tenantId)
      .eq("account_id", accountId)
      .maybeSingle();
    await createNotifications({
      accountId,
      recipientUserIds: tenant?.user_id ? [tenant.user_id] : [],
      type: "payment_due",
      title: "New payment recorded",
      entityType: "payment",
      entityId: paymentId,
      linkPath: "/tenant/payments",
      metadata: { payment_id: paymentId, amount, due_date: dueDate },
    });
  } catch (notifyErr) {
    console.warn("[notifications] payment_due failed", notifyErr);
  }
}

async function notifyTenantPaymentReceived({ payment, accountId }) {
  if (!payment?.tenant_id || !accountId) return;
  try {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("user_id")
      .eq("id", payment.tenant_id)
      .eq("account_id", accountId)
      .maybeSingle();
    await createNotifications({
      accountId,
      recipientUserIds: tenant?.user_id ? [tenant.user_id] : [],
      type: "payment_received",
      title: "Your payment has been received",
      entityType: "payment",
      entityId: payment.id,
      linkPath: "/tenant/payments",
      metadata: { payment_id: payment.id, amount: payment.amount, paid_at: payment.paid_at },
    });
  } catch (notifyErr) {
    console.warn("[notifications] payment_received failed", notifyErr);
  }
}

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
  if (!data) throw new Error("create_payment returned no data");
  const parsed = parsePaymentRow(data);
  await notifyTenantPaymentDue({
    paymentId: parsed.id,
    amount: parsed.amount,
    dueDate: parsed.due_date,
    tenantId,
    accountId,
  });
  return parsed;
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
    p_amount:    amt,
    p_due_date:  dueDate,
    p_notes:     notes ?? null,
  });

  if (error) throw error;
  if (!data) throw new Error("update_payment returned no data");
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
  if (!data) throw new Error("mark_payment_paid returned no data");
  const parsed = parsePaymentRow(data);
  await notifyTenantPaymentReceived({ payment: parsed, accountId });
  return parsed;
}

export async function markPaymentUnpaid(paymentId, accountId = null) {
  if (!paymentId) throw new Error("Missing paymentId");
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("mark_payment_unpaid", {
    p_account_id: accountId,
    p_payment_id: paymentId,
  });

  if (error) throw error;
  if (!data) throw new Error("mark_payment_unpaid returned no data");
  return parsePaymentRow(data);
}

/* ======================
   OWNER: VOID / REOPEN (A-9: explicit accountId)
   ====================== */

export async function voidPayment(paymentId, accountId = null) {
  if (!paymentId) throw new Error("Missing paymentId");
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("void_payment", {
    p_payment_id: paymentId,
    p_account_id: accountId,
  });

  if (error) throw error;
  if (!data) throw new Error("void_payment returned no data");
  return parsePaymentRow(data);
}

export async function reopenPayment(paymentId, accountId = null) {
  if (!paymentId) throw new Error("Missing paymentId");
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("reopen_payment", {
    p_payment_id: paymentId,
    p_account_id: accountId,
  });

  if (error) throw error;
  if (!data) throw new Error("reopen_payment returned no data");
  return parsePaymentRow(data);
}
