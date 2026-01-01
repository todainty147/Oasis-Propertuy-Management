import { supabase } from "../lib/supabase";

/* ======================
   CREATE
   ====================== */

export async function createPayment({
  accountId, // ✅ REQUIRED for multi-tenancy
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

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("No authenticated user");

  const { error } = await supabase.from("payments").insert({
    account_id: accountId,       // ✅ MULTI-TENANT (CRITICAL)
    owner_id: user.id,           // creator / legacy owner
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
   UPDATE
   ====================== */

export async function updatePayment(id, data) {
  const { error } = await supabase
    .from("payments")
    .update({
      amount: data.amount,
      status: data.status,
      paid_at: data.paidAt ?? null,
    })
    .eq("id", id);

  if (error) throw error;
}

/* ======================
   DELETE
   ====================== */

export async function deletePayment(id) {
  const { error } = await supabase
    .from("payments")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
