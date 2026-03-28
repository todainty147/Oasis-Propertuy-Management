import { beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedDates,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";
import { expectAccessDenied, firstRow } from "./helpers/rpcAssertions.js";

describe.skipIf(!isIntegrationHarnessConfigured())("portfolio_health_snapshot isolation", () => {
  const admin = getIntegrationAdminClient();

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
    expect(Number(row.due_amount)).toBeGreaterThan(0);
    expect(Number(row.outstanding_amount)).toBeGreaterThanOrEqual(Number(row.due_amount));
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

  it("nets partial payments into portfolio finance mix and outstanding balances", async () => {
    const partialPaymentId = "66666666-6666-6666-6666-666666666772";
    const { client } = await signInAsFixtureUser("ownerA");
    const { data: existingPartialPayment, error: existingPartialPaymentError } = await admin
      .from("payments")
      .select("id")
      .eq("id", partialPaymentId)
      .maybeSingle();

    expect(existingPartialPaymentError).toBeNull();
    const beforeResult = await client.rpc("portfolio_health_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
    });

    expect(beforeResult.error).toBeNull();
    const beforeRow = firstRow(beforeResult.data);
    expect(beforeRow).toBeTruthy();

    const { data: seededPayment, error: seededPaymentError } = await admin
      .from("payments")
      .select("owner_id,due_date")
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
      due_date: seededPayment.due_date,
      paid_at: isolationSeedDates.partialPaymentPaidAt,
    }, {
      onConflict: "id",
    });

    expect(seedError).toBeNull();
    const result = await client.rpc("portfolio_health_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
    });

    expect(result.error).toBeNull();
    const row = firstRow(result.data);
    expect(row).toBeTruthy();
    const expectedDelta = existingPartialPayment ? 0 : 300;
    expect(Number(row.paid_amount)).toBe(Number(beforeRow.paid_amount) + expectedDelta);
    expect(Number(row.due_amount)).toBe(Number(beforeRow.due_amount) - expectedDelta);
    expect(Number(row.due_soon_amount)).toBe(Number(beforeRow.due_soon_amount) - expectedDelta);
    expect(Number(row.outstanding_amount)).toBe(Number(beforeRow.outstanding_amount) - expectedDelta);
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
