import { supabase } from "../lib/supabase";

export async function createPayment(data) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("No authenticated user");

  const { error } = await supabase.from("payments").insert({
    owner_id: user.id,                // always from session
    property_id: data.propertyId,     // camelCase → snake_case
    tenant_id: data.tenantId,
    amount: Number(data.amount),
    status: data.status,
    due_date: data.dueDate,           // REQUIRED
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
