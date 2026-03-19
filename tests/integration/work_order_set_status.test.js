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

describe.skipIf(!isIntegrationHarnessConfigured())("work_order_set_status writes", () => {
  const admin = getIntegrationAdminClient();
  let seededUsers;
  let tempWorkOrderId;

  async function resetWorkOrderState() {
    const { error: deleteError } = await admin
      .from("work_orders")
      .delete()
      .eq("id", tempWorkOrderId);

    if (deleteError) throw deleteError;

    const { error: tenantResetError } = await admin
      .from("tenants")
      .update({ status: "applicant" })
      .eq("id", isolationFixtures.users.tenantA1.tenantId);

    if (tenantResetError) throw tenantResetError;
  }

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  async function createTempWorkOrder() {
    tempWorkOrderId = randomUUID();

    const { error } = await admin.from("work_orders").insert({
      id: tempWorkOrderId,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      maintenance_request_id: isolationSeedIds.requestIds.accountA,
      contractor_user_id: seededUsers.contractorA1.id,
      contractor_name: "Contractor A1",
      contractor_phone: "+447700900101",
      status: "assigned",
      created_by: seededUsers.ownerA.id,
    });

    if (error) throw error;
  }

  afterEach(async () => {
    await resetWorkOrderState();
  });

  it("allows owner A to change account A work order status and records audit", async () => {
    await createTempWorkOrder();
    const { client, user } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("work_order_set_status", {
      p_work_order_id: tempWorkOrderId,
      p_new_status: "in_progress",
      p_apply_if_tenant_allowed: false,
    });

    expect(result.error).toBeNull();

    const { data: workOrder, error: woError } = await admin
      .from("work_orders")
      .select("status, account_id")
      .eq("id", tempWorkOrderId)
      .single();

    expect(woError).toBeNull();
    expect(workOrder.status).toBe("in_progress");
    expect(workOrder.account_id).toBe(isolationFixtures.accounts.accountA.id);

    const { data: auditRows, error: auditError } = await admin
      .from("work_order_audit_log")
      .select("actor_user_id, action, account_id, new_value")
      .eq("work_order_id", tempWorkOrderId)
      .eq("action", "status_changed")
      .order("id", { ascending: false })
      .limit(1);

    expect(auditError).toBeNull();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].actor_user_id).toBe(user.id);
    expect(auditRows[0].account_id).toBe(isolationFixtures.accounts.accountA.id);
    expect(auditRows[0].new_value.status).toBe("in_progress");
  });

  it("denies owner A from changing account B work order status", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("work_order_set_status", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountB,
      p_new_status: "in_progress",
      p_apply_if_tenant_allowed: false,
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("not authorized");
  });

  it("denies contractor A from using member work order status transitions", async () => {
    await createTempWorkOrder();
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("work_order_set_status", {
      p_work_order_id: tempWorkOrderId,
      p_new_status: "in_progress",
      p_apply_if_tenant_allowed: false,
    });

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("not authorized");
  });

  it("allows tenant A to request cancellation as an audit-only event without changing work order status", async () => {
    await createTempWorkOrder();
    const { error: tenantStatusError } = await admin
      .from("tenants")
      .update({ status: "active" })
      .eq("id", isolationFixtures.users.tenantA1.tenantId);

    expect(tenantStatusError).toBeNull();

    const { client, user } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("work_order_set_status", {
      p_work_order_id: tempWorkOrderId,
      p_new_status: "cancelled",
      p_apply_if_tenant_allowed: false,
    });

    expect(result.error).toBeNull();

    const { data: workOrder, error: woError } = await admin
      .from("work_orders")
      .select("status")
      .eq("id", tempWorkOrderId)
      .single();

    expect(woError).toBeNull();
    expect(workOrder.status).toBe("assigned");

    const { data: auditRows, error: auditError } = await admin
      .from("work_order_audit_log")
      .select("actor_user_id, action, new_value")
      .eq("work_order_id", tempWorkOrderId)
      .eq("action", "tenant_cancellation_requested")
      .order("id", { ascending: false })
      .limit(1);

    expect(auditError).toBeNull();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].actor_user_id).toBe(user.id);
    expect(auditRows[0].new_value.requested_status).toBe("cancelled");
  });
});
