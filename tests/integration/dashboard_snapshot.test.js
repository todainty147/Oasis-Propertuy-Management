import { beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { expectAccessDenied, firstRow } from "./helpers/rpcAssertions.js";

describe.skipIf(!isIntegrationHarnessConfigured())("dashboard_snapshot isolation", () => {
  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  it("allows account A owner to read account A dashboard", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("dashboard_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
      p_horizon_days: 7,
    });

    expect(result.error).toBeNull();
    const row = firstRow(result.data);
    expect(row).toBeTruthy();
    expect(Number(row.property_count)).toBe(1);
  });

  it("denies account A staff from reading account B dashboard", async () => {
    const { client } = await signInAsFixtureUser("staffA");

    const result = await client.rpc("dashboard_snapshot", {
      p_account_id: isolationFixtures.accounts.accountB.id,
      p_tenant_id: null,
      p_horizon_days: 7,
    });

    expectAccessDenied(result);
  });

  it("allows tenant A to read only their tenant-scoped dashboard", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("dashboard_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      p_horizon_days: 7,
    });

    expect(result.error).toBeNull();
    const row = firstRow(result.data);
    expect(row).toBeTruthy();
    expect(Number(row.property_count)).toBe(1);
  });

  it("returns an empty scoped dashboard when account A owner passes a foreign tenant id", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("dashboard_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantB1.tenantId,
      p_horizon_days: 7,
    });

    expect(result.error).toBeNull();
    const row = firstRow(result.data);
    expect(row).toBeTruthy();
    expect(Number(row.property_count)).toBe(0);
    expect(Number(row.occupied_count)).toBe(0);
    expect(Number(row.vacant_count)).toBe(0);
    expect(Number(row.tenant_due_total)).toBe(0);
  });

  it("denies tenant A from reading tenant B scoped dashboard", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("dashboard_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantB1.tenantId,
      p_horizon_days: 7,
    });

    expectAccessDenied(result);
  });

  it("denies tenant A when tenant scope is omitted", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("dashboard_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
      p_horizon_days: 7,
    });

    expectAccessDenied(result);
  });
});
