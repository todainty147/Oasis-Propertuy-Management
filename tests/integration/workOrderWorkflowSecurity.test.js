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
import { expectAccessDenied } from "./helpers/rpcAssertions.js";

function expectWorkflowDenied(result) {
  const message = String(result.error?.message || "").toLowerCase();
  expect(result.data ?? null).toBeNull();
  expect(result.error).toBeTruthy();
  expect(
    message.includes("access denied") ||
      message.includes("not authorized") ||
      message.includes("only account members") ||
      message.includes("contractor not found") ||
      message.includes("no pending tenant cancellation"),
  ).toBe(true);
}

describe.skipIf(!isIntegrationHarnessConfigured())("work order assignment and cancellation decisions", () => {
  const admin = getIntegrationAdminClient();
  const createdWorkOrderIds = new Set();
  let seededUsers;

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdWorkOrderIds.size > 0) {
      const ids = Array.from(createdWorkOrderIds);
      createdWorkOrderIds.clear();
      const { error } = await admin.from("work_orders").delete().in("id", ids);
      expect(error).toBeNull();
    }

    const { error: tenantResetError } = await admin
      .from("tenants")
      .update({ status: "applicant" })
      .eq("id", isolationFixtures.users.tenantA1.tenantId);

    expect(tenantResetError).toBeNull();
  });

  async function createWorkOrder(overrides = {}) {
    const id = randomUUID();
    const payload = {
      id,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      maintenance_request_id: isolationSeedIds.requestIds.accountA,
      contractor_user_id: null,
      contractor_name: null,
      contractor_phone: null,
      status: "assigned",
      created_by: seededUsers.ownerA.id,
      ...overrides,
    };

    const { error } = await admin.from("work_orders").insert(payload);
    expect(error).toBeNull();
    createdWorkOrderIds.add(id);
    return id;
  }

  async function requestTenantCancellation(workOrderId) {
    const { error: tenantStatusError } = await admin
      .from("tenants")
      .update({ status: "active" })
      .eq("id", isolationFixtures.users.tenantA1.tenantId);
    expect(tenantStatusError).toBeNull();

    const { client } = await signInAsFixtureUser("tenantA1");
    const result = await client.rpc("work_order_set_status", {
      p_work_order_id: workOrderId,
      p_new_status: "cancelled",
      p_apply_if_tenant_allowed: false,
    });

    expect(result.error).toBeNull();
  }

  it("allows managers to assign an in-account contractor and records scoped assignment state", async () => {
    const workOrderId = await createWorkOrder();
    const { client } = await signInAsFixtureUser("staffA");

    const result = await client.rpc("work_order_assign_contractor", {
      p_work_order_id: workOrderId,
      p_contractor_id: isolationFixtures.users.contractorA1.contractorId,
    });

    expect(result.error).toBeNull();

    const lookup = await admin
      .from("work_orders")
      .select("account_id, contractor_user_id, contractor_name, contractor_phone")
      .eq("id", workOrderId)
      .single();

    expect(lookup.error).toBeNull();
    expect(lookup.data).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      contractor_user_id: seededUsers.contractorA1.id,
      contractor_name: "Contractor A1",
      contractor_phone: "+447700900101",
    });
  });

  it("denies tenant, contractor, and cross-account manager assignment attempts without mutating the work order", async () => {
    const workOrderId = await createWorkOrder();

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantResult = await tenantClient.rpc("work_order_assign_contractor", {
      p_work_order_id: workOrderId,
      p_contractor_id: isolationFixtures.users.contractorA1.contractorId,
    });
    expectAccessDenied(tenantResult);

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    const contractorResult = await contractorClient.rpc("work_order_assign_contractor", {
      p_work_order_id: workOrderId,
      p_contractor_id: isolationFixtures.users.contractorA1.contractorId,
    });
    expectAccessDenied(contractorResult);

    const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
    const foreignResult = await ownerAClient.rpc("work_order_assign_contractor", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountB,
      p_contractor_id: isolationFixtures.users.contractorB1.contractorId,
    });
    expectAccessDenied(foreignResult);

    const unchanged = await admin
      .from("work_orders")
      .select("contractor_user_id, contractor_name, contractor_phone")
      .eq("id", workOrderId)
      .single();

    expect(unchanged.error).toBeNull();
    expect(unchanged.data).toMatchObject({
      contractor_user_id: null,
      contractor_name: null,
      contractor_phone: null,
    });
  });

  it("denies assigning a contractor directory row from another account", async () => {
    const workOrderId = await createWorkOrder();
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("work_order_assign_contractor", {
      p_work_order_id: workOrderId,
      p_contractor_id: isolationFixtures.users.contractorB1.contractorId,
    });

    expectWorkflowDenied(result);

    const unchanged = await admin
      .from("work_orders")
      .select("contractor_user_id")
      .eq("id", workOrderId)
      .single();

    expect(unchanged.error).toBeNull();
    expect(unchanged.data.contractor_user_id).toBeNull();
  });

  it("allows managers to approve a pending tenant cancellation and records audit context", async () => {
    const workOrderId = await createWorkOrder({
      contractor_user_id: seededUsers.contractorA1.id,
      contractor_name: "Contractor A1",
      contractor_phone: "+447700900101",
    });
    await requestTenantCancellation(workOrderId);

    const { client, user } = await signInAsFixtureUser("staffA");
    const result = await client.rpc("work_order_approve_tenant_cancellation", {
      p_work_order_id: workOrderId,
    });

    expect(result.error).toBeNull();
    expect(result.data.status).toBe("cancelled");

    const audit = await admin
      .from("work_order_audit_log")
      .select("actor_user_id, action, account_id, new_value")
      .eq("work_order_id", workOrderId)
      .eq("action", "tenant_cancellation_approved")
      .order("id", { ascending: false })
      .limit(1);

    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(1);
    expect(audit.data[0]).toMatchObject({
      actor_user_id: user.id,
      action: "tenant_cancellation_approved",
      account_id: isolationFixtures.accounts.accountA.id,
      new_value: { status: "cancelled" },
    });
  });

  it("allows managers to deny a pending tenant cancellation while leaving status unchanged", async () => {
    const workOrderId = await createWorkOrder();
    await requestTenantCancellation(workOrderId);

    const { client, user } = await signInAsFixtureUser("ownerA");
    const result = await client.rpc("work_order_deny_tenant_cancellation", {
      p_work_order_id: workOrderId,
      p_reason: "Contractor already en route",
    });

    expect(result.error).toBeNull();
    expect(result.data.status).toBe("assigned");

    const audit = await admin
      .from("work_order_audit_log")
      .select("actor_user_id, action, account_id, new_value")
      .eq("work_order_id", workOrderId)
      .eq("action", "tenant_cancellation_denied")
      .order("id", { ascending: false })
      .limit(1);

    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(1);
    expect(audit.data[0]).toMatchObject({
      actor_user_id: user.id,
      action: "tenant_cancellation_denied",
      account_id: isolationFixtures.accounts.accountA.id,
      new_value: { reason: "Contractor already en route" },
    });

    const workOrder = await admin
      .from("work_orders")
      .select("status")
      .eq("id", workOrderId)
      .single();

    expect(workOrder.error).toBeNull();
    expect(workOrder.data.status).toBe("assigned");
  });

  it("denies cancellation decisions for non-managers, cross-account managers, and missing pending requests", async () => {
    const workOrderId = await createWorkOrder();
    await requestTenantCancellation(workOrderId);

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantApprove = await tenantClient.rpc("work_order_approve_tenant_cancellation", {
      p_work_order_id: workOrderId,
    });
    expectWorkflowDenied(tenantApprove);

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    const contractorDeny = await contractorClient.rpc("work_order_deny_tenant_cancellation", {
      p_work_order_id: workOrderId,
      p_reason: "No",
    });
    expectWorkflowDenied(contractorDeny);

    const { client: ownerAClient } = await signInAsFixtureUser("ownerA");
    const foreignApprove = await ownerAClient.rpc("work_order_approve_tenant_cancellation", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountB,
    });
    expectWorkflowDenied(foreignApprove);

    const noPendingWorkOrderId = await createWorkOrder();
    const noPending = await ownerAClient.rpc("work_order_deny_tenant_cancellation", {
      p_work_order_id: noPendingWorkOrderId,
      p_reason: "No request exists",
    });
    expectWorkflowDenied(noPending);

    const unchanged = await admin
      .from("work_orders")
      .select("status")
      .eq("id", workOrderId)
      .single();

    expect(unchanged.error).toBeNull();
    expect(unchanged.data.status).toBe("assigned");
  });
});
