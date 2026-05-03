// src/services/activityLogService.js
import { supabase } from "../lib/supabase";
import { parseActivityLogRow, parseRpcRows } from "./rpcContracts";

export async function fetchActivityLog({
  accountId,
  entityType = null,
  entityId = null,
  propertyId = null,
  limit = 20,
} = {}) {
  if (!accountId) throw new Error("Brak accountId");

  let q = supabase
    .from("activity_log")
    .select(
      `
      id,
      account_id,
      entity_type,
      entity_id,
      action,
      field,
      old_value,
      new_value,
      actor_user_id,
      actor_role,
      meta,
      created_at
    `
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Entity-specific log
  if (entityType && entityId) {
    q = q.eq("entity_type", entityType).eq("entity_id", entityId);
  }

  // Property activity feed (requires meta.property_id set by triggers)
  if (propertyId) {
    q = q.filter("meta->>property_id", "eq", String(propertyId));
  }

  const { data, error } = await q;
  if (error) throw error;

  return parseRpcRows(data ?? [], parseActivityLogRow, "activity log rows");
}
