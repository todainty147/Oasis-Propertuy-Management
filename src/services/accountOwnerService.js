import { supabase } from "../lib/supabase";
import { firstRpcRow, parseAccountOwnerContactRow } from "./rpcContracts";

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function isExpectedOptionalLookupError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42501" ||
    message.includes("access denied") ||
    message.includes("not authenticated") ||
    message.includes("invalid input syntax for type uuid")
  );
}

export async function getAccountOwnerContact(accountId) {
  if (!accountId) return null;
  const { data, error } = await supabase.rpc("get_account_owner_contact", {
    p_account_id: accountId,
  });

  if (error) {
    if (isMissingBackendObject(error) || isExpectedOptionalLookupError(error)) {
      return null;
    }
    throw error;
  }
  const row = firstRpcRow(data);
  if (!row) return null;
  return parseAccountOwnerContactRow(row);
}
