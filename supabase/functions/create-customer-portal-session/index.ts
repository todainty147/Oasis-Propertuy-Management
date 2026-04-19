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

    const { accountId } = await req.json();
    if (!accountId) {
      return respond({ error: "accountId is required" }, 400);
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

    const { data: customer, error: customerError } = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("account_id", accountId)
      .maybeSingle();

    if (customerError) {
      return safeError(req, customerError, 400, "Invalid request", { surface: "billing_customers" });
    }

    if (!customer?.stripe_customer_id) {
      return respond({ error: "No billing customer found for this account" }, 404);
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

    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${appUrl}/settings/billing`,
    });

    return respond({ url: portal.url });
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
    functionName: "create-customer-portal-session",
    message,
    status,
    context,
  });
}
