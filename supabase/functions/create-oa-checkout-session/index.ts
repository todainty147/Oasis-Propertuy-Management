import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  buildJsonHeaders,
  resolveTrustedAppOrigin,
} from "../_shared/trustedOrigin.ts";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2024-06-20",
});

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY        = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const APP_URL                  = Deno.env.get("APP_URL") || "";
const ALLOWED_APP_ORIGINS      = Deno.env.get("ALLOWED_APP_ORIGINS") || "";
const STRIPE_PRICE_OA          = Deno.env.get("STRIPE_PRICE_OPERATOR_AGENCY") || "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: buildJsonHeaders(req, ALLOWED_APP_ORIGINS),
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(req, ALLOWED_APP_ORIGINS) });
  }

  try {
    if (req.method !== "POST") {
      return respond({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond({ error: "Missing Authorization header" }, 401);

    // Verify caller is authenticated
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return respond({ error: "Unauthorized" }, 401);

    // Verify caller is a root operator
    const { data: rootMember, error: rootErr } = await admin
      .from("account_members")
      .select("account_id, accounts!inner(is_root)")
      .eq("user_id", user.id)
      .eq("accounts.is_root", true)
      .eq("role", "owner")
      .maybeSingle();

    if (rootErr || !rootMember) {
      return respond({ error: "Forbidden — root operator required" }, 403);
    }

    const { grantId } = await req.json();
    if (!grantId) return respond({ error: "grantId is required" }, 400);

    if (!STRIPE_PRICE_OA) {
      return respond({ error: "STRIPE_PRICE_OPERATOR_AGENCY is not configured" }, 500);
    }

    // Load grant — must be in draft status
    const { data: grant, error: grantErr } = await admin
      .from("operator_agency_grants")
      .select("id, account_id, unit_count, payment_status")
      .eq("id", grantId)
      .maybeSingle();

    if (grantErr || !grant) return respond({ error: "Grant not found" }, 404);
    if (grant.payment_status !== "draft") {
      return respond({ error: "Grant is not in draft status" }, 409);
    }

    // Resolve or create Stripe customer for the target account
    const { data: existingCustomer } = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("account_id", grant.account_id)
      .maybeSingle();

    let stripeCustomerId = existingCustomer?.stripe_customer_id || null;

    if (!stripeCustomerId) {
      const { data: acct } = await admin
        .from("accounts")
        .select("name")
        .eq("id", grant.account_id)
        .maybeSingle();

      const customer = await stripe.customers.create({
        name: acct?.name || "Tenaqo Account",
        metadata: { account_id: String(grant.account_id) },
      });
      stripeCustomerId = customer.id;

      await admin.from("billing_customers").upsert({
        account_id: grant.account_id,
        stripe_customer_id: stripeCustomerId,
      });
    }

    const appUrl = resolveTrustedAppOrigin({
      appUrl: APP_URL,
      allowedOrigins: ALLOWED_APP_ORIGINS,
    }).origin;

    // Create Stripe Checkout Session — OA must always require payment immediately
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: STRIPE_PRICE_OA, quantity: grant.unit_count }],
      success_url: `${appUrl}/settings/billing?oa_checkout=success`,
      cancel_url: `${appUrl}/settings/billing?oa_checkout=cancelled`,
      payment_method_collection: "always",  // No trial period for OA
      subscription_data: {
        metadata: {
          account_id: String(grant.account_id),
          grant_id: String(grant.id),
          plan_key: "operator_agency",
        },
      },
      metadata: {
        account_id: String(grant.account_id),
        grant_id: String(grant.id),
        plan_key: "operator_agency",
      },
    });

    // Stripe checkout sessions expire after 24 hours
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    // Record session details — use caller's JWT so RLS applies (root-only RPC)
    const { error: recordErr } = await userClient.rpc("record_oa_checkout_session", {
      p_grant_id:                    grant.id,
      p_stripe_checkout_session_id:  session.id,
      p_stripe_checkout_url:         session.url,
      p_stripe_checkout_expires_at:  expiresAt,
    });

    if (recordErr) {
      return safeErrorResponse(req, {
        allowedOrigins: ALLOWED_APP_ORIGINS,
        error: recordErr,
        functionName: "create-oa-checkout-session",
        message: "Failed to record checkout session",
        status: 500,
      });
    }

    return respond({ checkout_url: session.url, expires_at: expiresAt });
  } catch (error) {
    return safeErrorResponse(req, {
      allowedOrigins: ALLOWED_APP_ORIGINS,
      error,
      functionName: "create-oa-checkout-session",
      message: "Operation failed",
      status: 500,
    });
  }
});
