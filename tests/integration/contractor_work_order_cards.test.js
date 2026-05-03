import { beforeAll, describe, expect, it } from "vitest";

import {
  ensureIsolationHarnessSeed,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("contractor_work_order_cards isolation", () => {
  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  it("allows contractor A to read only their assigned work order cards", async () => {
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("contractor_work_order_cards", {
      p_work_order_ids: null,
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].work_order_id).toBe(isolationSeedIds.workOrderIds.accountA);
    expect(result.data[0].property_label).toContain("11 Starlight Avenue");
    expect(result.data[0].issue_title).toBe("Leaking tap");
  });

  it("filters contractor A away from account B work order ids", async () => {
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("contractor_work_order_cards", {
      p_work_order_ids: [
        isolationSeedIds.workOrderIds.accountA,
        isolationSeedIds.workOrderIds.accountB,
      ],
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].work_order_id).toBe(isolationSeedIds.workOrderIds.accountA);
  });

  it("returns an empty set when contractor A requests only foreign work order ids", async () => {
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("contractor_work_order_cards", {
      p_work_order_ids: [isolationSeedIds.workOrderIds.accountB],
    });

    expect(result.error).toBeNull();
    expect(result.data || []).toEqual([]);
  });

  it("returns an empty set when contractor A passes an empty work order filter array", async () => {
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("contractor_work_order_cards", {
      p_work_order_ids: [],
    });

    expect(result.error).toBeNull();
    expect(result.data || []).toEqual([]);
  });

  it("returns an empty set for account owner because no work orders are assigned to auth uid", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("contractor_work_order_cards", {
      p_work_order_ids: null,
    });

    expect(result.error).toBeNull();
    expect(result.data || []).toEqual([]);
  });

  it("returns an empty set for tenant because contractor_work_order_cards filters by auth uid", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("contractor_work_order_cards", {
      p_work_order_ids: null,
    });

    expect(result.error).toBeNull();
    expect(result.data || []).toEqual([]);
  });
});
