import { supabase } from "../lib/supabase";
import { buildEdgeFunctionFailure } from "./edgeFunctionFailure";
import { logSecurityRelevantFailure } from "./securityFailureLogger";
import { parseBillingSubscriptionRow, parseEdgeUrlResult } from "./rpcContracts";

async function invokeFunction(name, body, parser = null, context = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;
  if (!token) {
    throw new Error("Missing auth session");
  }

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
  );

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const error = buildEdgeFunctionFailure({
      payload,
      status: res.status,
      surface: name,
      fallback: `Failed to call ${name}`,
      accountId: context.accountId || body?.accountId || null,
      entityType: "account",
      entityId: context.accountId || body?.accountId || null,
    });
    logSecurityRelevantFailure(name, {
      error,
      context: {
        accountId: context.accountId || body?.accountId || null,
        planKey: body?.planKey || null,
        providerStatus: res.status,
        edgeFunction: name,
      },
    });
    throw error;
  }
  return parser ? parser(payload || {}) : payload;
}

export async function startCheckout({ accountId, planKey }) {
  return invokeFunction(
    "create-checkout-session",
    { accountId, planKey },
    parseEdgeUrlResult,
    { accountId },
  );
}

export async function openCustomerPortal({ accountId }) {
  return invokeFunction(
    "create-customer-portal-session",
    { accountId },
    parseEdgeUrlResult,
    { accountId },
  );
}

export async function getBillingSubscription(accountId) {
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST205" || /relation .*billing_subscriptions/i.test(error.message || "")) {
      return null;
    }
    throw error;
  }

  return data ? parseBillingSubscriptionRow(data) : null;
}

export function canWriteForBilling(status) {
  return ["active", "trialing", "past_due"].includes(String(status || ""));
}

// Returns true when the account has confirmed billing access (active or trialing Stripe
// subscription, OR an active OA grant). Does NOT gate OASIS trial-period access.
export function hasConfirmedBillingAccess(subscriptionStatus, oaPaymentStatus) {
  if (["active", "trialing"].includes(String(subscriptionStatus || ""))) return true;
  if (oaPaymentStatus === "active") return true;
  return false;
}
