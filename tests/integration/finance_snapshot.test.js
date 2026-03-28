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

describe.skipIf(!isIntegrationHarnessConfigured())("finance_snapshot isolation", () => {
  const admin = getIntegrationAdminClient();

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
    expect(Number(row.due_soon_income)).toBeGreaterThan(0);
    expect(Number(row.outstanding_income)).toBeGreaterThanOrEqual(Number(row.due_soon_income));
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

  it("nets partial payments into due-soon and outstanding totals without marking the property overdue", async () => {
    const partialPaymentId = "66666666-6666-6666-6666-666666666771";
    const { client } = await signInAsFixtureUser("ownerA");
    const { data: existingPartialPayment, error: existingPartialPaymentError } = await admin
      .from("payments")
      .select("id")
      .eq("id", partialPaymentId)
      .maybeSingle();

    expect(existingPartialPaymentError).toBeNull();
    const beforeResult = await client.rpc("finance_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
    });

    expect(beforeResult.error).toBeNull();
    const beforeRow = firstRow(beforeResult.data);
    expect(beforeRow).toBeTruthy();
    const beforePropertyRow = beforeRow.property_finance.find(
      (entry) => entry.propertyId === isolationFixtures.users.tenantA1.propertyId,
    );

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
    const result = await client.rpc("finance_snapshot", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_tenant_id: null,
    });

    expect(result.error).toBeNull();
    const row = firstRow(result.data);
    expect(row).toBeTruthy();
    const expectedDelta = existingPartialPayment ? 0 : 300;
    expect(Number(row.total_income)).toBe(Number(beforeRow.total_income) + expectedDelta);
    expect(Number(row.overdue_income)).toBe(0);
    expect(Number(row.due_soon_income)).toBe(Number(beforeRow.due_soon_income) - expectedDelta);
    expect(Number(row.outstanding_income)).toBe(Number(beforeRow.outstanding_income) - expectedDelta);

    const propertyRow = row.property_finance.find(
      (entry) => entry.propertyId === isolationFixtures.users.tenantA1.propertyId,
    );
    expect(propertyRow.paid).toBe(Number(beforePropertyRow?.paid || 0) + expectedDelta);
    expect(propertyRow.remaining).toBe(Number(beforePropertyRow?.remaining || 0) - expectedDelta);
    expect(propertyRow.paymentStatus).toBe("partial");
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
    expect(Number(row.due_soon_income)).toBe(0);
    expect(Number(row.outstanding_income)).toBe(0);
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
