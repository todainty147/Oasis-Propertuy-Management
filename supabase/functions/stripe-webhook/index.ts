import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { safeErrorResponse } from "../_shared/safeErrorResponse.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2024-06-20",
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);

Deno.serve(async (req) => {
  try {
    const body = await req.text();
    const signature = req.headers.get("Stripe-Signature");

    if (!signature) {
      return new Response("Missing Stripe-Signature", { status: 400 });
    }

    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );

    const existing = await admin
      .from("billing_events")
      .select("id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();

    if (existing.data) {
      return new Response("Already processed", { status: 200 });
    }

    let resolvedAccountId: string | null = null;

    await admin.from("billing_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event,
    });

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const accountId = session.metadata?.account_id;
          if (accountId && session.customer) {
            resolvedAccountId = accountId;
            await admin.from("billing_customers").upsert({
              account_id: accountId,
              stripe_customer_id: String(session.customer),
              email: session.customer_details?.email || null,
            });
          }
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const accountId = sub.metadata?.account_id;
          const item = sub.items.data[0];

          if (accountId) {
            resolvedAccountId = accountId;
            const [{ data: existingAccount }, { data: existingSubscription }] = await Promise.all([
              admin
                .from("accounts")
                .select("subscription_plan, subscription_status")
                .eq("id", accountId)
                .maybeSingle(),
              admin
                .from("billing_subscriptions")
                .select("stripe_price_id, status")
                .eq("account_id", accountId)
                .maybeSingle(),
            ]);

            const nextPlan = sub.metadata?.plan_key || null;
            const nextStatus = sub.status;
            const nextPriceId = item?.price?.id || "";

            await admin.from("billing_subscriptions").upsert({
              account_id: accountId,
              stripe_customer_id: String(sub.customer),
              stripe_subscription_id: sub.id,
              stripe_price_id: nextPriceId,
              stripe_product_id:
                typeof item?.price?.product === "string" ? item.price.product : null,
              status: nextStatus,
              current_period_start: toIso(sub.current_period_start),
              current_period_end: toIso(sub.current_period_end),
              cancel_at_period_end: sub.cancel_at_period_end,
              trial_end: sub.trial_end ? toIso(sub.trial_end) : null,
              metadata: sub.metadata || {},
            });

            await admin
              .from("accounts")
              .update({
                subscription_status: nextStatus,
                subscription_plan: nextPlan,
                subscription_renews_at: toIso(sub.current_period_end),
                billing_locked_at: ["canceled", "unpaid", "incomplete_expired"].includes(nextStatus)
                  ? new Date().toISOString()
                  : null,
              })
              .eq("id", accountId);

            if (
              existingAccount?.subscription_plan !== nextPlan ||
              existingAccount?.subscription_status !== nextStatus ||
              existingSubscription?.stripe_price_id !== nextPriceId ||
              existingSubscription?.status !== nextStatus
            ) {
              const { error: securityLogError } = await admin.rpc("log_security_event", {
                p_account_id: accountId,
                p_action: "billing_plan_changed",
                p_entity_type: "account",
                p_entity_id: accountId,
                p_metadata: {
                  stripe_event_id: event.id,
                  stripe_subscription_id: sub.id,
                  old_plan: existingAccount?.subscription_plan || null,
                  new_plan: nextPlan,
                  old_status: existingAccount?.subscription_status || existingSubscription?.status || null,
                  new_status: nextStatus,
                  old_price_id: existingSubscription?.stripe_price_id || null,
                  new_price_id: nextPriceId || null,
                },
              });

              if (securityLogError) {
                throw securityLogError;
              }
            }
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = typeof invoice.customer === "string" ? invoice.customer : null;

          if (customerId) {
            const { data: customer } = await admin
              .from("billing_customers")
              .select("account_id")
              .eq("stripe_customer_id", customerId)
              .maybeSingle();

            if (customer?.account_id) {
              resolvedAccountId = customer.account_id;
              await admin
                .from("accounts")
                .update({ subscription_status: "past_due" })
                .eq("id", customer.account_id);
            }
          }
          break;
        }
      }

      await admin
        .from("billing_events")
        .update({
          account_id: resolvedAccountId,
          processed_at: new Date().toISOString(),
          processing_error: null,
        })
        .eq("stripe_event_id", event.id);

      return new Response("ok", { status: 200 });
    } catch (processingError) {
      const correlationId = crypto.randomUUID();
      await admin
        .from("billing_events")
        .update({
          account_id: resolvedAccountId,
          processed_at: new Date().toISOString(),
          processing_error: `Operation failed: ${correlationId}`,
        })
        .eq("stripe_event_id", event.id);

      return safeErrorResponse(req, {
        allowedOrigins: "",
        correlationId,
        error: processingError,
        functionName: "stripe-webhook",
        message: "Operation failed",
        status: 400,
        context: {
          stripeEventId: event.id,
          stripeEventType: event.type,
        },
      });
    }
  } catch (error) {
    return safeErrorResponse(req, {
      allowedOrigins: "",
      error,
      functionName: "stripe-webhook",
      message: "Invalid request",
      status: 400,
    });
  }
});

function toIso(value?: number | null) {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}
