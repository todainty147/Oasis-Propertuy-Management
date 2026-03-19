import { beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { expectAccessDenied, firstRow } from "./helpers/rpcAssertions.js";

describe.skipIf(!isIntegrationHarnessConfigured())("portfolio_health_snapshot isolation", () => {
  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  it("allows account A owner to read seeded account A portfolio health", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("portfolio_health_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
    });

    expect(result.error).toBeNull();
    const row = firstRow(result.data);
    expect(row).toBeTruthy();
    expect(Number(row.property_count)).toBe(1);
    expect(Number(row.occupied_count)).toBe(1);
    expect(Number(row.due_amount)).toBeGreaterThanOrEqual(1200);
  });

  it("denies account A owner from reading account B portfolio health", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("portfolio_health_snapshot", {
      p_account_id: isolationFixtures.accounts.accountB.id,
      p_tenant_id: null,
    });

    expectAccessDenied(result);
  });

  it("allows tenant A to read only their tenant-scoped portfolio health", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("portfolio_health_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
    });

    expect(result.error).toBeNull();
    const row = firstRow(result.data);
    expect(row).toBeTruthy();
    expect(Number(row.property_count)).toBe(1);
    expect(Number(row.occupied_count)).toBe(1);
  });

  it("returns a zeroed snapshot when account A owner passes a foreign tenant id", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("portfolio_health_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantB1.tenantId,
    });

    expect(result.error).toBeNull();
    const row = firstRow(result.data);
    expect(row).toBeTruthy();
    expect(Number(row.property_count)).toBe(0);
    expect(Number(row.occupied_count)).toBe(0);
    expect(Number(row.outstanding_amount)).toBe(0);
    expect(Number(row.open_requests)).toBe(0);
  });

  it("denies tenant A from reading tenant B portfolio health scope", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("portfolio_health_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantB1.tenantId,
    });

    expectAccessDenied(result);
  });

  it("denies tenant A when portfolio health scope omits tenant id", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("portfolio_health_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
    });

    expectAccessDenied(result);
  });

  it("denies contractor A from reading portfolio health", async () => {
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("portfolio_health_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
    });

    expectAccessDenied(result);
  });
});
