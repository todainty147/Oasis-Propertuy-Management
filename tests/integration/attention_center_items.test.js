import { beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { expectAccessDenied } from "./helpers/rpcAssertions.js";

describe.skipIf(!isIntegrationHarnessConfigured())("attention_center_items isolation", () => {
  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  it("allows account A owner to read only seeded account A attention items", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("attention_center_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_limit: 40,
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.some((row) => row.item_type === "due_soon_rent")).toBe(true);
    expect(result.data.some((row) => row.source_table === "payments")).toBe(true);
    expect(result.data.some((row) => row.property_label === "11 Starlight Avenue")).toBe(true);
    expect(result.data.every((row) => row.property_label !== "22 Harbor View Road")).toBe(true);
  });

  it("allows account A staff to read seeded account A attention items", async () => {
    const { client } = await signInAsFixtureUser("staffA");

    const result = await client.rpc("attention_center_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_limit: 40,
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((row) => row.property_label !== "22 Harbor View Road")).toBe(true);
  });

  it("clamps a zero limit to one attention item", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const result = await client.rpc("attention_center_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_limit: 0,
    });

    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].source_table).toBeTruthy();
  });

  it("denies account A staff from reading account B attention items", async () => {
    const { client } = await signInAsFixtureUser("staffA");

    const result = await client.rpc("attention_center_items", {
      p_account_id: isolationFixtures.accounts.accountB.id,
      p_limit: 40,
    });

    expectAccessDenied(result);
  });

  it("denies tenant A from reading attention center items", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client.rpc("attention_center_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_limit: 40,
    });

    expectAccessDenied(result);
  });

  it("denies contractor A from reading attention center items", async () => {
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client.rpc("attention_center_items", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_limit: 40,
    });

    expectAccessDenied(result);
  });
});
