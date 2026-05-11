import { supabase } from "../lib/supabase";

/**
 * Called after a v1-compliant password is set by an account member (owner/admin/staff).
 * Marks the user's security profile as 'strong' and logs to the audit trail.
 * Best-effort — never throws.
 */
export async function recordStrongPassword(accountId) {
  if (!accountId) {
    return recordOwnStrongPassword();
  }
  const { error } = await supabase.rpc("record_strong_password", {
    p_account_id: accountId,
  });
  if (error) {
    // Fall back to the account-agnostic variant (e.g. user is not an account member)
    console.warn("[passwordSecurity] record_strong_password failed, trying fallback:", error.message);
    await recordOwnStrongPassword();
  }
}

/**
 * Account-agnostic variant for tenants, contractors, and any flow where the
 * caller may not be in account_members (e.g. tenant invite acceptance, standalone reset).
 * Best-effort — never throws.
 */
export async function recordOwnStrongPassword() {
  const { error } = await supabase.rpc("record_own_strong_password");
  if (error) {
    console.warn("[passwordSecurity] record_own_strong_password failed:", error.message);
  }
}

/**
 * Returns the current user's own security posture, or null if not found.
 * Shape: { password_policy_version, password_strength_status, password_last_set_at,
 *           mfa_required, mfa_enrolled }
 */
export async function getOwnSecurityProfile() {
  const { data, error } = await supabase.rpc("get_own_security_profile");
  if (error || !data?.length) return null;
  return data[0];
}

/**
 * Returns all account members' security posture for managers.
 * Sorted worst-first (reset_required → legacy_weak → unknown → strong).
 */
export async function listAccountPasswordSecurity(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase.rpc("list_account_password_security", {
    p_account_id: accountId,
  });
  if (error) {
    console.warn("[passwordSecurity] list_account_password_security failed:", error.message);
    return [];
  }
  return data ?? [];
}
