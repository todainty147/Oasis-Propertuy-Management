import { supabase } from "../lib/supabase";

/* ======================
   CREATE
   ====================== */

export async function createProperty({
  accountId, // ✅ REQUIRED for multi-tenancy
  address,
  city,
  size,
  rent,
  tenantId = null,
  ownerId,
}) {
  if (!accountId) {
    throw new Error("Brak accountId przy tworzeniu nieruchomości");
  }

  const { error } = await supabase
    .from("properties")
    .insert([
      {
        account_id: accountId, // ✅ MULTI-TENANT (CRITICAL)
        address,
        city,
        size,
        rent: Number(rent),
        tenant_id: tenantId,
        owner_id: ownerId,
      },
    ]);

  if (error) throw error;
}

/* ======================
   UPDATE
   ====================== */

export async function updateProperty(id, data) {
  const { error } = await supabase
    .from("properties")
    .update({
      address: data.address,
      city: data.city,
      size: data.size,
      rent: Number(data.rent),
      tenant_id: data.tenantId ?? null,
    })
    .eq("id", id);

  if (error) throw error;
}

/* ======================
   DELETE
   ====================== */

export async function deleteProperty(id) {
  const { error } = await supabase
    .from("properties")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
