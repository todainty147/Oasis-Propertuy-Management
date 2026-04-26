import { supabase } from "../lib/supabase";
import {
  firstRpcRow,
  parseAccountSandboxStatusRow,
  parseSandboxFixtureSeedResult,
  parseSelfServeLandlordAccountResult,
} from "./rpcContracts";

export async function finalizeSelfServeLandlordAccount(accountName = "", options = {}) {
  const { data, error } = await supabase.rpc("create_self_serve_landlord_account", {
    p_account_name: String(accountName || "").trim() || null,
    p_sandbox_mode: Boolean(options.sandboxMode),
  });

  if (error) throw error;
  const row = parseSelfServeLandlordAccountResult(firstRpcRow(data));

  if (options.sandboxMode && row?.account_id) {
    await seedDemoAccountFixtures(row.account_id, { forceReset: false });
  }

  return row;
}

export async function getAccountSandboxStatus(accountId) {
  if (!accountId) return null;

  const { data, error } = await supabase.rpc("get_account_sandbox_status", {
    p_account_id: accountId,
  });

  if (error) throw error;
  return parseAccountSandboxStatusRow(firstRpcRow(data));
}

export async function seedDemoAccountFixtures(accountId, options = {}) {
  const { data, error } = await supabase.rpc("seed_demo_account_fixtures", {
    p_account_id: accountId,
    p_force_reset: Boolean(options.forceReset),
  });

  if (error) throw error;
  return parseSandboxFixtureSeedResult(firstRpcRow(data));
}

export async function resetDemoAccount(accountId) {
  const { data, error } = await supabase.rpc("reset_demo_account", {
    p_account_id: accountId,
  });

  if (error) throw error;
  return parseSandboxFixtureSeedResult(firstRpcRow(data));
}
