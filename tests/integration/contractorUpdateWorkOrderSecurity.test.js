import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";

function expectContractorUpdateDenied(result) {
  expect(result.data ?? null).toBeNull();
  const message = String(result.error?.message || "").toLowerCase();
  expect(
    message.includes("not allowed") ||
      message.includes("work order not found") ||
      message.includes("violates row-level security") ||
      message.includes("invalid status") ||
      message.includes("work_orders_status"),
  ).toBe(true);
}

describe.skipIf(!isIntegrationHarnessConfigured())("contractor_update_work_order writes", () => {
  const admin = getIntegrationAdminClient();
  const createdWorkOrderIds = new Set();
  let seededUsers;

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdWorkOrderIds.size === 0) return;

    const ids = Array.from(createdWorkOrderIds);
    createdWorkOrderIds.clear();

    const { error } = await admin.from("work_orders").delete().in("id", ids);
    expect(error).toBeNull();
  });

  async function createWorkOrder(overrides = {}) {
    const id = randomUUID();
    const payload = {
      id,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      maintenance_request_id: isolationSeedIds.requestIds.accountA,
      contractor_user_id: seededUsers.contractorA1.id,
      contractor_name: "Contractor A1",
      contractor_phone: "+447700900101",
      status: "assigned",
      notes: null,
      scheduled_at: null,
      created_by: seededUsers.ownerA.id,
      ...overrides,
    };

    const { error } = await admin.from("work_orders").insert(payload);
    expect(error).toBeNull();
    createdWorkOrderIds.add(id);
    return id;
  }

  async function readWorkOrder(workOrderId) {
    const result = await admin
      .from("work_orders")
      .select("id, status, notes, scheduled_at, contractor_user_id, account_id")
      .eq("id", workOrderId)
      .single();

    expect(result.error).toBeNull();
    return result.data;
  }

  it("allows the assigned contractor to update status, notes, and schedule on their work order", async () => {
    const workOrderId = await createWorkOrder();
    const scheduledAt = "2026-05-12T10:30:00.000Z";
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("contractor_update_work_order", {
      p_work_order_id: workOrderId,
      p_status: "in_progress",
      p_notes: "Contractor confirmed attendance window",
      p_scheduled_at: scheduledAt,
    });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      id: workOrderId,
      status: "in_progress",
      notes: "Contractor confirmed attendance window",
    });
    expect(new Date(result.data.scheduled_at).toISOString()).toBe(scheduledAt);

    const persisted = await readWorkOrder(workOrderId);
    expect(persisted.status).toBe("in_progress");
    expect(persisted.notes).toBe("Contractor confirmed attendance window");
    expect(new Date(persisted.scheduled_at).toISOString()).toBe(scheduledAt);
  });

  it("denies foreign contractors, managers, tenants, and cross-account contractor attempts without mutation", async () => {
    const workOrderId = await createWorkOrder();

    const attempts = [
      { actor: "contractorB1", note: "foreign contractor attempt" },
      { actor: "ownerA", note: "manager through contractor rpc attempt" },
      { actor: "tenantA1", note: "tenant through contractor rpc attempt" },
    ];

    for (const attempt of attempts) {
      const { client } = await signInAsFixtureUser(attempt.actor);
      const result = await client.rpc("contractor_update_work_order", {
        p_work_order_id: workOrderId,
        p_status: "in_progress",
        p_notes: attempt.note,
        p_scheduled_at: "2026-05-13T11:00:00.000Z",
      });

      expectContractorUpdateDenied(result);
    }

    const { client: contractorAClient } = await signInAsFixtureUser("contractorA1");
    const crossAccount = await contractorAClient.rpc("contractor_update_work_order", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountB,
      p_status: "in_progress",
      p_notes: "cross account attempt",
      p_scheduled_at: "2026-05-14T12:00:00.000Z",
    });
    expectContractorUpdateDenied(crossAccount);

    const persisted = await readWorkOrder(workOrderId);
    expect(persisted).toMatchObject({
      id: workOrderId,
      status: "assigned",
      notes: null,
      scheduled_at: null,
      contractor_user_id: seededUsers.contractorA1.id,
      account_id: isolationFixtures.accounts.accountA.id,
    });

    const accountB = await readWorkOrder(isolationSeedIds.workOrderIds.accountB);
    expect(accountB.account_id).toBe(isolationFixtures.accounts.accountB.id);
    expect(accountB.status).toBe("assigned");
  });

  it("rejects invalid status values and preserves the assigned work order", async () => {
    const workOrderId = await createWorkOrder();
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("contractor_update_work_order", {
      p_work_order_id: workOrderId,
      p_status: "reopened",
      p_notes: "invalid status should not persist",
      p_scheduled_at: "2026-05-15T13:00:00.000Z",
    });

    expectContractorUpdateDenied(result);

    const persisted = await readWorkOrder(workOrderId);
    expect(persisted).toMatchObject({
      id: workOrderId,
      status: "assigned",
      notes: null,
      scheduled_at: null,
    });
  });

  it("allows note-only contractor updates without changing status or schedule", async () => {
    const workOrderId = await createWorkOrder();
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("contractor_update_work_order", {
      p_work_order_id: workOrderId,
      p_status: null,
      p_notes: "Contractor note only",
      p_scheduled_at: null,
    });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      id: workOrderId,
      status: "assigned",
      notes: "Contractor note only",
      scheduled_at: null,
    });

    const persisted = await readWorkOrder(workOrderId);
    expect(persisted).toMatchObject({
      status: "assigned",
      notes: "Contractor note only",
      scheduled_at: null,
    });
  });
});
