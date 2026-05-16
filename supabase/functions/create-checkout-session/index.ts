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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const APP_URL = Deno.env.get("APP_URL") || "";
const ALLOWED_APP_ORIGINS = Deno.env.get("ALLOWED_APP_ORIGINS") || "";
const STRIPE_TEST_TRIAL_DAYS = parsePositiveInt(Deno.env.get("STRIPE_TEST_TRIAL_DAYS"));

const PRICE_MAP: Record<string, string> = {
  starter: Deno.env.get("STRIPE_PRICE_STARTER") || "",
  growth: Deno.env.get("STRIPE_PRICE_GROWTH") || "",
  pro: Deno.env.get("STRIPE_PRICE_PRO") || "",
};

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const respond = (payload: unknown, status = 200) => json(req, payload, status);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(req, ALLOWED_APP_ORIGINS) });
  }

  try {
    if (req.method !== "POST") {
      return respond({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return respond({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const { accountId, planKey } = await req.json();
    if (!accountId || !planKey) {
      return respond({ error: "accountId and planKey are required" }, 400);
    }

    const normalizedPlanKey = String(planKey).trim().toLowerCase();
    if (!(normalizedPlanKey in PRICE_MAP)) {
      return respond({ error: "Invalid planKey" }, 400);
    }

    const priceId = PRICE_MAP[normalizedPlanKey];
    if (!priceId) {
      return respond(
        {
          error: `Stripe price is not configured for plan '${normalizedPlanKey}'`,
        },
        400,
      );
    }

    const appUrl = resolveAppUrl();
    if (!appUrl) {
      return respond(
        {
          error: "Trusted app origin is not configured",
          code: "trusted_app_origin_not_configured",
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
      return safeError(req, memberError, 400, "Invalid request", { surface: "account_members" });
    }

    if (
      !member ||
      !["owner", "admin", "staff"].includes(String(member.role || "").toLowerCase())
    ) {
      return respond({ error: "No permission for this account" }, 403);
    }

    const { data: account, error: accountError } = await admin
      .from("accounts")
      .select("id, name")
      .eq("id", accountId)
      .maybeSingle();

    if (accountError) {
      return safeError(req, accountError, 400, "Invalid request", { surface: "accounts" });
    }

    const { data: existingCustomer, error: existingCustomerError } = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("account_id", accountId)
      .maybeSingle();

    if (existingCustomerError) {
      return safeError(req, existingCustomerError, 400, "Invalid request", { surface: "billing_customers" });
    }

    let stripeCustomerId = existingCustomer?.stripe_customer_id || null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: account?.name || "Tenaqo Account",
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
        return safeError(req, upsertCustomerError, 400, "Operation failed", { surface: "billing_customers" });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/settings/billing?checkout=success`,
      cancel_url: `${appUrl}/settings/billing?checkout=cancelled`,
      allow_promotion_codes: true,
      payment_method_collection: STRIPE_TEST_TRIAL_DAYS > 0 ? "if_required" : "always",
      subscription_data: {
        ...(STRIPE_TEST_TRIAL_DAYS > 0
          ? { trial_period_days: STRIPE_TEST_TRIAL_DAYS }
          : {}),
        metadata: {
          account_id: String(accountId),
          plan_key: normalizedPlanKey,
          test_trial_days: STRIPE_TEST_TRIAL_DAYS > 0 ? String(STRIPE_TEST_TRIAL_DAYS) : "",
        },
      },
      metadata: {
        account_id: String(accountId),
        plan_key: normalizedPlanKey,
        test_trial_days: STRIPE_TEST_TRIAL_DAYS > 0 ? String(STRIPE_TEST_TRIAL_DAYS) : "",
      },
    });

    return respond({
      url: session.url,
      trialDays: STRIPE_TEST_TRIAL_DAYS,
    });
  } catch (error) {
    return safeError(req, error, 500, "Operation failed");
  }
});

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: buildJsonHeaders(req, ALLOWED_APP_ORIGINS),
  });
}

function resolveAppUrl() {
  return resolveTrustedAppOrigin({
    appUrl: APP_URL,
    allowedOrigins: ALLOWED_APP_ORIGINS,
  }).origin;
}

function safeError(
  req: Request,
  error: unknown,
  status: number,
  message: string,
  context: Record<string, unknown> = {},
) {
  return safeErrorResponse(req, {
    allowedOrigins: ALLOWED_APP_ORIGINS,
    error,
    functionName: "create-checkout-session",
    message,
    status,
    context,
  });
}

function parsePositiveInt(value: string | undefined) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
