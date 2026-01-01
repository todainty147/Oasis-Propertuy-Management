import { supabase } from "../lib/supabase";

/* ======================
   CREATE
   ====================== */

export async function createTenant({
  accountId, // ✅ REQUIRED for multi-tenancy
  name,
  email,
  phone,
  propertyId = null,
}) {
  if (!accountId) {
    throw new Error("Brak accountId przy tworzeniu najemcy");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Brak sesji użytkownika");

  const { data: tenant, error } = await supabase
    .from("tenants")
    .insert({
      account_id: accountId, // ✅ MULTI-TENANT (CRITICAL)
      owner_id: user.id,     // creator / legacy owner
      name,
      email,
      phone,
      property_id: propertyId,
    })
    .select()
    .single();

  if (error) throw error;

  // 🔄 keep your property status sync logic (RLS enforces account)
  if (propertyId) {
    await supabase
      .from("properties")
      .update({ status: "Wynajęte" })
      .eq("id", propertyId);
  }

  return tenant;
}

/* ======================
   UPDATE
   ====================== */

export async function updateTenant(id, data) {
  // fetch current tenant (to detect property change)
  const { data: current, error: currentError } = await supabase
    .from("tenants")
    .select("property_id")
    .eq("id", id)
    .single();

  if (currentError) throw currentError;

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

/* ======================
   DELETE
   ====================== */

export async function deleteTenant(id) {
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("property_id")
    .eq("id", id)
    .single();

  if (tenantError) throw tenantError;

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
