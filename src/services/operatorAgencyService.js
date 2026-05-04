import { supabase } from "../lib/supabase";

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

// ── Account-facing ────────────────────────────────────────────────────────────

export async function getMyOaGrantStatus(accountId) {
  if (!accountId) return null;
  const { data, error } = await supabase.rpc("get_my_oa_grant_status", {
    p_account_id: accountId,
  });
  if (error) {
    if (/permission denied/i.test(error.message || "")) return null;
    throw friendly(error, "Failed to load OA grant status");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    paymentStatus:           row.payment_status,
    subscriptionStart:       row.subscription_start,
    subscriptionEnd:         row.subscription_end,
    unitCount:               row.unit_count,
    checkoutUrl:             row.checkout_url,
    stripeCheckoutExpiresAt: row.stripe_checkout_expires_at,
    activatedAt:             row.activated_at,
    checkoutExpired: row.stripe_checkout_expires_at
      ? new Date(row.stripe_checkout_expires_at) <= new Date()
      : false,
  };
}

// ── Root operator ─────────────────────────────────────────────────────────────

export async function rootListAccountsWithBilling(rootAccountId) {
  if (!rootAccountId) return [];
  const { data, error } = await supabase.rpc("root_list_accounts_with_billing", {
    p_root_account_id: rootAccountId,
  });
  if (error) throw friendly(error, "Failed to load accounts with billing");
  return (data || []).map((r) => ({
    id:                 r.id,
    name:               r.name,
    isRoot:             Boolean(r.is_root),
    isDisabled:         Boolean(r.is_disabled),
    subscriptionPlan:   r.subscription_plan,
    subscriptionStatus: r.subscription_status,
    trialEndsAt:        r.trial_ends_at,
    trialSource:        r.trial_source,
    oaPaymentStatus:    r.oa_payment_status,
    oaSubscriptionEnd:  r.oa_subscription_end,
    oaUnitCount:        r.oa_unit_count,
    createdAt:          r.created_at,
  }));
}

export async function createOaGrant({
  targetAccountId,
  unitCount,
  subscriptionStart,
  subscriptionEnd,
  reason,
}) {
  if (!targetAccountId) throw new Error("Missing targetAccountId");
  if (!unitCount || unitCount <= 0) throw new Error("unitCount must be a positive integer");
  if (!subscriptionStart) throw new Error("subscriptionStart is required");
  if (!reason?.trim()) throw new Error("reason is required");

  const { data, error } = await supabase.rpc("create_operator_agency_grant", {
    p_target_account_id:  targetAccountId,
    p_unit_count:         unitCount,
    p_subscription_start: subscriptionStart,
    p_subscription_end:   subscriptionEnd || null,
    p_reason:             reason,
  });
  if (error) throw friendly(error, "Failed to create OA grant");
  return data; // grant id
}

export async function generateOaCheckoutLink({ grantId, accountId }) {
  if (!grantId) throw new Error("Missing grantId");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Missing auth session");

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-oa-checkout-session`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ grantId, accountId }),
    },
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || "Failed to generate checkout link");
  return payload; // { checkout_url, expires_at }
}

export async function activateOaPaymentLink({ grantId, reason }) {
  if (!grantId) throw new Error("Missing grantId");
  if (!reason?.trim()) throw new Error("reason is required");
  const { error } = await supabase.rpc("activate_oa_payment_link", {
    p_grant_id: grantId,
    p_reason:   reason,
  });
  if (error) throw friendly(error, "Failed to activate payment link");
}

export async function updateOaGrant({ grantId, subscriptionEnd, unitCount, reason }) {
  if (!grantId) throw new Error("Missing grantId");
  if (!unitCount || unitCount <= 0) throw new Error("unitCount must be a positive integer");
  if (!reason?.trim()) throw new Error("reason is required");
  const { error } = await supabase.rpc("update_operator_agency_grant", {
    p_grant_id:         grantId,
    p_subscription_end: subscriptionEnd || null,
    p_unit_count:       unitCount,
    p_reason:           reason,
  });
  if (error) throw friendly(error, "Failed to update OA grant");
}

export async function cancelOaGrant({ grantId, immediate = true, cancellationReason }) {
  if (!grantId) throw new Error("Missing grantId");
  if (!cancellationReason?.trim()) throw new Error("cancellationReason is required");
  const { error } = await supabase.rpc("cancel_operator_agency_grant", {
    p_grant_id:             grantId,
    p_immediate:            immediate,
    p_cancellation_reason:  cancellationReason,
  });
  if (error) throw friendly(error, "Failed to cancel OA grant");
}

export async function setAccountTrialEnd({ targetAccountId, trialEndsAt, reason }) {
  if (!targetAccountId) throw new Error("Missing targetAccountId");
  if (!reason?.trim()) throw new Error("reason is required");
  const { error } = await supabase.rpc("set_account_trial_end", {
    p_target_account_id: targetAccountId,
    p_trial_ends_at:     trialEndsAt,
    p_reason:            reason,
  });
  if (error) throw friendly(error, "Failed to set trial end date");
}

export async function removeAccountTrialCap({ targetAccountId, reason }) {
  if (!targetAccountId) throw new Error("Missing targetAccountId");
  if (!reason?.trim()) throw new Error("reason is required");
  const { error } = await supabase.rpc("remove_account_trial_cap", {
    p_target_account_id: targetAccountId,
    p_reason:            reason,
  });
  if (error) throw friendly(error, "Failed to remove trial cap");
}
