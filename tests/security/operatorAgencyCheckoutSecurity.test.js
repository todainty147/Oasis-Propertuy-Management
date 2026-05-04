import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mock Supabase ─────────────────────────────────────────────────────────────
const rpcMock = vi.fn();
vi.mock("../../src/lib/supabase.js", () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
}));

describe("getMyOaGrantStatus checkout URL security", () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it("returns checkout_url when status is pending_payment and not expired", async () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    rpcMock.mockResolvedValue({
      data: [{
        payment_status: "pending_payment",
        checkout_url: "https://checkout.stripe.com/pay/xyz",
        stripe_checkout_expires_at: future,
        subscription_start: "2026-06-01",
        subscription_end: null,
        unit_count: 10,
        activated_at: null,
      }],
      error: null,
    });
    const { getMyOaGrantStatus } = await import("../../src/services/operatorAgencyService.js");
    const status = await getMyOaGrantStatus("acct-a");
    expect(status.checkoutUrl).toBe("https://checkout.stripe.com/pay/xyz");
    expect(status.checkoutExpired).toBe(false);
  });

  it("marks checkout as expired when stripe_checkout_expires_at is in the past", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    rpcMock.mockResolvedValue({
      data: [{
        payment_status: "pending_payment",
        checkout_url: "https://checkout.stripe.com/pay/old",
        stripe_checkout_expires_at: past,
        subscription_start: "2026-06-01",
        subscription_end: null,
        unit_count: 10,
        activated_at: null,
      }],
      error: null,
    });
    const { getMyOaGrantStatus } = await import("../../src/services/operatorAgencyService.js");
    const status = await getMyOaGrantStatus("acct-a");
    expect(status.checkoutExpired).toBe(true);
  });

  it("returns null when no OA grant exists for account", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { getMyOaGrantStatus } = await import("../../src/services/operatorAgencyService.js");
    const status = await getMyOaGrantStatus("acct-b");
    expect(status).toBeNull();
  });

  it("returns null for null accountId without calling RPC", async () => {
    const { getMyOaGrantStatus } = await import("../../src/services/operatorAgencyService.js");
    const status = await getMyOaGrantStatus(null);
    expect(status).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns null when RPC returns permission denied error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const { getMyOaGrantStatus } = await import("../../src/services/operatorAgencyService.js");
    const status = await getMyOaGrantStatus("acct-c");
    expect(status).toBeNull();
  });

  it("throws on unexpected RPC errors (not permission denied)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "connection timeout" } });
    const { getMyOaGrantStatus } = await import("../../src/services/operatorAgencyService.js");
    await expect(getMyOaGrantStatus("acct-d")).rejects.toThrow();
  });
});

// ── generateOaCheckoutLink guards ─────────────────────────────────────────────

describe("generateOaCheckoutLink input guards", () => {
  it("throws when grantId is missing", async () => {
    const { generateOaCheckoutLink } = await import("../../src/services/operatorAgencyService.js");
    await expect(generateOaCheckoutLink({ accountId: "a" })).rejects.toThrow("Missing grantId");
  });
});

// ── activateOaPaymentLink guards ──────────────────────────────────────────────

describe("activateOaPaymentLink input guards", () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it("throws when grantId is missing", async () => {
    const { activateOaPaymentLink } = await import("../../src/services/operatorAgencyService.js");
    await expect(activateOaPaymentLink({ reason: "sent email" })).rejects.toThrow("Missing grantId");
  });

  it("throws when reason is blank", async () => {
    const { activateOaPaymentLink } = await import("../../src/services/operatorAgencyService.js");
    await expect(activateOaPaymentLink({ grantId: "g", reason: "" })).rejects.toThrow("reason is required");
  });

  it("calls activate_oa_payment_link RPC with correct params", async () => {
    rpcMock.mockResolvedValue({ error: null });
    const { activateOaPaymentLink } = await import("../../src/services/operatorAgencyService.js");
    await activateOaPaymentLink({ grantId: "grant-123", reason: "email sent to client" });
    expect(rpcMock).toHaveBeenCalledWith("activate_oa_payment_link", {
      p_grant_id: "grant-123",
      p_reason: "email sent to client",
    });
  });
});

// ── updateOaGrant guards ──────────────────────────────────────────────────────

describe("updateOaGrant input guards", () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it("throws when grantId is missing", async () => {
    const { updateOaGrant } = await import("../../src/services/operatorAgencyService.js");
    await expect(updateOaGrant({ unitCount: 10, reason: "r" })).rejects.toThrow("Missing grantId");
  });

  it("throws when unitCount <= 0", async () => {
    const { updateOaGrant } = await import("../../src/services/operatorAgencyService.js");
    await expect(updateOaGrant({ grantId: "g", unitCount: 0, reason: "r" }))
      .rejects.toThrow("unitCount must be a positive integer");
  });

  it("throws when reason is blank", async () => {
    const { updateOaGrant } = await import("../../src/services/operatorAgencyService.js");
    await expect(updateOaGrant({ grantId: "g", unitCount: 5, reason: "  " }))
      .rejects.toThrow("reason is required");
  });
});
