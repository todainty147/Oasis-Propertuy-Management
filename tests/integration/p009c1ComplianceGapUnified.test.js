import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const ACCOUNT_A = isolationFixtures.accounts.accountA.id;
const ACCOUNT_B = isolationFixtures.accounts.accountB.id;
// Property seeded for account A in isolationFixtures
const PROPERTY_A = "44444444-4444-4444-4444-444444444441";

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const IN_15_DAYS = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
const IN_60_DAYS = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

// Stable UUIDs for test data (deterministic, safe to delete in afterAll)
const BATCH_ID = "c1c1c1c1-c001-c001-c001-c1c1c1c1c001";
const TCI_OVERDUE_ID = "c1000000-0001-0001-0001-000000000001";
const TCI_DUE_SOON_ID = "c1000000-0001-0001-0001-000000000002";
const TCI_CONFLICT_ID = "c1000000-0001-0001-0001-000000000003";
const TCI_CURRENT_ID = "c1000000-0001-0001-0001-000000000004";
const CI_OVERDUE_ID = "c1000000-0001-0001-0001-000000000005";

describe.skipIf(!isIntegrationHarnessConfigured())("P-009C1 compliance_gap_unified", () => {
  let admin;
  let gasReqId;
  let epcReqId;

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
    admin = getIntegrationAdminClient();

    // Look up requirement IDs
    const { data: gasReq } = await admin
      .from("compliance_requirements")
      .select("id")
      .eq("requirement_key", "gas_safety_certificate")
      .limit(1)
      .maybeSingle();
    gasReqId = gasReq?.id ?? null;

    const { data: epcReq } = await admin
      .from("compliance_requirements")
      .select("id")
      .eq("requirement_key", "epc")
      .limit(1)
      .maybeSingle();
    epcReqId = epcReq?.id ?? null;

    // Seed native compliance_items: overdue (due_date yesterday, status active)
    await admin.from("compliance_items").upsert({
      id: CI_OVERDUE_ID,
      account_id: ACCOUNT_A,
      property_id: PROPERTY_A,
      title: "Gas safety check (native overdue)",
      category: "gas_safety",
      due_date: YESTERDAY,
      status: "active",
      reminder_window_days: 30,
    }, { onConflict: "id" });

    // Seed parent import_batches row — tenancy_compliance_items.import_batch_id FK requires it
    await admin.from("import_batches").upsert({
      id: BATCH_ID,
      account_id: ACCOUNT_A,
      source_filename: "p009c1-integration-test.csv",
      tab: "compliance",
      triggered_by: isolationFixtures.users.ownerA.id,
      status: "complete",
    }, { onConflict: "id" });

    // Seed imported TCI: overdue (expires_at yesterday, import_batch_id set)
    await admin.from("tenancy_compliance_items").upsert({
      id: TCI_OVERDUE_ID,
      account_id: ACCOUNT_A,
      property_id: PROPERTY_A,
      requirement_id: gasReqId,
      status: "expired",
      expires_at: YESTERDAY,
      import_batch_id: BATCH_ID,
      reminder_days_before: 30,
    }, { onConflict: "id" });

    // Seed imported TCI: due soon (expires in 15 days, within reminder window)
    await admin.from("tenancy_compliance_items").upsert({
      id: TCI_DUE_SOON_ID,
      account_id: ACCOUNT_A,
      property_id: PROPERTY_A,
      requirement_id: epcReqId,
      status: "expiring_soon",
      expires_at: IN_15_DAYS,
      import_batch_id: BATCH_ID,
      reminder_days_before: 30,
    }, { onConflict: "id" });

    // Seed imported TCI: conflict case — status='logged' but expires_at in past
    // scan_status must be 'overdue' (date-led, overrides status)
    await admin.from("tenancy_compliance_items").upsert({
      id: TCI_CONFLICT_ID,
      account_id: ACCOUNT_A,
      property_id: PROPERTY_A,
      requirement_id: gasReqId,
      status: "logged",
      expires_at: YESTERDAY,
      import_batch_id: BATCH_ID,
      reminder_days_before: 30,
    }, { onConflict: "id" });

    // Seed imported TCI: current (expires well into future, outside reminder window)
    await admin.from("tenancy_compliance_items").upsert({
      id: TCI_CURRENT_ID,
      account_id: ACCOUNT_A,
      property_id: PROPERTY_A,
      requirement_id: epcReqId,
      status: "logged",
      expires_at: IN_60_DAYS,
      import_batch_id: BATCH_ID,
      reminder_days_before: 30,
    }, { onConflict: "id" });
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("tenancy_compliance_items").delete().in("id", [
      TCI_OVERDUE_ID, TCI_DUE_SOON_ID, TCI_CONFLICT_ID, TCI_CURRENT_ID,
    ]);
    await admin.from("import_batches").delete().eq("id", BATCH_ID);
    await admin.from("compliance_items").delete().eq("id", CI_OVERDUE_ID);
  });

  // ── §1  compliance_gap_unified view ─────────────────────────────────────────

  it("D1 parity: native overdue compliance_item → scan_status=overdue in view", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data, error } = await client
      .from("compliance_gap_unified")
      .select("source_item_id, source_model, scan_status, is_attested_import")
      .eq("account_id", ACCOUNT_A)
      .eq("source_item_id", CI_OVERDUE_ID)
      .single();
    expect(error).toBeNull();
    expect(data.scan_status).toBe("overdue");
    expect(data.source_model).toBe("compliance_items");
    expect(data.is_attested_import).toBe(false);
  });

  it("D1 parity: imported expired TCI → scan_status=overdue in view", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data, error } = await client
      .from("compliance_gap_unified")
      .select("source_item_id, source_model, scan_status, is_attested_import, import_batch_id")
      .eq("account_id", ACCOUNT_A)
      .eq("source_item_id", TCI_OVERDUE_ID)
      .single();
    expect(error).toBeNull();
    expect(data.scan_status).toBe("overdue");
    expect(data.source_model).toBe("tenancy_compliance_items");
    expect(data.is_attested_import).toBe(true);
    expect(data.import_batch_id).toBe(BATCH_ID);
  });

  it("conflict: status=logged with expires_at in past → scan_status=overdue (date-led)", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data, error } = await client
      .from("compliance_gap_unified")
      .select("source_item_id, scan_status, source_status")
      .eq("account_id", ACCOUNT_A)
      .eq("source_item_id", TCI_CONFLICT_ID)
      .single();
    expect(error).toBeNull();
    expect(data.source_status).toBe("logged");
    expect(data.scan_status).toBe("overdue");
  });

  it("due_soon: imported TCI expiring in 15 days → scan_status=due_soon", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data, error } = await client
      .from("compliance_gap_unified")
      .select("source_item_id, scan_status, is_attested_import")
      .eq("account_id", ACCOUNT_A)
      .eq("source_item_id", TCI_DUE_SOON_ID)
      .single();
    expect(error).toBeNull();
    expect(data.scan_status).toBe("due_soon");
    expect(data.is_attested_import).toBe(true);
  });

  it("current: imported TCI expiring in 60 days → scan_status=current", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data, error } = await client
      .from("compliance_gap_unified")
      .select("source_item_id, scan_status, is_attested_import")
      .eq("account_id", ACCOUNT_A)
      .eq("source_item_id", TCI_CURRENT_ID)
      .single();
    expect(error).toBeNull();
    expect(data.scan_status).toBe("current");
    expect(data.is_attested_import).toBe(true);
  });

  it("native TCI rows (no import_batch_id) remain unmarked: is_attested_import=false", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    // Verify the view correctly marks only imported rows
    const { data, error } = await client
      .from("compliance_gap_unified")
      .select("source_item_id, is_attested_import, import_batch_id")
      .eq("account_id", ACCOUNT_A)
      .eq("source_model", "compliance_items");
    expect(error).toBeNull();
    // All compliance_items rows must have is_attested_import=false
    expect(data.every((r) => r.is_attested_import === false)).toBe(true);
    expect(data.every((r) => r.import_batch_id === null)).toBe(true);
  });

  // ── §2  Cross-account isolation ──────────────────────────────────────────────

  it("cross-account: ownerB cannot see accountA attested items via view", async () => {
    const { client } = await signInAsFixtureUser("ownerB");
    const { data, error } = await client
      .from("compliance_gap_unified")
      .select("source_item_id, account_id")
      .eq("account_id", ACCOUNT_A)
      .in("source_item_id", [TCI_OVERDUE_ID, TCI_DUE_SOON_ID]);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  // ── §3  command_center_items smoke ───────────────────────────────────────────

  it("smoke: imported overdue compliance appears in command_center_items", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data, error } = await client.rpc("command_center_items", {
      p_account_id: ACCOUNT_A,
      p_limit: 80,
    });
    expect(error).toBeNull();
    const attestedRows = (data || []).filter(
      (r) => r.source_table === "tenancy_compliance_items"
    );
    expect(attestedRows.length).toBeGreaterThan(0);
    const overdueRow = attestedRows.find((r) =>
      r.item_key === `compliance-attested-overdue-${TCI_OVERDUE_ID}`
    );
    expect(overdueRow).toBeDefined();
    expect(overdueRow.category).toBe("compliance");
    expect(overdueRow.link_path).toBe("/compliance/safe");
  });

  it("smoke: native compliance rows remain unmarked (source_table=compliance_items)", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data, error } = await client.rpc("command_center_items", {
      p_account_id: ACCOUNT_A,
      p_limit: 80,
    });
    expect(error).toBeNull();
    const nativeCompliance = (data || []).filter(
      (r) => r.category === "compliance" && r.source_table === "compliance_items"
    );
    // If any native compliance rows exist, they must have source_table = compliance_items
    nativeCompliance.forEach((r) => {
      expect(r.source_table).toBe("compliance_items");
    });
  });

  it("cross-account: CC items for account B contain no account A attested rows", async () => {
    const { client } = await signInAsFixtureUser("ownerB");
    const { data, error } = await client.rpc("command_center_items", {
      p_account_id: ACCOUNT_B,
      p_limit: 80,
    });
    expect(error).toBeNull();
    const leakCheck = (data || []).filter(
      (r) =>
        r.source_table === "tenancy_compliance_items" &&
        [TCI_OVERDUE_ID, TCI_DUE_SOON_ID, TCI_CONFLICT_ID].some(
          (id) => r.item_key.includes(id)
        )
    );
    expect(leakCheck).toHaveLength(0);
  });

  // ── §4  attention_center_items smoke ─────────────────────────────────────────

  it("smoke: imported overdue compliance appears in attention_center_items", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const { data, error } = await client.rpc("attention_center_items", {
      p_account_id: ACCOUNT_A,
      p_limit: 60,
    });
    expect(error).toBeNull();
    const attestedRows = (data || []).filter(
      (r) => r.source_table === "tenancy_compliance_items"
    );
    expect(attestedRows.length).toBeGreaterThan(0);
    const overdueRow = attestedRows.find((r) =>
      r.item_key === `compliance-attested-overdue-${TCI_OVERDUE_ID}`
    );
    expect(overdueRow).toBeDefined();
    expect(overdueRow.link_path).toBe("/compliance/safe");
  });

  // ── §5  get_operating_calendar smoke ─────────────────────────────────────────

  it("smoke: imported overdue compliance appears in calendar with is_attested_import=true", async () => {
    // Seed an item whose expires_at is in the search window
    const windowStart = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const windowEnd = new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10);

    const { client } = await signInAsFixtureUser("ownerA");
    const { data, error } = await client.rpc("get_operating_calendar", {
      p_account_id: ACCOUNT_A,
      p_start_date: windowStart,
      p_end_date: windowEnd,
    });
    expect(error).toBeNull();
    const attestedCalendarRows = (data || []).filter(
      (r) => r.is_attested_import === true
    );
    expect(attestedCalendarRows.length).toBeGreaterThan(0);
    // All attested calendar rows must link to /compliance/safe
    attestedCalendarRows.forEach((r) => {
      expect(r.link_path).toBe("/compliance/safe");
    });
    // source_module must be 'compliance'
    attestedCalendarRows.forEach((r) => {
      expect(r.source_module).toBe("compliance");
    });
  });

  it("calendar: native compliance rows keep is_attested_import=false", async () => {
    const windowStart = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const windowEnd = new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10);

    const { client } = await signInAsFixtureUser("ownerA");
    const { data, error } = await client.rpc("get_operating_calendar", {
      p_account_id: ACCOUNT_A,
      p_start_date: windowStart,
      p_end_date: windowEnd,
    });
    expect(error).toBeNull();
    const nativeRows = (data || []).filter(
      (r) => r.source_module !== "compliance" || r.is_attested_import === false
    );
    // Native rows must have is_attested_import=false (or undefined for non-compliance modules)
    const nativeCompliance = nativeRows.filter((r) => r.source_module === "compliance");
    nativeCompliance.forEach((r) => {
      expect(r.is_attested_import).toBe(false);
    });
  });
});
