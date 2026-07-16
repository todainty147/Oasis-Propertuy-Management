/**
 * Gate-B-ENT: Authoritative effective entitlement resolver.
 *
 * Proves end-to-end that account_has_effective_feature() enforces the correct
 * precedence for all registered feature access paths, and that
 * deposit_pack_account_has_entitlement() continues to behave identically after
 * it was migrated to delegate to the shared resolver.
 *
 * Test inventory:
 *   ENT-S1  Static: SQL file contains evidence_vault_dispute_pack → growth fix
 *   ENT-S2  Static: SQL file contains renters_rights_readiness → growth
 *   ENT-S3  Static: SQL file contains maintenance_evidence_pack → growth
 *   ENT-S4  Static: account_has_effective_feature is defined in SQL file
 *   ENT-S5  Static: SQL file implements explicit deny (enabled=false → false branch)
 *   ENT-S6  Static: SQL catalogue has exactly 79 entries (7 starter + 38 growth + 19 pro + 3 OA + 12 flag-only)
 *   ENT-S7  Static: every JS ENTITLEMENT_FEATURES key is registered in the SQL catalogue
 *
 *   ENT-01  Pro plan → evidence_vault_dispute_pack → true
 *   ENT-02  Growth plan → evidence_vault_dispute_pack → true
 *   ENT-03  Starter plan → evidence_vault_dispute_pack → false
 *   ENT-04  Root account → evidence_vault_dispute_pack → true (operator_agency rank)
 *   ENT-05  Starter + enabled flag → evidence_vault_dispute_pack → true
 *   ENT-06  Starter + disabled flag (enabled=false) → evidence_vault_dispute_pack → false
 *   ENT-07  Unregistered feature key → false
 *   ENT-08  HMRC flag-only feature → Growth plan alone → false
 *   ENT-09  HMRC flag-only feature → Starter + enabled flag → true
 *   ENT-10  Founder: Starter billing + active account_entitlements (pro) → true
 *   ENT-11  Expired founder: Starter billing + expired account_entitlements → false
 *   ENT-12  Cross-account isolation: accountA flag does not grant accountB access
 *   ENT-13  renters_rights_readiness → Growth → true
 *   ENT-14  renters_rights_readiness → Starter → false
 *   ENT-15  maintenance_evidence_pack → Growth → true
 *   ENT-16  C-3 fix: account_feature_required_plan('evidence_vault_dispute_pack') = 'growth'
 *   ENT-17  Deposit regression: deposit_pack_account_has_entitlement — pro → true
 *   ENT-18  Deposit regression: deposit_pack_account_has_entitlement — root → true
 *   ENT-19  Deposit regression: deposit_pack_account_has_entitlement — Starter → false
 *
 *   ENT-D1  Explicit deny: Growth + enabled=false → false (overrides plan entitlement)
 *   ENT-D2  Explicit deny: Pro + enabled=false → false (overrides plan entitlement)
 *   ENT-D3  Explicit grant: Starter + enabled=true → true (overrides plan restriction)
 *   ENT-D4  Explicit deny removed: Growth + no flag → true (plan access restored)
 *
 *   ENT-FND-01  Founder capacity: pre-fill complete — 19 redemptions exist for test offer
 *   ENT-FND-02  Founder capacity: ownerA claims position 20 — last available slot
 *   ENT-FND-03  Founder capacity: ownerB finds offer at capacity — slots_full
 *   ENT-FND-04  Founder capacity: ownerA retry is idempotent — count=20, active entitlement count=1
 *   ENT-FND-05  Founder capacity: real FOUNDER20 redemption count is unchanged
 */

import fs from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { ENTITLEMENT_FEATURES } from "../../src/lib/entitlements.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const accountAId = isolationFixtures.accounts.accountA.id;
const accountBId = isolationFixtures.accounts.accountB.id;
const rootAccountId = isolationFixtures.accounts.root.id;

// Fixed IDs for test-scoped rows — makes cleanup deterministic across runs.
const TEST_ENT_ID = "e0e00001-0000-4000-0000-000000000001";
const TEST_FLAG_FEATURE_EVD = "evidence_vault_dispute_pack";
const TEST_FLAG_FEATURE_HMRC = "hmrc_mtd_connection";
const TEST_FLAG_FEATURE_RRR = "renters_rights_readiness";

const SQL_PATH = path.join(
  process.cwd(),
  "supabase",
  "gate_b_ent_effective_feature_resolver.sql",
);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function hasEffectiveFeature(admin, accountId, feature) {
  const { data, error } = await admin.rpc("account_has_effective_feature", {
    p_account_id: accountId,
    p_feature: feature,
  });
  if (error) throw new Error(`account_has_effective_feature(${feature}): ${error.message}`);
  return data;
}

async function setAccountPlan(admin, accountId, plan) {
  const { error } = await admin
    .from("accounts")
    .update({ subscription_plan: plan })
    .eq("id", accountId);
  if (error) throw new Error(`setAccountPlan(${plan}): ${error.message}`);
}

async function setFlag(admin, accountId, featureKey, enabled) {
  const { error } = await admin.from("account_feature_flags").upsert(
    { account_id: accountId, feature_key: featureKey, enabled },
    { onConflict: "account_id,feature_key" },
  );
  if (error) throw new Error(`setFlag(${featureKey}, ${enabled}): ${error.message}`);
}

async function deleteFlag(admin, accountId, featureKey) {
  await admin
    .from("account_feature_flags")
    .delete()
    .eq("account_id", accountId)
    .eq("feature_key", featureKey);
}

async function insertTestEntitlement(admin, accountId, opts = {}) {
  const row = {
    id: TEST_ENT_ID,
    account_id: accountId,
    source: "manual_admin",
    effective_plan: opts.effectivePlan ?? "pro",
    billed_plan: opts.billedPlan ?? "starter",
    is_active: opts.isActive ?? true,
    starts_at: opts.startsAt ?? new Date(Date.now() - 86_400_000).toISOString(),
    ends_at: opts.endsAt ?? null,
    monthly_ai_credit_limit: 0,
    metadata: {},
  };
  const { error } = await admin.from("account_entitlements").insert(row);
  if (error) throw new Error(`insertTestEntitlement: ${error.message}`);
}

async function deleteTestEntitlement(admin) {
  await admin.from("account_entitlements").delete().eq("id", TEST_ENT_ID);
}

// ── Static contracts ──────────────────────────────────────────────────────────

describe("Gate-B-ENT static contracts", () => {
  it("ENT-S1: SQL file contains evidence_vault_dispute_pack → growth (C-3 fix)", () => {
    const src = fs.readFileSync(SQL_PATH, "utf-8");
    expect(src).toContain("'evidence_vault_dispute_pack'          then 'growth'");
  });

  it("ENT-S2: SQL file contains renters_rights_readiness → growth", () => {
    const src = fs.readFileSync(SQL_PATH, "utf-8");
    expect(src).toContain("'renters_rights_readiness'             then 'growth'");
  });

  it("ENT-S3: SQL file contains maintenance_evidence_pack → growth", () => {
    const src = fs.readFileSync(SQL_PATH, "utf-8");
    expect(src).toContain("'maintenance_evidence_pack'            then 'growth'");
  });

  it("ENT-S4: SQL file defines account_has_effective_feature", () => {
    const src = fs.readFileSync(SQL_PATH, "utf-8");
    expect(src).toContain("create or replace function public.account_has_effective_feature");
  });

  it("ENT-S5: SQL file implements explicit deny (enabled=false branch before plan check)", () => {
    const src = fs.readFileSync(SQL_PATH, "utf-8");
    // The fix: select enabled directly, not EXISTS(... enabled=true)
    expect(src).toContain("select enabled");
    expect(src).toContain("(select enabled from flag) = false");
    expect(src).toContain("(select enabled from flag) = true");
    // Ensure the old flag_check CTE pattern is gone from account_has_effective_feature
    expect(src).not.toContain("flag_check as (");
    expect(src).not.toContain("as has_flag");
  });

  it("ENT-S6: SQL catalogue has exactly 79 entries (7+38+19+3+12)", () => {
    const src = fs.readFileSync(SQL_PATH, "utf-8");
    // Match CASE WHEN branches in account_feature_min_plan
    const entries = src.match(
      /when\s+'[\w_]+'\s+then\s+'(?:starter|growth|pro|operator_agency|flag_only)'/g,
    );
    const count = entries?.length ?? 0;
    // Reconciliation: 7 starter + 38 growth + 19 pro + 3 operator_agency + 12 flag_only = 79
    expect(count).toBe(79);
  });

  it("ENT-S7: every JS ENTITLEMENT_FEATURES key is registered in the SQL catalogue", () => {
    const src = fs.readFileSync(SQL_PATH, "utf-8");
    const missing = [];
    for (const key of Object.values(ENTITLEMENT_FEATURES)) {
      if (!src.includes(`'${key}'`)) {
        missing.push(key);
      }
    }
    // Two server-only keys are in SQL but not in JS ENTITLEMENT_FEATURES:
    //   maintenance_evidence_pack  (growth — server-side feature flag key)
    //   document_extraction        (growth — server-side feature flag key)
    // All JS keys must be in SQL. If missing is non-empty the catalogue is out of sync.
    expect(missing).toEqual([]);
  });
});

// ── Integration contracts ─────────────────────────────────────────────────────

describe.skipIf(!isIntegrationHarnessConfigured())(
  "Gate-B-ENT effective feature resolver",
  () => {
    let admin;

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();

      // Pre-flight cleanup: remove any leftover rows from previous runs.
      await deleteTestEntitlement(admin);
      await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD);
      await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_HMRC);
      await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_RRR);
      await deleteFlag(admin, accountBId, TEST_FLAG_FEATURE_EVD);

      // Both fixture accounts are seeded pro. Restore to 'pro' at end.
    });

    afterAll(async () => {
      await deleteTestEntitlement(admin);
      await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD);
      await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_HMRC);
      await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_RRR);
      await deleteFlag(admin, accountBId, TEST_FLAG_FEATURE_EVD);
      // Restore fixture accounts to their canonical seeded plans.
      await setAccountPlan(admin, accountAId, "pro");
      await setAccountPlan(admin, accountBId, "pro");
    });

    // ── Plan defaults ───────────────────────────────────────────────────────

    it("ENT-01: Pro plan → evidence_vault_dispute_pack → true", async () => {
      // accountA is seeded pro — no override needed.
      const result = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
      expect(result).toBe(true);
    });

    it("ENT-02: Growth plan → evidence_vault_dispute_pack → true", async () => {
      await setAccountPlan(admin, accountAId, "growth");
      try {
        const result = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
        expect(result).toBe(true);
      } finally {
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    it("ENT-03: Starter plan → evidence_vault_dispute_pack → false", async () => {
      await setAccountPlan(admin, accountAId, "starter");
      try {
        const result = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
        expect(result).toBe(false);
      } finally {
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    it("ENT-04: Root account → evidence_vault_dispute_pack → true (operator_agency rank)", async () => {
      // Root account always resolves to operator_agency (rank 4) regardless of subscription_plan.
      const result = await hasEffectiveFeature(admin, rootAccountId, "evidence_vault_dispute_pack");
      expect(result).toBe(true);
    });

    // ── Account-level flag grants ───────────────────────────────────────────

    it("ENT-05: Starter plan + enabled flag → evidence_vault_dispute_pack → true", async () => {
      await setAccountPlan(admin, accountAId, "starter");
      await setFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD, true);
      try {
        const result = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
        expect(result).toBe(true);
      } finally {
        await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD);
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    it("ENT-06: Starter plan + disabled flag (enabled=false) → evidence_vault_dispute_pack → false", async () => {
      await setAccountPlan(admin, accountAId, "starter");
      await setFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD, false);
      try {
        const result = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
        expect(result).toBe(false);
      } finally {
        await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD);
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    // ── Unregistered features ───────────────────────────────────────────────

    it("ENT-07: Unregistered feature key → false (deny-by-default)", async () => {
      const result = await hasEffectiveFeature(admin, accountAId, "completely_unknown_xyz_feature");
      expect(result).toBe(false);
    });

    // ── Flag-only features (HMRC) ───────────────────────────────────────────

    it("ENT-08: HMRC flag-only feature → Growth plan alone → false", async () => {
      await setAccountPlan(admin, accountAId, "growth");
      try {
        const result = await hasEffectiveFeature(admin, accountAId, TEST_FLAG_FEATURE_HMRC);
        expect(result).toBe(false);
      } finally {
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    it("ENT-09: HMRC flag-only feature → Starter + enabled flag → true", async () => {
      await setAccountPlan(admin, accountAId, "starter");
      await setFlag(admin, accountAId, TEST_FLAG_FEATURE_HMRC, true);
      try {
        const result = await hasEffectiveFeature(admin, accountAId, TEST_FLAG_FEATURE_HMRC);
        expect(result).toBe(true);
      } finally {
        await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_HMRC);
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    // ── Founder entitlement (account_entitlements) ──────────────────────────

    it("ENT-10: Founder — Starter billing + active account_entitlements (pro) → true", async () => {
      await setAccountPlan(admin, accountAId, "starter");
      await insertTestEntitlement(admin, accountAId, {
        effectivePlan: "pro",
        billedPlan: "starter",
        startsAt: new Date(Date.now() - 86_400_000).toISOString(),
        endsAt: null,
      });
      try {
        const result = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
        expect(result).toBe(true);
      } finally {
        await deleteTestEntitlement(admin);
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    it("ENT-11: Expired founder — Starter billing + expired account_entitlements → false", async () => {
      await setAccountPlan(admin, accountAId, "starter");
      await insertTestEntitlement(admin, accountAId, {
        effectivePlan: "pro",
        billedPlan: "starter",
        startsAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        endsAt: new Date(Date.now() - 86_400_000).toISOString(),
      });
      try {
        const result = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
        expect(result).toBe(false);
      } finally {
        await deleteTestEntitlement(admin);
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    // ── Cross-account scope isolation ───────────────────────────────────────

    it("ENT-12: Cross-account — accountA flag does not grant accountB access", async () => {
      await setAccountPlan(admin, accountBId, "starter");
      await setFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD, true);
      try {
        const resultA = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
        const resultB = await hasEffectiveFeature(admin, accountBId, "evidence_vault_dispute_pack");
        expect(resultA).toBe(true);   // accountA has the flag
        expect(resultB).toBe(false);  // accountB does not
      } finally {
        await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD);
        await setAccountPlan(admin, accountBId, "pro");
      }
    });

    // ── renters_rights_readiness (was unregistered) ─────────────────────────

    it("ENT-13: renters_rights_readiness → Growth → true", async () => {
      await setAccountPlan(admin, accountAId, "growth");
      try {
        const result = await hasEffectiveFeature(admin, accountAId, TEST_FLAG_FEATURE_RRR);
        expect(result).toBe(true);
      } finally {
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    it("ENT-14: renters_rights_readiness → Starter → false", async () => {
      await setAccountPlan(admin, accountAId, "starter");
      try {
        const result = await hasEffectiveFeature(admin, accountAId, TEST_FLAG_FEATURE_RRR);
        expect(result).toBe(false);
      } finally {
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    // ── maintenance_evidence_pack (was unregistered) ────────────────────────

    it("ENT-15: maintenance_evidence_pack → Growth → true", async () => {
      await setAccountPlan(admin, accountAId, "growth");
      try {
        const result = await hasEffectiveFeature(admin, accountAId, "maintenance_evidence_pack");
        expect(result).toBe(true);
      } finally {
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    // ── C-3 fix: account_feature_required_plan ──────────────────────────────

    it("ENT-16: account_feature_required_plan('evidence_vault_dispute_pack') = 'growth'", async () => {
      const { data, error } = await admin.rpc("account_feature_required_plan", {
        p_feature: "evidence_vault_dispute_pack",
      });
      expect(error).toBeNull();
      expect(data).toBe("growth");
    });

    // ── Deposit regression: deposit_pack_account_has_entitlement ────────────

    it("ENT-17: deposit regression — Pro account → deposit_pack_account_has_entitlement → true", async () => {
      // accountA is pro — this is the T-01 equivalent
      const { data, error } = await admin.rpc("deposit_pack_account_has_entitlement", {
        p_account_id: accountAId,
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it("ENT-18: deposit regression — Root account → deposit_pack_account_has_entitlement → true", async () => {
      const { data, error } = await admin.rpc("deposit_pack_account_has_entitlement", {
        p_account_id: rootAccountId,
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it("ENT-19: deposit regression — Starter account → deposit_pack_account_has_entitlement → false", async () => {
      await setAccountPlan(admin, accountAId, "starter");
      try {
        const { data, error } = await admin.rpc("deposit_pack_account_has_entitlement", {
          p_account_id: accountAId,
        });
        expect(error).toBeNull();
        expect(data).toBe(false);
      } finally {
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    // ── Explicit deny semantics ─────────────────────────────────────────────
    // These tests specifically exercise the enabled=false → false branch that was
    // missing before Gate-B-ENT. ENT-06 (Starter + enabled=false) would accidentally
    // pass even with the bug because Starter is denied by plan anyway. ENT-D1/D2
    // use Growth/Pro plans where the bug would incorrectly allow access.

    it("ENT-D1: explicit deny — Growth plan + enabled=false → false (overrides plan entitlement)", async () => {
      await setAccountPlan(admin, accountAId, "growth");
      await setFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD, false);
      try {
        const result = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
        // Growth (rank 2) >= growth min_plan (rank 2), but enabled=false must override → false
        expect(result).toBe(false);
      } finally {
        await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD);
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    it("ENT-D2: explicit deny — Pro plan + enabled=false → false (overrides plan entitlement)", async () => {
      // accountA starts pro; just add the deny flag
      await setFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD, false);
      try {
        const result = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
        // Pro (rank 3) >= growth min_plan (rank 2), but enabled=false must override → false
        expect(result).toBe(false);
      } finally {
        await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD);
      }
    });

    it("ENT-D3: explicit grant — Starter + enabled=true → true (overrides plan restriction)", async () => {
      await setAccountPlan(admin, accountAId, "starter");
      await setFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD, true);
      try {
        const result = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
        expect(result).toBe(true);
      } finally {
        await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD);
        await setAccountPlan(admin, accountAId, "pro");
      }
    });

    it("ENT-D4: explicit deny removed → plan access restored for Growth account", async () => {
      await setAccountPlan(admin, accountAId, "growth");
      await setFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD, false);

      // Confirm deny is active
      const withDeny = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
      expect(withDeny).toBe(false);

      // Remove flag — plan check should now pass
      await deleteFlag(admin, accountAId, TEST_FLAG_FEATURE_EVD);
      const withoutDeny = await hasEffectiveFeature(admin, accountAId, "evidence_vault_dispute_pack");
      expect(withoutDeny).toBe(true);

      await setAccountPlan(admin, accountAId, "pro");
    });
  },
);

// ── Founder capacity tests ────────────────────────────────────────────────────
// Proves the 20-slot boundary of ENT_TEST_CAP_OFFER_V1 (NOT FOUNDER20).
//
// Strategy:
//   1. Create test offer with max_redemptions=20.
//   2. Create 19 synthetic accounts and admin-insert 19 redemptions (positions 1-19).
//   3. ownerA claims position 20 via the real authenticated RPC.
//   4. ownerB is denied (slots_full — all 20 slots taken).
//   5. ownerA retry is idempotent — redemption count stays at 20, entitlement count=1.
//   6. Real FOUNDER20 redemption count is unchanged throughout.
//   afterAll removes test offer, 19 synthetic accounts, all test redemptions/entitlements.

describe.skipIf(!isIntegrationHarnessConfigured())(
  "Gate-B-ENT founder capacity",
  () => {
    const TEST_OFFER_ID = "f0ffe100-0000-4000-0000-000000000001";
    const TEST_OFFER_CODE = "ENT_TEST_CAP_OFFER_V1";

    // 19 distinct synthetic accounts — pre-fill slots 1-19 via admin insert.
    const SYNTH_ACCOUNT_IDS = Array.from({ length: 19 }, (_, i) =>
      `f0acc001-0000-4000-0000-${String(i + 1).padStart(12, "0")}`
    );

    let admin;
    let ownerAUserId;
    let ownerBUserId;
    let founder20CountBefore;

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();

      // Capture real auth UIDs — needed for authenticated RPC calls.
      const { user: ownerAUser } = await signInAsFixtureUser("ownerA");
      const { user: ownerBUser } = await signInAsFixtureUser("ownerB");
      ownerAUserId = ownerAUser.id;
      ownerBUserId = ownerBUser.id;

      // Record real FOUNDER20 slot count — ENT-FND-05 asserts it is unchanged.
      const { data: f20Offer } = await admin
        .from("launch_offers")
        .select("id")
        .eq("code", "FOUNDER20")
        .maybeSingle();
      if (f20Offer) {
        const { count } = await admin
          .from("launch_offer_redemptions")
          .select("*", { count: "exact", head: true })
          .eq("offer_id", f20Offer.id)
          .eq("status", "redeemed");
        founder20CountBefore = count ?? 0;
      } else {
        founder20CountBefore = 0;
      }

      // Cleanup from any previous aborted run.
      await admin.from("account_entitlements")
        .delete()
        .eq("account_id", accountAId)
        .eq("source", "launch_offer");
      await admin.from("launch_offer_redemptions").delete().eq("offer_id", TEST_OFFER_ID);
      await admin.from("launch_offers").delete().eq("id", TEST_OFFER_ID);
      await admin.from("accounts").delete().in("id", SYNTH_ACCOUNT_IDS);

      // Create 19 synthetic accounts (min fields; created_by uses real ownerA UID).
      const synthAccounts = SYNTH_ACCOUNT_IDS.map((id, i) => ({
        id,
        name: `ENT Cap Test Account ${i + 1}`,
        created_by: ownerAUserId,
        is_root: false,
        subscription_plan: "starter",
        subscription_status: "active",
        language: "en",
        country_code: "GB",
        currency: "GBP",
      }));
      const { error: accErr } = await admin.from("accounts").insert(synthAccounts);
      if (accErr) throw new Error(`Create synthetic accounts: ${accErr.message}`);

      // Create isolated test offer (max_redemptions=20).
      const { error: offerErr } = await admin.from("launch_offers").insert({
        id: TEST_OFFER_ID,
        code: TEST_OFFER_CODE,
        name: "ENT Gate-B-ENT capacity test offer",
        description: "Isolated test offer — deleted by afterAll",
        max_redemptions: 20,
        target_plan: "pro",
        billed_plan: "starter",
        duration_months: 12,
        monthly_ai_credit_limit: 0,
        is_active: true,
      });
      if (offerErr) throw new Error(`Create test offer: ${offerErr.message}`);

      // Admin-insert redemptions for positions 1-19.
      const prefillRows = SYNTH_ACCOUNT_IDS.map((accountId, i) => ({
        offer_id: TEST_OFFER_ID,
        account_id: accountId,
        user_id: null,
        email: `ent-cap-test-${i + 1}@oasis.test`,
        normalized_email: `ent-cap-test-${i + 1}@oasis.test`,
        signup_source: "ent_test_prefill",
        position: i + 1,
        status: "redeemed",
      }));
      const { error: prefillErr } = await admin.from("launch_offer_redemptions").insert(prefillRows);
      if (prefillErr) throw new Error(`Pre-fill 19 redemptions: ${prefillErr.message}`);
    });

    afterAll(async () => {
      // Clean up in FK dependency order.
      await admin.from("account_entitlements")
        .delete()
        .eq("account_id", accountAId)
        .eq("source", "launch_offer");
      await admin.from("launch_offer_redemptions").delete().eq("offer_id", TEST_OFFER_ID);
      await admin.from("launch_offers").delete().eq("id", TEST_OFFER_ID);
      await admin.from("accounts").delete().in("id", SYNTH_ACCOUNT_IDS);
    });

    it("ENT-FND-01: pre-fill complete — 19 redemptions exist for test offer", async () => {
      const { count, error } = await admin
        .from("launch_offer_redemptions")
        .select("*", { count: "exact", head: true })
        .eq("offer_id", TEST_OFFER_ID)
        .eq("status", "redeemed");
      expect(error).toBeNull();
      expect(count).toBe(19);
    });

    it("ENT-FND-02: ownerA claims position 20 — last available slot", async () => {
      const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
      const { data, error } = await ownerAClient.rpc("apply_founder_offer_on_landlord_signup", {
        p_offer_code: TEST_OFFER_CODE,
        p_account_id: accountAId,
        p_user_id: ownerAUserId,
        p_email: "owner.a@oasis.test",
      });
      expect(error).toBeNull();
      expect(data?.qualified).toBe(true);
      expect(data?.position).toBe(20);
      expect(data?.remaining_slots).toBe(0);
      expect(data?.effective_plan).toBe("pro");
    });

    it("ENT-FND-03: ownerB finds offer at capacity — slots_full", async () => {
      const { client: ownerBClient } = await signInAsFixtureUser("ownerB");
      const { data, error } = await ownerBClient.rpc("apply_founder_offer_on_landlord_signup", {
        p_offer_code: TEST_OFFER_CODE,
        p_account_id: accountBId,
        p_user_id: ownerBUserId,
        p_email: "owner.b@oasis.test",
      });
      expect(error).toBeNull();
      expect(data?.qualified).toBe(false);
      expect(data?.status).toBe("slots_full");
      expect(data?.remaining_slots).toBe(0);
    });

    it("ENT-FND-04: ownerA retry is idempotent — redemption count=20, active entitlement count=1", async () => {
      const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
      const { data, error } = await ownerAClient.rpc("apply_founder_offer_on_landlord_signup", {
        p_offer_code: TEST_OFFER_CODE,
        p_account_id: accountAId,
        p_user_id: ownerAUserId,
        p_email: "owner.a@oasis.test",
      });
      expect(error).toBeNull();
      expect(data?.qualified).toBe(true);

      // Total redemption count must remain 20 — no duplicate insert.
      const { count: redemptionCount, error: rcErr } = await admin
        .from("launch_offer_redemptions")
        .select("*", { count: "exact", head: true })
        .eq("offer_id", TEST_OFFER_ID)
        .eq("status", "redeemed");
      expect(rcErr).toBeNull();
      expect(redemptionCount).toBe(20);

      // Exactly one active launch_offer entitlement for accountA.
      const { data: ents, error: entErr } = await admin
        .from("account_entitlements")
        .select("id")
        .eq("account_id", accountAId)
        .eq("source", "launch_offer")
        .eq("is_active", true);
      expect(entErr).toBeNull();
      expect(ents).toHaveLength(1);
    });

    it("ENT-FND-05: real FOUNDER20 redemption count is unchanged", async () => {
      const { data: f20Offer } = await admin
        .from("launch_offers")
        .select("id")
        .eq("code", "FOUNDER20")
        .maybeSingle();
      if (!f20Offer) {
        expect(founder20CountBefore).toBe(0);
        return;
      }
      const { count } = await admin
        .from("launch_offer_redemptions")
        .select("*", { count: "exact", head: true })
        .eq("offer_id", f20Offer.id)
        .eq("status", "redeemed");
      expect(count ?? 0).toBe(founder20CountBefore);
    });
  },
);
