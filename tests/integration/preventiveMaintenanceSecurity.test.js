import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("preventive maintenance task security", () => {
  const admin = getIntegrationAdminClient();
  const createdTaskIds = new Set();

  function buildTaskRow(overrides = {}) {
    return {
      id: randomUUID(),
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationFixtures.users.tenantA1.propertyId,
      title: "HVAC filter replacement",
      category: "hvac",
      frequency: "quarterly",
      frequency_interval_days: null,
      next_due_date: "2026-12-01",
      assigned_to_contractor_id: null,
      notes: "integration preventive task",
      status: "active",
      ...overrides,
    };
  }

  async function insertTask(row = {}) {
    const payload = buildTaskRow(row);
    const { data, error } = await admin
      .from("preventive_maintenance_tasks")
      .insert(payload)
      .select("id, account_id, property_id, title, status")
      .single();

    if (error) throw error;
    createdTaskIds.add(data.id);
    return data;
  }

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdTaskIds.size === 0) return;

    const ids = Array.from(createdTaskIds);
    createdTaskIds.clear();

    const { error } = await admin
      .from("preventive_maintenance_tasks")
      .delete()
      .in("id", ids);

    if (error) throw error;
  });

  it("allows owner A to create and update account A preventive tasks", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const insertResult = await client
      .from("preventive_maintenance_tasks")
      .insert(buildTaskRow({ notes: "owner-created preventive task" }))
      .select("id, account_id, notes, status")
      .single();

    expect(insertResult.error).toBeNull();
    createdTaskIds.add(insertResult.data.id);
    expect(insertResult.data.account_id).toBe(isolationFixtures.accounts.accountA.id);

    const updateResult = await client
      .from("preventive_maintenance_tasks")
      .update({ status: "paused" })
      .eq("id", insertResult.data.id)
      .select("id, status")
      .single();

    expect(updateResult.error).toBeNull();
    expect(updateResult.data.status).toBe("paused");
  });

  it("allows staff A to read account A preventive tasks", async () => {
    const task = await insertTask();
    const { client } = await signInAsFixtureUser("staffA");

    const result = await client
      .from("preventive_maintenance_tasks")
      .select("id, account_id, title")
      .eq("id", task.id)
      .single();

    expect(result.error).toBeNull();
    expect(result.data.account_id).toBe(isolationFixtures.accounts.accountA.id);
  });

  it("denies cross-account owners from reading foreign preventive tasks", async () => {
    const task = await insertTask();
    const { client } = await signInAsFixtureUser("ownerB");

    const result = await client
      .from("preventive_maintenance_tasks")
      .select("id, account_id")
      .eq("id", task.id)
      .maybeSingle();

    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  it("denies tenants from creating preventive tasks", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client
      .from("preventive_maintenance_tasks")
      .insert(buildTaskRow({ notes: "tenant-created preventive task" }))
      .select("id")
      .single();

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("row-level security");
  });
});
