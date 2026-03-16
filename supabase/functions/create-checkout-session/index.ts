import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2024-06-20",
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "";

const PRICE_MAP: Record<string, string> = {
  starter: Deno.env.get("STRIPE_PRICE_STARTER") || "",
  growth: Deno.env.get("STRIPE_PRICE_GROWTH") || "",
  pro: Deno.env.get("STRIPE_PRICE_PRO") || "",
};

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { accountId, planKey } = await req.json();
    if (!accountId || !planKey) {
      return json({ error: "accountId and planKey are required" }, 400);
    }

    const normalizedPlanKey = String(planKey).trim().toLowerCase();
    if (!(normalizedPlanKey in PRICE_MAP)) {
      return json({ error: "Invalid planKey" }, 400);
    }

    const priceId = PRICE_MAP[normalizedPlanKey];
    if (!priceId) {
      return json(
        {
          error: `Stripe price is not configured for plan '${normalizedPlanKey}'`,
        },
        400,
      );
    }

    const { data: member, error: memberError } = await admin
      .from("account_members")
      .select("role")
      .eq("account_id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError) {
      return json({ error: memberError.message }, 400);
    }

    if (
      !member ||
      !["owner", "admin", "staff"].includes(String(member.role || "").toLowerCase())
    ) {
      return json({ error: "No permission for this account" }, 403);
    }

    const { data: account, error: accountError } = await admin
      .from("accounts")
      .select("id, name")
      .eq("id", accountId)
      .maybeSingle();

    if (accountError) {
      return json({ error: accountError.message }, 400);
    }

    const { data: existingCustomer, error: existingCustomerError } = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("account_id", accountId)
      .maybeSingle();

    if (existingCustomerError) {
      return json({ error: existingCustomerError.message }, 400);
    }

    let stripeCustomerId = existingCustomer?.stripe_customer_id || null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: account?.name || "OASIS Account",
        metadata: {
          account_id: String(accountId),
        },
      });

      stripeCustomerId = customer.id;

      const { error: upsertCustomerError } = await admin.from("billing_customers").upsert({
        account_id: accountId,
        stripe_customer_id: stripeCustomerId,
        email: user.email || null,
      });

      if (upsertCustomerError) {
        return json({ error: upsertCustomerError.message }, 400);
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/settings/billing?checkout=success`,
      cancel_url: `${APP_URL}/settings/billing?checkout=cancelled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          account_id: String(accountId),
          plan_key: normalizedPlanKey,
        },
      },
      metadata: {
        account_id: String(accountId),
        plan_key: normalizedPlanKey,
      },
    });

    return json({ url: session.url });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
