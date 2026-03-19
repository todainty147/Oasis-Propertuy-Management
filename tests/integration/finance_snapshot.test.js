import { beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { expectAccessDenied, firstRow } from "./helpers/rpcAssertions.js";

describe.skipIf(!isIntegrationHarnessConfigured())("finance_snapshot isolation", () => {
  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  it("allows account A owner to read account A finance snapshot", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("finance_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
    });

    expect(result.error).toBeNull();
    const row = firstRow(result.data);
    expect(row).toBeTruthy();
    expect(Number(row.expected_income)).toBeGreaterThanOrEqual(1200);
  });

  it("denies account A owner from reading account B finance snapshot", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("finance_snapshot", {
      p_account_id: isolationFixtures.accounts.accountB.id,
      p_tenant_id: null,
    });

    expectAccessDenied(result);
  });

  it("allows tenant A to read only their tenant-scoped finance snapshot", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("finance_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
    });

    expect(result.error).toBeNull();
    const row = firstRow(result.data);
    expect(row).toBeTruthy();
    expect(Array.isArray(row.property_finance)).toBe(true);
  });

  it("returns zeroed finance data when account A owner passes a foreign tenant id", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("finance_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantB1.tenantId,
    });

    expect(result.error).toBeNull();
    const row = firstRow(result.data);
    expect(row).toBeTruthy();
    expect(Number(row.total_income)).toBe(0);
    expect(Number(row.overdue_income)).toBe(0);
    expect(Number(row.expected_income)).toBe(0);
    expect(row.property_finance).toEqual([]);
  });

  it("denies tenant A from reading tenant B finance scope", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("finance_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantB1.tenantId,
    });

    expectAccessDenied(result);
  });

  it("denies tenant A when finance scope omits tenant id", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("finance_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
    });

    expectAccessDenied(result);
  });
});
