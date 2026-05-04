import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── SQL structural checks ─────────────────────────────────────────────────────

const sqlRoot = path.join(process.cwd(), "supabase");

function readSql(filename) {
  return fs.readFileSync(path.join(sqlRoot, filename), "utf8");
}

describe("trial_period_enforcement.sql structural checks", () => {
  const sql = readSql("trial_period_enforcement.sql");

  it("adds trial_ends_at column to accounts", () => {
    expect(sql).toMatch(/alter table public\.accounts/i);
    expect(sql).toMatch(/trial_ends_at\s+timestamptz/i);
  });

  it("adds trial_source column with valid check constraint", () => {
    expect(sql).toMatch(/trial_source.*text/i);
    expect(sql).toMatch(/self_serve_signup/);
    expect(sql).toMatch(/root_invite/);
    expect(sql).toMatch(/grandfathered/);
  });

  it("adds trial_extended_by_user_id referencing auth.users (not accounts)", () => {
    expect(sql).toMatch(/trial_extended_by_user_id.*uuid.*references.*auth\.users/i);
  });

  it("set_account_trial_end requires root operator check", () => {
    expect(sql).toMatch(/user_is_root_operator/);
  });

  it("set_account_trial_end rejects null or blank reason", () => {
    expect(sql).toMatch(/reason is required for trial date changes/i);
  });

  it("set_account_trial_end blocks setting trial on root accounts", () => {
    expect(sql).toMatch(/cannot set trial on a root account/i);
  });

  it("set_account_trial_end blocks setting trial when OA grant is active", () => {
    expect(sql).toMatch(/operator_agency_grants/i);
    expect(sql).toMatch(/trial dates do not apply/i);
  });

  it("remove_account_trial_cap is a separate RPC from set_account_trial_end", () => {
    expect(sql).toMatch(/create or replace function public\.set_account_trial_end/i);
    expect(sql).toMatch(/create or replace function public\.remove_account_trial_cap/i);
  });

  it("remove_account_trial_cap requires reason", () => {
    expect(sql).toMatch(/reason is required for trial cap removal/i);
  });

  it("both RPCs log a security event", () => {
    const logMatches = sql.match(/perform public\.log_security_event/gi) || [];
    expect(logMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("grants are revoke/grant scoped to authenticated only", () => {
    expect(sql).toMatch(/revoke all.*on function public\.set_account_trial_end.*from public/i);
    expect(sql).toMatch(/grant execute.*on function public\.set_account_trial_end.*to authenticated/i);
    expect(sql).toMatch(/revoke all.*on function public\.remove_account_trial_cap.*from public/i);
  });
});

describe("self_serve_landlord_signup.sql sets trial_ends_at", () => {
  const sql = readSql("self_serve_landlord_signup.sql");

  it("inserts trial_ends_at as now() + 14 days", () => {
    expect(sql).toMatch(/trial_ends_at/i);
    expect(sql).toMatch(/now\(\)\s*\+\s*interval\s*'14 days'/i);
  });

  it("sets trial_source to self_serve_signup", () => {
    expect(sql).toMatch(/self_serve_signup/);
  });
});

describe("create_landlord_invitation.sql sets trial_ends_at", () => {
  const sql = readSql("create_landlord_invitation.sql");

  it("inserts trial_ends_at as now() + 14 days", () => {
    expect(sql).toMatch(/trial_ends_at/i);
    expect(sql).toMatch(/now\(\)\s*\+\s*interval\s*'14 days'/i);
  });

  it("sets trial_source to root_invite", () => {
    expect(sql).toMatch(/root_invite/);
  });
});

// ── Service input guards ──────────────────────────────────────────────────────

const rpcMock = vi.fn();
vi.mock("../../src/lib/supabase.js", () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
}));

describe("operatorAgencyService trial RPCs — input guards", () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it("setAccountTrialEnd throws when targetAccountId is missing", async () => {
    const { setAccountTrialEnd } = await import("../../src/services/operatorAgencyService.js");
    await expect(setAccountTrialEnd({ reason: "test" })).rejects.toThrow("Missing targetAccountId");
  });

  it("setAccountTrialEnd throws when reason is missing", async () => {
    const { setAccountTrialEnd } = await import("../../src/services/operatorAgencyService.js");
    await expect(setAccountTrialEnd({ targetAccountId: "abc", reason: "" })).rejects.toThrow("reason is required");
  });

  it("removeAccountTrialCap throws when targetAccountId is missing", async () => {
    const { removeAccountTrialCap } = await import("../../src/services/operatorAgencyService.js");
    await expect(removeAccountTrialCap({ reason: "special" })).rejects.toThrow("Missing targetAccountId");
  });

  it("removeAccountTrialCap throws when reason is missing", async () => {
    const { removeAccountTrialCap } = await import("../../src/services/operatorAgencyService.js");
    await expect(removeAccountTrialCap({ targetAccountId: "abc" })).rejects.toThrow("reason is required");
  });

  it("setAccountTrialEnd calls set_account_trial_end RPC with correct params", async () => {
    rpcMock.mockResolvedValue({ error: null });
    const { setAccountTrialEnd } = await import("../../src/services/operatorAgencyService.js");
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    await setAccountTrialEnd({ targetAccountId: "acct-1", trialEndsAt: futureDate, reason: "sales request" });
    expect(rpcMock).toHaveBeenCalledWith("set_account_trial_end", expect.objectContaining({
      p_target_account_id: "acct-1",
      p_trial_ends_at: futureDate,
      p_reason: "sales request",
    }));
  });
});
