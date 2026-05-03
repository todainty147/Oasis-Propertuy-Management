import { beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { expectAccessDenied } from "./helpers/rpcAssertions.js";

describe.skipIf(!isIntegrationHarnessConfigured())("portfolio_attention_items isolation", () => {
  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  it("allows account A owner to read seeded account A portfolio attention items", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("portfolio_attention_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
      p_limit: 20,
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.some((row) => row.item_type === "due_soon_payment")).toBe(true);
    expect(result.data.some((row) => Number(row.amount) === 1200)).toBe(true);
    expect(result.data.every((row) => !row.property_label || row.property_label === "11 Starlight Avenue")).toBe(true);
  });

  it("denies account A owner from reading account B portfolio attention items", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("portfolio_attention_items", {
      p_account_id: isolationFixtures.accounts.accountB.id,
      p_tenant_id: null,
      p_limit: 20,
    });

    expectAccessDenied(result);
  });

  it("allows tenant A to read only their tenant-scoped portfolio attention items", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("portfolio_attention_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      p_limit: 20,
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.some((row) => row.item_type === "due_soon_payment")).toBe(true);
    expect(result.data.every((row) => !row.property_label || row.property_label === "11 Starlight Avenue")).toBe(true);
  });

  it("returns an empty set when account A owner passes a foreign tenant id", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("portfolio_attention_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantB1.tenantId,
      p_limit: 20,
    });

    expect(result.error).toBeNull();
    expect(result.data || []).toEqual([]);
  });

  it("denies tenant A from reading tenant B portfolio attention scope", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("portfolio_attention_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: isolationFixtures.users.tenantB1.tenantId,
      p_limit: 20,
    });

    expectAccessDenied(result);
  });

  it("denies tenant A when portfolio attention scope omits tenant id", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("portfolio_attention_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
      p_limit: 20,
    });

    expectAccessDenied(result);
  });

  it("denies contractor A from reading portfolio attention items", async () => {
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("portfolio_attention_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
      p_limit: 20,
    });

    expectAccessDenied(result);
  });
});
