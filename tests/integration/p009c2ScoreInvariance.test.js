/**
 * P-009C2 — Portfolio Health score-invariance (D2 gate)
 *
 * Proves that adding qualifying imported TCI rows to tenancy_compliance_items
 * does NOT change the score, category, or compliance-penalty component that
 * calculatePropertyOperationalHealth returns for the same native fixture.
 *
 * Structure:
 *   beforeAll  — seeds one native compliance_items row (no TCI rows yet)
 *   §5a        — captures score / category / overdueComplianceCount BEFORE insert
 *   §5b        — inserts 2 qualifying imported TCI rows (overdue + due_soon)
 *   §5c        — re-fetches and asserts score / category / penalty UNCHANGED
 *   §5d        — asserts imported-note count changed by exactly 2
 *   afterAll   — removes all seed rows
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { calculatePropertyOperationalHealth } from "../../src/services/propertyHealthScoreService.js";

const ACCOUNT_A  = isolationFixtures.accounts.accountA.id;
const PROPERTY_A = "44444444-4444-4444-4444-444444444441";

const YESTERDAY  = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const IN_15_DAYS = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);

// Stable UUIDs — "aa005100" prefix = score-invariance; no collision with C1/C2 tests
// All characters are valid hex (0-9, a-f only)
const SINV_BATCH_ID      = "aa005100-0005-0005-0005-000000000005";
const SINV_CI_ID         = "aa005100-0005-0005-0005-000000000010"; // native compliance_items
const SINV_TCI_OVERDUE   = "aa005100-0005-0005-0005-000000000020"; // imported TCI overdue
const SINV_TCI_DUE_SOON  = "aa005100-0005-0005-0005-000000000030"; // imported TCI due_soon

// Minimal property stub — only fields used by the scoring function
const PROPERTY_STUB = { id: PROPERTY_A, address: "Test Property", rent: 1200 };

describe.skipIf(!isIntegrationHarnessConfigured())("P-009C2 §5 Portfolio Health score-invariance", () => {
  let admin;

  // Shared state captured across §5a → §5c steps
  let scoreBefore;
  let categoryBefore;
  let overdueComplianceCountBefore;
  let importedCountBefore;
  let scoreAfter;
  let categoryAfter;
  let overdueComplianceCountAfter;
  let importedCountAfter;

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
    admin = getIntegrationAdminClient();

    // Seed ONE native compliance_items row: overdue (due yesterday, status=active).
    // No TCI rows yet — that is the "before" state.
    await admin.from("compliance_items").upsert({
      id: SINV_CI_ID,
      account_id: ACCOUNT_A,
      property_id: PROPERTY_A,
      title: "Gas safety (score-invariance test)",
      category: "gas_safety",
      due_date: YESTERDAY,
      status: "active",
      reminder_window_days: 30,
    }, { onConflict: "id" });
  });

  afterAll(async () => {
    if (!admin) return;
    // Remove TCI rows (may or may not exist if test failed early)
    await admin
      .from("tenancy_compliance_items")
      .delete()
      .in("id", [SINV_TCI_OVERDUE, SINV_TCI_DUE_SOON]);
    await admin.from("import_batches").delete().eq("id", SINV_BATCH_ID);
    await admin.from("compliance_items").delete().eq("id", SINV_CI_ID);
  });

  // ── §5a  BEFORE: capture score with native fixture only ───────────────────────

  it("§5a before: compliance_items row is visible and overdue", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data } = await client
      .from("compliance_items")
      .select("id, status, due_date")
      .eq("id", SINV_CI_ID)
      .single();
    expect(data.status).toBe("active");
    expect(data.due_date).toBe(YESTERDAY);
  });

  it("§5a before: imported TCI rows from SINV batch do not exist yet", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { count } = await client
      .from("compliance_gap_unified")
      .select("*", { count: "exact", head: true })
      .eq("account_id", ACCOUNT_A)
      .eq("is_attested_import", true)
      .in("scan_status", ["overdue", "due_soon", "missing"])
      .in("source_item_id", [SINV_TCI_OVERDUE, SINV_TCI_DUE_SOON]);
    importedCountBefore = count ?? 0;
    expect(importedCountBefore).toBe(0);
  });

  it("§5a before: score is 88 (compliance_overdue penalty=12 applied to native row)", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data: ciRows } = await client
      .from("compliance_items")
      .select("id, status, due_date, reminder_window_days")
      .eq("id", SINV_CI_ID);

    const result = calculatePropertyOperationalHealth({
      property: PROPERTY_STUB,
      complianceItems: ciRows || [],
      missingComplianceItems: [],
      payments: [],
      maintenanceRequests: [],
      workOrders: [],
      preventiveTasks: [],
      leases: [],
      operatingExpenses: [],
      tenantCount: 1,
    });

    scoreBefore                 = result.score;
    categoryBefore              = result.category;
    overdueComplianceCountBefore = result.signals.overdueComplianceCount;

    // Deterministic: one overdue compliance_items row → penalty 12 → score 88 → healthy
    expect(scoreBefore).toBe(88);
    expect(categoryBefore).toBe("healthy");
    expect(overdueComplianceCountBefore).toBe(1);
  });

  // ── §5b  INSERT qualifying imported TCI rows ──────────────────────────────────

  it("§5b: insert 2 qualifying imported TCI rows (overdue + due_soon)", async () => {
    await admin.from("import_batches").upsert({
      id: SINV_BATCH_ID,
      account_id: ACCOUNT_A,
      source_filename: "sinv-score-invariance.csv",
      tab: "compliance",
      triggered_by: isolationFixtures.users.ownerA.id,
      status: "complete",
    }, { onConflict: "id" });

    const base = {
      account_id: ACCOUNT_A,
      property_id: PROPERTY_A,
      import_batch_id: SINV_BATCH_ID,
      reminder_days_before: 30,
    };

    const { error: e1 } = await admin.from("tenancy_compliance_items").upsert(
      { ...base, id: SINV_TCI_OVERDUE,  status: "expired",       expires_at: YESTERDAY  },
      { onConflict: "id" },
    );
    const { error: e2 } = await admin.from("tenancy_compliance_items").upsert(
      { ...base, id: SINV_TCI_DUE_SOON, status: "expiring_soon", expires_at: IN_15_DAYS },
      { onConflict: "id" },
    );
    expect(e1).toBeNull();
    expect(e2).toBeNull();
  });

  it("§5b: imported TCI rows are now visible via compliance_gap_unified", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data } = await client
      .from("compliance_gap_unified")
      .select("source_item_id, scan_status, is_attested_import")
      .eq("account_id", ACCOUNT_A)
      .in("source_item_id", [SINV_TCI_OVERDUE, SINV_TCI_DUE_SOON])
      .order("scan_status");
    expect(data).toHaveLength(2);
    const statuses = data.map((r) => r.scan_status).sort();
    expect(statuses).toEqual(["due_soon", "overdue"]);
    data.forEach((r) => expect(r.is_attested_import).toBe(true));
  });

  // ── §5c  AFTER: re-fetch compliance_items and assert score UNCHANGED ───────────

  it("§5c after: compliance_items rows are identical to before (TCI rows do not appear)", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data: ciRows } = await client
      .from("compliance_items")
      .select("id, status, due_date, reminder_window_days")
      .eq("id", SINV_CI_ID);

    // TCI rows must NOT appear in compliance_items
    const ids = (ciRows || []).map((r) => r.id);
    expect(ids).not.toContain(SINV_TCI_OVERDUE);
    expect(ids).not.toContain(SINV_TCI_DUE_SOON);
    // Our native row must still be present
    expect(ids).toContain(SINV_CI_ID);
  });

  it("§5c after: score, category, and compliance-penalty component UNCHANGED", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data: ciRows } = await client
      .from("compliance_items")
      .select("id, status, due_date, reminder_window_days")
      .eq("id", SINV_CI_ID);

    const result = calculatePropertyOperationalHealth({
      property: PROPERTY_STUB,
      complianceItems: ciRows || [],
      missingComplianceItems: [],
      payments: [],
      maintenanceRequests: [],
      workOrders: [],
      preventiveTasks: [],
      leases: [],
      operatingExpenses: [],
      tenantCount: 1,
    });

    scoreAfter                 = result.score;
    categoryAfter              = result.category;
    overdueComplianceCountAfter = result.signals.overdueComplianceCount;

    // Primary invariance assertions
    expect(scoreAfter).toBe(scoreBefore);
    expect(categoryAfter).toBe(categoryBefore);
    expect(overdueComplianceCountAfter).toBe(overdueComplianceCountBefore);

    // Also prove the absolute values haven't drifted
    expect(scoreAfter).toBe(88);
    expect(categoryAfter).toBe("healthy");
    expect(overdueComplianceCountAfter).toBe(1);
  });

  // ── §5d  Imported count changed by exactly 2 ─────────────────────────────────

  it("§5d: imported-note count (canonical predicate) increased by exactly 2", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { count } = await client
      .from("compliance_gap_unified")
      .select("*", { count: "exact", head: true })
      .eq("account_id", ACCOUNT_A)
      .eq("is_attested_import", true)
      .in("scan_status", ["overdue", "due_soon", "missing"])
      .in("source_item_id", [SINV_TCI_OVERDUE, SINV_TCI_DUE_SOON]);
    importedCountAfter = count ?? 0;

    // Exactly 2 more rows appeared — the ones we inserted in §5b
    expect(importedCountAfter).toBe(importedCountBefore + 2);
    expect(importedCountAfter).toBe(2);
  });
});
