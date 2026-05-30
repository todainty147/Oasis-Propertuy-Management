import { supabase } from "../lib/supabase";

const FOUNDER_OFFER_CODE = "FOUNDER20";

/**
 * Applies the founder launch offer to a newly created landlord account.
 * Non-blocking: never throws. Returns the raw RPC result or a synthetic
 * offer_check_failed object on any error.
 *
 * @param {{ accountId: string, userId: string, email: string, signupSource?: string }} opts
 * @returns {Promise<{ qualified: boolean, status: string, position?: number, remainingSlots?: number, effectivePlan?: string, billedPlan?: string, entitlementId?: string, message?: string }>}
 */
export async function applyFounderOffer({ accountId, userId, email, signupSource = "app_landlord_signup" }) {
  try {
    const { data, error } = await supabase.rpc("apply_founder_offer_on_landlord_signup", {
      p_offer_code:    FOUNDER_OFFER_CODE,
      p_account_id:    accountId,
      p_user_id:       userId,
      p_email:         email,
      p_signup_source: signupSource,
    });

    if (error) {
      console.warn("[founderOffer] RPC error:", error.code, error.message);
      return { qualified: false, status: "offer_check_failed" };
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result !== "object") {
      return { qualified: false, status: "offer_check_failed" };
    }

    return {
      qualified:      Boolean(result.qualified),
      status:         String(result.status || "offer_check_failed"),
      position:       result.position ?? null,
      remainingSlots: result.remaining_slots ?? null,
      effectivePlan:  result.effective_plan ?? null,
      billedPlan:     result.billed_plan ?? null,
      entitlementId:  result.entitlement_id ?? null,
      message:        result.message ?? null,
    };
  } catch (err) {
    console.warn("[founderOffer] Unexpected error:", err?.message);
    return { qualified: false, status: "offer_check_failed" };
  }
}

/**
 * Returns the active launch_offer entitlement for the given account, or null.
 * Used by AccountContext to expose isFounder and related state.
 *
 * @param {string} accountId
 * @returns {Promise<object|null>}
 */
export async function getAccountActiveEntitlement(accountId) {
  if (!accountId) return null;

  try {
    const { data, error } = await supabase
      .from("account_entitlements")
      .select("id, source, effective_plan, billed_plan, starts_at, ends_at, monthly_ai_credit_limit, metadata")
      .eq("account_id", accountId)
      .eq("is_active", true)
      .eq("source", "launch_offer")
      .gt("ends_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // ends_at filter will fail if the column doesn't exist yet (pre-migration)
      // Fail silently — entitlement is a non-critical enrichment
      return null;
    }

    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns founder offer slot usage. Root operators only.
 * @param {string} [offerCode]
 * @returns {Promise<object|null>}
 */
export async function getFounderOfferStatus(offerCode = FOUNDER_OFFER_CODE) {
  try {
    const { data, error } = await supabase.rpc("launch_offer_status", {
      p_offer_code: offerCode,
    });

    if (error) return null;

    const result = Array.isArray(data) ? data[0] : data;
    if (!result || typeof result !== "object") return null;

    return {
      offerCode:       result.offer_code,
      offerName:       result.offer_name,
      maxRedemptions:  result.max_redemptions,
      redeemedCount:   result.redeemed_count,
      cancelledCount:  result.cancelled_count,
      remainingSlots:  result.remaining_slots,
      lastRedeemedAt:  result.last_redeemed_at,
      isActive:        result.is_active,
      endsAt:          result.ends_at,
    };
  } catch {
    return null;
  }
}
