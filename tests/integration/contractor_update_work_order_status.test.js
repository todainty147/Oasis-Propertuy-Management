import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("contractor_update_work_order_status writes", () => {
  const admin = getIntegrationAdminClient();
  let seededUsers;
  let tempWorkOrderId;

  async function resetWorkOrderState() {
    const { error: deleteError } = await admin
      .from("work_orders")
      .delete()
      .eq("id", tempWorkOrderId);

    if (deleteError) throw deleteError;
  }

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  async function createTempWorkOrder() {
    tempWorkOrderId = randomUUID();

    const { error } = await admin.from("work_orders").insert({
      id: tempWorkOrderId,
      account_id: "11111111-1111-1111-1111-111111111111",
      property_id: isolationSeedIds.propertyIds.accountA,
      maintenance_request_id: isolationSeedIds.requestIds.accountA,
      contractor_user_id: seededUsers.contractorA1.id,
      contractor_name: "Contractor A1",
      contractor_phone: "+447700900101",
      status: "assigned",
      notes: null,
      created_by: seededUsers.ownerA.id,
    });

    if (error) throw error;
  }

  afterEach(async () => {
    await resetWorkOrderState();
  });

  it("allows contractor A to update only their assigned work order status and notes", async () => {
    await createTempWorkOrder();
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("contractor_update_work_order_status", {
      p_work_order_id: tempWorkOrderId,
      p_status: "in_progress",
      p_notes: "integration contractor note",
    });

    expect(result.error).toBeNull();
    expect(result.data.status).toBe("in_progress");
    expect(result.data.notes).toBe("integration contractor note");

    const { data: workOrder, error } = await admin
      .from("work_orders")
      .select("status, notes")
      .eq("id", tempWorkOrderId)
      .single();

    expect(error).toBeNull();
    expect(workOrder.status).toBe("in_progress");
    expect(workOrder.notes).toBe("integration contractor note");
  });

  it("denies contractor A from updating account B work orders", async () => {
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("contractor_update_work_order_status", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountB,
      p_status: "in_progress",
      p_notes: "integration contractor note",
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("not allowed");
  });

  it("denies owner A from using contractor-only work order status writes", async () => {
    await createTempWorkOrder();
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("contractor_update_work_order_status", {
      p_work_order_id: tempWorkOrderId,
      p_status: "in_progress",
      p_notes: "integration contractor note",
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("not allowed");
  });

  it("rejects invalid contractor status values and leaves the seeded work order unchanged", async () => {
    await createTempWorkOrder();
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("contractor_update_work_order_status", {
      p_work_order_id: tempWorkOrderId,
      p_status: "reopened",
      p_notes: "integration contractor note",
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("invalid status");

    const { data: workOrder, error } = await admin
      .from("work_orders")
      .select("status, notes")
      .eq("id", tempWorkOrderId)
      .single();

    expect(error).toBeNull();
    expect(workOrder.status).toBe("assigned");
    expect(workOrder.notes).toBeNull();
  });
});
