import { supabase } from "../lib/supabase";

export async function createProperty({
  address,
  city,
  tenantId = null,
  status = "Wolne",
}) {
  const { error } = await supabase
    .from("properties")
    .insert([
      {
        address,
        city,
        tenant_id: tenantId,
        status,
      },
    ]);

  if (error) {
    throw error;
  }
}
