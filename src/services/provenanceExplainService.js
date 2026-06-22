import { supabase } from "../lib/supabase";

export async function explainPropertyBalance(propertyId) {
  const { data, error } = await supabase.rpc("explain_property_balance", {
    p_property_id: propertyId,
  });
  if (error) throw error;
  return data;
}
