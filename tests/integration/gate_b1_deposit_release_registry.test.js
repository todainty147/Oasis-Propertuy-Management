/**
 * Gate-B1: Deposit release registry and export authorisation gate.
 *
 * Proves end-to-end that the three-condition production render invariant holds:
 *   (1) release state = production
 *   (2) account has Growth+ entitlement (evidence_vault_dispute_pack)
 *   (3) authenticated actor has account-management authority
 *
 * All three conditions are enforced at the database/RPC boundary.
 * Frontend routing is tested only for static source-level honesty contracts.
 *
 * Test inventory:
 *   T-01  Entitlement helper — pro-plan account returns true
 *   T-02  Entitlement helper — root account returns true
 *   T-03  Release registry seeded at internal_preview
 *   T-04  Transition RPC — non-root caller rejected (P0401)
 *   T-05  Transition RPC — invalid state machine step rejected (P0408)
 *   T-06  Export-auth — non-root denied in internal_preview (P0404)
 *   T-07  Export-auth — root owner allowed in internal_preview
 *   T-08  Export-auth — ownerA allowed in production
 *   T-09  Export-auth — null pack_version classified as pre_gate_b
 *   T-10  Export-auth — tenantA1 denied (no manage permission)
 *   T-11  Export-auth — ownerB denied (cross-account)
 *   T-12  Export-auth — suspended state blocks all actors
 *   T-13  Final registry state = internal_preview after full lifecycle
 *   T-14  RLS scope isolation — ownerB cannot read accountA packs
 *   T-15  Static: authorise-before-print guard in print page source
 *   T-16  Static: production-appropriate limitations text preserved
 *   T-17  Workspace-vs-export split: Growth manager lists/edits pack (workspace OK) while export denied
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
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

// ── Fixture IDs ─────────────────────────────────────────────────────────────

const accountAId = isolationFixtures.accounts.accountA.id;
const accountBId = isolationFixtures.accounts.accountB.id;
const rootAccountId = isolationFixtures.accounts.root.id;
const propertyId = isolationFixtures.users.tenantA1.propertyId;
const tenantId = isolationFixtures.users.tenantA1.tenantId;

const GB1_PACK_ID = "b1000001-0000-4000-0000-000000000001";

// Unique per run to avoid release_reference conflicts across test runs.
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
    // Old silent-catch: the recordDepositDisputePackExport import and its swallowed catch must be gone
    expect(src).not.toContain("recordDepositDisputePackExport");
    expect(src).not.toContain("Printing should remain available");
    // Authorise-before-print: prepareDepositDisputePackExport must appear before window.print()
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

// ── Integration contracts ─────────────────────────────────────────────────────

describe.skipIf(!isIntegrationHarnessConfigured())(
  "Gate-B1 deposit release registry and export gate",
  () => {
    let admin;

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
          // pack_version intentionally null — tests pre_gate_b classification
        },
        { onConflict: "id" },
      );
      if (error) throw new Error(`seed pack: ${error.message}`);
    });

    afterAll(cleanupPack);

    // ── T-01 / T-02: Entitlement helper ──────────────────────────────────────

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

    // ── T-03: Registry initial state ─────────────────────────────────────────

    it("T-03: release registry is seeded at internal_preview", async () => {
      const { data, error } = await admin
        .from("deposit_pack_release_registry")
        .select("release_state, pack_version")
        .eq("pack_type", "deposit_dispute_pack")
        .single();
      expect(error).toBeNull();
      expect(data?.release_state).toBe("internal_preview");
      expect(data?.pack_version).toBe("gate_b1_v1");
    });

    // ── T-04 / T-05: Transition RPC deny cases ───────────────────────────────

    it("T-04: transition RPC rejects non-root callers", async () => {
      const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
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

    it("T-05: transition RPC rejects invalid state-machine step (internal_preview → suspended)", async () => {
      const { client: rootClient } = await signInAsFixtureUser("rootOwner");
      const { data, error } = await rootClient.rpc(
        "transition_deposit_pack_release_state",
        {
          p_pack_type: "deposit_dispute_pack",
          p_new_state: "suspended",
          p_release_reference: `gb1-invalid-step-${RUN_ID}`,
          p_rationale: "Should be rejected — direct to suspended not allowed",
          p_pack_version: "gate_b1_v1",
        },
      );
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/not permitted/i);
      expect(data).toBeNull();
    });

    // ── T-17: Workspace-vs-export split ──────────────────────────────────────
    // Proves the critical customer-access invariant:
    // Growth manager at internal_preview → workspace (list/edit) OPEN; export DENIED.
    // The workspace RLS policy checks role+entitlement only (no release state).
    // Release state is enforced exclusively inside prepare_deposit_dispute_pack_export.

    it(
      "T-17: workspace-vs-export split — Growth manager lists and edits their pack (workspace OK) " +
      "while production export is denied (release gate holds)",
      async () => {
        const { client: ownerAClient } = await signInAsFixtureUser("ownerA");

        // Half 1: workspace — SELECT the pack; RLS must pass (role + entitlement, no release gate)
        const { data: packs, error: listErr } = await ownerAClient
          .from("deposit_dispute_packs")
          .select("id, title, status")
          .eq("id", GB1_PACK_ID);
        expect(listErr).toBeNull();
        expect(packs).toHaveLength(1);
        expect(packs[0].id).toBe(GB1_PACK_ID);

        // Half 1b: workspace — UPDATE the pack (confirms write RLS also unbocked from release state)
        const { error: updateErr } = await ownerAClient
          .from("deposit_dispute_packs")
          .update({ summary: "T-17 workspace edit" })
          .eq("id", GB1_PACK_ID);
        expect(updateErr).toBeNull();

        // Half 2: export denied — same actor, same pack, same state
        const { data: authData, error: exportErr } = await ownerAClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID },
        );
        expect(exportErr).not.toBeNull();
        expect(exportErr?.message).toMatch(/internal preview/i);
        expect(authData).toBeNull();
      },
    );

    // ── T-06 / T-07: Export-auth in initial (internal_preview) state ─────────

    it("T-06: export-auth denies non-root in internal_preview state", async () => {
      const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
      const { data, error } = await ownerAClient.rpc(
        "prepare_deposit_dispute_pack_export",
        { p_pack_id: GB1_PACK_ID },
      );
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/internal preview/i);
      expect(data).toBeNull();
    });

    it("T-07: export-auth allows root owner in internal_preview state", async () => {
      const { client: rootClient } = await signInAsFixtureUser("rootOwner");
      const { data, error } = await rootClient.rpc(
        "prepare_deposit_dispute_pack_export",
        { p_pack_id: GB1_PACK_ID },
      );
      expect(error).toBeNull();
      expect(data?.result).toBe("print_initiated");
      expect(data?.release_mode).toBe("internal_preview");
      expect(data?.is_root_preview).toBe(true);
    });

    // ── Production state gate tests ───────────────────────────────────────────

    describe("production state gate", () => {
      let rootClient;
      let ownerAClient;

      beforeAll(async () => {
        const rootResult = await signInAsFixtureUser("rootOwner");
        rootClient = rootResult.client;
        const ownerAResult = await signInAsFixtureUser("ownerA");
        ownerAClient = ownerAResult.client;

        const { error } = await rootClient.rpc(
          "transition_deposit_pack_release_state",
          {
            p_pack_type: "deposit_dispute_pack",
            p_new_state: "production",
            p_release_reference: `gb1-go-live-${RUN_ID}`,
            p_rationale: "Gate-B1 integration test — will be reverted in afterAll",
            p_pack_version: "gate_b1_v1",
          },
        );
        if (error) throw new Error(`transition to production failed: ${error.message}`);
      });

      afterAll(async () => {
        // Two-hop revert: production → suspended → internal_preview
        await rootClient.rpc("transition_deposit_pack_release_state", {
          p_pack_type: "deposit_dispute_pack",
          p_new_state: "suspended",
          p_release_reference: `gb1-revert-1-${RUN_ID}`,
          p_rationale: "Gate-B1 integration test revert — step 1",
          p_pack_version: "gate_b1_v1",
        });
        await rootClient.rpc("transition_deposit_pack_release_state", {
          p_pack_type: "deposit_dispute_pack",
          p_new_state: "internal_preview",
          p_release_reference: `gb1-revert-2-${RUN_ID}`,
          p_rationale: "Gate-B1 integration test revert — step 2",
          p_pack_version: "gate_b1_v1",
        });

        // T-13: Final state verification (runs as part of afterAll)
        const { data } = await rootClient
          .from("deposit_pack_release_registry")
          .select("release_state")
          .eq("pack_type", "deposit_dispute_pack")
          .single();
        expect(data?.release_state).toBe("internal_preview");
      });

      it("T-08: ownerA (entitled, account manager) can prepare export in production", async () => {
        const { data, error } = await ownerAClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID },
        );
        expect(error).toBeNull();
        expect(data?.result).toBe("print_initiated");
        expect(data?.release_mode).toBe("production");
        expect(data?.is_root_preview).toBe(false);
      });

      it("T-09: null pack_version is classified as pre_gate_b in authorisation payload", async () => {
        const { data, error } = await ownerAClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID },
        );
        expect(error).toBeNull();
        expect(data?.pack_version).toBe("pre_gate_b");
      });

      it("T-10: tenantA1 denied — no account-management authority", async () => {
        const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
        const { data, error } = await tenantClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID },
        );
        expect(error).not.toBeNull();
        expect(error?.message).toMatch(/not authorised to manage/i);
        expect(data).toBeNull();
      });

      it("T-11: ownerB denied — cross-account (no authority over accountA)", async () => {
        const { client: ownerBClient } = await signInAsFixtureUser("ownerB");
        const { data, error } = await ownerBClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID },
        );
        expect(error).not.toBeNull();
        expect(error?.message).toMatch(/not authorised to manage/i);
        expect(data).toBeNull();
      });

      it("T-12: export denied when state is suspended (all actors blocked)", async () => {
        // Temporarily suspend within the production-state window
        const { error: suspendErr } = await rootClient.rpc(
          "transition_deposit_pack_release_state",
          {
            p_pack_type: "deposit_dispute_pack",
            p_new_state: "suspended",
            p_release_reference: `gb1-mid-suspend-${RUN_ID}`,
            p_rationale: "Gate-B1 integration test — suspended gate check",
            p_pack_version: "gate_b1_v1",
          },
        );
        expect(suspendErr).toBeNull();

        // Both ownerA and root are blocked when suspended
        const { error: ownerAErr } = await ownerAClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID },
        );
        expect(ownerAErr).not.toBeNull();
        expect(ownerAErr?.message).toMatch(/suspended/i);

        const { error: rootErr } = await rootClient.rpc(
          "prepare_deposit_dispute_pack_export",
          { p_pack_id: GB1_PACK_ID },
        );
        expect(rootErr).not.toBeNull();
        expect(rootErr?.message).toMatch(/suspended/i);

        // Restore to production so afterAll can do the normal two-hop revert
        const { error: restoreErr } = await rootClient.rpc(
          "transition_deposit_pack_release_state",
          {
            p_pack_type: "deposit_dispute_pack",
            p_new_state: "production",
            p_release_reference: `gb1-mid-restore-${RUN_ID}`,
            p_rationale: "Gate-B1 integration test — restore production after suspended check",
            p_pack_version: "gate_b1_v1",
          },
        );
        expect(restoreErr).toBeNull();
      });
    });

    // ── T-14: RLS scope isolation ─────────────────────────────────────────────

    it("T-14: ownerB cannot read accountA deposit packs (RLS scope isolation)", async () => {
      const { client: ownerBClient } = await signInAsFixtureUser("ownerB");
      const { data, error } = await ownerBClient
        .from("deposit_dispute_packs")
        .select("id")
        .eq("id", GB1_PACK_ID);
      // RLS returns empty result, not an error
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  },
);
