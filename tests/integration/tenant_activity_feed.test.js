import { beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { expectAccessDenied } from "./helpers/rpcAssertions.js";

describe.skipIf(!isIntegrationHarnessConfigured())("tenant_activity_feed isolation", () => {
  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  it("allows tenant A to read their own activity feed", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("tenant_activity_feed", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      p_limit: 20,
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("respects limit clamping by returning a single tenant A feed row when limit is zero", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("tenant_activity_feed", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      p_limit: 0,
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].source_table).toBeTruthy();
  });

  it("denies tenant A from requesting tenant B activity feed", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("tenant_activity_feed", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantB1.tenantId,
      p_limit: 20,
    });

    expectAccessDenied(result);
  });

  it("allows account A owner to review tenant A activity feed inside their account", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("tenant_activity_feed", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      p_limit: 20,
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("returns an empty feed when account A owner passes a foreign tenant id", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("tenant_activity_feed", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantB1.tenantId,
      p_limit: 20,
    });

    expect(result.error).toBeNull();
    expect(result.data || []).toEqual([]);
  });
});
