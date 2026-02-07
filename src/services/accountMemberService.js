// src/services/accountMemberService.js
import { supabase } from "../lib/supabase";

/**
 * Returns auth user_ids for members of an account.
 * - If roles is provided, filters by those roles (exact match).
 * - If roles is empty/undefined, returns all members.
 * - Dedupe + remove nulls defensively.
 */
export async function getAccountUserIds(accountId, roles = null) {
  if (!accountId) throw new Error("getAccountUserIds: missing accountId");

  let q = supabase
    .from("account_members")
    .select("user_id, role")
    .eq("account_id", accountId);

  // Only apply role filter if roles is a non-empty array
  if (Array.isArray(roles) && roles.length > 0) {
    q = q.in("role", roles);
  }

  const { data, error } = await q;
  if (error) throw error;

  // Defensive: remove nulls + dedupe
  const ids = (data ?? [])
    .map((r) => r.user_id)
    .filter(Boolean);

  return Array.from(new Set(ids));
}
