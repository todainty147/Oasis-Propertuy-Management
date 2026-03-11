// src/services/workOrderFinancialsService.js
import { supabase } from "../lib/supabase";

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

export async function getWorkOrderFinancials({ accountId, workOrderId } = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!workOrderId) throw new Error("Brak workOrderId");

  const { data, error } = await supabase
    .from("work_order_financials")
    .select(
      "id,account_id,work_order_id,quote_amount,quote_currency,quote_notes,quote_submitted_at,quote_submitted_by,quote_status,invoice_amount,invoice_currency,invoice_issued_at,invoice_due_at,approved_at,approved_by,rejected_at,rejected_by,rejection_reason,created_at,updated_at"
    )
    .eq("account_id", accountId)
    .eq("work_order_id", workOrderId)
    .maybeSingle();

  if (error) throw friendly(error, "Nie udało się pobrać finansów zlecenia");
  return data || null;
}

/* =========================
   CONTRACTOR actions
   ========================= */

export async function upsertQuoteDraft({
  workOrderId,
  quoteAmount,
  quoteCurrency,
  quoteNotes,
} = {}) {
  const { data, error } = await supabase.rpc("wo_fin_upsert_quote_draft", {
    p_work_order_id: workOrderId,
    p_quote_amount: quoteAmount ?? null,
    p_quote_currency: quoteCurrency ?? null,
    p_quote_notes: quoteNotes ?? null,
  });

  if (error) throw friendly(error, "Nie udało się zapisać szkicu wyceny");
  return data;
}

export async function submitQuote({ workOrderId } = {}) {
  const { data, error } = await supabase.rpc("wo_fin_submit_quote", {
    p_work_order_id: workOrderId,
  });

  if (error) throw friendly(error, "Nie udało się wysłać wyceny");
  return data;
}

export async function upsertInvoice({
  workOrderId,
  invoiceAmount,
  invoiceCurrency,
  invoiceIssuedAt,
  invoiceDueAt,
} = {}) {
  const { data, error } = await supabase.rpc("wo_fin_upsert_invoice", {
    p_work_order_id: workOrderId,
    p_invoice_amount: invoiceAmount ?? null,
    p_invoice_currency: invoiceCurrency ?? null,
    p_invoice_issued_at: invoiceIssuedAt ?? null,
    p_invoice_due_at: invoiceDueAt ?? null,
  });

  if (error) throw friendly(error, "Nie udało się zapisać faktury");
  return data;
}

/* =========================
   MANAGER actions
   ========================= */

export async function approveQuote({ workOrderId } = {}) {
  const { data, error } = await supabase.rpc("wo_fin_approve_quote", {
    p_work_order_id: workOrderId,
  });

  if (error) throw friendly(error, "Nie udało się zatwierdzić wyceny");
  return data;
}

export async function rejectQuote({ workOrderId, reason } = {}) {
  const { data, error } = await supabase.rpc("wo_fin_reject_quote", {
    p_work_order_id: workOrderId,
    p_reason: reason ?? null,
  });

  if (error) throw friendly(error, "Nie udało się odrzucić wyceny");
  return data;
}
// Back-compat aliases (safe)
export const setQuoteDraft = upsertQuoteDraft;
export const setInvoiceAmount = ({ workOrderId, invoiceAmount } = {}) =>
  upsertInvoice({ workOrderId, invoiceAmount });
export const updateWorkOrderFinancials = async () => {
  throw new Error("updateWorkOrderFinancials removed: use RPCs (upsertQuoteDraft/upsertInvoice/approve/reject/submit).");
};