import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { isLiveStripeBillingEnabled, LIVE_STRIPE_BILLING_FLAG } from "../../src/config/pilotBillingMode.js";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("pilot billing mode contracts", () => {
  const billingPage = read("src/pages/BillingPage.jsx");
  const messages = read("src/i18n/messages.js");
  const rootAccountsPage = read("src/pages/admin/RootAccountsPage.jsx");
  const accountContext = read("src/context/AccountContext.jsx");
  const entitlements = read("src/lib/entitlements.js");
  const founderService = read("src/services/founderOfferService.js");
  const pricingContent = read("marketing-site/content/pricing.ts");
  const doc = read("docs/release/pilot-billing-mode.md");

  it("keeps live Stripe billing behind an explicit cutover flag", () => {
    expect(LIVE_STRIPE_BILLING_FLAG).toBe("VITE_STRIPE_LIVE_BILLING_ENABLED");
    expect(isLiveStripeBillingEnabled({})).toBe(false);
    expect(isLiveStripeBillingEnabled({ VITE_STRIPE_LIVE_BILLING_ENABLED: "false" })).toBe(false);
    expect(isLiveStripeBillingEnabled({ VITE_STRIPE_LIVE_BILLING_ENABLED: "true" })).toBe(true);
    expect(isLiveStripeBillingEnabled({ VITE_STRIPE_LIVE_BILLING_ENABLED: "live" })).toBe(true);
  });

  it("shows manual pilot billing copy and no-auto-charge promise in the billing page", () => {
    expect(billingPage).toContain("pilot-billing-mode-banner");
    expect(billingPage).toContain("billing.pilotNoAutoCharge");
    expect(billingPage).toContain("billing.pilotManualBilling");
    expect(billingPage).toContain("billing.pilotContactToContinue");
    expect(messages).toContain("You are on an early access trial. You will not be charged automatically.");
    expect(messages).toContain("Billing is currently handled manually by the Tenaqo team during the pilot.");
  });

  it("guards checkout and portal calls when live Stripe billing is disabled", () => {
    const checkoutBlock = billingPage.slice(
      billingPage.indexOf("async function handleCheckout"),
      billingPage.indexOf("async function handlePortal"),
    );
    const portalBlock = billingPage.slice(
      billingPage.indexOf("async function handlePortal"),
      billingPage.indexOf("if (!canManageBilling)"),
    );
    expect(checkoutBlock).toContain("if (!liveStripeBillingEnabled)");
    expect(checkoutBlock).toContain("billing.liveBillingUnavailable");
    expect(checkoutBlock).toContain("startCheckout");
    expect(portalBlock).toContain("if (!liveStripeBillingEnabled)");
    expect(portalBlock).toContain("billing.liveBillingUnavailable");
    expect(portalBlock).toContain("openCustomerPortal");
  });

  it("replaces normal pilot checkout and portal CTAs with contact actions", () => {
    expect(billingPage).toContain("liveStripeBillingEnabled ? (");
    expect(billingPage).toContain("billing.manageManual");
    expect(billingPage).toContain("billing.contactToActivate");
    expect(billingPage).toContain("mailto:${billingEmail}");
    expect(messages).toContain("Live Stripe checkout is not enabled for this pilot.");
  });

  it("documents trial expiry as a soft manual contact flow, not a zero-price payment flow", () => {
    expect(accountContext).toContain('if (activePlan === "trial_expired") return "locked_trial";');
    expect(entitlements).toContain("trial_expired:");
    expect(entitlements).toContain("rank 0");
    expect(billingPage).toContain("billing.trialExpiredManual");
    expect(messages).toContain("Your early access trial has ended.");
    expect(billingPage).not.toMatch(/0\.00|£0|free forever/i);
    expect(doc).not.toMatch(/0\.00|£0|free forever/i);
  });

  it("keeps founder offer and root account management visible but gated", () => {
    expect(founderService).toContain('const FOUNDER_OFFER_CODE = "FOUNDER20"');
    expect(founderService).toContain("launch_offer_status");
    expect(founderService).toContain('source", "launch_offer"');
    expect(rootAccountsPage).toContain("Root operator access required.");
    expect(rootAccountsPage).toContain("FounderOfferStatusCard");
    expect(rootAccountsPage).toContain("trial_expiring");
    expect(rootAccountsPage).toContain("trial_expired");
    expect(rootAccountsPage).toContain("setAccountTrialEnd");
    expect(rootAccountsPage).toContain("removeAccountTrialCap");
  });

  it("keeps public pricing CTA out of direct Stripe checkout", () => {
    expect(pricingContent).toContain('planCtaLabel: "See how Tenaqo works"');
    expect(pricingContent).not.toMatch(/checkout\.stripe|create-checkout-session|Subscribe now/i);
  });

  it("has the pilot billing release runbook", () => {
    expect(doc).toContain("Stripe status: sandbox/test until live cutover");
    expect(doc).toContain("will not automatically charge");
    expect(doc).toContain("Trial Behaviour");
    expect(doc).toContain("Founder Offer Behaviour");
    expect(doc).toContain("Live Cutover Checklist Placeholder");
    expect(doc).toContain("VITE_STRIPE_LIVE_BILLING_ENABLED=true");
  });
});
