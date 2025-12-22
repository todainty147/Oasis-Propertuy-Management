import { supabase } from "../lib/supabase";

export async function createProperty({
  address,
  city,
  size,
  rent,
  tenantId = null,
  ownerId,
}) {
  const { error } = await supabase
    .from("properties")
    .insert([
      {
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
   DELETE (OPTIONAL)
   ====================== */
export async function deleteProperty(id) {
  const { error } = await supabase
    .from("properties")
    .delete()
    .eq("id", id);

  if (error) throw error;
}