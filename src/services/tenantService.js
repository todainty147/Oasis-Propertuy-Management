import { supabase } from "../lib/supabase";

export async function createTenant({ name, email, phone, propertyId }) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("tenants").insert([
    {
      owner_id: user.id,
      name,
      email,
      phone,
      property_id: propertyId ?? null,
    },
  ]);

  if (error) throw error;
}

export async function updateTenant(id, updates) {
  const { error } = await supabase
    .from("tenants")
    .update({
      name: updates.name,
      email: updates.email,
      phone: updates.phone,
      property_id: updates.propertyId ?? null,
    })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteTenant(id) {
  const { error } = await supabase
    .from("tenants")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
