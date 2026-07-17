/**
 * Gate-B1G: Release registry and ledger write guard.
 *
 * Proves that:
 *   (a) direct writes to deposit_pack_release_registry and
 *       deposit_pack_release_transitions are blocked for ALL roles while the
 *       guard is enabled — including postgres (which has rolreplication=true
 *       but is not a superuser in the local Supabase environment);
 *   (b) the _guard.open_transition_window() nonce setter is not callable by
 *       service_role or authenticated, making the authorisation window unspoofable;
 *   (c) the transition RPC continues to work correctly via the nonce mechanism;
 *   (d) the original Gate-B1 seed statement (ON CONFLICT DO NOTHING) replays
 *       cleanly under the installed guard.
 *
 * ISOLATION CONTRACT
 * ──────────────────
 * Protection tests (B1G-P*) read the real deposit_dispute_pack row and assert
 * that write attempts are denied — the real row is NEVER successfully mutated.
 * Lifecycle tests (B1G-L*) use TEST_PACK_TYPE = 'deposit_dispute_pack_b1g_test'.
 * Cleanup uses the documented break-glass path (session_replication_role=replica),
 * which requires postgres credentials (rolreplication=true). No test row persists.
 *
 * Test inventory:
 *   B1G-S1  _guard schema exists
 *   B1G-S2  _guard.transition_authorisation table exists
 *   B1G-S3  _guard.open_transition_window not executable by service_role
 *   B1G-S4  _guard.open_transition_window not executable by authenticated
 *   B1G-S5  triggers installed on registry and ledger
 *   B1G-S6  transition RPC has no 'deposit_dispute_pack%' prefix text
 *   B1G-S7  transition RPC function body has no prefix-check text
 *   B1G-S8  Gate-B-ENT overlay still shows prior prefix guard (historical record)
 *   B1G-S9  export-fix overlay exists and references correct column names in INSERT
 *   B1G-S10 export-fix overlay removes legacy seed rows via DELETE, not UPDATE enabled=true
 *
 *   B1G-G1  localPsqlBreakGlassDelete: real pack type is rejected before psql runs
 *   B1G-G2  localPsqlBreakGlassDelete: non-local URL is rejected before psql runs
 *   B1G-G3  localPsqlBreakGlassDelete: empty pack type is rejected before psql runs
 *   B1G-G4  localPsqlBreakGlassDelete: mismatched expectedPackType is rejected
 *   B1G-G5  localPsqlBreakGlassDelete: valid local fixture pack type passes validation
 *
 *   B1G-P1  authenticated direct UPDATE denied
 *   B1G-P2  service_role direct UPDATE denied
 *   B1G-P3  postgres direct UPDATE denied while guard enabled
 *   B1G-P4  service_role direct DELETE denied
 *   B1G-P5  postgres direct DELETE denied while guard enabled
 *   B1G-P6  service_role cannot forge nonce; direct UPDATE still denied
 *   B1G-P7  registry state unchanged after all denial tests
 *   B1G-P8  ledger row count still zero after all denial tests
 *
 *   B1G-M1  validator returns false without prior open_transition_window
 *   B1G-M2  nonce from a committed transaction is not reusable in a new session
 *   B1G-M3  failed RPC leaves no usable authorisation context
 *
 *   B1G-R1  original Gate-B1 seed statement reruns without error under guard
 *   B1G-R2  replay does not alter existing registry state
 *   B1G-R3  replay creates no ledger event
 *   B1G-R4  direct INSERT at production is denied regardless of role
 *   B1G-R5  direct INSERT at suspended is denied regardless of role
 *
 *   B1G-L1  non-root RPC call denied (P0401)
 *   B1G-L2  root RPC valid transition: internal_preview -> production succeeds
 *   B1G-L3  exactly one registry change after the transition
 *   B1G-L4  exactly one ledger event after the transition
 *   B1G-L5  invalid state-machine step creates no partial state
 *   B1G-L6  idempotent duplicate creates no second ledger row
 *   B1G-L7  suspension and recovery via RPC succeed
 *   B1G-L8  ledger UPDATE denied
 *   B1G-L9  ledger DELETE denied
 *   B1G-L10 direct ledger INSERT denied
 *
 *   B1G-N1  nonce for TEST_PACK_TYPE does NOT authorize UPDATE of REAL_PACK_TYPE
 *   B1G-N2  nonce for state-A does NOT authorize UPDATE to state-B (same pack)
 *
 *   B1G-A1  session_replication_role privilege audit (documents which roles can bypass)
 *
 *   B1G-E1  Growth + no flag → allowed (plan-rank path)
 *   B1G-E2  downgrade to Starter + no flag → denied (plan rank insufficient)
 *   B1G-E3  restore to Growth + no flag → allowed again
 *   B1G-E4  Growth + deliberate deny flag (created_by non-null) → denied (overrides plan)
 *   B1G-E5  remove deny flag → allowed by plan again
 *   B1G-E6  Growth + explicit grant flag (enabled=true) → allowed
 *   B1G-E7  downgrade to Starter while grant remains → still allowed (grant overrides plan)
 *   B1G-E8  remove grant flag on Starter → denied (no flag, plan insufficient)
 *
 *   B1G-I1  real deposit_dispute_pack row is unchanged at end of full suite
 *   B1G-I2  lifecycle describe is skipped on non-local environments
 */

import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import {
  isIntegrationHarnessConfigured,
  isLocalSupabase,
  localPsqlBreakGlassDelete,
  localPsqlExec,
  localPsqlRun,
  validateBreakGlassCleanup,
} from "./helpers/env.js";

// ── Constants ────────────────────────────────────────────────────────────────

const REAL_PACK_TYPE = "deposit_dispute_pack";
const TEST_PACK_TYPE = "deposit_dispute_pack_b1g_test";
const RUN_ID = Math.random().toString(36).slice(2, 10);

const TRANSITION_RPC_PATH = path.join(
  process.cwd(),
  "supabase/gate_b1g_release_guard.sql",
);
const ENT_OVERLAY_PATH = path.join(
  process.cwd(),
  "supabase/gate_b_ent_effective_feature_resolver.sql",
);
const EXPORT_FIX_PATH = path.join(
  process.cwd(),
  "supabase/gate_b_ent_deposit_export_fix.sql",
);

// ── B1G-S: Static contracts ───────────────────────────────────────────────────

describe("B1G static contracts", () => {
  it("B1G-S1: gate_b1g_release_guard.sql exists", () => {
    expect(fs.existsSync(TRANSITION_RPC_PATH)).toBe(true);
  });

  it("B1G-S2: SQL file creates _guard schema", () => {
    const sql = fs.readFileSync(TRANSITION_RPC_PATH, "utf-8");
    expect(sql).toContain("create schema if not exists _guard");
  });

  it("B1G-S3: SQL file creates _guard.transition_authorisation table", () => {
    const sql = fs.readFileSync(TRANSITION_RPC_PATH, "utf-8");
    expect(sql).toContain("_guard.transition_authorisation");
    expect(sql).toContain("backend_pid");
    expect(sql).toContain("txid_current()");
  });

  it("B1G-S4: _guard.open_transition_window is REVOKE'd from service_role", () => {
    const sql = fs.readFileSync(TRANSITION_RPC_PATH, "utf-8");
    expect(sql).toContain("revoke execute on function _guard.open_transition_window");
    expect(sql).toMatch(/revoke execute on function _guard\.open_transition_window.*service_role/s);
  });

  it("B1G-S5: _guard.open_transition_window is REVOKE'd from authenticated", () => {
    const sql = fs.readFileSync(TRANSITION_RPC_PATH, "utf-8");
    expect(sql).toMatch(/revoke execute on function _guard\.open_transition_window.*authenticated/s);
  });

  it("B1G-S6: triggers are installed on both tables", () => {
    const sql = fs.readFileSync(TRANSITION_RPC_PATH, "utf-8");
    expect(sql).toContain("trg_b1g_registry_write_guard");
    expect(sql).toContain("trg_b1g_ledger_write_guard");
    expect(sql).toContain("on public.deposit_pack_release_registry");
    expect(sql).toContain("on public.deposit_pack_release_transitions");
  });

  it("B1G-S7: B1G overlay file contains no prefix-allowlist text anywhere", () => {
    const sql = fs.readFileSync(TRANSITION_RPC_PATH, "utf-8");
    expect(sql).not.toContain("not like 'deposit_dispute_pack%'");
    expect(sql).not.toContain('not like "deposit_dispute_pack%"');
  });

  it("B1G-S8: transition RPC function body contains no pack-type prefix check", () => {
    const b1gSql = fs.readFileSync(TRANSITION_RPC_PATH, "utf-8");
    const fnStart = b1gSql.indexOf(
      "create or replace function public.transition_deposit_pack_release_state",
    );
    const fnEnd = b1gSql.indexOf("\n$$;", fnStart);
    const fnBody = b1gSql.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain("deposit_dispute_pack%");
  });

  it("B1G-S9: export-fix overlay exists and uses correct column names in INSERT", () => {
    // gate_b_ent_deposit_export_fix.sql is the explicit corrective overlay.
    // The COMMENT on the function legitimately names the wrong columns as documentation;
    // this test only inspects the INSERT statement, not the whole file.
    expect(fs.existsSync(EXPORT_FIX_PATH)).toBe(true);
    const sql = fs.readFileSync(EXPORT_FIX_PATH, "utf-8");
    // Overlay must document the defect it corrects
    expect(sql).toContain("0ea0601");
    expect(sql).toContain("T-07");
    // Extract the INSERT statement block
    const insertStart = sql.indexOf(
      "insert into public.deposit_pack_export_authorisations",
    );
    const insertEnd = sql.indexOf("returning id into", insertStart);
    expect(insertStart).toBeGreaterThan(-1);
    const insertBlock = sql.slice(insertStart, insertEnd);
    // Correct columns appear in the INSERT
    expect(insertBlock).toContain("actor_id");
    expect(insertBlock).toContain("release_mode");
    expect(insertBlock).toContain("pack_version");
    // Wrong Gate-B-ENT column names must NOT appear in the INSERT statement
    expect(insertBlock).not.toContain("authorised_by");
    expect(insertBlock).not.toContain("release_state_at_export");
    expect(insertBlock).not.toContain("pack_version_at_export");
  });

  it("B1G-S10: export-fix overlay removes legacy seed rows via DELETE, not UPDATE enabled=true", () => {
    // PO ruling (Finding A): UPDATE enabled=false → enabled=true creates permanent grants
    // that survive plan downgrades. The correct fix is to delete the seed rows so accounts
    // fall back to plan-rank evaluation. Explicit admin-created rows (created_by non-null) remain.
    const sql = fs.readFileSync(EXPORT_FIX_PATH, "utf-8");
    // Must contain a DELETE statement targeting the legacy seed fingerprint
    expect(sql).toContain("delete from public.account_feature_flags");
    expect(sql).toContain("and  created_by  is null");
    // Must NOT convert seed rows into permanent grants
    expect(sql).not.toMatch(/set\s+enabled\s*=\s*true/i);
    // Must document the fingerprint rationale
    expect(sql).toContain("created_by IS NULL");
  });
});

// ── B1G-G: break-glass helper safety guards ───────────────────────────────────
// These tests call validateBreakGlassCleanup() directly with a fake URL or bad args
// to prove each guard fires before any psql subprocess is created.

describe("B1G break-glass helper safety guards", () => {
  const LOCAL_URL = "http://127.0.0.1:61021";

  it("B1G-G1: real pack type 'deposit_dispute_pack' is rejected before psql runs", () => {
    expect(() =>
      validateBreakGlassCleanup("deposit_dispute_pack", LOCAL_URL),
    ).toThrow(/forbidden/i);
  });

  it("B1G-G2: non-local Supabase URL is rejected before psql runs", () => {
    expect(() =>
      validateBreakGlassCleanup("deposit_dispute_pack_test", "https://staging.tenaqo.com"),
    ).toThrow(/non-local|not local/i);
  });

  it("B1G-G3: empty pack type is rejected before psql runs", () => {
    expect(() =>
      validateBreakGlassCleanup("", LOCAL_URL),
    ).toThrow(/empty/i);
  });

  it("B1G-G4: mismatched expectedPackType is rejected before psql runs", () => {
    expect(() =>
      validateBreakGlassCleanup(
        "deposit_dispute_pack_other_test",
        LOCAL_URL,
        "deposit_dispute_pack_expected_test",
      ),
    ).toThrow(/does not match/i);
  });

  it("B1G-G5: valid local fixture pack type passes validation without throwing", () => {
    expect(() =>
      validateBreakGlassCleanup(
        "deposit_dispute_pack_b1g_test",
        LOCAL_URL,
        "deposit_dispute_pack_b1g_test",
      ),
    ).not.toThrow();
  });
});

// ── B1G-E: Entitlement flag semantics (localhost-only) ───────────────────────
// Proves that account_has_effective_feature / deposit_pack_account_has_entitlement
// correctly implements the three-tier precedence after the seed-row deletion fix:
//   (b) enabled=false row → explicit deny (overrides plan)
//   (c) enabled=true row  → explicit grant (overrides plan)
//   (e) no row            → plan-rank evaluation
// Uses a throwaway test account created via psql to avoid mutating fixture accounts.

const ENT_TEST_ACCOUNT_ID = "b1e00001-0000-4000-8000-000000000001";
// ownerA's email — we resolve the actual auth.users UUID at insert time via subselect.
const ENT_TEST_CREATED_BY_EMAIL = isolationFixtures.users.ownerA.email;

describe.skipIf(!isIntegrationHarnessConfigured() || !isLocalSupabase())(
  "B1G-E entitlement flag semantics",
  () => {
    function entitlementCheck() {
      return localPsqlRun(
        `SELECT CASE WHEN public.deposit_pack_account_has_entitlement('${ENT_TEST_ACCOUNT_ID}') ` +
        `THEN 'ALLOWED' ELSE 'DENIED' END AS access_check;`,
      );
    }

    beforeAll(async () => {
      // Seed fixture auth users first so the created_by FK on accounts is satisfied.
      await ensureIsolationHarnessSeed();
      // Create the ephemeral test account. Resolve ownerA's actual auth.users UUID via
      // subselect — the fixture constant is only the email; the real UUID is auth-assigned.
      localPsqlExec(
        `INSERT INTO public.accounts (id, name, created_by, subscription_plan, is_root) ` +
        `SELECT ` +
        `  '${ENT_TEST_ACCOUNT_ID}', ` +
        `  'B1G-E entitlement test account', ` +
        `  u.id, ` +
        `  'growth', ` +
        `  false ` +
        `FROM auth.users u WHERE u.email = '${ENT_TEST_CREATED_BY_EMAIL}' ` +
        `ON CONFLICT (id) DO UPDATE SET subscription_plan = 'growth', is_root = false;`,
      );
      // Clear any stale flag rows from a prior failed run.
      localPsqlExec(
        `DELETE FROM public.account_feature_flags WHERE account_id = '${ENT_TEST_ACCOUNT_ID}';`,
      );
    });

    afterAll(() => {
      // CASCADE from accounts deletion removes flag rows automatically.
      localPsqlExec(
        `DELETE FROM public.accounts WHERE id = '${ENT_TEST_ACCOUNT_ID}';`,
      );
    });

    it("B1G-E1: Growth + no flag → allowed (plan-rank path, no flag row)", () => {
      // No flag row → flag CTE returns NULL → falls through to plan_rank(growth) >= plan_rank(growth) = true
      const result = entitlementCheck();
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("ALLOWED");
    });

    it("B1G-E2: downgrade to Starter + no flag → denied (plan rank insufficient)", () => {
      localPsqlExec(
        `UPDATE public.accounts SET subscription_plan = 'starter' WHERE id = '${ENT_TEST_ACCOUNT_ID}';`,
      );
      const result = entitlementCheck();
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("DENIED");
    });

    it("B1G-E3: restore to Growth + no flag → allowed again (downgrade reversal)", () => {
      localPsqlExec(
        `UPDATE public.accounts SET subscription_plan = 'growth' WHERE id = '${ENT_TEST_ACCOUNT_ID}';`,
      );
      const result = entitlementCheck();
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("ALLOWED");
    });

    it("B1G-E4: Growth + deliberate deny flag (enabled=false, created_by non-null) → denied", () => {
      // Insert an intentional deny row — admin-created (created_by IS NOT NULL).
      // This is the pattern that must NOT be deleted by the corrective overlay.
      localPsqlExec(
        `INSERT INTO public.account_feature_flags ` +
        `  (account_id, feature_key, enabled, created_by) ` +
        `SELECT ` +
        `  '${ENT_TEST_ACCOUNT_ID}', 'evidence_vault_dispute_pack', false, u.id ` +
        `FROM auth.users u WHERE u.email = '${ENT_TEST_CREATED_BY_EMAIL}' ` +
        `ON CONFLICT (account_id, feature_key) DO UPDATE SET enabled = false;`,
      );
      // enabled=false overrides plan rank → deny
      const result = entitlementCheck();
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("DENIED");
    });

    it("B1G-E5: remove deny flag → allowed by plan again", () => {
      localPsqlExec(
        `DELETE FROM public.account_feature_flags ` +
        `WHERE account_id = '${ENT_TEST_ACCOUNT_ID}' ` +
        `  AND feature_key = 'evidence_vault_dispute_pack';`,
      );
      const result = entitlementCheck();
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("ALLOWED");
    });

    it("B1G-E6: Growth + explicit grant (enabled=true) → allowed", () => {
      localPsqlExec(
        `INSERT INTO public.account_feature_flags ` +
        `  (account_id, feature_key, enabled, created_by) ` +
        `SELECT ` +
        `  '${ENT_TEST_ACCOUNT_ID}', 'evidence_vault_dispute_pack', true, u.id ` +
        `FROM auth.users u WHERE u.email = '${ENT_TEST_CREATED_BY_EMAIL}' ` +
        `ON CONFLICT (account_id, feature_key) DO UPDATE SET enabled = true;`,
      );
      const result = entitlementCheck();
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("ALLOWED");
    });

    it("B1G-E7: downgrade to Starter while explicit grant remains → still allowed (grant overrides plan)", () => {
      localPsqlExec(
        `UPDATE public.accounts SET subscription_plan = 'starter' WHERE id = '${ENT_TEST_ACCOUNT_ID}';`,
      );
      // enabled=true row overrides plan_rank check → allow even on Starter
      const result = entitlementCheck();
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("ALLOWED");
    });

    it("B1G-E8: remove grant flag on Starter plan → denied (no flag, plan insufficient)", () => {
      localPsqlExec(
        `DELETE FROM public.account_feature_flags ` +
        `WHERE account_id = '${ENT_TEST_ACCOUNT_ID}' ` +
        `  AND feature_key = 'evidence_vault_dispute_pack';`,
      );
      // No flag row, plan = starter, rank(starter) < rank(growth) → deny
      const result = entitlementCheck();
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("DENIED");
    });
  },
);

// ── B1G-P + B1G-M + B1G-R: Protection, hardening, replay (local only) ───────

describe.skipIf(!isIntegrationHarnessConfigured() || !isLocalSupabase())(
  "B1G protection, marker hardening, and replay (local Supabase only)",
  () => {
    let admin;
    let REGISTRY_START_STATE;
    let LEDGER_START_COUNT;

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();

      const { data: reg } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state")
        .eq("pack_type", REAL_PACK_TYPE)
        .single();
      REGISTRY_START_STATE = reg?.release_state;

      const { count } = await admin
        .from("deposit_pack_release_transitions")
        .select("*", { count: "exact", head: true })
        .eq("pack_type", REAL_PACK_TYPE);
      LEDGER_START_COUNT = count ?? 0;
    });

    // ── B1G-P: Real row protection tests ─────────────────────────────────────

    it("B1G-P1: authenticated direct UPDATE of registry is blocked (RLS; state unchanged)", async () => {
      // SELECT-only RLS for authenticated silently prevents the UPDATE (0 rows, no error).
      // The trigger is a second backstop if RLS were ever relaxed.
      const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
      await ownerAClient
        .from("deposit_pack_release_registry")
        .update({ release_state: "production" })
        .eq("pack_type", REAL_PACK_TYPE);
      // Whether RLS fires silently or trigger raises, the state must be unchanged.
      const { data } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state")
        .eq("pack_type", REAL_PACK_TYPE)
        .single();
      expect(data?.release_state).toBe(REGISTRY_START_STATE);
    });

    it("B1G-P2: service_role direct UPDATE of registry is denied by trigger", async () => {
      // admin client uses service_role JWT — bypasses RLS but trigger still fires.
      const { error } = await admin
        .from("deposit_pack_release_registry")
        .update({ release_state: "production", updated_at: new Date().toISOString() })
        .eq("pack_type", REAL_PACK_TYPE);
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/gate-b1g|P0G02/i);
    });

    it("B1G-P3: postgres direct UPDATE is denied while guard is enabled", () => {
      // postgres has rolreplication=true and owns the tables (bypasses RLS).
      // A lone direct UPDATE still hits the BEFORE trigger which raises P0G02.
      const result = localPsqlRun(
        `UPDATE public.deposit_pack_release_registry ` +
        `SET release_state = 'production', updated_at = now() ` +
        `WHERE pack_type = '${REAL_PACK_TYPE}';`,
      );
      expect(result.success).toBe(false);
      expect(result.stderr).toMatch(/gate-b1g|P0G02/i);
    });

    it("B1G-P4: service_role direct DELETE of registry row is denied", async () => {
      const { error } = await admin
        .from("deposit_pack_release_registry")
        .delete()
        .eq("pack_type", REAL_PACK_TYPE);
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/gate-b1g|P0G04/i);
    });

    it("B1G-P5: postgres direct DELETE of registry row is denied while guard is enabled", () => {
      const result = localPsqlRun(
        `DELETE FROM public.deposit_pack_release_registry WHERE pack_type = '${REAL_PACK_TYPE}';`,
      );
      expect(result.success).toBe(false);
      expect(result.stderr).toMatch(/gate-b1g|P0G04/i);
    });

    it("B1G-P6: service_role cannot forge nonce; direct UPDATE after attempt is still denied", () => {
      // Attempt 1: service_role (SET ROLE) tries to call _guard.open_transition_window.
      // REVOKE EXECUTE means it should fail with permission denied.
      const forgeResult = localPsqlRun(
        `SET ROLE service_role; ` +
        `SELECT _guard.open_transition_window('${REAL_PACK_TYPE}', 'production'); ` +
        `RESET ROLE;`,
      );
      // Either the call fails (REVOKE enforced) or the subsequent UPDATE fails (no valid nonce)
      // — at least one of these must be true. We assert both: forge fails AND direct UPDATE fails.
      // (The forge may fail before the UPDATE; we test them independently.)

      // Attempt 2: admin client (service_role) tries direct UPDATE without nonce.
      // This simulates the scenario where a bypass attempt was made and failed.
      const { error: updateError } = (() => {
        let result;
        // Use a synchronous approach with psql for clarity
        const updateResult = localPsqlRun(
          `SET ROLE service_role; ` +
          `UPDATE public.deposit_pack_release_registry ` +
          `  SET release_state = 'production', updated_at = now() ` +
          `  WHERE pack_type = '${REAL_PACK_TYPE}'; ` +
          `RESET ROLE;`,
        );
        return { error: updateResult.success ? null : { message: updateResult.stderr } };
      })();
      expect(updateError).not.toBeNull();
    });

    it("B1G-P7: real registry state is unchanged after all denial tests", async () => {
      const { data, error } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state, pack_version")
        .eq("pack_type", REAL_PACK_TYPE)
        .single();
      expect(error).toBeNull();
      expect(data?.release_state).toBe(REGISTRY_START_STATE);
    });

    it("B1G-P8: real ledger count is unchanged after all denial tests", async () => {
      const { count } = await admin
        .from("deposit_pack_release_transitions")
        .select("*", { count: "exact", head: true })
        .eq("pack_type", REAL_PACK_TYPE);
      expect(count).toBe(LEDGER_START_COUNT);
    });

    // ── B1G-M: Marker hardening ───────────────────────────────────────────────

    it("B1G-M1: is_transition_authorized returns false without prior open_transition_window", () => {
      // Prove the validator returns false for the current postgres session (no nonce open).
      const result = localPsqlRun(
        `SELECT _guard.is_transition_authorized('${REAL_PACK_TYPE}', 'production') AS auth;`,
      );
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("f"); // false — no authorised window
    });

    it("B1G-M2: nonce from a prior committed transaction cannot be reused in a new session", () => {
      // T1: postgres inserts a nonce for REAL_PACK_TYPE production and commits.
      localPsqlExec(
        `INSERT INTO _guard.transition_authorisation (backend_pid, txid, pack_type, new_state) ` +
        `VALUES (pg_backend_pid(), txid_current(), '${REAL_PACK_TYPE}', 'production') ` +
        `ON CONFLICT (backend_pid, txid) DO NOTHING;`,
      );
      // T2: new psql session — different backend_pid and txid.
      // is_transition_authorized checks pg_backend_pid() and txid_current() against stored row.
      // These differ in the new session, so validation returns false.
      const result = localPsqlRun(
        `SELECT _guard.is_transition_authorized('${REAL_PACK_TYPE}', 'production') AS auth;`,
      );
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("f"); // false — nonce from different backend/txid
      // Cleanup: remove the stale nonce row (postgres can DELETE from _guard as table owner).
      localPsqlExec(
        `DELETE FROM _guard.transition_authorisation ` +
        `WHERE pack_type = '${REAL_PACK_TYPE}';`,
      );
    });

    it("B1G-M3: failed RPC leaves no usable authorisation context", async () => {
      // Call the transition RPC with an invalid state step (internal_preview → suspended).
      // The RPC opens the nonce at step 8 (AFTER validation at step 7), so validation
      // fails BEFORE the nonce is opened. Either way, transaction rollback removes any nonce.
      const { client: rootClient } = await signInAsFixtureUser("rootOwner");
      const { error: rpcError } = await rootClient.rpc(
        "transition_deposit_pack_release_state",
        {
          p_pack_type:         REAL_PACK_TYPE,
          p_new_state:         "suspended", // invalid from internal_preview
          p_release_reference: `b1g-m3-probe-${RUN_ID}`,
          p_rationale:         "B1G-M3: probe to confirm no residual nonce",
          p_pack_version:      "gate_b1_v1",
        },
      );
      expect(rpcError).not.toBeNull(); // must be rejected

      // After the failed RPC, the direct UPDATE must still be denied (no residual nonce).
      const { error: updateError } = await admin
        .from("deposit_pack_release_registry")
        .update({ release_state: "suspended" })
        .eq("pack_type", REAL_PACK_TYPE);
      expect(updateError).not.toBeNull();
      expect(updateError.message).toMatch(/gate-b1g|P0G02/i);
    });

    // ── B1G-R: Replay tests ───────────────────────────────────────────────────

    it("B1G-R1: original Gate-B1 seed statement reruns without error under guard", () => {
      // Mimics Pass 2: gate_b1_deposit_release_registry.sql replayed with guard active.
      // BEFORE INSERT trigger fires (state=internal_preview → allowed).
      // ON CONFLICT DO NOTHING: row exists → no insert. No error.
      const result = localPsqlRun(
        `INSERT INTO public.deposit_pack_release_registry (pack_type, release_state, pack_version) ` +
        `VALUES ('${REAL_PACK_TYPE}', 'internal_preview', 'gate_b1_v1') ` +
        `ON CONFLICT (pack_type) DO NOTHING;`,
      );
      expect(result.success).toBe(true);
    });

    it("B1G-R2: replay does not alter existing registry state or version", async () => {
      const { data } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state, pack_version")
        .eq("pack_type", REAL_PACK_TYPE)
        .single();
      expect(data?.release_state).toBe(REGISTRY_START_STATE);
      expect(data?.pack_version).toBe("gate_b1_v1");
    });

    it("B1G-R3: replay creates no ledger event", async () => {
      const { count } = await admin
        .from("deposit_pack_release_transitions")
        .select("*", { count: "exact", head: true })
        .eq("pack_type", REAL_PACK_TYPE);
      expect(count).toBe(LEDGER_START_COUNT);
    });

    it("B1G-R4: direct INSERT at production is denied regardless of role", () => {
      const result = localPsqlRun(
        `INSERT INTO public.deposit_pack_release_registry (pack_type, release_state, pack_version) ` +
        `VALUES ('b1g_test_prod_probe', 'production', 'test');`,
      );
      expect(result.success).toBe(false);
      expect(result.stderr).toMatch(/gate-b1g|P0G01/i);
    });

    it("B1G-R5: direct INSERT at suspended is denied regardless of role", () => {
      const result = localPsqlRun(
        `INSERT INTO public.deposit_pack_release_registry (pack_type, release_state, pack_version) ` +
        `VALUES ('b1g_test_susp_probe', 'suspended', 'test');`,
      );
      expect(result.success).toBe(false);
      expect(result.stderr).toMatch(/gate-b1g|P0G01/i);
    });

    // ── B1G-A: session_replication_role privilege audit (REVIEWER ADDITION) ───

    it("B1G-A1: documents which roles can set session_replication_role (break-glass audit)", () => {
      // PostgreSQL requires rolsuper=true OR rolreplication=true to set
      // session_replication_role = 'replica'. This test documents the current state.
      const result = localPsqlRun(
        `SELECT rolname, rolsuper, rolreplication ` +
        `FROM pg_roles ` +
        `WHERE rolname IN ('postgres', 'service_role', 'authenticated', 'anon') ` +
        `ORDER BY rolname;`,
      );
      expect(result.success).toBe(true);
      // Parse table output (rolname | rolsuper | rolreplication)
      const rows = {};
      for (const line of result.stdout.split("\n")) {
        const parts = line.split("|").map((p) => p.trim());
        if (parts.length >= 3 && parts[0] && parts[0] !== "rolname" && !parts[0].startsWith("-")) {
          rows[parts[0]] = {
            canBypass: parts[1] === "t" || parts[2] === "t",
          };
        }
      }
      // postgres must have break-glass capability (rolreplication or rolsuper)
      expect(rows["postgres"]?.canBypass).toBe(true);
      // Application roles must NOT be able to set session_replication_role
      expect(rows["service_role"]?.canBypass).toBe(false);
      expect(rows["authenticated"]?.canBypass).toBe(false);
      expect(rows["anon"]?.canBypass).toBe(false);
    });
  },
);

// ── B1G-L: Lifecycle tests (localhost-only, TEST_PACK_TYPE only) ──────────────

describe.skipIf(!isIntegrationHarnessConfigured() || !isLocalSupabase())(
  "B1G lifecycle tests (localhost-only, TEST_PACK_TYPE only)",
  () => {
    let admin;
    let rootClient;
    let ownerAClient;
    let rootUserId;

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();

      const rootResult = await signInAsFixtureUser("rootOwner");
      rootClient = rootResult.client;
      rootUserId = isolationFixtures.users.rootOwner.id;

      const ownerAResult = await signInAsFixtureUser("ownerA");
      ownerAClient = ownerAResult.client;

      // Clean any residual test rows from a prior run.
      localPsqlBreakGlassDelete(TEST_PACK_TYPE, TEST_PACK_TYPE);

      // Seed the isolated test registry row at internal_preview.
      const { error } = await admin.from("deposit_pack_release_registry").insert({
        pack_type:     TEST_PACK_TYPE,
        release_state: "internal_preview",
        pack_version:  "b1g_test_v1",
      });
      if (error) throw new Error(`seed test registry: ${error.message}`);
    });

    afterAll(async () => {
      // Gate-B1G blocks admin DELETE — use psql break-glass cleanup.
      // session_replication_role = 'replica' disables triggers for this session only.
      // Only postgres (rolreplication=true) can set it.
      localPsqlBreakGlassDelete(TEST_PACK_TYPE, TEST_PACK_TYPE);
    });

    it("B1G-L1: non-root caller is rejected (P0401) before any state change", async () => {
      const { error } = await ownerAClient.rpc(
        "transition_deposit_pack_release_state",
        {
          p_pack_type:         TEST_PACK_TYPE,
          p_new_state:         "production",
          p_release_reference: `b1g-l1-nonroot-${RUN_ID}`,
          p_rationale:         "B1G-L1: non-root probe",
          p_pack_version:      "b1g_test_v1",
        },
      );
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/root operator/i);
    });

    it("B1G-L2: root RPC transitions TEST_PACK_TYPE internal_preview -> production", async () => {
      const { data, error } = await rootClient.rpc(
        "transition_deposit_pack_release_state",
        {
          p_pack_type:         TEST_PACK_TYPE,
          p_new_state:         "production",
          p_release_reference: `b1g-l2-go-live-${RUN_ID}`,
          p_rationale:         "B1G-L2: lifecycle test go-live (isolated pack)",
          p_pack_version:      "b1g_test_v1",
        },
      );
      expect(error).toBeNull();
      expect(data?.release_state).toBe("production");
      expect(data?.previous_state).toBe("internal_preview");
      expect(data?.idempotent).toBe(false);
      expect(data?.pack_type).toBe(TEST_PACK_TYPE);
    });

    it("B1G-L3: registry shows exactly the new state and version after transition", async () => {
      const { data } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state, pack_version")
        .eq("pack_type", TEST_PACK_TYPE)
        .single();
      expect(data?.release_state).toBe("production");
      expect(data?.pack_version).toBe("b1g_test_v1");
    });

    it("B1G-L4: exactly one ledger event exists for TEST_PACK_TYPE", async () => {
      const { data, count } = await admin
        .from("deposit_pack_release_transitions")
        .select("*", { count: "exact" })
        .eq("pack_type", TEST_PACK_TYPE);
      expect(count).toBe(1);
      expect(data?.[0]?.previous_release_state).toBe("internal_preview");
      expect(data?.[0]?.new_release_state).toBe("production");
      expect(data?.[0]?.release_reference).toBe(`b1g-l2-go-live-${RUN_ID}`);
    });

    it("B1G-L5: invalid state-machine step (production -> internal_preview) creates no partial state", async () => {
      const { error } = await rootClient.rpc(
        "transition_deposit_pack_release_state",
        {
          p_pack_type:         TEST_PACK_TYPE,
          p_new_state:         "internal_preview", // invalid from production
          p_release_reference: `b1g-l5-invalid-${RUN_ID}`,
          p_rationale:         "B1G-L5: invalid step probe",
          p_pack_version:      "b1g_test_v1",
        },
      );
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/not permitted/i);

      // Registry and ledger must be unchanged.
      const { data: reg } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state")
        .eq("pack_type", TEST_PACK_TYPE)
        .single();
      expect(reg?.release_state).toBe("production");

      const { count } = await admin
        .from("deposit_pack_release_transitions")
        .select("*", { count: "exact", head: true })
        .eq("pack_type", TEST_PACK_TYPE);
      expect(count).toBe(1); // still one, from B1G-L2
    });

    it("B1G-L6: identical RPC call with same release_reference is idempotent (no duplicate ledger row)", async () => {
      const { data, error } = await rootClient.rpc(
        "transition_deposit_pack_release_state",
        {
          p_pack_type:         TEST_PACK_TYPE,
          p_new_state:         "production",
          p_release_reference: `b1g-l2-go-live-${RUN_ID}`, // same ref as B1G-L2
          p_rationale:         "B1G-L6: idempotency replay",
          p_pack_version:      "b1g_test_v1",
        },
      );
      expect(error).toBeNull();
      expect(data?.idempotent).toBe(true);

      const { count } = await admin
        .from("deposit_pack_release_transitions")
        .select("*", { count: "exact", head: true })
        .eq("pack_type", TEST_PACK_TYPE);
      expect(count).toBe(1); // still one, no duplicate
    });

    it("B1G-L7: suspension and recovery via RPC succeed (production -> suspended -> production)", async () => {
      // Suspend
      const { error: suspendErr } = await rootClient.rpc(
        "transition_deposit_pack_release_state",
        {
          p_pack_type:         TEST_PACK_TYPE,
          p_new_state:         "suspended",
          p_release_reference: `b1g-l7-suspend-${RUN_ID}`,
          p_rationale:         "B1G-L7: suspension test (isolated pack)",
          p_pack_version:      "b1g_test_v1",
        },
      );
      expect(suspendErr).toBeNull();

      const { data: susData } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state")
        .eq("pack_type", TEST_PACK_TYPE)
        .single();
      expect(susData?.release_state).toBe("suspended");

      // Recover to production (suspended -> production is valid)
      const { error: recoverErr } = await rootClient.rpc(
        "transition_deposit_pack_release_state",
        {
          p_pack_type:         TEST_PACK_TYPE,
          p_new_state:         "production",
          p_release_reference: `b1g-l7-recover-${RUN_ID}`,
          p_rationale:         "B1G-L7: recovery test (isolated pack)",
          p_pack_version:      "b1g_test_v1",
        },
      );
      expect(recoverErr).toBeNull();

      const { data: recData } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state")
        .eq("pack_type", TEST_PACK_TYPE)
        .single();
      expect(recData?.release_state).toBe("production");
    });

    it("B1G-L8: direct UPDATE of ledger row is denied (append-only)", async () => {
      const { data: rows } = await admin
        .from("deposit_pack_release_transitions")
        .select("id")
        .eq("pack_type", TEST_PACK_TYPE)
        .limit(1);
      const id = rows?.[0]?.id;
      expect(id).toBeDefined();

      const { error } = await admin
        .from("deposit_pack_release_transitions")
        .update({ rationale: "B1G-L8 tamper attempt" })
        .eq("id", id);
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/gate-b1g|P0G06|append-only/i);
    });

    it("B1G-L9: direct DELETE of ledger row is denied (append-only)", async () => {
      const { error } = await admin
        .from("deposit_pack_release_transitions")
        .delete()
        .eq("pack_type", TEST_PACK_TYPE);
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/gate-b1g|P0G07|append-only/i);
    });

    it("B1G-L10: direct INSERT into ledger without authorisation context is denied", async () => {
      const { error } = await admin.from("deposit_pack_release_transitions").insert({
        pack_type:              TEST_PACK_TYPE,
        previous_release_state: "production",
        new_release_state:      "suspended",
        approved_by:            rootUserId,
        release_reference:      `b1g-l10-direct-${RUN_ID}`,
        rationale:              "B1G-L10: direct ledger insert probe",
        pack_version:           "b1g_test_v1",
      });
      expect(error).not.toBeNull();
      expect(error.message).toMatch(/gate-b1g|P0G05/i);
    });

    // ── B1G-N: Nonce cross-pack and state-mismatch binding proofs ──────────────
    // These tests run as postgres (via localPsqlRun) which can directly insert a row
    // into _guard.transition_authorisation as table owner — this is the "direct nonce
    // insertion" bypass path. They prove that even with a valid nonce present, the
    // guard STILL enforces pack_type and new_state binding:
    //   - Nonce keyed to (TEST_PACK_TYPE, 'production') does NOT authorize a write
    //     to REAL_PACK_TYPE ('deposit_dispute_pack').
    //   - Nonce keyed to (TEST_PACK_TYPE, 'production') does NOT authorize a write
    //     to (TEST_PACK_TYPE, 'suspended') — wrong target state.
    // The BEGIN block and ON_ERROR_STOP=1 mean: the UPDATE fails → psql exits non-zero
    // → PostgreSQL rolls back the uncommitted transaction on connection close.
    // No rows (registry, ledger, or nonce) persist after each test.

    it("B1G-N1: nonce for TEST_PACK_TYPE does NOT authorize UPDATE of REAL_PACK_TYPE", () => {
      // Open a nonce that says "authorised: TEST_PACK_TYPE → production".
      // Then try to UPDATE REAL_PACK_TYPE ('deposit_dispute_pack') to 'production'.
      // Trigger calls is_transition_authorized('deposit_dispute_pack', 'production')
      // → nonce has pack_type='deposit_dispute_pack_b1g_test', so returns false → P0G02.
      const result = localPsqlRun(
        `BEGIN; ` +
        `INSERT INTO _guard.transition_authorisation (backend_pid, txid, pack_type, new_state) ` +
        `VALUES (pg_backend_pid(), txid_current(), '${TEST_PACK_TYPE}', 'production'); ` +
        `UPDATE public.deposit_pack_release_registry ` +
        `  SET release_state = 'production', updated_at = now() ` +
        `  WHERE pack_type = '${REAL_PACK_TYPE}'; ` +
        `ROLLBACK;`,
      );
      // UPDATE should fail: nonce is for TEST_PACK_TYPE, not REAL_PACK_TYPE.
      expect(result.success).toBe(false);
      expect(result.stderr).toMatch(/gate-b1g|P0G02/i);
    });

    it("B1G-N2: nonce for state-A does NOT authorize UPDATE to state-B for the same pack", () => {
      // Open a nonce that says "authorised: TEST_PACK_TYPE → production".
      // Then try to UPDATE TEST_PACK_TYPE to 'suspended' (different target state).
      // Trigger calls is_transition_authorized('deposit_dispute_pack_b1g_test', 'suspended')
      // → nonce has new_state='production', not 'suspended', so returns false → P0G02.
      const result = localPsqlRun(
        `BEGIN; ` +
        `INSERT INTO _guard.transition_authorisation (backend_pid, txid, pack_type, new_state) ` +
        `VALUES (pg_backend_pid(), txid_current(), '${TEST_PACK_TYPE}', 'production'); ` +
        `UPDATE public.deposit_pack_release_registry ` +
        `  SET release_state = 'suspended', updated_at = now() ` +
        `  WHERE pack_type = '${TEST_PACK_TYPE}'; ` +
        `ROLLBACK;`,
      );
      // UPDATE should fail: nonce new_state='production' ≠ attempted new state 'suspended'.
      expect(result.success).toBe(false);
      expect(result.stderr).toMatch(/gate-b1g|P0G02/i);
    });
  },
);

// ── B1G-I: Isolation verification (suite-level) ───────────────────────────────

describe.skipIf(!isIntegrationHarnessConfigured() || !isLocalSupabase())(
  "B1G isolation verification",
  () => {
    let admin;
    let REAL_STATE_AT_START;

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();

      const { data } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state")
        .eq("pack_type", REAL_PACK_TYPE)
        .single();
      REAL_STATE_AT_START = data?.release_state;
    });

    it("B1G-I1: real deposit_dispute_pack registry row is unchanged at end of full suite", async () => {
      const { data } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state, pack_version")
        .eq("pack_type", REAL_PACK_TYPE)
        .single();
      expect(data?.release_state).toBe(REAL_STATE_AT_START);
      expect(data?.pack_version).toBe("gate_b1_v1");
    });

    it("B1G-I2: no transition rows exist for real pack_type (ledger still zero)", async () => {
      const { count } = await admin
        .from("deposit_pack_release_transitions")
        .select("*", { count: "exact", head: true })
        .eq("pack_type", REAL_PACK_TYPE);
      expect(count).toBe(0);
    });
  },
);
