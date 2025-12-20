import { supabase } from "../lib/supabase";

export async function createTenant(data) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .insert({
      owner_id: user.id,          // ✅ REQUIRED
      name: data.name,
      email: data.email,
      phone: data.phone,
      property_id: data.propertyId ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  // keep your property status sync logic
  if (data.propertyId) {
    await supabase
      .from("properties")
      .update({ status: "Wynajęte" })
      .eq("id", data.propertyId);
  }

  return tenant;
}


export async function updateTenant(id, data) {
  // fetch current tenant (to detect property change)
  const { data: current } = await supabase
    .from("tenants")
    .select("property_id")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("tenants")
    .update({
      name: data.name,
      email: data.email,
      phone: data.phone,
      property_id: data.propertyId ?? null,
    })
    .eq("id", id);

  if (error) throw error;

  // 🔄 property changed
  if (current.property_id !== data.propertyId) {
    if (current.property_id) {
      await supabase
        .from("properties")
        .update({ status: "Wolne" })
        .eq("id", current.property_id);
    }

    if (data.propertyId) {
      await supabase
        .from("properties")
        .update({ status: "Wynajęte" })
        .eq("id", data.propertyId);
    }
  }
}


export async function deleteTenant(id) {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("property_id")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("tenants")
    .delete()
    .eq("id", id);

  if (error) throw error;

  if (tenant?.property_id) {
    await supabase
      .from("properties")
      .update({ status: "Wolne" })
      .eq("id", tenant.property_id);
  }
}

