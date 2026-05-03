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

function expectRlsDenied(result) {
  const message = String(result.error?.message || "").toLowerCase();
  expect(result.error).toBeTruthy();
  expect(
    message.includes("row-level security") ||
      message.includes("violates row-level security") ||
      message.includes("permission denied") ||
      message.includes("not allowed") ||
      message.includes("invalid reported_by_tenant_id"),
  ).toBe(true);
}

describe.skipIf(!isIntegrationHarnessConfigured())("maintenance request table security", () => {
  const admin = getIntegrationAdminClient();
  const createdRequestIds = new Set();

  function buildRequest(overrides = {}) {
    return {
      id: randomUUID(),
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      reported_by_tenant_id: null,
      title: `Integration maintenance ${randomUUID()}`,
      description: "Created by maintenance request security coverage",
      priority: "normal",
      status: "open",
      ...overrides,
    };
  }

  async function createRequestAs(fixtureKey, overrides = {}) {
    const { client } = await signInAsFixtureUser(fixtureKey);
    const payload = buildRequest(overrides);
    const result = await client
      .from("maintenance_requests")
      .insert(payload)
      .select("id, account_id, property_id, reported_by_tenant_id, title, status, priority")
      .single();

    if (!result.error && result.data?.id) {
      createdRequestIds.add(result.data.id);
    }

    return { result, payload };
  }

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdRequestIds.size === 0) return;

    const ids = Array.from(createdRequestIds);
    createdRequestIds.clear();
    const { error } = await admin
      .from("maintenance_requests")
      .delete()
      .in("id", ids);

    expect(error).toBeNull();
  });

  it("allows managers to read in-account requests while hiding cross-account rows", async () => {
    const { client } = await signInAsFixtureUser("staffA");

    const ownResult = await client
      .from("maintenance_requests")
      .select("id, account_id, property_id, reported_by_tenant_id, title")
      .eq("id", isolationSeedIds.requestIds.accountA)
      .single();

    expect(ownResult.error).toBeNull();
    expect(ownResult.data).toMatchObject({
      id: isolationSeedIds.requestIds.accountA,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
    });

    const foreignResult = await client
      .from("maintenance_requests")
      .select("id")
      .eq("id", isolationSeedIds.requestIds.accountB);

    expect(foreignResult.error).toBeNull();
    expect(foreignResult.data || []).toEqual([]);
  });

  it("allows tenants to read and create only requests for their own property", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const readResult = await client
      .from("maintenance_requests")
      .select("id, account_id, property_id, reported_by_tenant_id, title")
      .eq("id", isolationSeedIds.requestIds.accountA)
      .single();

    expect(readResult.error).toBeNull();
    expect(readResult.data).toMatchObject({
      id: isolationSeedIds.requestIds.accountA,
      reported_by_tenant_id: isolationFixtures.users.tenantA1.tenantId,
    });

    const foreignRead = await client
      .from("maintenance_requests")
      .select("id")
      .eq("id", isolationSeedIds.requestIds.accountB);

    expect(foreignRead.error).toBeNull();
    expect(foreignRead.data || []).toEqual([]);

    const { result } = await createRequestAs("tenantA1", {
      reported_by_tenant_id: null,
      title: "Tenant-created maintenance request",
    });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      reported_by_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      title: "Tenant-created maintenance request",
      status: "open",
    });
  });

  it("blocks tenant spoofing and cross-property request creation", async () => {
    const spoofed = await createRequestAs("tenantA1", {
      reported_by_tenant_id: isolationFixtures.users.tenantB1.tenantId,
      title: "Spoofed maintenance request",
    });

    expectRlsDenied(spoofed.result);

    const foreignProperty = await createRequestAs("tenantA1", {
      account_id: isolationFixtures.accounts.accountB.id,
      property_id: isolationSeedIds.propertyIds.accountB,
      reported_by_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      title: "Foreign property maintenance request",
    });

    expectRlsDenied(foreignProperty.result);
  });

  it("allows managers to create, update, and delete in-account requests", async () => {
    const { result } = await createRequestAs("adminA", {
      title: "Manager-created maintenance request",
    });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      reported_by_tenant_id: null,
      title: "Manager-created maintenance request",
    });

    const { client } = await signInAsFixtureUser("staffA");
    const updateResult = await client
      .from("maintenance_requests")
      .update({
        status: "waiting",
        waiting_reason: "tenant_response",
        priority: "high",
      })
      .eq("id", result.data.id)
      .select("id, status, waiting_reason, priority")
      .single();

    expect(updateResult.error).toBeNull();
    expect(updateResult.data).toMatchObject({
      id: result.data.id,
      status: "waiting",
      waiting_reason: "tenant_response",
      priority: "high",
    });

    const deleteResult = await client
      .from("maintenance_requests")
      .delete()
      .eq("id", result.data.id);

    expect(deleteResult.error).toBeNull();
    createdRequestIds.delete(result.data.id);

    const { data: deletedRows, error: deletedError } = await admin
      .from("maintenance_requests")
      .select("id")
      .eq("id", result.data.id);

    expect(deletedError).toBeNull();
    expect(deletedRows || []).toEqual([]);
  });

  it("prevents tenant, contractor, and cross-account manager direct mutation", async () => {
    const { result } = await createRequestAs("ownerA", {
      title: "Protected maintenance request",
    });

    expect(result.error).toBeNull();

    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantUpdate = await tenantClient
      .from("maintenance_requests")
      .update({ status: "closed" })
      .eq("id", result.data.id)
      .select("id");

    expect(tenantUpdate.error).toBeNull();
    expect(tenantUpdate.data || []).toEqual([]);

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    const contractorRead = await contractorClient
      .from("maintenance_requests")
      .select("id")
      .eq("id", result.data.id);

    expect(contractorRead.error).toBeNull();
    expect(contractorRead.data || []).toEqual([]);

    const contractorUpdate = await contractorClient
      .from("maintenance_requests")
      .update({ status: "closed" })
      .eq("id", result.data.id)
      .select("id");

    expect(contractorUpdate.error).toBeNull();
    expect(contractorUpdate.data || []).toEqual([]);

    const { client: staffBClient } = await signInAsFixtureUser("staffB");
    const crossAccountUpdate = await staffBClient
      .from("maintenance_requests")
      .update({ status: "closed" })
      .eq("id", result.data.id)
      .select("id");

    expect(crossAccountUpdate.error).toBeNull();
    expect(crossAccountUpdate.data || []).toEqual([]);

    const { data: unchangedRow, error: unchangedError } = await admin
      .from("maintenance_requests")
      .select("id, status")
      .eq("id", result.data.id)
      .single();

    expect(unchangedError).toBeNull();
    expect(unchangedRow).toMatchObject({
      id: result.data.id,
      status: "open",
    });
  });
});
