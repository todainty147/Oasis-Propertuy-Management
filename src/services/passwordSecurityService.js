import { supabase } from "../lib/supabase";

const LOCAL_STRONG_PASSWORD_PREFIX = "tenaqo_password_strong_at:";
const LOCAL_STRONG_PASSWORD_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

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

export function markLocalStrongPassword(userId) {
  if (!userId) return;
  try {
    localStorage.setItem(`${LOCAL_STRONG_PASSWORD_PREFIX}${userId}`, String(Date.now()));
  } catch {
    // ignore storage errors
  }
}

export function hasRecentLocalStrongPassword(userId, now = Date.now()) {
  if (!userId) return false;
  try {
    const value = Number(localStorage.getItem(`${LOCAL_STRONG_PASSWORD_PREFIX}${userId}`) || 0);
    return Number.isFinite(value) && value > 0 && now - value < LOCAL_STRONG_PASSWORD_MAX_AGE_MS;
  } catch {
    return false;
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
