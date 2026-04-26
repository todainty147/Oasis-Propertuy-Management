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
import { firstRow } from "./helpers/rpcAssertions.js";

describe.skipIf(!isIntegrationHarnessConfigured())("property_operational_health_snapshot status alignment", () => {
  const admin = getIntegrationAdminClient();
  const createdRequestIds = new Set();
  const createdWorkOrderIds = new Set();
  let seededUsers;

  beforeAll(async () => {
    seededUsers = await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdWorkOrderIds.size > 0) {
      const { error } = await admin.from("work_orders").delete().in("id", Array.from(createdWorkOrderIds));
      expect(error).toBeNull();
      createdWorkOrderIds.clear();
    }

    if (createdRequestIds.size > 0) {
      const { error } = await admin.from("maintenance_requests").delete().in("id", Array.from(createdRequestIds));
      expect(error).toBeNull();
      createdRequestIds.clear();
    }
  });

  async function fetchPropertyRow(client) {
    const result = await client.rpc("property_operational_health_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_property_id: isolationSeedIds.propertyIds.accountA,
      p_limit: 1,
    });

    expect(result.error).toBeNull();
    return firstRow(result.data);
  }

  async function fetchKpiRow(client) {
    const result = await client.rpc("maintenance_kpi_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
    });
    expect(result.error).toBeNull();
    return firstRow(result.data);
  }

  it("does not count resolved requests as open pressure", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const beforeProperty = await fetchPropertyRow(client);
    const beforeKpi = await fetchKpiRow(client);

    const requestId = randomUUID();
    createdRequestIds.add(requestId);

    const insert = await admin.from("maintenance_requests").insert({
      id: requestId,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      reported_by_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      title: "Resolved request should not count as open",
      description: "Regression guard for property health alignment",
      priority: "normal",
      status: "resolved",
    });
    expect(insert.error).toBeNull();

    const afterProperty = await fetchPropertyRow(client);
    const afterKpi = await fetchKpiRow(client);

    expect(Number(afterProperty.open_request_count)).toBe(Number(beforeProperty.open_request_count));
    expect(Number(afterKpi.open_requests)).toBe(Number(beforeKpi.open_requests));
  });

  it("counts assigned work orders consistently across KPI and property health", async () => {
    const { client } = await signInAsFixtureUser("ownerA");
    const beforeProperty = await fetchPropertyRow(client);
    const beforeKpi = await fetchKpiRow(client);

    const workOrderId = randomUUID();
    createdWorkOrderIds.add(workOrderId);

    const insert = await admin.from("work_orders").insert({
      id: workOrderId,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      maintenance_request_id: isolationSeedIds.requestIds.accountA,
      contractor_user_id: seededUsers.contractorA1.id,
      contractor_name: "Contractor A1",
      contractor_phone: "+447700900101",
      status: "assigned",
      created_by: seededUsers.ownerA.id,
    });
    expect(insert.error).toBeNull();

    const afterProperty = await fetchPropertyRow(client);
    const afterKpi = await fetchKpiRow(client);

    expect(Number(afterProperty.active_work_order_count)).toBe(Number(beforeProperty.active_work_order_count) + 1);
    expect(Number(afterKpi.active_work_orders)).toBe(Number(beforeKpi.active_work_orders) + 1);
  });
});
