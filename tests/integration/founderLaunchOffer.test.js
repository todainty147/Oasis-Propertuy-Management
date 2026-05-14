/**
 * Integration tests for the Founder Launch Offer Automation v1.
 *
 * Covers:
 *   - Core offer mechanics (redemption, idempotency, slot limits)
 *   - Eligibility guards (ownership, sandbox, root, inactive, expired)
 *   - Plan resolver regression (entitlement priority over Stripe)
 *   - AI quota override (100/month for founders, not pro-plan 3000)
 *   - Admin recovery RPC
 *   - Race condition simulation (concurrent signups)
 *   - launch_offer_status admin visibility
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";

const OFFER_CODE    = "FOUNDER20";
const ACCOUNT_A     = isolationFixtures.accounts.accountA.id;
const ACCOUNT_B     = isolationFixtures.accounts.accountB.id;
const ROOT_ACCOUNT  = isolationFixtures.accounts.root.id;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function cleanupRedemptions(admin, offerCode = OFFER_CODE) {
  // Delete all test redemptions so each describe block starts clean
  const { data: offer } = await admin
    .from("launch_offers")
    .select("id")
    .eq("code", offerCode)
    .maybeSingle();
  if (!offer) return;

  await admin
    .from("account_entitlements")
    .delete()
    .eq("source", "launch_offer");

  await admin
    .from("launch_offer_redemptions")
    .delete()
    .eq("offer_id", offer.id);
}

async function applyOffer(client, { accountId, userId, email, source = "integration_test" }) {
  const { data, error } = await client.rpc("apply_founder_offer_on_landlord_signup", {
    p_offer_code:    OFFER_CODE,
    p_account_id:    accountId,
    p_user_id:       userId,
    p_email:         email,
    p_signup_source: source,
  });
  return { data: Array.isArray(data) ? data[0] : data, error };
}

async function getEntitlement(admin, accountId) {
  const { data } = await admin
    .from("account_entitlements")
    .select("*")
    .eq("account_id", accountId)
    .eq("source", "launch_offer")
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe.skipIf(!isIntegrationHarnessConfigured())(
  "founder_launch_offer — RPCs, plan resolver, AI quota",
  () => {
    let admin;
    let users; // { ownerA, ownerB, rootOwner, adminA, staffA, tenantA1 }

    beforeAll(async () => {
      users = await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();
      // Ensure FOUNDER20 offer exists (idempotent seed)
      await admin.from("launch_offers").upsert(
        {
          code: OFFER_CODE, name: "Founder 20 Launch Offer",
          max_redemptions: 20, target_plan: "pro", billed_plan: "starter",
          duration_months: 12, monthly_ai_credit_limit: 100, is_active: true,
        },
        { onConflict: "code" },
      );
    });

    afterAll(async () => {
      await cleanupRedemptions(admin);
    });

    // ── Core mechanics ───────────────────────────────────────────────────────

    describe("core mechanics", () => {
      beforeAll(async () => { await cleanupRedemptions(admin); });
      afterAll(async ()  => { await cleanupRedemptions(admin); });

      it("1. first landlord signup receives qualified=true and position=1", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { data, error } = await applyOffer(client, {
          accountId: ACCOUNT_A,
          userId:    users.ownerA.id,
          email:     isolationFixtures.users.ownerA.email,
        });

        expect(error).toBeNull();
        expect(data.qualified).toBe(true);
        expect(data.status).toBe("redeemed");
        expect(data.position).toBe(1);
        expect(data.effective_plan).toBe("pro");
        expect(data.billed_plan).toBe("starter");
        expect(data.entitlement_id).toBeTruthy();
      });

      it("2. redemption row and entitlement row are created correctly", async () => {
        const ent = await getEntitlement(admin, ACCOUNT_A);
        expect(ent).not.toBeNull();
        expect(ent.effective_plan).toBe("pro");
        expect(ent.billed_plan).toBe("starter");
        expect(ent.monthly_ai_credit_limit).toBe(100);
        expect(ent.is_active).toBe(true);
        expect(ent.ends_at).toBeTruthy();

        const { data: redemption } = await admin
          .from("launch_offer_redemptions")
          .select("*")
          .eq("account_id", ACCOUNT_A)
          .maybeSingle();
        expect(redemption).not.toBeNull();
        expect(redemption.position).toBe(1);
        expect(redemption.status).toBe("redeemed");
      });

      it("3. duplicate account_id is idempotent — returns same position, no new row", async () => {
        const { client } = await signInAsFixtureUser("ownerA");
        const { data } = await applyOffer(client, {
          accountId: ACCOUNT_A,
          userId:    users.ownerA.id,
          email:     isolationFixtures.users.ownerA.email,
        });

        expect(data.qualified).toBe(true);
        expect(data.position).toBe(1); // same position

        const { count } = await admin
          .from("launch_offer_redemptions")
          .select("id", { count: "exact" })
          .eq("account_id", ACCOUNT_A);
        expect(count).toBe(1); // still only one row
      });

      it("4. second account gets position=2", async () => {
        const { client } = await signInAsFixtureUser("ownerB");
        const { data, error } = await applyOffer(client, {
          accountId: ACCOUNT_B,
          userId:    users.ownerB.id,
          email:     isolationFixtures.users.ownerB.email,
        });

        expect(error).toBeNull();
        expect(data.qualified).toBe(true);
        expect(data.position).toBe(2);
        expect(data.remaining_slots).toBe(18);
      });

      it("5. duplicate normalized email on different account returns email_already_redeemed", async () => {
        const { data: offer } = await admin
          .from("launch_offers")
          .select("id")
          .eq("code", OFFER_CODE)
          .single();

        // Test 4 left ACCOUNT_B with a redemption and an entitlement. Both idempotency
        // checks (step 8: redemption row, step 9: entitlement row) fire before the email
        // guard (step 10), so we remove both so the email check is exercised with a fresh
        // account call.
        await admin
          .from("launch_offer_redemptions")
          .delete()
          .eq("offer_id", offer.id)
          .eq("account_id", ACCOUNT_B);
        await admin
          .from("account_entitlements")
          .delete()
          .eq("account_id", ACCOUNT_B)
          .eq("source", "launch_offer");

        // ACCOUNT_A still holds a redeemed row for ownerA's email (from test 1).
        // Calling with ownerA's email from ACCOUNT_B hits the email_already_redeemed guard.
        const { client } = await signInAsFixtureUser("ownerB");
        const { data } = await applyOffer(client, {
          accountId: ACCOUNT_B,
          userId:    users.ownerB.id,
          email:     isolationFixtures.users.ownerA.email,
        });

        expect(data.qualified).toBe(false);
        expect(data.status).toBe("email_already_redeemed");
        // afterAll cleanupRedemptions handles full teardown including ACCOUNT_B deletion.
      });
    });

    // ── Eligibility guards ───────────────────────────────────────────────────

    describe("eligibility guards", () => {
      beforeAll(async () => { await cleanupRedemptions(admin); });
      afterAll(async ()  => { await cleanupRedemptions(admin); });

      it("6. non-owner (staff) caller returns not_owner", async () => {
        const { client } = await signInAsFixtureUser("staffA");
        // staffA is staff on ACCOUNT_A, not owner — should be rejected
        const { data } = await applyOffer(client, {
          accountId: ACCOUNT_A,
          userId:    users.staffA.id,
          email:     isolationFixtures.users.staffA.email,
        });

        expect(data.qualified).toBe(false);
        expect(data.status).toBe("not_owner");
      });

      it("7. sandbox/demo account returns sandbox_not_eligible", async () => {
        // Mark ACCOUNT_B as demo temporarily
        await admin.from("account_sandbox_profiles").upsert(
          { account_id: ACCOUNT_B, mode: "demo", lifecycle_status: "active" },
          { onConflict: "account_id" },
        );

        const { client } = await signInAsFixtureUser("ownerB");
        const { data } = await applyOffer(client, {
          accountId: ACCOUNT_B,
          userId:    users.ownerB.id,
          email:     isolationFixtures.users.ownerB.email,
        });

        expect(data.qualified).toBe(false);
        expect(data.status).toBe("sandbox_not_eligible");

        // Restore production mode
        await admin.from("account_sandbox_profiles").upsert(
          { account_id: ACCOUNT_B, mode: "production", lifecycle_status: "active" },
          { onConflict: "account_id" },
        );
      });

      it("8. inactive offer returns offer_inactive", async () => {
        await admin.from("launch_offers").update({ is_active: false }).eq("code", OFFER_CODE);

        const { client } = await signInAsFixtureUser("ownerA");
        const { data } = await applyOffer(client, {
          accountId: ACCOUNT_A,
          userId:    users.ownerA.id,
          email:     isolationFixtures.users.ownerA.email,
        });

        expect(data.qualified).toBe(false);
        expect(data.status).toBe("offer_inactive");

        // Restore
        await admin.from("launch_offers").update({ is_active: true }).eq("code", OFFER_CODE);
      });

      it("9. expired offer returns offer_expired", async () => {
        await admin.from("launch_offers").update({
          ends_at: new Date(Date.now() - 1000).toISOString(),
        }).eq("code", OFFER_CODE);

        const { client } = await signInAsFixtureUser("ownerA");
        const { data } = await applyOffer(client, {
          accountId: ACCOUNT_A,
          userId:    users.ownerA.id,
          email:     isolationFixtures.users.ownerA.email,
        });

        expect(data.qualified).toBe(false);
        expect(data.status).toBe("offer_expired");

        // Restore
        await admin.from("launch_offers").update({ ends_at: null }).eq("code", OFFER_CODE);
      });

      it("10. slots_full when max_redemptions reached", async () => {
        // Set max to 1, use ownerA's slot
        await admin.from("launch_offers").update({ max_redemptions: 1 }).eq("code", OFFER_CODE);

        const { client: clientA } = await signInAsFixtureUser("ownerA");
        await applyOffer(clientA, {
          accountId: ACCOUNT_A,
          userId:    users.ownerA.id,
          email:     isolationFixtures.users.ownerA.email,
        });

        const { client: clientB } = await signInAsFixtureUser("ownerB");
        const { data } = await applyOffer(clientB, {
          accountId: ACCOUNT_B,
          userId:    users.ownerB.id,
          email:     isolationFixtures.users.ownerB.email,
        });

        expect(data.qualified).toBe(false);
        expect(data.status).toBe("slots_full");
        expect(data.remaining_slots).toBe(0);

        // Restore
        await admin.from("launch_offers").update({ max_redemptions: 20 }).eq("code", OFFER_CODE);
      });
    });

    // ── Plan resolver regression ──────────────────────────────────────────────

    describe("plan resolver regression", () => {
      beforeAll(async () => { await cleanupRedemptions(admin); });
      afterAll(async () => {
        await cleanupRedemptions(admin);
        // Restore accounts.subscription_plan
        await admin.from("accounts").update({ subscription_plan: "pro", subscription_status: "active" }).eq("id", ACCOUNT_A);
      });

      it("11. active entitlement resolves to pro even when accounts.subscription_plan = starter (Stripe webhook sim)", async () => {
        // Simulate Stripe webhook writing starter to the accounts table
        await admin.from("accounts")
          .update({ subscription_plan: "starter", subscription_status: "active" })
          .eq("id", ACCOUNT_A);

        // Apply founder offer (creates entitlement with effective_plan = pro)
        const { client } = await signInAsFixtureUser("ownerA");
        await applyOffer(client, {
          accountId: ACCOUNT_A,
          userId:    users.ownerA.id,
          email:     isolationFixtures.users.ownerA.email,
        });

        // Plan resolver must return 'pro' despite accounts.subscription_plan = 'starter'
        const { data: resolvedPlan } = await admin.rpc("account_subscription_plan", {
          p_account_id: ACCOUNT_A,
        });

        expect(resolvedPlan).toBe("pro");
      });

      it("12. after entitlement ends_at passes, resolver falls through to accounts.subscription_plan", async () => {
        // Manually expire the entitlement
        await admin.from("account_entitlements")
          .update({ ends_at: new Date(Date.now() - 1000).toISOString() })
          .eq("account_id", ACCOUNT_A)
          .eq("source", "launch_offer");

        const { data: resolvedPlan } = await admin.rpc("account_subscription_plan", {
          p_account_id: ACCOUNT_A,
        });

        // Should fall through to accounts.subscription_plan = 'starter'
        expect(resolvedPlan).toBe("starter");

        // Restore entitlement to active
        await admin.from("account_entitlements")
          .update({ ends_at: new Date(Date.now() + 365 * 86_400_000).toISOString() })
          .eq("account_id", ACCOUNT_A)
          .eq("source", "launch_offer");
      });

      it("13. root account always resolves to operator_agency regardless of entitlement", async () => {
        // Insert a founder entitlement on the root account (edge case)
        await admin.from("account_entitlements").insert({
          account_id:              ROOT_ACCOUNT,
          source:                  "launch_offer",
          effective_plan:          "pro",
          billed_plan:             "starter",
          monthly_ai_credit_limit: 100,
          is_active:               true,
        });

        const { data: resolvedPlan } = await admin.rpc("account_subscription_plan", {
          p_account_id: ROOT_ACCOUNT,
        });

        expect(resolvedPlan).toBe("operator_agency");

        // Cleanup root entitlement
        await admin.from("account_entitlements").delete().eq("account_id", ROOT_ACCOUNT);
      });
    });

    // ── AI quota override ─────────────────────────────────────────────────────

    describe("AI quota override", () => {
      beforeAll(async () => { await cleanupRedemptions(admin); });
      afterAll(async () => { await cleanupRedemptions(admin); });

      it("14. get_account_ai_monthly_limit returns 100 for active founder", async () => {
        // Apply offer to create entitlement with monthly_ai_credit_limit = 100
        const { client } = await signInAsFixtureUser("ownerA");
        await applyOffer(client, {
          accountId: ACCOUNT_A,
          userId:    users.ownerA.id,
          email:     isolationFixtures.users.ownerA.email,
        });

        const { data: limit } = await admin.rpc("get_account_ai_monthly_limit", {
          p_account_id: ACCOUNT_A,
        });

        expect(limit).toBe(100);
      });

      it("15. get_account_ai_monthly_limit uses plan-based limit when entitlement monthly_ai_credit_limit = 0", async () => {
        // Update entitlement to have credit limit = 0 (should fall back to plan-based)
        await admin.from("account_entitlements")
          .update({ monthly_ai_credit_limit: 0 })
          .eq("account_id", ACCOUNT_A)
          .eq("source", "launch_offer");

        // Plan resolver returns 'pro' (entitlement still active), pro monthly limit = 3000
        const { data: limit } = await admin.rpc("get_account_ai_monthly_limit", {
          p_account_id: ACCOUNT_A,
        });

        expect(limit).toBe(3000); // pro plan default

        // Restore
        await admin.from("account_entitlements")
          .update({ monthly_ai_credit_limit: 100 })
          .eq("account_id", ACCOUNT_A)
          .eq("source", "launch_offer");
      });

      it("16. get_account_ai_monthly_limit returns 100 (not 3000) confirming founder override", async () => {
        // Verify after restore
        const { data: limit } = await admin.rpc("get_account_ai_monthly_limit", {
          p_account_id: ACCOUNT_A,
        });
        expect(limit).toBe(100);
      });
    });

    // ── Admin recovery ────────────────────────────────────────────────────────

    describe("admin recovery", () => {
      beforeAll(async () => { await cleanupRedemptions(admin); });
      afterAll(async () => { await cleanupRedemptions(admin); });

      it("17. admin_apply_founder_offer_to_account succeeds for root operator", async () => {
        const { client: rootClient } = await signInAsFixtureUser("rootOwner");

        const { data, error } = await rootClient.rpc("admin_apply_founder_offer_to_account", {
          p_offer_code: OFFER_CODE,
          p_account_id: ACCOUNT_A,
          p_reason:     "Integration test recovery",
        });

        const result = Array.isArray(data) ? data[0] : data;
        expect(error).toBeNull();
        expect(result.qualified).toBe(true);
        expect(result.status).toBe("redeemed");
        expect(result.effective_plan).toBe("pro");
      });

      it("18. admin_apply_founder_offer_to_account is idempotent on re-run", async () => {
        const { client: rootClient } = await signInAsFixtureUser("rootOwner");

        const { data, error } = await rootClient.rpc("admin_apply_founder_offer_to_account", {
          p_offer_code: OFFER_CODE,
          p_account_id: ACCOUNT_A,
          p_reason:     "Idempotency check",
        });

        const result = Array.isArray(data) ? data[0] : data;
        expect(error).toBeNull();
        expect(["redeemed", "already_redeemed", "entitlement_already_exists"]).toContain(result.status);

        // Confirm still only one redemption row
        const { count } = await admin
          .from("launch_offer_redemptions")
          .select("id", { count: "exact" })
          .eq("account_id", ACCOUNT_A);
        expect(count).toBe(1);
      });

      it("19. non-root caller of admin_apply_founder_offer_to_account raises an exception", async () => {
        const { client: ownerClient } = await signInAsFixtureUser("ownerA");

        const { error } = await ownerClient.rpc("admin_apply_founder_offer_to_account", {
          p_offer_code: OFFER_CODE,
          p_account_id: ACCOUNT_A,
          p_reason:     "Unauthorized attempt",
        });

        expect(error).not.toBeNull();
        expect(String(error.message || "").toLowerCase()).toContain("root operator");
      });
    });

    // ── Admin visibility ──────────────────────────────────────────────────────

    describe("admin visibility", () => {
      beforeAll(async () => { await cleanupRedemptions(admin); });
      afterAll(async () => { await cleanupRedemptions(admin); });

      it("20. launch_offer_status returns correct counts after redemptions", async () => {
        // Apply two offers
        const { client: clientA } = await signInAsFixtureUser("ownerA");
        await applyOffer(clientA, { accountId: ACCOUNT_A, userId: users.ownerA.id, email: isolationFixtures.users.ownerA.email });

        const { client: clientB } = await signInAsFixtureUser("ownerB");
        await applyOffer(clientB, { accountId: ACCOUNT_B, userId: users.ownerB.id, email: isolationFixtures.users.ownerB.email });

        const { client: rootClient } = await signInAsFixtureUser("rootOwner");
        const { data, error } = await rootClient.rpc("launch_offer_status", { p_offer_code: OFFER_CODE });

        const result = Array.isArray(data) ? data[0] : data;
        expect(error).toBeNull();
        expect(result.redeemed_count).toBe(2);
        expect(result.remaining_slots).toBe(18);
        expect(result.cancelled_count).toBe(0);
        expect(result.last_redeemed_at).toBeTruthy();
      });

      it("21. launch_offer_status raises for non-root caller", async () => {
        const { client: ownerClient } = await signInAsFixtureUser("ownerA");
        const { error } = await ownerClient.rpc("launch_offer_status", { p_offer_code: OFFER_CODE });
        expect(error).not.toBeNull();
      });
    });

    // ── Race condition simulation ─────────────────────────────────────────────

    describe("race condition simulation", () => {
      beforeAll(async () => { await cleanupRedemptions(admin); });
      afterAll(async () => { await cleanupRedemptions(admin); });

      it("22. 20 concurrent signups result in exactly 20 unique positions with no duplicates", async () => {
        // Set max to 20 (already is) and fire 20 concurrent calls.
        // We use the admin client (service_role) to bypass auth for speed,
        // calling the RPC directly with pre-seeded ownerA credentials for all
        // calls — this stresses the advisory lock, not the ownership guard.

        const { client: clientA } = await signInAsFixtureUser("ownerA");
        const { client: clientB } = await signInAsFixtureUser("ownerB");

        // Create 20 synthetic accounts via admin inserts
        const syntheticAccounts = Array.from({ length: 20 }, (_, i) => ({
          id:    `eeeeeeee-eeee-eeee-eeee-${String(i + 1).padStart(12, "0")}`,
          name:  `Synthetic Account ${i + 1}`,
          created_by: users.ownerA.id,
          is_root: false,
          subscription_plan: "starter",
        }));

        await admin.from("accounts").upsert(syntheticAccounts, { onConflict: "id" });

        // Add ownerA as owner on all synthetic accounts
        await admin.from("account_members").upsert(
          syntheticAccounts.map((a) => ({
            account_id: a.id,
            user_id: users.ownerA.id,
            role: "owner",
          })),
          { onConflict: "account_id,user_id" },
        );

        // Fire 20 concurrent apply calls (ownerA is owner on all synthetic accounts)
        const results = await Promise.allSettled(
          syntheticAccounts.map((a, i) =>
            clientA.rpc("apply_founder_offer_on_landlord_signup", {
              p_offer_code:    OFFER_CODE,
              p_account_id:    a.id,
              p_user_id:       users.ownerA.id,
              p_email:         `synthetic${i + 1}@race.test`,
              p_signup_source: "race_test",
            }),
          ),
        );

        const succeeded = results
          .filter((r) => r.status === "fulfilled")
          .map((r) => {
            const raw = r.value.data;
            return Array.isArray(raw) ? raw[0] : raw;
          })
          .filter((d) => d?.qualified === true);

        const positions = succeeded.map((d) => d.position);
        const uniquePositions = new Set(positions);

        expect(succeeded.length).toBe(20);
        expect(uniquePositions.size).toBe(20);
        expect(Math.min(...positions)).toBe(1);
        expect(Math.max(...positions)).toBe(20);

        // Cleanup synthetic accounts
        await admin.from("accounts").delete().in("id", syntheticAccounts.map((a) => a.id));
      });
    });
  },
);
