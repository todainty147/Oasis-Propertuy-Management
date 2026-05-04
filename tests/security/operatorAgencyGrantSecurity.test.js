import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sqlRoot = path.join(process.cwd(), "supabase");
function readSql(filename) {
  return fs.readFileSync(path.join(sqlRoot, filename), "utf8");
}

// ── SQL structural checks ─────────────────────────────────────────────────────

describe("operator_agency_grants.sql table structure", () => {
  const sql = readSql("operator_agency_grants.sql");

  it("has a unit_count > 0 CHECK constraint", () => {
    expect(sql).toMatch(/unit_count.*integer.*not null.*check.*unit_count\s*>\s*0/is);
  });

  it("has a dates_valid CHECK constraint", () => {
    expect(sql).toMatch(/subscription_end is null or subscription_end >= subscription_start/i);
  });

  it("has unique partial index preventing multiple active/pending grants per account", () => {
    expect(sql).toMatch(/create unique index.*operator_agency_grants_active_idx/i);
    expect(sql).toMatch(/pending_checkout.*pending_payment.*active|draft.*pending_checkout/i);
  });

  it("has unique index on stripe_checkout_session_id to prevent double-processing", () => {
    expect(sql).toMatch(/operator_agency_grants_checkout_session_idx/i);
  });

  it("has unique index on stripe_subscription_id", () => {
    expect(sql).toMatch(/operator_agency_grants_subscription_idx/i);
  });

  it("uses user-level audit fields (not just account-level)", () => {
    expect(sql).toMatch(/granted_by_user_id.*uuid.*references.*auth\.users/i);
    expect(sql).toMatch(/cancelled_by_user_id/i);
    expect(sql).toMatch(/updated_by_user_id/i);
  });

  it("has RLS enabled and root-only policy", () => {
    expect(sql).toMatch(/alter table public\.operator_agency_grants enable row level security/i);
    expect(sql).toMatch(/user_is_root_operator/);
  });

  it("has payment_status enum covering all lifecycle states", () => {
    for (const status of ["draft","pending_checkout","pending_payment","active","expired","cancelled","checkout_failed","activation_failed"]) {
      expect(sql).toContain(`'${status}'`);
    }
  });

  it("create_operator_agency_grant rejects missing targetAccountId, missing reason, unit_count<=0", () => {
    expect(sql).toMatch(/missing target account id/i);
    expect(sql).toMatch(/reason is required for oa grant creation/i);
    expect(sql).toMatch(/unit_count must be a positive integer/i);
  });

  it("create_operator_agency_grant blocks if active Stripe subscription exists", () => {
    expect(sql).toMatch(/active self-serve subscription/i);
  });

  it("create_operator_agency_grant clears trial_ends_at for OA accounts", () => {
    expect(sql).toMatch(/trial_ends_at\s*=\s*null/i);
  });

  it("create_operator_agency_grant logs a security event", () => {
    expect(sql).toMatch(/oa_grant_created/i);
  });

  it("cancel_operator_agency_grant requires cancellation reason", () => {
    expect(sql).toMatch(/cancellation reason is required/i);
  });

  it("get_my_oa_grant_status restricts checkout_url when expired", () => {
    // URL is only returned when status is pending_payment AND expiry is in the future
    expect(sql).toMatch(/stripe_checkout_expires_at.*>.*now\(\)/i);
    // Falls back to null (may span lines: "else null\n  end  as checkout_url")
    expect(sql).toMatch(/else null/i);
    expect(sql).toMatch(/as checkout_url/i);
  });

  it("get_my_oa_grant_status checks is_account_manager or root", () => {
    expect(sql).toMatch(/is_account_manager.*or.*user_is_root_operator/i);
  });
});

// ── Service input guards ──────────────────────────────────────────────────────

const rpcMock = vi.fn();
vi.mock("../../src/lib/supabase.js", () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
}));

describe("operatorAgencyService — createOaGrant input guards", () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it("throws when targetAccountId is missing", async () => {
    const { createOaGrant } = await import("../../src/services/operatorAgencyService.js");
    await expect(createOaGrant({ unitCount: 5, subscriptionStart: "2026-01-01", reason: "r" }))
      .rejects.toThrow("Missing targetAccountId");
  });

  it("throws when unitCount is zero", async () => {
    const { createOaGrant } = await import("../../src/services/operatorAgencyService.js");
    await expect(createOaGrant({ targetAccountId: "a", unitCount: 0, subscriptionStart: "2026-01-01", reason: "r" }))
      .rejects.toThrow("unitCount must be a positive integer");
  });

  it("throws when unitCount is negative", async () => {
    const { createOaGrant } = await import("../../src/services/operatorAgencyService.js");
    await expect(createOaGrant({ targetAccountId: "a", unitCount: -3, subscriptionStart: "2026-01-01", reason: "r" }))
      .rejects.toThrow("unitCount must be a positive integer");
  });

  it("throws when subscriptionStart is missing", async () => {
    const { createOaGrant } = await import("../../src/services/operatorAgencyService.js");
    await expect(createOaGrant({ targetAccountId: "a", unitCount: 5, reason: "r" }))
      .rejects.toThrow("subscriptionStart is required");
  });

  it("throws when reason is blank", async () => {
    const { createOaGrant } = await import("../../src/services/operatorAgencyService.js");
    await expect(createOaGrant({ targetAccountId: "a", unitCount: 5, subscriptionStart: "2026-01-01", reason: "  " }))
      .rejects.toThrow("reason is required");
  });

  it("calls create_operator_agency_grant RPC with correct params", async () => {
    rpcMock.mockResolvedValue({ data: "grant-uuid", error: null });
    const { createOaGrant } = await import("../../src/services/operatorAgencyService.js");
    const result = await createOaGrant({
      targetAccountId: "acct-1", unitCount: 10,
      subscriptionStart: "2026-06-01", subscriptionEnd: "2027-05-31",
      reason: "sales agreed",
    });
    expect(result).toBe("grant-uuid");
    expect(rpcMock).toHaveBeenCalledWith("create_operator_agency_grant", expect.objectContaining({
      p_target_account_id:  "acct-1",
      p_unit_count:         10,
      p_subscription_start: "2026-06-01",
      p_subscription_end:   "2027-05-31",
      p_reason:             "sales agreed",
    }));
  });
});

describe("operatorAgencyService — cancelOaGrant input guards", () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it("throws when grantId is missing", async () => {
    const { cancelOaGrant } = await import("../../src/services/operatorAgencyService.js");
    await expect(cancelOaGrant({ cancellationReason: "r" })).rejects.toThrow("Missing grantId");
  });

  it("throws when cancellationReason is blank", async () => {
    const { cancelOaGrant } = await import("../../src/services/operatorAgencyService.js");
    await expect(cancelOaGrant({ grantId: "g", cancellationReason: "" }))
      .rejects.toThrow("cancellationReason is required");
  });
});

describe("operatorAgencyService — getMyOaGrantStatus", () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it("returns null when accountId is missing", async () => {
    const { getMyOaGrantStatus } = await import("../../src/services/operatorAgencyService.js");
    const result = await getMyOaGrantStatus(null);
    expect(result).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns null when RPC returns permission denied", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const { getMyOaGrantStatus } = await import("../../src/services/operatorAgencyService.js");
    const result = await getMyOaGrantStatus("some-account");
    expect(result).toBeNull();
  });

  it("maps checkout_url and checkoutExpired correctly for pending grant", async () => {
    const futureExpiry = new Date(Date.now() + 3600000).toISOString();
    rpcMock.mockResolvedValue({
      data: [{
        payment_status: "pending_payment",
        subscription_start: "2026-06-01",
        subscription_end: "2027-05-31",
        unit_count: 25,
        checkout_url: "https://checkout.stripe.com/pay/abc123",
        stripe_checkout_expires_at: futureExpiry,
        activated_at: null,
      }],
      error: null,
    });
    const { getMyOaGrantStatus } = await import("../../src/services/operatorAgencyService.js");
    const result = await getMyOaGrantStatus("acct-1");
    expect(result.paymentStatus).toBe("pending_payment");
    expect(result.checkoutUrl).toBe("https://checkout.stripe.com/pay/abc123");
    expect(result.checkoutExpired).toBe(false);
  });

  it("marks checkoutExpired true when expiry is in the past", async () => {
    const pastExpiry = new Date(Date.now() - 3600000).toISOString();
    rpcMock.mockResolvedValue({
      data: [{
        payment_status: "pending_payment",
        checkout_url: "https://checkout.stripe.com/pay/old",
        stripe_checkout_expires_at: pastExpiry,
      }],
      error: null,
    });
    const { getMyOaGrantStatus } = await import("../../src/services/operatorAgencyService.js");
    const result = await getMyOaGrantStatus("acct-1");
    expect(result.checkoutExpired).toBe(true);
  });
});
