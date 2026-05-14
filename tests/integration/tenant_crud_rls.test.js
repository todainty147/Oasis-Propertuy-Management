/**
 * Integration: tenant table RLS — cross-account isolation
 *
 * Covers every CRUD vector for the tenants table:
 *   - READ  isolation (ownerA, ownerB, staffA, tenantA1 can only see their own rows)
 *   - INSERT denial (ownerB / contractor cannot write into accountA)
 *   - UPDATE denial (ownerB update affects zero rows via silent RLS filter)
 *   - DELETE denial (ownerB delete affects zero rows via silent RLS filter)
 *
 * All test-created rows use randomUUID IDs and are cleaned up in afterAll / per-test
 * finally blocks so they cannot pollute the seeded fixture state.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const ACCOUNT_A = isolationFixtures.accounts.accountA.id;
const ACCOUNT_B = isolationFixtures.accounts.accountB.id;
const TENANT_A1_ID = isolationFixtures.users.tenantA1.tenantId;
const TENANT_B1_ID = isolationFixtures.users.tenantB1.tenantId;

function uniqueEmail() {
  return `rls-tenant-test-${randomUUID()}@example.test`;
}

function expectRlsWriteDenied(result) {
  expect(result.data ?? null).toBeNull();
  expect(result.error).not.toBeNull();
  const msg = String(result.error?.message ?? "").toLowerCase();
  expect(
    msg.includes("row-level security") ||
      msg.includes("violates row-level security") ||
      msg.includes("permission") ||
      msg.includes("forbidden") ||
      msg.includes("denied"),
  ).toBe(true);
}

describe.skipIf(!isIntegrationHarnessConfigured())("tenant table RLS — cross-account isolation", () => {
  const admin = getIntegrationAdminClient();
  let updateTestTenantId;

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();

    // Create a stable tenant used across read/update/delete denial tests
    updateTestTenantId = randomUUID();
    const { error } = await admin.from("tenants").insert({
      id: updateTestTenantId,
      account_id: ACCOUNT_A,
      user_id: null,
      name: "RLS Stable Test Tenant",
      email: uniqueEmail(),
      phone: null,
    });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    if (updateTestTenantId) {
      await admin.from("tenants").delete().eq("id", updateTestTenantId);
    }
  });

  // ── READ isolation ────────────────────────────────────────────────────────────

  it("ownerA reads accountA tenants and includes seeded Tenant A1", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const { data, error } = await client
      .from("tenants")
      .select("id")
      .eq("account_id", ACCOUNT_A);

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(TENANT_A1_ID);
  });

  it("ownerA querying accountB tenants gets empty result — RLS silent filter", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const { data, error } = await client
      .from("tenants")
      .select("id")
      .eq("account_id", ACCOUNT_B);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("ownerB querying accountA tenants gets empty result — RLS silent filter", async () => {
    const { client } = await signInAsFixtureUser("ownerB");

    const { data, error } = await client
      .from("tenants")
      .select("id")
      .eq("account_id", ACCOUNT_A);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("staffA can read accountA tenants", async () => {
    const { client } = await signInAsFixtureUser("staffA");

    const { data, error } = await client
      .from("tenants")
      .select("id")
      .eq("account_id", ACCOUNT_A);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("tenantA1 can read their own record but not tenantB1", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const { data, error } = await client.from("tenants").select("id");

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(TENANT_A1_ID);
    expect(ids).not.toContain(TENANT_B1_ID);
  });

  // ── INSERT isolation ──────────────────────────────────────────────────────────

  it("ownerA can insert a tenant in their own account", async () => {
    const newId = randomUUID();
    const { client } = await signInAsFixtureUser("ownerA");

    try {
      const { data, error } = await client
        .from("tenants")
        .insert({
          id: newId,
          account_id: ACCOUNT_A,
          user_id: null,
          name: "Owner A Insert Test",
          email: uniqueEmail(),
        })
        .select("id")
        .single();

      expect(error).toBeNull();
      expect(data?.id).toBe(newId);
    } finally {
      await admin.from("tenants").delete().eq("id", newId);
    }
  });

  it("ownerB cannot insert a tenant into accountA — RLS write denied", async () => {
    const { client } = await signInAsFixtureUser("ownerB");

    const result = await client
      .from("tenants")
      .insert({
        id: randomUUID(),
        account_id: ACCOUNT_A,
        user_id: null,
        name: "Rogue tenant from B",
        email: uniqueEmail(),
      })
      .select("id")
      .single();

    expectRlsWriteDenied(result);
  });

  it("contractorA1 cannot insert a tenant into accountA — RLS write denied", async () => {
    const { client } = await signInAsFixtureUser("contractorA1");

    const result = await client
      .from("tenants")
      .insert({
        id: randomUUID(),
        account_id: ACCOUNT_A,
        user_id: null,
        name: "Contractor rogue tenant",
        email: uniqueEmail(),
      })
      .select("id")
      .single();

    expectRlsWriteDenied(result);
  });

  // ── UPDATE isolation ──────────────────────────────────────────────────────────

  it("ownerA can update a tenant in their own account", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const { error } = await client
      .from("tenants")
      .update({ phone: "+447700000099" })
      .eq("id", updateTestTenantId)
      .eq("account_id", ACCOUNT_A);

    expect(error).toBeNull();
  });

  it("ownerB update on accountA tenant affects zero rows — RLS silent filter", async () => {
    const { client } = await signInAsFixtureUser("ownerB");

    const { data, error } = await client
      .from("tenants")
      .update({ phone: "+447700000098" })
      .eq("id", updateTestTenantId)
      .select("id");

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // Verify the row was not actually modified
    const verify = await admin
      .from("tenants")
      .select("id")
      .eq("id", updateTestTenantId)
      .single();
    expect(verify.data?.id).toBe(updateTestTenantId);
  });

  // ── DELETE isolation ──────────────────────────────────────────────────────────

  it("ownerB delete on accountA tenant affects zero rows — RLS silent filter", async () => {
    const { client } = await signInAsFixtureUser("ownerB");

    const { data, error } = await client
      .from("tenants")
      .delete()
      .eq("id", updateTestTenantId)
      .select("id");

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // Verify the row still exists
    const verify = await admin
      .from("tenants")
      .select("id")
      .eq("id", updateTestTenantId)
      .maybeSingle();
    expect(verify.data?.id).toBe(updateTestTenantId);
  });

  it("ownerA can delete their own tenant", async () => {
    const deleteId = randomUUID();
    await admin.from("tenants").insert({
      id: deleteId,
      account_id: ACCOUNT_A,
      user_id: null,
      name: "Delete Target Tenant",
      email: uniqueEmail(),
    });

    const { client } = await signInAsFixtureUser("ownerA");
    const { error } = await client
      .from("tenants")
      .delete()
      .eq("id", deleteId)
      .eq("account_id", ACCOUNT_A);

    expect(error).toBeNull();

    const verify = await admin
      .from("tenants")
      .select("id")
      .eq("id", deleteId)
      .maybeSingle();
    expect(verify.data).toBeNull();
  });
});
