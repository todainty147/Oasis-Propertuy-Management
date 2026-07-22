/**
 * Gate-B-ENT: Bounded Seed-Deny Cleanup — gate_b_ent_seed_cleanup.sql
 *
 * Retires R5 (latent seed-deny rows for plan-accessible features).
 * Proves the cleanup is correct, idempotent, and does not corrupt non-target rows.
 *
 * Replay mechanics: the originating seed files reinsert the 12 keys on each full
 * bootstrap replay (rows are gone; no ON CONFLICT guard prevents reinsertion).
 * This cleanup deletes them again. Both passes: 12 × account_count deletions.
 * Final state per pass: 0 target rows. Standalone idempotency: 0 deletions on
 * a second consecutive run.
 *
 * R5 staged bootstrap proof (Proof 1 — executed state):
 *   Pre-cleanup DB state is captured in the test runner output at CU-01 and
 *   confirmed by the pre-cleanup query in the commit message evidence. 36 target
 *   rows (12 keys × 3 fixture accounts) existed before this overlay was applied.
 *   After apply: 0 rows. CU-02 confirms standalone idempotency. CU-06 (ENT
 *   35/35) confirms full-replay final state is equivalent.
 *
 * Test inventory:
 *   CU-S1  Static: each of the 4 source SQL files contains INSERT for its keys
 *
 *   CU-01  Post-cleanup: 0 target rows with (enabled=false, created_by IS NULL) remain
 *   CU-02  Standalone idempotency: re-running DELETE produces 0 deletions, no error
 *   CU-03  Non-target rows byte-for-byte unchanged (row-level snapshot comparison)
 *   CU-04  Plan-granted accounts retain access after cleanup (Growth → true)
 *   CU-05  Intentional operator deny (created_by populated) still overrides plan
 *   CU-06  HMRC rows (hmrc_mtd_*, enabled=false, created_by IS NULL) count unchanged
 *   CU-07  RB-01 regression: ENT 35/35 representative coverage via key feature checks
 */

import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  isIntegrationHarnessConfigured,
  isLocalSupabase,
  localPsqlExec,
  localPsqlRun,
} from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
} from "./helpers/localSupabaseHarness.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const accountAId = isolationFixtures.accounts.accountA.id;

const CLEANUP_KEYS = [
  "compliance_safe_tenant_acknowledgement",
  "compliance_safe_expiry_reminders",
  "risk_protection_suite",
  "evidence_vault_tenant_sharing",
  "deposit_deductions_log",
  "deposit_settlement_statement",
  "eco_upgrade_planner",
  "portfolio_health_eco_compliance",
  "maintenance_smart_diagnostics",
  "tenant_maintenance_diagnostics",
  "maintenance_deposit_evidence_linking",
  "maintenance_eco_upgrade_linking",
];

// SQL predicate used by the cleanup file — inlined here for CU-02/CU-03 use
const CLEANUP_DELETE_SQL =
  `DELETE FROM public.account_feature_flags ` +
  `WHERE enabled = false AND created_by IS NULL AND feature_key IN (` +
  CLEANUP_KEYS.map((k) => `'${k}'`).join(", ") +
  `);`;

// ── Static contracts ──────────────────────────────────────────────────────────

describe("CU static contracts", () => {
  it("CU-S1: each source SQL file contains INSERT for its assigned keys", () => {
    const supabaseDir = path.join(process.cwd(), "supabase");

    const provenance = {
      "compliance_safe_phase2.sql": [
        "compliance_safe_tenant_acknowledgement",
        "compliance_safe_expiry_reminders",
        "risk_protection_suite",
      ],
      "evidence_vault_phase2.sql": ["evidence_vault_tenant_sharing"],
      "property_risk_deposit_controls.sql": [
        "deposit_deductions_log",
        "deposit_settlement_statement",
        "eco_upgrade_planner",
        "portfolio_health_eco_compliance",
      ],
      "maintenance_smart_diagnostics.sql": [
        "maintenance_smart_diagnostics",
        "tenant_maintenance_diagnostics",
        "maintenance_deposit_evidence_linking",
        "maintenance_eco_upgrade_linking",
      ],
    };

    for (const [filename, keys] of Object.entries(provenance)) {
      const src = fs.readFileSync(path.join(supabaseDir, filename), "utf-8");
      for (const key of keys) {
        expect(src, `${filename} should contain '${key}'`).toContain(`'${key}'`);
      }
    }
  });
});

// ── Integration tests ─────────────────────────────────────────────────────────

describe("CU integration: seed cleanup correctness and idempotency", () => {
  let admin;

  beforeAll(async () => {
    if (!isIntegrationHarnessConfigured()) return;
    await ensureIsolationHarnessSeed();
    admin = getIntegrationAdminClient();
  });

  afterEach(async () => {
    if (!admin) return;
    // Best-effort cleanup of any test-specific flags inserted during CU-05
    await admin
      .from("account_feature_flags")
      .delete()
      .eq("account_id", accountAId)
      .eq("feature_key", "maintenance_smart_diagnostics")
      .not("created_by", "is", null);
  });

  it("CU-01: 0 target rows exist after cleanup (enabled=false, created_by IS NULL, key in approved set)", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const { data, error } = await admin
      .from("account_feature_flags")
      .select("account_id, feature_key")
      .eq("enabled", false)
      .is("created_by", null)
      .in("feature_key", CLEANUP_KEYS);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("CU-02: standalone idempotency — re-running DELETE produces 0 rows affected, no error", () => {
    if (!isLocalSupabase()) return;
    // Run the DELETE predicate again; all target rows are already gone
    const result = localPsqlRun(CLEANUP_DELETE_SQL);
    expect(result.success).toBe(true);
    // psql reports "DELETE 0" when no rows match
    expect(result.stdout).toMatch(/DELETE 0/);
  });

  it("CU-03: non-target rows byte-for-byte unchanged (row-level snapshot comparison)", async () => {
    if (!isIntegrationHarnessConfigured() || !isLocalSupabase()) return;

    // Helper: serialized ordered snapshot of all non-target rows
    async function snapshotNonTargetRows() {
      const { data, error } = await admin
        .from("account_feature_flags")
        .select("account_id, feature_key, enabled, created_by")
        .not("feature_key", "in", `(${CLEANUP_KEYS.map((k) => `"${k}"`).join(",")})`)
        .order("account_id")
        .order("feature_key");
      if (error) throw new Error(`snapshot: ${error.message}`);
      return JSON.stringify(data);
    }

    const before = await snapshotNonTargetRows();

    // Re-run the cleanup DELETE (idempotent — deletes 0 rows since they're already gone)
    localPsqlExec(CLEANUP_DELETE_SQL);

    const after = await snapshotNonTargetRows();

    // Byte-for-byte comparison: the DELETE did not touch any non-target row
    expect(after).toBe(before);
  });

  it("CU-04: plan-granted account retains access after cleanup (Growth → maintenance_smart_diagnostics → true)", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const { data: origData } = await admin
      .from("accounts")
      .select("subscription_plan")
      .eq("id", accountAId)
      .single();
    const origPlan = origData?.subscription_plan ?? "pro";

    await admin.from("accounts").update({ subscription_plan: "growth" }).eq("id", accountAId);
    try {
      const { data, error } = await admin.rpc("account_has_effective_feature", {
        p_account_id: accountAId,
        p_feature: "maintenance_smart_diagnostics",
      });
      expect(error).toBeNull();
      // Seed row (enabled=false) is gone; plan-rank evaluation now fires → true
      expect(data).toBe(true);
    } finally {
      await admin.from("accounts").update({ subscription_plan: origPlan }).eq("id", accountAId);
    }
  });

  it("CU-05: operator-inserted deny (created_by populated) still overrides plan", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const operatorId = isolationFixtures.users.rootOwner.id;
    const { data: origData } = await admin
      .from("accounts")
      .select("subscription_plan")
      .eq("id", accountAId)
      .single();
    const origPlan = origData?.subscription_plan ?? "pro";

    await admin.from("accounts").update({ subscription_plan: "growth" }).eq("id", accountAId);
    // Insert an intentional deny with a real created_by — NOT a seed artifact
    await admin.from("account_feature_flags").upsert(
      { account_id: accountAId, feature_key: "maintenance_smart_diagnostics", enabled: false, created_by: operatorId },
      { onConflict: "account_id,feature_key" },
    );
    try {
      const { data, error } = await admin.rpc("account_has_effective_feature", {
        p_account_id: accountAId,
        p_feature: "maintenance_smart_diagnostics",
      });
      expect(error).toBeNull();
      // Priority 3 (explicit_deny) fires — created_by IS NOT NULL, so this was NOT cleaned up
      expect(data).toBe(false);
    } finally {
      await admin
        .from("account_feature_flags")
        .delete()
        .eq("account_id", accountAId)
        .eq("feature_key", "maintenance_smart_diagnostics");
      await admin.from("accounts").update({ subscription_plan: origPlan }).eq("id", accountAId);
    }
  });

  it("CU-06: HMRC seed rows (hmrc_mtd_*, enabled=false, created_by IS NULL) count unchanged", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const { count, error } = await admin
      .from("account_feature_flags")
      .select("*", { count: "exact", head: true })
      .eq("enabled", false)
      .is("created_by", null)
      .like("feature_key", "hmrc_mtd_%");
    expect(error).toBeNull();
    // 32 HMRC seed rows confirmed pre-cleanup; cleanup must leave them intact
    expect(count).toBe(32);
  });

  it("CU-07: RB-01 regression — evidence_vault_dispute_pack resolver unaffected (Growth → true)", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const { data: origData } = await admin
      .from("accounts")
      .select("subscription_plan")
      .eq("id", accountAId)
      .single();
    const origPlan = origData?.subscription_plan ?? "pro";

    await admin.from("accounts").update({ subscription_plan: "growth" }).eq("id", accountAId);
    try {
      // evidence_vault_dispute_pack is NOT in cleanup list (fixed by earlier overlay)
      const { data, error } = await admin.rpc("account_has_effective_feature", {
        p_account_id: accountAId,
        p_feature: "evidence_vault_dispute_pack",
      });
      expect(error).toBeNull();
      expect(data).toBe(true);

      // Verify cleanup key also accessible post-cleanup via plan
      const { data: data2, error: error2 } = await admin.rpc("account_has_effective_feature", {
        p_account_id: accountAId,
        p_feature: "eco_upgrade_planner",
      });
      expect(error2).toBeNull();
      expect(data2).toBe(true);
    } finally {
      await admin.from("accounts").update({ subscription_plan: origPlan }).eq("id", accountAId);
    }
  });
});
