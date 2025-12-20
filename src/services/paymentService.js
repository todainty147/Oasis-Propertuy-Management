import { supabase } from "../lib/supabase";

export async function createPayment(data) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("payments").insert({
    owner_id: user.id,            // ✅ ALWAYS FROM SESSION
    property_id: data.propertyId,
    tenant_id: data.tenantId,     // ✅ REQUIRED
    amount: Number(data.amount),
    status: data.status,
    due_date: data.dueDate,       // ✅ REQUIRED
    paid_at: data.paidAt ?? null,
  });

  if (error) throw error;
}



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

export async function deletePayment(id) {
  const { error } = await supabase
    .from("payments")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
