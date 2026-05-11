import { supabase } from "../lib/supabase";

/** Simple base64 pseudo-hash used as a consistent per-email identifier. */
function emailHash(email) {
  return btoa(String(email || "").trim().toLowerCase());
}

/**
 * Records one auth attempt and returns whether it is allowed.
 *
 * @param {string} email   — the user's email (hashed before leaving the client)
 * @param {string} surface — 'auth_login' | 'auth_reset' | 'auth_signup' | 'auth_invite'
 * @returns {{ allowed: boolean, retryAfterSeconds: number }}
 */
export async function recordAuthRateLimitAttempt(email, surface) {
  try {
    const { data, error } = await supabase.rpc(
      "record_auth_rate_limit_attempt",
      {
        p_email_hash: emailHash(email),
        p_surface:    surface,
      },
    );

    if (error) {
      // On RPC failure (e.g. network), allow the attempt — don't silently block users
      console.warn("[authRateLimit] RPC failed, allowing attempt:", error.message);
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return {
      allowed:            Boolean(data?.allowed ?? true),
      retryAfterSeconds:  Number(data?.retry_after_seconds ?? 0),
    };
  } catch {
    // Never block users on client-side errors
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Formats a retry-after duration into a human-readable string (e.g. "14 min"). */
export function formatRetryAfter(seconds) {
  if (!seconds || seconds <= 0) return "";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.ceil(seconds / 60);
  return `${mins} min`;
}
