import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── Webhook code structural analysis ─────────────────────────────────────────
// Validates the stripe-webhook edge function has correct OA activation logic
// without being able to execute the Deno edge runtime.

const webhookSrc = fs.readFileSync(
  path.join(process.cwd(), "supabase/functions/stripe-webhook/index.ts"),
  "utf8",
);

describe("stripe-webhook OA activation: security checks in source", () => {
  it("checks plan_key === 'operator_agency' before activating OA grant", () => {
    expect(webhookSrc).toMatch(/planKey.*===.*operator_agency|plan_key.*===.*operator_agency/);
  });

  it("validates grant.account_id matches session metadata account_id", () => {
    expect(webhookSrc).toMatch(/grant\.account_id.*!==.*accountId|account_id.*mismatch/i);
  });

  it("validates stripe_checkout_session_id matches stored session ID", () => {
    expect(webhookSrc).toMatch(/stripe_checkout_session_id.*!==.*session\.id|session.*mismatch/i);
  });

  it("skips activation if grant is already active (idempotency)", () => {
    expect(webhookSrc).toMatch(/payment_status.*===.*active/);
    expect(webhookSrc).toMatch(/already activated|idempotency|break/i);
  });

  it("only activates if grant.payment_status is pending_payment", () => {
    expect(webhookSrc).toMatch(/payment_status.*!==.*pending_payment|not in pending_payment/i);
  });

  it("updates grant payment_status to active on success", () => {
    expect(webhookSrc).toMatch(/payment_status.*active/);
    expect(webhookSrc).toMatch(/activated_at/);
  });

  it("updates account subscription_plan to operator_agency on activation", () => {
    expect(webhookSrc).toMatch(/subscription_plan.*operator_agency/);
  });

  it("transitions grant to activation_failed on update error", () => {
    expect(webhookSrc).toMatch(/activation_failed/);
  });

  it("logs a security event for OA activation", () => {
    expect(webhookSrc).toMatch(/oa_grant_activated/);
  });

  it("logs error when grant_id is missing from metadata", () => {
    expect(webhookSrc).toMatch(/missing grant_id in metadata/i);
  });

  it("handles OA subscription cancellation when subscription is deleted", () => {
    expect(webhookSrc).toMatch(/nextStatus.*===.*canceled.*operator_agency|plan_key.*===.*operator_agency.*cancel/is);
    expect(webhookSrc).toMatch(/payment_status.*cancelled/);
  });
});

describe("stripe-webhook: existing idempotency check preserved", () => {
  it("still checks billing_events table for duplicate events", () => {
    expect(webhookSrc).toMatch(/billing_events/);
    expect(webhookSrc).toMatch(/stripe_event_id/);
    expect(webhookSrc).toMatch(/already processed/i);
  });
});

describe("create-oa-checkout-session: security checks in source", () => {
  const checkoutSrc = fs.readFileSync(
    path.join(process.cwd(), "supabase/functions/create-oa-checkout-session/index.ts"),
    "utf8",
  );

  it("verifies caller is authenticated before proceeding", () => {
    expect(checkoutSrc).toMatch(/auth\.getUser\(\)/);
  });

  it("verifies caller is a root operator", () => {
    expect(checkoutSrc).toMatch(/is_root.*true|is_root.*=.*true/i);
    expect(checkoutSrc).toMatch(/root operator required/i);
  });

  it("verifies grant is in draft status before creating Stripe session", () => {
    expect(checkoutSrc).toMatch(/payment_status.*!==.*draft|not in draft status/i);
  });

  it("sets payment_method_collection to always (no trial for OA)", () => {
    expect(checkoutSrc).toMatch(/payment_method_collection.*always/);
  });

  it("does NOT set trial_period_days on the OA subscription", () => {
    expect(checkoutSrc).not.toMatch(/trial_period_days/);
  });

  it("includes grant_id in Stripe metadata for webhook verification", () => {
    expect(checkoutSrc).toMatch(/grant_id/);
  });

  it("uses STRIPE_PRICE_OPERATOR_AGENCY env var", () => {
    expect(checkoutSrc).toMatch(/STRIPE_PRICE_OPERATOR_AGENCY/);
  });

  it("passes unit_count as quantity to Stripe line_items", () => {
    expect(checkoutSrc).toMatch(/quantity.*grant\.unit_count|unit_count.*quantity/i);
  });
});
