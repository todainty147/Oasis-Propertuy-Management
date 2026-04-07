import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("lease table security", () => {
  const admin = getIntegrationAdminClient();
  const createdLeaseIds = new Set();

  function buildLeaseRow(overrides = {}) {
    return {
      id: randomUUID(),
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationFixtures.users.tenantA1.propertyId,
      tenant_id: isolationFixtures.users.tenantA1.tenantId,
      lease_start_date: "2026-01-01",
      lease_end_date: "2026-12-31",
      renewal_status: "active",
      notice_period_days: 30,
      auto_renew: false,
      notes: "integration lease",
      ...overrides,
    };
  }

  async function insertLease(row = {}) {
    const payload = buildLeaseRow(row);
    const { data, error } = await admin
      .from("leases")
      .insert(payload)
      .select("id, account_id, property_id, tenant_id, lease_start_date, lease_end_date")
      .single();

    if (error) throw error;
    createdLeaseIds.add(data.id);
    return data;
  }

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdLeaseIds.size === 0) return;

    const ids = Array.from(createdLeaseIds);
    createdLeaseIds.clear();

    const { error } = await admin.from("leases").delete().in("id", ids);
    if (error) throw error;
  });

  it("allows owner A to create and read account A leases", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const insertResult = await client
      .from("leases")
      .insert(buildLeaseRow({ notes: "owner-created lease" }))
      .select("id, account_id, notes")
      .single();

    expect(insertResult.error).toBeNull();
    createdLeaseIds.add(insertResult.data.id);
    expect(insertResult.data.account_id).toBe(isolationFixtures.accounts.accountA.id);

    const readResult = await client
      .from("leases")
      .select("id, account_id, tenant_id")
      .eq("id", insertResult.data.id)
      .single();

    expect(readResult.error).toBeNull();
    expect(readResult.data.tenant_id).toBe(isolationFixtures.users.tenantA1.tenantId);
  });

  it("allows tenant A to read only their linked lease", async () => {
    const lease = await insertLease();
    const { client } = await signInAsFixtureUser("tenantA1");

    const ownLease = await client
      .from("leases")
      .select("id, tenant_id")
      .eq("id", lease.id)
      .single();

    expect(ownLease.error).toBeNull();
    expect(ownLease.data.tenant_id).toBe(isolationFixtures.users.tenantA1.tenantId);
  });

  it("denies cross-account owners from reading a foreign lease", async () => {
    const lease = await insertLease();
    const { client } = await signInAsFixtureUser("ownerB");

    const result = await client
      .from("leases")
      .select("id, account_id")
      .eq("id", lease.id)
      .maybeSingle();

    expect(result.error).toBeNull();
    expect(result.data).toBeNull();
  });

  it("denies tenant A from creating leases", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client
      .from("leases")
      .insert(buildLeaseRow({ notes: "tenant-created lease" }))
      .select("id")
      .single();

    expect(result.data ?? null).toBeNull();
    expect(String(result.error?.message || "").toLowerCase()).toContain("row-level security");
  });
});
