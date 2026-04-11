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

function normalizeActions(actions) {
  return [...(actions ?? [])].sort();
}

describe.skipIf(!isIntegrationHarnessConfigured())("work order allowed action helpers", () => {
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
      .in("id", [
        isolationFixtures.users.tenantA1.tenantId,
        isolationFixtures.users.tenantB1.tenantId,
      ]);

    expect(tenantResetError).toBeNull();
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
      created_by: seededUsers.ownerA.id,
      ...overrides,
    };

    const { error } = await admin.from("work_orders").insert(payload);
    expect(error).toBeNull();
    createdWorkOrderIds.add(id);
    return id;
  }

  async function setTenantStatus(tenantId, status) {
    const { error } = await admin.from("tenants").update({ status }).eq("id", tenantId);
    expect(error).toBeNull();
  }

  it("returns manager actions for in-account work orders and hides foreign ids from bulk responses", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const singleResult = await client.rpc("work_order_allowed_actions", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountA,
    });

    expect(singleResult.error).toBeNull();
    expect(normalizeActions(singleResult.data)).toEqual(["cancelled", "in_progress"]);

    const foreignResult = await client.rpc("work_order_allowed_actions", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountB,
    });

    expect(foreignResult.error).toBeNull();
    expect(normalizeActions(foreignResult.data)).toEqual([]);

    const missingId = randomUUID();
    const bulkResult = await client.rpc("work_order_allowed_actions_bulk", {
      p_work_order_ids: [
        isolationSeedIds.workOrderIds.accountA,
        isolationSeedIds.workOrderIds.accountB,
        missingId,
      ],
    });

    expect(bulkResult.error).toBeNull();
    expect(bulkResult.data).toHaveLength(1);
    expect(bulkResult.data[0].work_order_id).toBe(isolationSeedIds.workOrderIds.accountA);
    expect(normalizeActions(bulkResult.data[0].actions)).toEqual(["cancelled", "in_progress"]);
  });

  it("limits active tenants to cancellation requests for their property scope only", async () => {
    await setTenantStatus(isolationFixtures.users.tenantA1.tenantId, "active");
    await setTenantStatus(isolationFixtures.users.tenantB1.tenantId, "active");

    const { client } = await signInAsFixtureUser("tenantA1");

    const ownScope = await client.rpc("work_order_allowed_actions", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountA,
    });
    expect(ownScope.error).toBeNull();
    expect(normalizeActions(ownScope.data)).toEqual(["cancelled"]);

    const foreignScope = await client.rpc("work_order_allowed_actions", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountB,
    });
    expect(foreignScope.error).toBeNull();
    expect(normalizeActions(foreignScope.data)).toEqual([]);

    const bulkResult = await client.rpc("work_order_allowed_actions_bulk", {
      p_work_order_ids: [
        isolationSeedIds.workOrderIds.accountA,
        isolationSeedIds.workOrderIds.accountB,
      ],
    });
    expect(bulkResult.error).toBeNull();
    expect(bulkResult.data.map((row) => row.work_order_id)).toEqual([
      isolationSeedIds.workOrderIds.accountA,
    ]);
  });

  it("returns assigned-contractor actions only through the contractor helper", async () => {
    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");

    const contractorResult = await contractorClient.rpc("contractor_allowed_actions", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountA,
    });
    expect(contractorResult.error).toBeNull();
    expect(normalizeActions(contractorResult.data)).toEqual(["cancelled", "in_progress"]);

    const memberHelperResult = await contractorClient.rpc("work_order_allowed_actions", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountA,
    });
    expect(memberHelperResult.error).toBeNull();
    expect(normalizeActions(memberHelperResult.data)).toEqual([]);

    const foreignContractorResult = await contractorClient.rpc("contractor_allowed_actions", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountB,
    });
    expect(foreignContractorResult.error).toBeNull();
    expect(normalizeActions(foreignContractorResult.data)).toEqual([]);

    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const managerViaContractorHelper = await ownerClient.rpc("contractor_allowed_actions", {
      p_work_order_id: isolationSeedIds.workOrderIds.accountA,
    });
    expect(managerViaContractorHelper.error).toBeNull();
    expect(normalizeActions(managerViaContractorHelper.data)).toEqual([]);
  });

  it("returns no actions for terminal work orders across manager, tenant, and contractor helpers", async () => {
    await setTenantStatus(isolationFixtures.users.tenantA1.tenantId, "active");
    const workOrderId = await createWorkOrder({ status: "completed" });

    const { client: ownerClient } = await signInAsFixtureUser("ownerA");
    const ownerResult = await ownerClient.rpc("work_order_allowed_actions", {
      p_work_order_id: workOrderId,
    });
    expect(ownerResult.error).toBeNull();
    expect(normalizeActions(ownerResult.data)).toEqual([]);

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantResult = await tenantClient.rpc("work_order_allowed_actions", {
      p_work_order_id: workOrderId,
    });
    expect(tenantResult.error).toBeNull();
    expect(normalizeActions(tenantResult.data)).toEqual([]);

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    const contractorResult = await contractorClient.rpc("contractor_allowed_actions", {
      p_work_order_id: workOrderId,
    });
    expect(contractorResult.error).toBeNull();
    expect(normalizeActions(contractorResult.data)).toEqual([]);
  });
});
