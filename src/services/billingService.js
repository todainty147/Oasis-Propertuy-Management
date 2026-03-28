import { supabase } from "../lib/supabase";
import { parseBillingSubscriptionRow, parseEdgeUrlResult } from "./rpcContracts";

async function invokeFunction(name, body, parser = null) {
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
    throw new Error(payload?.error || `Failed to call ${name}`);
  }
  return parser ? parser(payload || {}) : payload;
}

export async function startCheckout({ accountId, planKey }) {
  return invokeFunction("create-checkout-session", { accountId, planKey }, parseEdgeUrlResult);
}

export async function openCustomerPortal({ accountId }) {
  return invokeFunction("create-customer-portal-session", { accountId }, parseEdgeUrlResult);
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
