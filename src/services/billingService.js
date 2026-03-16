import { supabase } from "../lib/supabase";

async function invokeFunction(name, body) {
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
  return payload;
}

export async function startCheckout({ accountId, planKey }) {
  return invokeFunction("create-checkout-session", { accountId, planKey });
}

export async function openCustomerPortal({ accountId }) {
  return invokeFunction("create-customer-portal-session", { accountId });
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

  return data;
}

export function canWriteForBilling(status) {
  return ["active", "trialing", "past_due"].includes(String(status || ""));
}
