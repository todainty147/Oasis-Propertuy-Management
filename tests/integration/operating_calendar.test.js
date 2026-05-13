import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { expectAccessDenied } from "./helpers/rpcAssertions.js";

// Wide date window that safely captures all harness-seeded rows regardless of
// when in the month the test suite runs.
function calendarWindow() {
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);

  const start = new Date(today);
  start.setUTCDate(today.getUTCDate() - 60);

  const end = new Date(today);
  end.setUTCDate(today.getUTCDate() + 60);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate:   end.toISOString().slice(0, 10),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchCalendar(client, accountId, overrides = {}) {
  const { startDate, endDate } = calendarWindow();
  return client.rpc("get_operating_calendar", {
    p_account_id:    accountId,
    p_start_date:    startDate,
    p_end_date:      endDate,
    p_property_id:   null,
    p_source_module: null,
    p_urgency:       null,
    p_status:        null,
    ...overrides,
  });
}

// ─── Access isolation ─────────────────────────────────────────────────────────

describe.skipIf(!isIntegrationHarnessConfigured())("get_operating_calendar — access isolation", () => {
  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  it("allows account A owner to read account A calendar items", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id);

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("account A calendar contains payments and maintenance items", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id);

    expect(result.error).toBeNull();
    const modules = result.data.map((r) => r.source_module);
    expect(modules).toContain("payment");
    expect(modules).toContain("maintenance");
  });

  it("account A calendar rows include expected return columns", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id);

    expect(result.error).toBeNull();
    const row = result.data[0];
    expect(row).toHaveProperty("id");
    expect(row).toHaveProperty("source_module");
    expect(row).toHaveProperty("title");
    expect(row).toHaveProperty("due_date");
    expect(row).toHaveProperty("status");
    expect(row).toHaveProperty("urgency");
    expect(row).toHaveProperty("property_id");
    expect(row).toHaveProperty("property_label");
  });

  it("account A owner does not see account B items", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id);

    expect(result.error).toBeNull();
    expect(result.data.every((row) => row.property_label !== "22 Harbor View Road")).toBe(true);
  });

  it("allows account A staff to read account A calendar items", async () => {
    const { client } = await signInAsFixtureUser("staffA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id);

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((row) => row.property_label !== "22 Harbor View Road")).toBe(true);
  });

  it("allows account A admin to read account A calendar items", async () => {
    const { client } = await signInAsFixtureUser("adminA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id);

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("denies account A owner from reading account B calendar items", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountB.id);

    expectAccessDenied(result);
  });

  it("denies account A staff from reading account B calendar items", async () => {
    const { client } = await signInAsFixtureUser("staffA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountB.id);

    expectAccessDenied(result);
  });

  it("denies tenant A from calling get_operating_calendar", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id);

    expectAccessDenied(result);
  });

  it("denies contractor A from calling get_operating_calendar", async () => {
    const { client } = await signInAsFixtureUser("contractorA1");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id);

    expectAccessDenied(result);
  });
});

// ─── Filter parameters ────────────────────────────────────────────────────────

describe.skipIf(!isIntegrationHarnessConfigured())("get_operating_calendar — filter parameters", () => {
  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  it("p_source_module filters to only payment rows", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id, {
      p_source_module: "payment",
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.every((row) => row.source_module === "payment")).toBe(true);
  });

  it("p_source_module filters to only maintenance rows", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id, {
      p_source_module: "maintenance",
    });

    expect(result.error).toBeNull();
    expect(result.data.every((row) => row.source_module === "maintenance")).toBe(true);
  });

  it("p_status filter returns only rows matching that status", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    // First get all items to find a known status
    const all = await fetchCalendar(client, isolationFixtures.accounts.accountA.id);
    expect(all.error).toBeNull();
    if (all.data.length === 0) return; // nothing to filter on

    const targetStatus = all.data[0].status;
    const filtered = await fetchCalendar(client, isolationFixtures.accounts.accountA.id, {
      p_status: targetStatus,
    });

    expect(filtered.error).toBeNull();
    expect(filtered.data.every((row) => row.status === targetStatus)).toBe(true);
  });

  it("p_property_id filters to only the given property", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id, {
      p_property_id: isolationSeedIds.propertyIds.accountA,
    });

    expect(result.error).toBeNull();
    expect(result.data.every(
      (row) => row.property_id === isolationSeedIds.propertyIds.accountA
    )).toBe(true);
  });

  it("p_property_id for account B property returns no rows for account A owner", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id, {
      p_property_id: isolationSeedIds.propertyIds.accountB,
    });

    // Account A has no items for account B's property, so result should be empty
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(0);
  });

  it("narrow date window returns fewer items than a wide window", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const wideResult = await fetchCalendar(client, isolationFixtures.accounts.accountA.id);
    expect(wideResult.error).toBeNull();

    const today = new Date().toISOString().slice(0, 10);
    const narrowResult = await client.rpc("get_operating_calendar", {
      p_account_id:    isolationFixtures.accounts.accountA.id,
      p_start_date:    "2000-01-01",
      p_end_date:      "2000-01-02", // range with no data
      p_property_id:   null,
      p_source_module: null,
      p_urgency:       null,
      p_status:        null,
    });

    expect(narrowResult.error).toBeNull();
    expect(narrowResult.data).toHaveLength(0);
    expect(wideResult.data.length).toBeGreaterThan(narrowResult.data.length);
  });

  it("items are ordered by due_date ascending", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id);

    expect(result.error).toBeNull();
    if (result.data.length < 2) return;

    const dates = result.data.map((r) => r.due_date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});

// ─── Custom calendar items (operating_calendar_items table RLS) ───────────────

describe.skipIf(!isIntegrationHarnessConfigured())("operating_calendar_items — RLS", () => {
  const admin = getIntegrationAdminClient();
  const createdItemIds = new Set();

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdItemIds.size === 0) return;
    const { error } = await admin
      .from("operating_calendar_items")
      .delete()
      .in("id", Array.from(createdItemIds));
    expect(error).toBeNull();
    createdItemIds.clear();
  });

  it("owner can create and read a custom calendar item for their account", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const id = randomUUID();
    createdItemIds.add(id);

    const today = new Date().toISOString().slice(0, 10);
    const insert = await client
      .from("operating_calendar_items")
      .insert({
        id,
        account_id: isolationFixtures.accounts.accountA.id,
        title:      "Test calendar task",
        due_date:   today,
        urgency:    "medium",
        status:     "scheduled",
      });

    expect(insert.error).toBeNull();

    // Should appear in the calendar RPC
    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id, {
      p_source_module: "custom",
    });
    expect(result.error).toBeNull();
    expect(result.data.some((row) => row.id === id)).toBe(true);
  });

  it("custom item title appears in calendar result", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const id = randomUUID();
    createdItemIds.add(id);

    const today = new Date().toISOString().slice(0, 10);
    await client.from("operating_calendar_items").insert({
      id,
      account_id: isolationFixtures.accounts.accountA.id,
      title:      "Landlord inspection Q2",
      due_date:   today,
      urgency:    "high",
      status:     "scheduled",
    });

    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id, {
      p_source_module: "custom",
    });

    expect(result.error).toBeNull();
    expect(result.data.some((row) => row.title === "Landlord inspection Q2")).toBe(true);
  });

  it("custom item with urgency critical appears with urgency=critical in calendar", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const id = randomUUID();
    createdItemIds.add(id);

    const today = new Date().toISOString().slice(0, 10);
    await client.from("operating_calendar_items").insert({
      id,
      account_id: isolationFixtures.accounts.accountA.id,
      title:      "Critical inspection",
      due_date:   today,
      urgency:    "critical",
      status:     "scheduled",
    });

    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id, {
      p_source_module: "custom",
      p_urgency:       "critical",
    });

    expect(result.error).toBeNull();
    expect(result.data.some((row) => row.id === id && row.urgency === "critical")).toBe(true);
  });

  it("past-due custom item is derived as overdue in calendar", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const id = randomUUID();
    createdItemIds.add(id);

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const past = pastDate.toISOString().slice(0, 10);

    await client.from("operating_calendar_items").insert({
      id,
      account_id: isolationFixtures.accounts.accountA.id,
      title:      "Overdue custom task",
      due_date:   past,
      urgency:    "medium",
      status:     "scheduled", // stored as scheduled, but calendar RPC derives overdue
    });

    const result = await fetchCalendar(client, isolationFixtures.accounts.accountA.id, {
      p_source_module: "custom",
    });

    expect(result.error).toBeNull();
    const row = result.data.find((r) => r.id === id);
    expect(row).toBeDefined();
    expect(row.status).toBe("overdue");
  });

  it("owner cannot insert a custom item for account B", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const id = randomUUID();

    const today = new Date().toISOString().slice(0, 10);
    const insert = await client
      .from("operating_calendar_items")
      .insert({
        id,
        account_id: isolationFixtures.accounts.accountB.id,
        title:      "Cross-account injection attempt",
        due_date:   today,
        urgency:    "low",
        status:     "scheduled",
      });

    expect(insert.error).not.toBeNull();
    // Clean up if it somehow got through (it should not)
    await admin.from("operating_calendar_items").delete().eq("id", id);
  });

  it("tenant cannot read operating_calendar_items for account A", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");
    const result = await client
      .from("operating_calendar_items")
      .select("id")
      .eq("account_id", isolationFixtures.accounts.accountA.id);

    // RLS should return empty or error — never data
    const rows = Array.isArray(result.data) ? result.data : [];
    expect(rows).toHaveLength(0);
  });

  it("staff can create a custom item for their account", async () => {
    const { client } = await signInAsFixtureUser("staffA");
    const id = randomUUID();
    createdItemIds.add(id);

    const today = new Date().toISOString().slice(0, 10);
    const insert = await client
      .from("operating_calendar_items")
      .insert({
        id,
        account_id: isolationFixtures.accounts.accountA.id,
        title:      "Staff-created task",
        due_date:   today,
        urgency:    "low",
        status:     "scheduled",
      });

    expect(insert.error).toBeNull();
  });

  it("owner can delete their own custom calendar item", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const id = randomUUID();

    const today = new Date().toISOString().slice(0, 10);
    await client.from("operating_calendar_items").insert({
      id,
      account_id: isolationFixtures.accounts.accountA.id,
      title:      "To be deleted",
      due_date:   today,
      urgency:    "low",
      status:     "scheduled",
    });

    const del = await client
      .from("operating_calendar_items")
      .delete()
      .eq("id", id)
      .eq("account_id", isolationFixtures.accounts.accountA.id);

    expect(del.error).toBeNull();
  });
});
