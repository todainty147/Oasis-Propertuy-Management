import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Tests the hardened account_subscription_plan() SQL logic and the client-side
// normalizePlan/isLockedPlan/getPlanRank functions that mirror it.

// ── Client-side plan utilities ────────────────────────────────────────────────

import {
  normalizePlan,
  isLockedPlan,
  getPlanRank,
  hasFeature,
  PLAN_RANKS,
  LOCKED_PLAN_SENTINELS,
} from "../../src/lib/entitlements.js";

describe("normalizePlan — sentinel pass-through", () => {
  const sentinels = [
    "trial_expired",
    "operator_agency_pending",
    "oa_contract_expired",
    "billing_past_due_locked",
    "billing_locked",
  ];

  it.each(sentinels)("passes through '%s' unchanged", (sentinel) => {
    expect(normalizePlan(sentinel)).toBe(sentinel);
  });

  it("falls back to starter for unknown plan strings", () => {
    expect(normalizePlan("unknown_plan")).toBe("starter");
    expect(normalizePlan("")).toBe("starter");
    expect(normalizePlan(null)).toBe("starter");
    expect(normalizePlan(undefined)).toBe("starter");
  });

  it("normalizes valid plans correctly", () => {
    expect(normalizePlan("Starter")).toBe("starter");
    expect(normalizePlan("GROWTH")).toBe("growth");
    expect(normalizePlan("Pro")).toBe("pro");
    expect(normalizePlan("operator_agency")).toBe("operator_agency");
  });
});

describe("isLockedPlan", () => {
  it("returns true for all sentinel values", () => {
    for (const sentinel of LOCKED_PLAN_SENTINELS) {
      expect(isLockedPlan(sentinel)).toBe(true);
    }
  });

  it("returns false for real plan values", () => {
    expect(isLockedPlan("starter")).toBe(false);
    expect(isLockedPlan("growth")).toBe(false);
    expect(isLockedPlan("pro")).toBe(false);
    expect(isLockedPlan("operator_agency")).toBe(false);
  });
});

describe("getPlanRank — sentinels rank at 0", () => {
  it("all sentinel plans have rank 0", () => {
    for (const sentinel of LOCKED_PLAN_SENTINELS) {
      expect(getPlanRank(sentinel)).toBe(0);
    }
  });

  it("real plans have rank >= 1", () => {
    expect(getPlanRank("starter")).toBe(1);
    expect(getPlanRank("growth")).toBe(2);
    expect(getPlanRank("pro")).toBe(3);
    expect(getPlanRank("operator_agency")).toBe(4);
  });
});

describe("hasFeature — locked plans deny all paid features", () => {
  const lockedPlans = [...LOCKED_PLAN_SENTINELS];
  const paidFeatures = ["command_center", "portfolio_health", "maintenance_kpi",
    "playbooks", "security_audit", "ai_maintenance_triage"];

  it.each(lockedPlans)("plan '%s' denies all paid features", (plan) => {
    for (const feature of paidFeatures) {
      expect(hasFeature(plan, feature)).toBe(false);
    }
  });

  it("starter plan still has basic features", () => {
    expect(hasFeature("starter", "tenants")).toBe(true);
    expect(hasFeature("starter", "properties")).toBe(true);
    expect(hasFeature("starter", "maintenance")).toBe(true);
    expect(hasFeature("starter", "command_center")).toBe(false);
  });
});

// ── SQL structural checks ─────────────────────────────────────────────────────

describe("account_subscription_plan_hardened.sql structure", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/account_subscription_plan_hardened.sql"),
    "utf8",
  );

  it("adds rank 0 for all sentinel values", () => {
    const sentinels = ["trial_expired", "operator_agency_pending", "oa_contract_expired",
      "billing_past_due_locked", "billing_locked"];
    for (const s of sentinels) {
      expect(sql).toContain(`when '${s}'`);
      expect(sql).toContain("then 0");
    }
  });

  it("uses LATERAL subquery for billing_subscriptions (deterministic)", () => {
    expect(sql).toMatch(/left join lateral.*billing_subscriptions/is);
    expect(sql).toMatch(/limit 1/i);
  });

  it("uses LATERAL subquery for operator_agency_grants (deterministic)", () => {
    expect(sql).toMatch(/left join lateral.*operator_agency_grants/is);
  });

  it("root account unconditionally returns operator_agency", () => {
    expect(sql).toMatch(/when a\.is_root.*then.*operator_agency/is);
  });

  it("checks OA grant active before trial check", () => {
    const oaIdx      = sql.indexOf("oag.payment_status = 'active'");
    const trialIdx   = sql.indexOf("trial_ends_at is not null");
    expect(oaIdx).toBeGreaterThan(-1);
    expect(trialIdx).toBeGreaterThan(-1);
    expect(oaIdx).toBeLessThan(trialIdx);
  });

  it("returns trial_expired when trial_ends_at is in the past", () => {
    expect(sql).toMatch(/trial_ends_at.*<=.*now.*then.*trial_expired/is);
  });

  it("returns operator_agency_pending for draft/pending_checkout/pending_payment grants", () => {
    expect(sql).toMatch(/operator_agency_pending/);
    expect(sql).toMatch(/draft.*pending_checkout.*pending_payment|pending_checkout.*pending_payment/i);
  });

  it("past_due within 7 days still gets plan access", () => {
    expect(sql).toMatch(/past_due.*current_period_end.*now.*-.*interval.*7 days/is);
  });

  it("past_due beyond grace returns billing_past_due_locked", () => {
    expect(sql).toMatch(/billing_past_due_locked/);
  });

  it("canceled/unpaid/incomplete_expired returns billing_locked", () => {
    expect(sql).toMatch(/billing_locked/);
    expect(sql).toMatch(/canceled.*unpaid.*incomplete_expired/i);
  });

  it("7-day grace period applied for OA contract expiry", () => {
    expect(sql).toMatch(/subscription_end.*\+.*7.*>=.*current_date|subscription_end.*\+\s*7/i);
  });
});
