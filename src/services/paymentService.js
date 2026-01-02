import { supabase } from "../lib/supabase";

/* ======================
   CREATE PAYMENT
   ====================== */

export async function createPayment({
  accountId, // ✅ REQUIRED
  propertyId,
  tenantId,
  amount,
  status,
  dueDate,
  paidAt = null,
}) {
  if (!accountId) {
    throw new Error("Brak accountId przy tworzeniu płatności");
  }

  const { error } = await supabase
    .from("payments")
    .insert({
      account_id: accountId,     // ✅ MULTI-TENANT ROOT
      property_id: propertyId,
      tenant_id: tenantId,
      amount: Number(amount),
      status,
      due_date: dueDate,
      paid_at: paidAt,
    });

  if (error) throw error;
}

/* ======================
   UPDATE PAYMENT
   ====================== */

export async function updatePayment(id, data) {
  const { error } = await supabase
    .from("payments")
    .update({
      amount: Number(data.amount),
      status: data.status,
      paid_at: data.paidAt ?? null,
    })
    .eq("id", id);

  if (error) throw error;
}

/* ======================
   DELETE PAYMENT
   ====================== */

export async function deletePayment(id) {
  const { error } = await supabase
    .from("payments")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
