import { supabase } from "../lib/supabase";
import { parseRootTelemetrySupportAccessRow, parseRootTelemetrySupportOperatorRow, parseRpcRows } from "./rpcContracts";

function friendly(error, fallback) {
  return new Error(error?.message || fallback);
}

export async function listRootTelemetrySupportAccess(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase.rpc("root_telemetry_support_access_list", {
    p_account_id: accountId,
  });
  if (error) throw friendly(error, "Failed to load root telemetry support access");
  return parseRpcRows(data || [], parseRootTelemetrySupportAccessRow, "root_telemetry_support_access_list rows");
}

export async function grantRootTelemetrySupportAccess({
  accountId,
  userEmail,
  notes = "",
  expiresAt = null,
} = {}) {
  if (!accountId) throw new Error("Missing account id");
  if (!String(userEmail || "").trim()) throw new Error("Missing support user email");

  const { data, error } = await supabase.rpc("root_telemetry_support_access_grant", {
    p_account_id: accountId,
    p_user_email: String(userEmail || "").trim().toLowerCase(),
    p_notes: String(notes || "").trim() || null,
    p_expires_at: expiresAt || null,
  });
  if (error) throw friendly(error, "Failed to grant root telemetry support access");
  return parseRootTelemetrySupportAccessRow(data);
}

export async function revokeRootTelemetrySupportAccess({
  accountId,
  userId,
} = {}) {
  if (!accountId) throw new Error("Missing account id");
  if (!userId) throw new Error("Missing support user id");

  const { data, error } = await supabase.rpc("root_telemetry_support_access_revoke", {
    p_account_id: accountId,
    p_user_id: userId,
  });
  if (error) throw friendly(error, "Failed to revoke root telemetry support access");
  return parseRootTelemetrySupportAccessRow(data);
}

export async function searchRootTelemetrySupportOperators({ accountId, query = "", limit = 10 } = {}) {
  if (!accountId) return [];
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (normalizedQuery.length < 2) return [];

  const { data, error } = await supabase.rpc("root_telemetry_support_operator_directory", {
    p_account_id: accountId,
    p_query: normalizedQuery,
    p_limit: Math.min(Math.max(Number(limit) || 10, 1), 25),
  });
  if (error) throw friendly(error, "Failed to search support operators");
  return parseRpcRows(data || [], parseRootTelemetrySupportOperatorRow, "root_telemetry_support_operator_directory rows");
}
