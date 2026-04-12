import { supabase } from "../lib/supabase";
import {
  firstRpcRow,
  parseAccountSandboxStatusRow,
  parseSelfServeLandlordAccountResult,
} from "./rpcContracts";

export async function finalizeSelfServeLandlordAccount(accountName = "", options = {}) {
  const { data, error } = await supabase.rpc("create_self_serve_landlord_account", {
    p_account_name: String(accountName || "").trim() || null,
    p_sandbox_mode: Boolean(options.sandboxMode),
  });

  if (error) throw error;
  return parseSelfServeLandlordAccountResult(firstRpcRow(data));
}

export async function getAccountSandboxStatus(accountId) {
  if (!accountId) return null;

  const { data, error } = await supabase.rpc("get_account_sandbox_status", {
    p_account_id: accountId,
  });

  if (error) throw error;
  return parseAccountSandboxStatusRow(firstRpcRow(data));
}
