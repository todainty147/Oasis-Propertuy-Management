import { supabase } from "../lib/supabase";

export async function getMaintenanceStats(accountId) {
  if (!accountId) return null;
  const { data, error } = await supabase.rpc("maintenance_dashboard_stats", {
    p_account_id: accountId,
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
}

export async function getMaintenanceAttention(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase.rpc("maintenance_attention_needed", {
    p_account_id: accountId,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
