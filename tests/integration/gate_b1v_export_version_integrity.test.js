/**
 * Gate-B1V: Export authorisation pack_version integrity.
 *
 * Proves that prepare_deposit_dispute_pack_export records the registry
 * pack_version in deposit_pack_export_authorisations, not a pack-record
 * column default (which was always 'pre_gate_b' before this hotfix).
 *
 * Root cause (gate_b_ent_deposit_export_fix.sql):
 *   v_historical_version := coalesce(deposit_dispute_packs.pack_version, 'pre_gate_b')
 *   INSERT ... pack_version = v_historical_version  ← always 'pre_gate_b' for null-versioned packs
 *   v_registry_version was read correctly but only returned in JSON, never inserted.
 *
 * Fix (gate_b1v_export_version_integrity.sql): remove v_pack_version_col and
 * v_historical_version. Read release_state and pack_version atomically from the
 * same registry row (step 4). Use v_registry_version for both INSERT and return.
 *
 * ISOLATION CONTRACT
 * ──────────────────
 * All tests use isolated pack types:
 *   TEST_PACK_TYPE_V  = 'deposit_dispute_pack_gate_b1v_test'  (pack_version 'gate_b1v_test')
 *   TEST_PACK_TYPE_V2 = 'deposit_dispute_pack_gate_b1v2_test' (pack_version 'gate_b1_v2_test')
 * The real 'deposit_dispute_pack' registry row is never written.
 *
 * Test inventory:
 *   B1V-S1  Static: overlay function body omits v_historical_version, v_pack_version_col,
 *                   and 'pre_gate_b' literal
 *   B1V-S2  Static: overlay INSERT block uses v_registry_version (not v_historical_version)
 *
 *   B1V-I4  Denied export (non-root in internal_preview) creates no authorisation row
 *   B1V-I1  Root caller in internal_preview → pack_version = registry version
 *   B1V-I3  Anti-hardcoding: V2 registry (gate_b1_v2_test) → correct version recorded
 *   B1V-I2  ownerA in production → pack_version = registry version
 *   B1V-I5  Authorisation row release_mode and pack_version match live registry row
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
} from "./helpers/env.js";

// ── Fixture IDs ──────────────────────────────────────────────────────────────

const accountAId = isolationFixtures.accounts.accountA.id;
const propertyId  = isolationFixtures.users.tenantA1.propertyId;
const tenantId    = isolationFixtures.users.tenantA1.tenantId;

const B1V_PACK_ID = "b1000002-0000-4000-0000-000000000002";

// Two isolated pack types — one proves correct version recording, one proves
// there is no hardcoded version string in the function.
const TEST_PACK_TYPE_V  = "deposit_dispute_pack_gate_b1v_test";
const TEST_PACK_TYPE_V2 = "deposit_dispute_pack_gate_b1v2_test";

const RUN_ID = Math.random().toString(36).slice(2, 10);

const OVERLAY_SQL_PATH = path.join(
  process.cwd(),
  "supabase/gate_b1v_export_version_integrity.sql",
);

// ── Static contracts ─────────────────────────────────────────────────────────

describe("Gate-B1V static contracts", () => {
  it(
    "B1V-S1: overlay function body omits v_historical_version, v_pack_version_col, " +
    "and 'pre_gate_b' literal",
    () => {
      const src = fs.readFileSync(OVERLAY_SQL_PATH, "utf-8");
      // Match specifically 'as $$...$$' to capture the function body, not the DO block.
      const funcBody = src.match(/\bas\s+\$\$([\s\S]*?)\$\$/i)?.[1] ?? "";
      expect(funcBody.length).toBeGreaterThan(0);
      expect(funcBody).not.toContain("v_historical_version");
      expect(funcBody).not.toContain("v_pack_version_col");
      expect(funcBody).not.toContain("pre_gate_b");
    },
  );

  it(
    "B1V-S2: overlay INSERT into deposit_pack_export_authorisations uses v_registry_version " +
    "for pack_version (not v_historical_version or v_pack_version_col)",
    () => {
      const src      = fs.readFileSync(OVERLAY_SQL_PATH, "utf-8");
      const funcBody = src.match(/\bas\s+\$\$([\s\S]*?)\$\$/i)?.[1] ?? "";
      const insertBlock =
        funcBody.match(
          /insert\s+into\s+public\.deposit_pack_export_authorisations[\s\S]*?returning/i,
        )?.[0] ?? "";
      expect(insertBlock.length).toBeGreaterThan(0);
      expect(insertBlock).toContain("v_registry_version");
      expect(insertBlock).not.toContain("v_historical_version");
      expect(insertBlock).not.toContain("v_pack_version_col");
      expect(insertBlock).not.toContain("pre_gate_b");
    },
  );
});

// ── Integration tests (local Supabase only) ──────────────────────────────────

describe.skipIf(!isIntegrationHarnessConfigured() || !isLocalSupabase())(
  "Gate-B1V export version integrity",
  () => {
    let admin;
    let rootClient;
    let ownerAClient;

    async function cleanupPackAndAuths() {
      await admin
        .from("deposit_pack_export_authorisations")
        .delete()
        .eq("pack_id", B1V_PACK_ID);
      await admin
        .from("deposit_dispute_packs")
        .delete()
        .eq("id", B1V_PACK_ID);
    }

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();

      const rootResult   = await signInAsFixtureUser("rootOwner");
      rootClient         = rootResult.client;
      const ownerAResult = await signInAsFixtureUser("ownerA");
      ownerAClient       = ownerAResult.client;

      await cleanupPackAndAuths();

      // Break-glass delete any residual test registry rows from a prior failed run.
      localPsqlBreakGlassDelete(TEST_PACK_TYPE_V,  TEST_PACK_TYPE_V);
      localPsqlBreakGlassDelete(TEST_PACK_TYPE_V2, TEST_PACK_TYPE_V2);

      // Seed test pack. pack_version intentionally null — confirms null pack record
      // does not pollute the authorisation row after the B1V hotfix.
      const { error: packErr } = await admin.from("deposit_dispute_packs").upsert(
        {
          id:                        B1V_PACK_ID,
          account_id:                accountAId,
          property_id:               propertyId,
          tenant_id:                 tenantId,
          title:                     "Gate-B1V export version integrity test pack",
          status:                    "draft",
          deposit_amount:            900,
          proposed_deduction_amount: 150,
          summary:                   "Seeded by Gate-B1V integration test suite.",
        },
        { onConflict: "id" },
      );
      if (packErr) throw new Error(`seed pack: ${packErr.message}`);

      // Seed V registry at internal_preview with version 'gate_b1v_test'.
      const { error: regVErr } = await admin.from("deposit_pack_release_registry").insert({
        pack_type:     TEST_PACK_TYPE_V,
        release_state: "internal_preview",
        pack_version:  "gate_b1v_test",
      });
      if (regVErr) throw new Error(`seed V registry: ${regVErr.message}`);

      // Seed V2 registry at internal_preview with a distinct version.
      // V2 proves there is no hardcoded version string in the function.
      const { error: regV2Err } = await admin.from("deposit_pack_release_registry").insert({
        pack_type:     TEST_PACK_TYPE_V2,
        release_state: "internal_preview",
        pack_version:  "gate_b1_v2_test",
      });
      if (regV2Err) throw new Error(`seed V2 registry: ${regV2Err.message}`);

      // Transition V2 to production so ownerA can export (needed for B1V-I3).
      const { error: transV2Err } = await rootClient.rpc(
        "transition_deposit_pack_release_state",
        {
          p_pack_type:         TEST_PACK_TYPE_V2,
          p_new_state:         "production",
          p_release_reference: `b1v-v2-prod-${RUN_ID}`,
          p_rationale:         "Gate-B1V integration test — V2 pack type, not real registry",
          p_pack_version:      "gate_b1_v2_test",
        },
      );
      if (transV2Err) throw new Error(`transition V2 to production: ${transV2Err.message}`);
    });

    afterAll(async () => {
      await cleanupPackAndAuths();
      // Break-glass delete cleans up regardless of current state.
      localPsqlBreakGlassDelete(TEST_PACK_TYPE_V,  TEST_PACK_TYPE_V);
      localPsqlBreakGlassDelete(TEST_PACK_TYPE_V2, TEST_PACK_TYPE_V2);
    });

    // ── B1V-I4: Denied export creates no authorisation row ────────────────────

    it("B1V-I4: denied export (non-root in internal_preview) creates no authorisation row", async () => {
      const { count: before } = await admin
        .from("deposit_pack_export_authorisations")
        .select("id", { count: "exact", head: true })
        .eq("pack_id", B1V_PACK_ID);

      const { data, error } = await ownerAClient.rpc("prepare_deposit_dispute_pack_export", {
        p_pack_id:            B1V_PACK_ID,
        p_registry_pack_type: TEST_PACK_TYPE_V,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/internal preview/i);
      expect(data).toBeNull();

      const { count: after } = await admin
        .from("deposit_pack_export_authorisations")
        .select("id", { count: "exact", head: true })
        .eq("pack_id", B1V_PACK_ID);

      expect(after).toBe(before);
    });

    // ── B1V-I1: internal_preview + root → pack_version = registry version ─────

    it("B1V-I1: root caller in internal_preview records registry pack_version in authorisation", async () => {
      const { data, error } = await rootClient.rpc("prepare_deposit_dispute_pack_export", {
        p_pack_id:            B1V_PACK_ID,
        p_registry_pack_type: TEST_PACK_TYPE_V,
      });
      expect(error).toBeNull();
      expect(data?.result).toBe("print_initiated");
      expect(data?.pack_version).toBe("gate_b1v_test");
      expect(data?.release_mode).toBe("internal_preview");
      expect(data?.is_root_preview).toBe(true);
    });

    // ── B1V-I3: anti-hardcoding — second registry with distinct version ────────

    it(
      "B1V-I3: anti-hardcoding — V2 registry (gate_b1_v2_test) records correct " +
      "pack_version (not 'gate_b1v_test' or 'pre_gate_b')",
      async () => {
        const { data, error } = await ownerAClient.rpc("prepare_deposit_dispute_pack_export", {
          p_pack_id:            B1V_PACK_ID,
          p_registry_pack_type: TEST_PACK_TYPE_V2,
        });
        expect(error).toBeNull();
        expect(data?.result).toBe("print_initiated");
        expect(data?.pack_version).toBe("gate_b1_v2_test");
        expect(data?.release_mode).toBe("production");
      },
    );

    // ── Production state gate (V registry) ────────────────────────────────────

    describe("production state — V registry", () => {
      beforeAll(async () => {
        const { error } = await rootClient.rpc("transition_deposit_pack_release_state", {
          p_pack_type:         TEST_PACK_TYPE_V,
          p_new_state:         "production",
          p_release_reference: `b1v-v-prod-${RUN_ID}`,
          p_rationale:         "Gate-B1V integration test — V pack type at production",
          p_pack_version:      "gate_b1v_test",
        });
        if (error) throw new Error(`transition V to production: ${error.message}`);
      });

      afterAll(async () => {
        // Two-hop revert: production → suspended → internal_preview.
        await rootClient.rpc("transition_deposit_pack_release_state", {
          p_pack_type:         TEST_PACK_TYPE_V,
          p_new_state:         "suspended",
          p_release_reference: `b1v-v-revert-1-${RUN_ID}`,
          p_rationale:         "Gate-B1V test revert step 1 (isolated pack)",
          p_pack_version:      "gate_b1v_test",
        });
        await rootClient.rpc("transition_deposit_pack_release_state", {
          p_pack_type:         TEST_PACK_TYPE_V,
          p_new_state:         "internal_preview",
          p_release_reference: `b1v-v-revert-2-${RUN_ID}`,
          p_rationale:         "Gate-B1V test revert step 2 (isolated pack)",
          p_pack_version:      "gate_b1v_test",
        });
      });

      it("B1V-I2: ownerA in production records registry pack_version in authorisation", async () => {
        const { data, error } = await ownerAClient.rpc("prepare_deposit_dispute_pack_export", {
          p_pack_id:            B1V_PACK_ID,
          p_registry_pack_type: TEST_PACK_TYPE_V,
        });
        expect(error).toBeNull();
        expect(data?.result).toBe("print_initiated");
        expect(data?.pack_version).toBe("gate_b1v_test");
        expect(data?.release_mode).toBe("production");
        expect(data?.is_root_preview).toBe(false);
      });

      it(
        "B1V-I5: authorisation row release_mode and pack_version match live registry row",
        async () => {
          const { data: exportData, error: exportErr } = await ownerAClient.rpc(
            "prepare_deposit_dispute_pack_export",
            { p_pack_id: B1V_PACK_ID, p_registry_pack_type: TEST_PACK_TYPE_V },
          );
          expect(exportErr).toBeNull();
          const authId = exportData?.auth_id;
          expect(authId).toBeTruthy();

          const { data: authRow, error: authErr } = await admin
            .from("deposit_pack_export_authorisations")
            .select("pack_version, release_mode")
            .eq("id", authId)
            .single();
          expect(authErr).toBeNull();

          const { data: regRow, error: regErr } = await admin
            .from("deposit_pack_release_registry")
            .select("pack_version, release_state")
            .eq("pack_type", TEST_PACK_TYPE_V)
            .single();
          expect(regErr).toBeNull();

          expect(authRow?.pack_version).toBe(regRow?.pack_version);
          expect(authRow?.release_mode).toBe(regRow?.release_state);
        },
      );
    });
  },
);
