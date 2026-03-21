import { beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { expectAccessDenied, firstRow } from "./helpers/rpcAssertions.js";

describe.skipIf(!isIntegrationHarnessConfigured())("dashboard_snapshot isolation", () => {
  const admin = getIntegrationAdminClient();

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

  it("nets partial payments into due-soon dashboard totals", async () => {
    const partialPaymentId = "66666666-6666-6666-6666-666666666773";
    const { client } = await signInAsFixtureUser("ownerA");
    const { data: existingPartialPayment, error: existingPartialPaymentError } = await admin
      .from("payments")
      .select("id")
      .eq("id", partialPaymentId)
      .maybeSingle();

    expect(existingPartialPaymentError).toBeNull();

    const beforeResult = await client.rpc("dashboard_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
      p_horizon_days: 7,
    });

    expect(beforeResult.error).toBeNull();
    const beforeRow = firstRow(beforeResult.data);
    expect(beforeRow).toBeTruthy();

    const { data: seededPayment, error: seededPaymentError } = await admin
      .from("payments")
      .select("owner_id")
      .eq("id", "66666666-6666-6666-6666-666666666661")
      .single();

    expect(seededPaymentError).toBeNull();

    const { error: seedError } = await admin.from("payments").upsert({
      id: partialPaymentId,
      account_id: isolationFixtures.accounts.accountA.id,
      owner_id: seededPayment.owner_id,
      property_id: isolationFixtures.users.tenantA1.propertyId,
      tenant_id: isolationFixtures.users.tenantA1.tenantId,
      amount: 300,
      status: "paid",
      due_date: "2026-03-20",
      paid_at: "2026-03-20",
    }, {
      onConflict: "id",
    });

    expect(seedError).toBeNull();

    const result = await client.rpc("dashboard_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
      p_horizon_days: 7,
    });

    expect(result.error).toBeNull();
    const row = firstRow(result.data);
    expect(row).toBeTruthy();
    const expectedDelta = existingPartialPayment ? 0 : 300;
    expect(Number(row.tenant_paid_total)).toBe(Number(beforeRow.tenant_paid_total) + expectedDelta);
    expect(Number(row.tenant_due_total)).toBe(Number(beforeRow.tenant_due_total) - expectedDelta);
    expect(Number(row.due_soon_amount)).toBe(Number(beforeRow.due_soon_amount) - expectedDelta);
  });
});
