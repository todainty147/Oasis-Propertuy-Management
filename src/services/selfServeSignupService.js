import { supabase } from "../lib/supabase";
import { firstRpcRow, parseSelfServeLandlordAccountResult } from "./rpcContracts";

export async function finalizeSelfServeLandlordAccount(accountName = "") {
  const { data, error } = await supabase.rpc("create_self_serve_landlord_account", {
    p_account_name: String(accountName || "").trim() || null,
  });

  if (error) throw error;
  return parseSelfServeLandlordAccountResult(firstRpcRow(data));
}
