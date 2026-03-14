import { supabase } from "../lib/supabase";

export async function finalizeSelfServeLandlordAccount(accountName = "") {
  const { data, error } = await supabase.rpc("create_self_serve_landlord_account", {
    p_account_name: String(accountName || "").trim() || null,
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

