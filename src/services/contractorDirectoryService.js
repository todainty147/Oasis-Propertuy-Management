import { supabase } from "../lib/supabase";
import { parseContractorDirectoryRow, parseRpcRows } from "./rpcContracts";

export async function listActiveContractors(accountId) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .from("contractors")
    .select("id, name, phone, email, user_id, active")
    .eq("account_id", accountId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return parseRpcRows(data || [], parseContractorDirectoryRow, "active contractor rows");
}

export async function countActiveContractors(accountId) {
  if (!accountId) return 0;

  const { count, error } = await supabase
    .from("contractors")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("active", true);

  if (error) throw error;
  return Number(count || 0);
}
