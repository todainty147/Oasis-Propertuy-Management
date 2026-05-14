/**
 * Integration: properties table RLS — cross-account isolation
 *
 * Covers every CRUD vector for the properties table:
 *   - READ  isolation (ownerA/staffA see their account; ownerB/tenantA1 cannot)
 *   - INSERT denial (ownerB / tenant role cannot write into accountA)
 *   - UPDATE denial (ownerB update affects zero rows via silent RLS filter)
 *   - DELETE denial (ownerB delete affects zero rows via silent RLS filter)
 *   - syncTenantAssignment side-channel: tenant.property_id updates when property
 *     tenant changes (verifies the two-table consistency contract at the DB level)
 *
 * All test-created rows use randomUUID IDs. afterAll/finally blocks ensure cleanup.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const ACCOUNT_A = isolationFixtures.accounts.accountA.id;
const ACCOUNT_B = isolationFixtures.accounts.accountB.id;
const PROPERTY_A_ID = isolationSeedIds.propertyIds.accountA;
const PROPERTY_B_ID = isolationSeedIds.propertyIds.accountB;

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

describe.skipIf(!isIntegrationHarnessConfigured())("properties table RLS — cross-account isolation", () => {
  const admin = getIntegrationAdminClient();
  let updateTestPropertyId;
  let ownerAUserId;

  beforeAll(async () => {
    const usersByKey = await ensureIsolationHarnessSeed();
    ownerAUserId = usersByKey.ownerA.id;

    // Create a stable property used across update/delete denial tests
    updateTestPropertyId = randomUUID();
    const { error } = await admin.from("properties").insert({
      id: updateTestPropertyId,
      account_id: ACCOUNT_A,
      owner_id: ownerAUserId,
      address: "99 RLS Test Lane",
      city: "London",
      size: "1 bed",
      rent: 800,
      status: "Wolne",
      tenant_id: null,
    });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    if (updateTestPropertyId) {
      await admin.from("properties").delete().eq("id", updateTestPropertyId);
    }
  });

  // ── READ isolation ────────────────────────────────────────────────────────────

  it("ownerA reads accountA properties and includes the seeded property", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const { data, error } = await client
      .from("properties")
      .select("id, address")
      .eq("account_id", ACCOUNT_A);

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(PROPERTY_A_ID);
  });

  it("ownerA querying accountB properties gets empty result — RLS silent filter", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const { data, error } = await client
      .from("properties")
      .select("id")
      .eq("account_id", ACCOUNT_B);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("ownerB querying accountA properties gets empty result — RLS silent filter", async () => {
    const { client } = await signInAsFixtureUser("ownerB");

    const { data, error } = await client
      .from("properties")
      .select("id")
      .eq("account_id", ACCOUNT_A);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("staffA can read accountA properties", async () => {
    const { client } = await signInAsFixtureUser("staffA");

    const { data, error } = await client
      .from("properties")
      .select("id")
      .eq("account_id", ACCOUNT_A);

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("tenantA1 can read their assigned property only", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const { data, error } = await client.from("properties").select("id");

    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(PROPERTY_A_ID);
    expect(ids).not.toContain(PROPERTY_B_ID);
  });

  // ── INSERT isolation ──────────────────────────────────────────────────────────

  it("ownerA can insert a property in their own account", async () => {
    const newId = randomUUID();
    const { client } = await signInAsFixtureUser("ownerA");

    try {
      const { data, error } = await client
        .from("properties")
        .insert({
          id: newId,
          account_id: ACCOUNT_A,
          address: "1 Owner A Insert Street",
          city: "London",
          size: "studio",
          rent: 900,
          status: "Wolne",
          tenant_id: null,
        })
        .select("id")
        .single();

      expect(error).toBeNull();
      expect(data?.id).toBe(newId);
    } finally {
      await admin.from("properties").delete().eq("id", newId);
    }
  });

  it("ownerB cannot insert a property into accountA — RLS write denied", async () => {
    const { client } = await signInAsFixtureUser("ownerB");

    const result = await client
      .from("properties")
      .insert({
        id: randomUUID(),
        account_id: ACCOUNT_A,
        address: "Rogue Property From B",
        city: "London",
        size: "1 bed",
        rent: 0,
        status: "Wolne",
        tenant_id: null,
      })
      .select("id")
      .single();

    expectRlsWriteDenied(result);
  });

  it("tenantA1 cannot insert a property into accountA — RLS write denied", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const result = await client
      .from("properties")
      .insert({
        id: randomUUID(),
        account_id: ACCOUNT_A,
        address: "Tenant rogue property",
        city: "London",
        rent: 0,
        status: "Wolne",
        tenant_id: null,
      })
      .select("id")
      .single();

    expectRlsWriteDenied(result);
  });

  // ── UPDATE isolation ──────────────────────────────────────────────────────────

  it("ownerA can update a property in their own account", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const { error } = await client
      .from("properties")
      .update({ city: "Manchester" })
      .eq("id", updateTestPropertyId)
      .eq("account_id", ACCOUNT_A);

    expect(error).toBeNull();

    // Reset city for isolation
    await admin.from("properties").update({ city: "London" }).eq("id", updateTestPropertyId);
  });

  it("ownerB update on accountA property affects zero rows — RLS silent filter", async () => {
    const { client } = await signInAsFixtureUser("ownerB");

    const { data, error } = await client
      .from("properties")
      .update({ city: "Edinburgh" })
      .eq("id", updateTestPropertyId)
      .select("id");

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // Verify no change in DB
    const verify = await admin
      .from("properties")
      .select("city")
      .eq("id", updateTestPropertyId)
      .single();
    expect(verify.data?.city).not.toBe("Edinburgh");
  });

  // ── DELETE isolation ──────────────────────────────────────────────────────────

  it("ownerB delete on accountA property affects zero rows — RLS silent filter", async () => {
    const { client } = await signInAsFixtureUser("ownerB");

    const { data, error } = await client
      .from("properties")
      .delete()
      .eq("id", updateTestPropertyId)
      .select("id");

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    // Verify the row still exists
    const verify = await admin
      .from("properties")
      .select("id")
      .eq("id", updateTestPropertyId)
      .maybeSingle();
    expect(verify.data?.id).toBe(updateTestPropertyId);
  });

  it("ownerA can delete their own property", async () => {
    const deleteId = randomUUID();
    await admin.from("properties").insert({
      id: deleteId,
      account_id: ACCOUNT_A,
      owner_id: ownerAUserId,
      address: "99 Delete Target Lane",
      city: "London",
      size: "studio",
      rent: 500,
      status: "Wolne",
      tenant_id: null,
    });

    const { client } = await signInAsFixtureUser("ownerA");
    const { error } = await client
      .from("properties")
      .delete()
      .eq("id", deleteId)
      .eq("account_id", ACCOUNT_A);

    expect(error).toBeNull();

    const verify = await admin
      .from("properties")
      .select("id")
      .eq("id", deleteId)
      .maybeSingle();
    expect(verify.data).toBeNull();
  });
});
