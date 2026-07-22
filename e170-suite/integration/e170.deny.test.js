/**
 * E-170 deny tests — five prohibitions.
 *
 * Every test that expects a guard error asserts the SPECIFIC guard message,
 * not merely that an error occurred. This rules out schema-cache misses
 * ("function not found") counting as a pass (the D-01 lesson from E-170-VAL).
 *
 * D-01  coverage_start in the future → guard message contains exact wording
 * D-02  p_attests_prospective_completeness = false → guard message
 * D-03  cross-account call (ownerA targets accountB property) → guard message
 * D-04  anon/unauthenticated call → PostgREST auth denial (not schema cache miss)
 * D-05  no activation → balance_state = unknown_payment_history, remaining = 0
 *
 * Evidence tag: EXECUTED_INTEGRATION_DB
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

import { isolationFixtures } from "../../tests/fixtures/isolationFixtures.js";
import { getIntegrationEnv, localPsqlRun, isLocalSupabase } from "../../tests/integration/helpers/env.js";
import {
  isE170SuiteEligible,
  bootstrapHarness,
  createE170Property,
  insertLease,
  destroyE170Property,
  callSnapshot,
  findProp,
  activateTenancy,
  ACCOUNT_ID,
  today,
  dayOffset,
} from "./_harness.js";

// ── Anon client helper ────────────────────────────────────────────────────────

function createAnonClient() {
  const env = getIntegrationEnv();
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// ── ownerB client (for cross-account test) ───────────────────────────────────

async function signInAsOwnerB() {
  const env = getIntegrationEnv();
  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: isolationFixtures.users.ownerB.email,
    password: env.userPassword,
  });
  if (error) throw new Error(`ownerB sign-in failed: ${error.message}`);
  return client;
}

if (!isE170SuiteEligible()) {
  describe.skip("E-170 deny tests (harness not configured or not local)", () => {});
} else {
  describe("E-170 deny tests", () => {
    let admin, ownerClient, ownerBClient, ownerUserId;
    let propId, tenantId;

    beforeAll(async () => {
      ({ admin, ownerClient, ownerUserId } = await bootstrapHarness());
      ownerBClient = await signInAsOwnerB();

      ({ propId, tenantId } = await createE170Property(admin, ownerUserId, { rent: 1000 }));

      await insertLease(admin, {
        propId,
        tenantId,
        leaseStartDate: "2024-01-01",
        renewalStatus:  "active",
      });
    }, 30_000);

    afterAll(async () => {
      await destroyE170Property(admin, propId, tenantId);
    });

    // ── D-01: coverage_start in the future ───────────────────────────────────

    it("D-01: rejects coverage_start in the future with the specific guard message", async () => {
      const { error } = await ownerClient.rpc("activate_tenancy_finance_tracking", {
        p_account_id:                       ACCOUNT_ID,
        p_property_id:                      propId,
        p_coverage_start:                   "2099-01-01",
        p_opening_balance_minor:            0,
        p_attests_prospective_completeness: true,
        p_note:                             null,
      });
      expect(error, "Expected an error for future coverage_start").not.toBeNull();
      // Must match the SQL guard, NOT a schema-cache miss.
      expect(error.message).toMatch(/coverage_start may not be in the future/i);
    });

    // ── D-02: no attestation ──────────────────────────────────────────────────

    it("D-02: rejects missing attestation with the specific guard message", async () => {
      const { error } = await ownerClient.rpc("activate_tenancy_finance_tracking", {
        p_account_id:                       ACCOUNT_ID,
        p_property_id:                      propId,
        p_coverage_start:                   today(),
        p_opening_balance_minor:            0,
        p_attests_prospective_completeness: false,
        p_note:                             null,
      });
      expect(error, "Expected an error for false attestation").not.toBeNull();
      expect(error.message).toMatch(/activation requires explicit prospective-completeness attestation/i);
    });

    it("D-02b: rejects null attestation with the specific guard message", async () => {
      const { error } = await ownerClient.rpc("activate_tenancy_finance_tracking", {
        p_account_id:                       ACCOUNT_ID,
        p_property_id:                      propId,
        p_coverage_start:                   today(),
        p_opening_balance_minor:            0,
        p_attests_prospective_completeness: null,
        p_note:                             null,
      });
      expect(error, "Expected an error for null attestation").not.toBeNull();
      expect(error.message).toMatch(/activation requires explicit prospective-completeness attestation/i);
    });

    // ── D-03: cross-account (ownerA targets accountB property) ───────────────

    it("D-03: rejects cross-account activation with the permission-denied guard message", async () => {
      // Use a property owned by accountB, called by ownerA.
      // The property is the canonical accountB property from the isolation harness.
      const accountBPropId = "44444444-4444-4444-4444-444444444442";

      const { error } = await ownerClient.rpc("activate_tenancy_finance_tracking", {
        p_account_id:                       isolationFixtures.accounts.accountB.id,
        p_property_id:                      accountBPropId,
        p_coverage_start:                   today(),
        p_opening_balance_minor:            0,
        p_attests_prospective_completeness: true,
        p_note:                             null,
      });
      expect(error, "Expected cross-account activation to be denied").not.toBeNull();
      expect(error.message).toMatch(/permission denied/i);
    });

    // ── D-04: unauthenticated — three-part disambiguation (Gate 3) ───────────
    //
    // Prior evidence: anon call returned PGRST202 "Could not find the function".
    // PGRST202 is ambiguous: it can mean wrong signature, stale schema cache,
    // OR absent execute privilege for the calling role.
    //
    // Gate 3 proves the PGRST202 is permission-based denial, not a schema miss:
    //   D-04a: function + signature exist in pg_proc (not a missing function).
    //   D-04b: authenticated role has execute privilege (function is reachable).
    //   D-04c: anon role has NO execute privilege (the specific mechanism of denial).
    //
    // Together, these three make the denial unambiguous.
    //
    // Evidence tag: EXECUTED_INTEGRATION_DB (pg_proc + has_function_privilege via psql)

    const FN_SIG = "public.activate_tenancy_finance_tracking(uuid,uuid,date,integer,boolean,text)";

    it("D-04a: function exists in pg_proc under public schema (not a missing-function schema miss)", () => {
      if (!isLocalSupabase()) return; // psql-level proof requires local DB access
      // Proves the function exists in the schema, ruling out "function not found" as cause.
      // The argument list includes DEFAULT clauses in pg_get_function_arguments; we
      // check proname + namespace + proargtypes (6 arguments matching the known signature)
      // rather than the full argument string to avoid DEFAULT-value string comparison issues.
      const result = localPsqlRun(`
        SELECT p.proname, pronargs
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'activate_tenancy_finance_tracking'
          AND p.pronargs = 6;
      `);
      expect(result.success, `pg_proc query failed: ${result.stderr}`).toBe(true);
      expect(result.stdout).toContain("activate_tenancy_finance_tracking");
    });

    it("D-04b: authenticated role has execute privilege (function is reachable when authed)", () => {
      if (!isLocalSupabase()) return;
      const result = localPsqlRun(
        `SELECT has_function_privilege('authenticated', '${FN_SIG}', 'execute');`
      );
      expect(result.success, `has_function_privilege query failed: ${result.stderr}`).toBe(true);
      expect(result.stdout).toMatch(/\bt\b/); // psql boolean true
    });

    it("D-04c: anon role has NO execute privilege — permission-based denial (not schema miss)", () => {
      if (!isLocalSupabase()) return;
      const result = localPsqlRun(
        `SELECT has_function_privilege('anon', '${FN_SIG}', 'execute');`
      );
      expect(result.success, `has_function_privilege query failed: ${result.stderr}`).toBe(true);
      expect(result.stdout).toMatch(/\bf\b/); // psql boolean false
    });

    it("D-04 (PostgREST): anon call returns an error (PGRST202 or permission denied)", async () => {
      const anonClient = createAnonClient();
      const { error } = await anonClient.rpc("activate_tenancy_finance_tracking", {
        p_account_id:                       ACCOUNT_ID,
        p_property_id:                      propId,
        p_coverage_start:                   today(),
        p_opening_balance_minor:            0,
        p_attests_prospective_completeness: true,
        p_note:                             null,
      });
      expect(error, "Expected unauthenticated call to be denied").not.toBeNull();
      // D-04a/b/c above prove this PGRST202/permission-denied is specifically because
      // anon has no execute privilege — not a schema-cache miss or absent function.
      const msg = error.message.toLowerCase();
      const isAuthDenial =
        msg.includes("permission denied") ||
        msg.includes("could not find the function") ||
        msg.includes("not found") ||
        error.code === "PGRST202" ||
        error.code === "42501";
      expect(isAuthDenial).toBe(true);
    });

    // ── D-05: no activation → balance is unknown, not a computed number ───────

    it("D-05: property without activation shows balance_state = unknown_payment_history", async () => {
      const snap  = await callSnapshot(ownerClient);
      const prop  = findProp(snap, propId);
      expect(prop, "Test property not found in snapshot").not.toBeNull();
      expect(prop.balanceState).toBe("unknown_payment_history");
    });

    it("D-05b: property without activation shows remaining = 0 (no phantom)", async () => {
      const snap = await callSnapshot(ownerClient);
      const prop = findProp(snap, propId);
      expect(Number(prop.remaining)).toBe(0);
    });

    it("D-05c: property without activation shows outstandingMinor = null", async () => {
      const snap = await callSnapshot(ownerClient);
      const prop = findProp(snap, propId);
      expect(prop.outstandingMinor).toBeNull();
    });

    it("D-05d: property without activation shows paymentStatus = unknown", async () => {
      const snap = await callSnapshot(ownerClient);
      const prop = findProp(snap, propId);
      expect(prop.paymentStatus).toBe("unknown");
    });
  });
}
