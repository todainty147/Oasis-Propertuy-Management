import { supabase } from "../lib/supabase";
import {
  parseRootAccountMutationRow,
  parseRootAccountRow,
  parseRpcRows,
} from "./rpcContracts";

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

export async function rootListAccounts(rootAccountId) {
  if (!rootAccountId) return [];
  const { data, error } = await supabase.rpc("root_list_accounts", {
    p_root_account_id: rootAccountId,
  });
  if (error) throw friendly(error, "Failed to load root accounts");
  return parseRpcRows(data || [], parseRootAccountRow, "root_list_accounts rows");
}

export async function rootSetAccountDisabled({
  rootAccountId,
  targetAccountId,
  disabled,
} = {}) {
  if (!rootAccountId) throw new Error("Missing root account id");
  if (!targetAccountId) throw new Error("Missing target account id");
  const { data, error } = await supabase.rpc("root_set_account_disabled", {
    p_root_account_id: rootAccountId,
    p_target_account_id: targetAccountId,
    p_disabled: Boolean(disabled),
  });
  if (error) throw friendly(error, "Failed to update account status");
  return parseRootAccountMutationRow(data);
}

export async function rootDeleteAccount({
  rootAccountId,
  targetAccountId,
} = {}) {
  if (!rootAccountId) throw new Error("Missing root account id");
  if (!targetAccountId) throw new Error("Missing target account id");
  const { data, error } = await supabase.rpc("root_delete_account", {
    p_root_account_id: rootAccountId,
    p_target_account_id: targetAccountId,
  });
  if (error) throw friendly(error, "Failed to delete account");
  return parseRootAccountMutationRow(data);
}
