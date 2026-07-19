/**
 * Gate-B1: Deposit release registry and export authorisation gate.
 *
 * Proves end-to-end that the three-condition production render invariant holds:
 *   (1) release state = production
 *   (2) account has Growth+ entitlement (evidence_vault_dispute_pack)
 *   (3) authenticated actor has account-management authority
 *
 * ISOLATION CONTRACT
 * ──────────────────
 * All release-state transition tests use the isolated pack type
 * 'deposit_dispute_pack_gate_b1_test'. The real 'deposit_dispute_pack'
 * registry row is only READ (never written) by these tests.
 * T-03 captures the real registry state at start; T-13 proves it is
 * unchanged at the end. Zero false operational transition events are created.
 *
 * Export RPC tests pass p_registry_pack_type = TEST_PACK_TYPE so they
 * consult the isolated registry row rather than the real one.
 *
 * The registry+export describe is guarded by isLocalSupabase() as a
 * defence-in-depth layer (tests only run against local Docker Supabase).
 *
 * Test inventory:
 *   T-15  Static: authorise-before-print guard in print page source
 *   T-16  Static: production-appropriate limitations text preserved
 *
 *   T-01  Entitlement helper — pro-plan account returns true
 *   T-02  Entitlement helper — root account returns true
 *   T-14  RLS scope isolation — ownerB cannot read accountA packs
 *
 *   T-03  Real registry state captured at start (adapts to current state)
 *   T-04  Transition RPC — non-root caller rejected (P0401) [read-only test]
 *   T-05  Transition RPC — invalid state-machine step rejected (P0408) [TEST_PACK_TYPE]
 *   T-06  Export-auth — non-root denied in internal_preview [TEST_PACK_TYPE]
 *   T-07  Export-auth — root owner allowed in internal_preview [TEST_PACK_TYPE]
 *   T-17  Workspace-vs-export split [workspace: real pack; export: TEST_PACK_TYPE]
 *   T-08  Export-auth — ownerA allowed in production [TEST_PACK_TYPE]
 *   T-09  Export-auth — null pack record version uses registry pack_version [TEST_PACK_TYPE]
 *   T-10  Export-auth — tenantA1 denied (no manage permission) [TEST_PACK_TYPE]
 *   T-11  Export-auth — ownerB denied (cross-account) [TEST_PACK_TYPE]
 *   T-12  Export-auth — suspended state blocks all actors [TEST_PACK_TYPE]
 *   T-13  Zero-mutation proof: real registry is unchanged after all tests
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

// ── Fixture IDs ─────────────────────────────────────────────────────────────

const accountAId = isolationFixtures.accounts.accountA.id;
const accountBId = isolationFixtures.accounts.accountB.id;
const rootAccountId = isolationFixtures.accounts.root.id;
const propertyId = isolationFixtures.users.tenantA1.propertyId;
const tenantId = isolationFixtures.users.tenantA1.tenantId;

const GB1_PACK_ID = "b1000001-0000-4000-0000-000000000001";

// Isolated pack type — ALL transition and export tests use this.
// The real 'deposit_dispute_pack' is only read, never transitioned.
const TEST_PACK_TYPE = "deposit_dispute_pack_gate_b1_test";

// Unique per run — prevents release_reference conflicts.
const RUN_ID = Math.random().toString(36).slice(2, 10);

const PRINT_PAGE_PATH = path.join(
  process.cwd(),
  "src/pages/documents/DepositDisputePackPrintPage.jsx",
);

// ── Static contracts ─────────────────────────────────────────────────────────

describe("Gate-B1 static contracts", () => {
  it("T-15: print page source has authorise-before-print guard (no silent catch)", () => {
    const src = fs.readFileSync(PRINT_PAGE_PATH, "utf-8");
    expect(src).toContain("prepareDepositDisputePackExport");
    expect(src).toContain("setExportAuthError");
    expect(src).toContain("window.print()");
    expect(src).not.toContain("recordDepositDisputePackExport");
    expect(src).not.toContain("Printing should remain available");
    const authPos = src.indexOf("prepareDepositDisputePackExport");
    const printPos = src.indexOf("window.print()");
    expect(authPos).toBeGreaterThan(0);
    expect(printPos).toBeGreaterThan(authPos);
  });

  it("T-16: production-appropriate limitations text preserved (no silent-demo regression)", () => {
    const src = fs.readFileSync(PRINT_PAGE_PATH, "utf-8");
    expect(src).toContain("not legal advice");
    expect(src).toContain("deposit adjudicator");
    expect(src).toContain("does not independently authenticate");
    expect(src).toContain("business-process lock");
  });
});

// ── Entitlement and RLS (no state, any configured harness) ───────────────────

describe.skipIf(!isIntegrationHarnessConfigured())(
  "Gate-B1 entitlement and RLS",
  () => {
    let admin;

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();
    });

    it("T-01: entitlement helper returns true for pro-plan account (accountA)", async () => {
      const { data, error } = await admin.rpc("deposit_pack_account_has_entitlement", {
        p_account_id: accountAId,
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it("T-02: entitlement helper returns true for root account", async () => {
      const { data, error } = await admin.rpc("deposit_pack_account_has_entitlement", {
        p_account_id: rootAccountId,
      });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it("T-14: ownerB cannot read accountA deposit packs (RLS scope isolation)", async () => {
      const { client: ownerBClient } = await signInAsFixtureUser("ownerB");
      const { data, error } = await ownerBClient
        .from("deposit_dispute_packs")
        .select("id")
        .eq("id", GB1_PACK_ID);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  },
);

// ── Registry and export gate (local Supabase only, uses TEST_PACK_TYPE) ──────

describe.skipIf(!isIntegrationHarnessConfigured() || !isLocalSupabase())(
  "Gate-B1 deposit release registry and export gate",
  () => {
    let admin;
    let REGISTRY_START_STATE; // real deposit_dispute_pack state at test start

    async function cleanupPack() {
      await admin
        .from("deposit_pack_export_authorisations")
        .delete()
        .eq("pack_id", GB1_PACK_ID);
      await admin
        .from("deposit_dispute_packs")
        .delete()
        .eq("id", GB1_PACK_ID);
    }

    beforeAll(async () => {
      await ensureIsolationHarnessSeed();
      admin = getIntegrationAdminClient();
      await cleanupPack();

      // Clean any residual test registry/ledger rows from a prior failed run.
      // Gate-B1G guard blocks admin DELETE on these tables; use psql break-glass.
      localPsqlBreakGlassDelete(TEST_PACK_TYPE, TEST_PACK_TYPE);

      // Seed the test pack used by export-auth tests.
      const { error } = await admin.from("deposit_dispute_packs").upsert(
        {
          id: GB1_PACK_ID,
          account_id: accountAId,
          property_id: propertyId,
          tenant_id: tenantId,
          title: "Gate-B1 release registry integration test pack",
          status: "draft",
          deposit_amount: 800,
          proposed_deduction_amount: 100,
          summary: "Seeded by Gate-B1 integration test suite.",
          // pack_version intentionally null — confirms null pack record does not affect authorisation version (B1V hotfix)
        },
        { onConflict: "id" },
      );
      if (error) throw new Error(`seed pack: ${error.message}`);

      // Capture real registry state. T-03 asserts this; T-13 proves it is unchanged.
      const { data: reg } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state")
        .eq("pack_type", "deposit_dispute_pack")
        .single();
      REGISTRY_START_STATE = reg?.release_state;

      // Seed isolated test pack type at internal_preview (fresh INSERT after psql cleanup).
      const { error: regErr } = await admin.from("deposit_pack_release_registry").insert({
        pack_type: TEST_PACK_TYPE,
        release_state: "internal_preview",
        pack_version: "gate_b1_test",
      });
      if (regErr) throw new Error(`seed registry: ${regErr.message}`);
    });

    afterAll(async () => {
      await cleanupPack();
      // Gate-B1G guard blocks admin DELETE on registry and ledger tables.
      // Use psql break-glass (session_replication_role=replica) for cleanup.
      localPsqlBreakGlassDelete(TEST_PACK_TYPE, TEST_PACK_TYPE);
    });

    // ── T-03: Real registry state capture ────────────────────────────────────

    it("T-03: real deposit_dispute_pack registry state is captured and stable", async () => {
      const { data, error } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state, pack_version")
        .eq("pack_type", "deposit_dispute_pack")
        .single();
      expect(error).toBeNull();
      expect(data?.release_state).toBe(REGISTRY_START_STATE);
      expect(data?.pack_version).toBe("gate_b1_v1");
    });

    // ── T-04: Non-root rejection (read-only test — fails before state change) ─

    it("T-04: transition RPC rejects non-root callers (P0401 before state change)", async () => {
      const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
      // Note: uses real pack_type — safe because non-root is rejected at step 1,
      // before the registry row is touched.
      const { data, error } = await ownerAClient.rpc(
        "transition_deposit_pack_release_state",
        {
          p_pack_type: "deposit_dispute_pack",
          p_new_state: "production",
          p_release_reference: `gb1-nonroot-${RUN_ID}`,
          p_rationale: "Should be rejected",
          p_pack_version: "gate_b1_v1",
        },
      );
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/root operator/i);
      expect(data).toBeNull();
    });

    // ── T-05: Invalid state step (uses TEST_PACK_TYPE — zero real ledger rows) ─

    it("T-05: transition RPC rejects invalid state-machine step (internal_preview → suspended)", async () => {
      const { client: rootClient } = await signInAsFixtureUser("rootOwner");
      // Uses TEST_PACK_TYPE (at internal_preview). Rejected before any insert.
      const { data, error } = await rootClient.rpc(
        "transition_deposit_pack_release_state",
        {
          p_pack_type: TEST_PACK_TYPE,
          p_new_state: "suspended",
          p_release_reference: `gb1-invalid-step-${RUN_ID}`,
          p_rationale: "Test: internal_preview→suspended is not a valid step",
          p_pack_version: "gate_b1_test",
        },
      );
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/not permitted/i);
      expect(data).toBeNull();
    });

    // ── T-06 / T-07: Export-auth in internal_preview state (TEST_PACK_TYPE) ───

    it("T-06: export-auth denies non-root in internal_preview state", async () => {
      const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
      const { data, error } = await ownerAClient.rpc(
        "prepare_deposit_dispute_pack_export",
        { p_pack_id: GB1_PACK_ID, p_registry_pack_type: TEST_PACK_TYPE },
      );
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/internal preview/i);
      expect(data).toBeNull();
    });

    it("T-07: export-auth allows root owner in internal_preview state", async () => {
      const { client: rootClient } = await signInAsFixtureUser("rootOwner");
      const { data, error } = await rootClient.rpc(
        "prepare_deposit_dispute_pack_export",
        { p_pack_id: GB1_PACK_ID, p_registry_pack_type: TEST_PACK_TYPE },
      );
      expect(error).toBeNull();
      expect(data?.result).toBe("print_initiated");
      expect(data?.release_mode).toBe("internal_preview");
      expect(data?.is_root_preview).toBe(true);
    });

    // ── T-17: Workspace-vs-export split ──────────────────────────────────────
    // Workspace (RLS) checks role + entitlement only — no release gate.
    // Export gate (RPC) checks release state via TEST_PACK_TYPE (internal_preview).

    it(
      "T-17: workspace-vs-export split — Growth manager lists/edits pack (OK) " +
      "while export is denied by release gate",
      async () => {
        const { client: ownerAClient } = await signInAsFixtureUser("ownerA");

        // Half 1: workspace — SELECT (RLS must pass; no release state involved)
        const { data: packs, error: listErr } = await ownerAClient
          .from("deposit_dispute_packs")
          .select("id, title, status")
          .eq("id", GB1_PACK_ID);
        expect(listErr).toBeNull();
        expect(packs).toHaveLength(1);
        expect(packs[0].id).toBe(GB1_PACK_ID);

        // Half 1b: workspace — UPDATE
        const { error: updateErr } = await ownerAClient
          .from("deposit_dispute_packs")
          .update({ summary: "T-17 workspace edit" })
          .eq("id", GB1_PACK_ID);
        expect(updateErr).toBeNull();

        // Half 2: export denied — registry at internal_preview (via TEST_PACK_TYPE)
        const { data: authData, error: exportErr } = await ownerAClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID, p_registry_pack_type: TEST_PACK_TYPE },
        );
        expect(exportErr).not.toBeNull();
        expect(exportErr?.message).toMatch(/internal preview/i);
        expect(authData).toBeNull();
      },
    );

    // ── Production state gate (transitions TEST_PACK_TYPE, NOT real pack) ─────

    describe("production state gate", () => {
      let rootClient;
      let ownerAClient;

      beforeAll(async () => {
        const rootResult = await signInAsFixtureUser("rootOwner");
        rootClient = rootResult.client;
        const ownerAResult = await signInAsFixtureUser("ownerA");
        ownerAClient = ownerAResult.client;

        // Transition TEST_PACK_TYPE to production — NOT the real deposit_dispute_pack.
        const { error } = await rootClient.rpc(
          "transition_deposit_pack_release_state",
          {
            p_pack_type: TEST_PACK_TYPE,
            p_new_state: "production",
            p_release_reference: `gb1-test-go-live-${RUN_ID}`,
            p_rationale: "Gate-B1 integration test — isolated test pack, not real registry",
            p_pack_version: "gate_b1_test",
          },
        );
        if (error) throw new Error(`transition test pack to production: ${error.message}`);
      });

      afterAll(async () => {
        // Two-hop revert: TEST_PACK_TYPE production → suspended → internal_preview.
        await rootClient.rpc("transition_deposit_pack_release_state", {
          p_pack_type: TEST_PACK_TYPE,
          p_new_state: "suspended",
          p_release_reference: `gb1-test-revert-1-${RUN_ID}`,
          p_rationale: "Gate-B1 test revert step 1 (isolated pack)",
          p_pack_version: "gate_b1_test",
        });
        await rootClient.rpc("transition_deposit_pack_release_state", {
          p_pack_type: TEST_PACK_TYPE,
          p_new_state: "internal_preview",
          p_release_reference: `gb1-test-revert-2-${RUN_ID}`,
          p_rationale: "Gate-B1 test revert step 2 (isolated pack)",
          p_pack_version: "gate_b1_test",
        });
      });

      it("T-08: ownerA (entitled, account manager) can prepare export in production", async () => {
        const { data, error } = await ownerAClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID, p_registry_pack_type: TEST_PACK_TYPE },
        );
        expect(error).toBeNull();
        expect(data?.result).toBe("print_initiated");
        expect(data?.release_mode).toBe("production");
        expect(data?.is_root_preview).toBe(false);
      });

      it("T-09: null pack record pack_version uses registry pack_version in authorisation payload", async () => {
        const { data, error } = await ownerAClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID, p_registry_pack_type: TEST_PACK_TYPE },
        );
        expect(error).toBeNull();
        // gate_b1v hotfix: registry pack_version ('gate_b1_test') is used,
        // not the pack record's null value which previously defaulted to 'pre_gate_b'.
        expect(data?.pack_version).toBe("gate_b1_test");
      });

      it("T-10: tenantA1 denied — no account-management authority", async () => {
        const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
        const { data, error } = await tenantClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID, p_registry_pack_type: TEST_PACK_TYPE },
        );
        expect(error).not.toBeNull();
        expect(error?.message).toMatch(/not authorised to manage/i);
        expect(data).toBeNull();
      });

      it("T-11: ownerB denied — cross-account (no authority over accountA)", async () => {
        const { client: ownerBClient } = await signInAsFixtureUser("ownerB");
        const { data, error } = await ownerBClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID, p_registry_pack_type: TEST_PACK_TYPE },
        );
        expect(error).not.toBeNull();
        expect(error?.message).toMatch(/not authorised to manage/i);
        expect(data).toBeNull();
      });

      it("T-12: export denied when state is suspended (all actors blocked)", async () => {
        // Temporarily suspend TEST_PACK_TYPE within the production window.
        const { error: suspendErr } = await rootClient.rpc(
          "transition_deposit_pack_release_state",
          {
            p_pack_type: TEST_PACK_TYPE,
            p_new_state: "suspended",
            p_release_reference: `gb1-test-mid-suspend-${RUN_ID}`,
            p_rationale: "Gate-B1 test: suspended gate check (isolated pack)",
            p_pack_version: "gate_b1_test",
          },
        );
        expect(suspendErr).toBeNull();

        const { error: ownerAErr } = await ownerAClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID, p_registry_pack_type: TEST_PACK_TYPE },
        );
        expect(ownerAErr).not.toBeNull();
        expect(ownerAErr?.message).toMatch(/suspended/i);

        const { error: rootErr } = await rootClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID, p_registry_pack_type: TEST_PACK_TYPE },
        );
        expect(rootErr).not.toBeNull();
        expect(rootErr?.message).toMatch(/suspended/i);

        // Restore TEST_PACK_TYPE to production so afterAll two-hop works normally.
        const { error: restoreErr } = await rootClient.rpc(
          "transition_deposit_pack_release_state",
          {
            p_pack_type: TEST_PACK_TYPE,
            p_new_state: "production",
            p_release_reference: `gb1-test-mid-restore-${RUN_ID}`,
            p_rationale: "Gate-B1 test: restore after suspended check (isolated pack)",
            p_pack_version: "gate_b1_test",
          },
        );
        expect(restoreErr).toBeNull();
      });
    });

    // ── T-13: Zero-mutation proof ─────────────────────────────────────────────
    // Runs after the production state gate describe has completed.
    // Proves the real deposit_dispute_pack registry row was never changed.

    it("T-13: zero-mutation proof — real deposit_dispute_pack registry is unchanged", async () => {
      const { data, error } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state")
        .eq("pack_type", "deposit_dispute_pack")
        .single();
      expect(error).toBeNull();
      expect(data?.release_state).toBe(REGISTRY_START_STATE);
    });
  },
);
