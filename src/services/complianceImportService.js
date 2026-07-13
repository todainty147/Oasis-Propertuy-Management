import { supabase } from "../lib/supabase";

function isMissingBackendObject(error) {
  const msg = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    msg.includes("relation") ||
    msg.includes("does not exist")
  );
}

/**
 * Canonical imported-review predicate (P-009C2):
 *   is_attested_import = true
 *   AND scan_status IN ('overdue', 'due_soon', 'missing')
 *
 * Excludes: current, inactive, and native rows (import_batch_id IS NULL).
 * This is the single semantic authority for the account-level imported review count.
 */
export async function getImportedReviewCount(accountId) {
  if (!accountId) return 0;
  const { count, error } = await supabase
    .from("compliance_gap_unified")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("is_attested_import", true)
    .in("scan_status", ["overdue", "due_soon", "missing"]);
  if (error) {
    if (isMissingBackendObject(error)) return 0;
    throw error;
  }
  return count ?? 0;
}
