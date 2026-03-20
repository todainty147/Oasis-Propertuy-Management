import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

function expectWriteDenied(result) {
  expect(result.data ?? null).toBeNull();
  const message = String(result.error?.message || "").toLowerCase();
  expect(
    message.includes("not allowed") ||
      message.includes("not permitted") ||
      message.includes("permission") ||
      message.includes("access denied") ||
      message.includes("unauthorized") ||
      message.includes("forbidden"),
  ).toBe(true);
}

describe.skipIf(!isIntegrationHarnessConfigured())("payment write authorization", () => {
  const admin = getIntegrationAdminClient();

  async function createTempPaymentAs(fixtureKey, overrides = {}) {
    const { client } = await signInAsFixtureUser(fixtureKey);
    const result = await client.rpc("create_payment", {
      p_account_id: overrides.accountId ?? isolationFixtures.accounts.accountA.id,
      p_property_id: overrides.propertyId ?? isolationSeedIds.propertyIds.accountA,
      p_tenant_id: overrides.tenantId ?? isolationFixtures.users.tenantA1.tenantId,
      p_amount: overrides.amount ?? 1111.11,
      p_due_date: overrides.dueDate ?? "2026-04-01",
      p_paid_at: overrides.paidAt ?? null,
      p_notes: null,
    });

    expect(result.error).toBeNull();
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    expect(row?.id).toBeTruthy();
    return row;
  }

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  afterEach(() => {
    // Payment deletes emit audit events, so direct cleanup is not a safe generic
    // pattern for this suite. Each test uses fresh ids and exact payment_id filters.
  });

  it("allows in-account owner to create a payment and persists account-scoped state", async () => {
    const payment = await createTempPaymentAs("ownerA", {
      amount: 1450.25,
      dueDate: "2026-04-03",
    });

    const { data, error } = await admin
      .from("payments")
      .select("id, account_id, property_id, tenant_id, amount, status, due_date, paid_at")
      .eq("id", payment.id)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: payment.id,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      tenant_id: isolationFixtures.users.tenantA1.tenantId,
      amount: 1450.25,
      status: "due",
      due_date: "2026-04-03",
      paid_at: null,
    });
  });

  it("allows in-account admin to update payment amount and due date", async () => {
    const payment = await createTempPaymentAs("ownerA", {
      amount: 1000,
      dueDate: "2026-04-05",
    });
    const { client } = await signInAsFixtureUser("adminA");

    const result = await client.rpc("update_payment", {
      p_payment_id: payment.id,
      p_amount: 1325.5,
      p_due_date: "2026-04-09",
      p_notes: null,
    });

    expect(result.error).toBeNull();

    const { data, error } = await admin
      .from("payments")
      .select("amount, status, due_date")
      .eq("id", payment.id)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      amount: 1325.5,
      status: "due",
      due_date: "2026-04-09",
    });
  });

  it("denies cross-account admin from creating a payment in another account", async () => {
    const { client } = await signInAsFixtureUser("adminA");

    const result = await client.rpc("create_payment", {
      p_account_id: isolationFixtures.accounts.accountB.id,
      p_property_id: isolationSeedIds.propertyIds.accountB,
      p_tenant_id: isolationFixtures.users.tenantB1.tenantId,
      p_amount: 999,
      p_due_date: "2026-04-03",
      p_paid_at: null,
      p_notes: null,
    });

    expectWriteDenied(result);
  });

  it("denies tenant and contractor from using payment creation RPCs", async () => {
    const { client: tenantClient } = await signInAsFixtureUser("tenantA1");
    const tenantResult = await tenantClient.rpc("create_payment", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_property_id: isolationSeedIds.propertyIds.accountA,
      p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      p_amount: 750,
      p_due_date: "2026-04-03",
      p_paid_at: null,
      p_notes: null,
    });
    expectWriteDenied(tenantResult);

    const { client: contractorClient } = await signInAsFixtureUser("contractorA1");
    const contractorResult = await contractorClient.rpc("create_payment", {
      p_account_id: isolationFixtures.accounts.accountA.id,
      p_property_id: isolationSeedIds.propertyIds.accountA,
      p_tenant_id: isolationFixtures.users.tenantA1.tenantId,
      p_amount: 750,
      p_due_date: "2026-04-03",
      p_paid_at: null,
      p_notes: null,
    });
    expectWriteDenied(contractorResult);
  });

  it("allows admin payment status mutation and records ledger/event side effects", async () => {
    const payment = await createTempPaymentAs("ownerA", {
      amount: 1650,
      dueDate: "2026-04-06",
    });
    const { client } = await signInAsFixtureUser("adminA");

    const paidResult = await client.rpc("mark_payment_paid", {
      p_payment_id: payment.id,
      p_paid_at: "2026-04-07",
    });

    expect(paidResult.error).toBeNull();

    const { data: paidRow, error: paidRowError } = await admin
      .from("payments")
      .select("status, paid_at")
      .eq("id", payment.id)
      .single();

    expect(paidRowError).toBeNull();
    expect(paidRow).toMatchObject({
      status: "paid",
      paid_at: "2026-04-07",
    });

    const { data: ledgerRows, error: ledgerError } = await admin
      .from("ledger_entries")
      .select("account_id, source_table, source_id, entry_type, direction, amount")
      .eq("source_table", "payments")
      .eq("source_id", payment.id);

    expect(ledgerError).toBeNull();
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]).toMatchObject({
      account_id: isolationFixtures.accounts.accountA.id,
      source_table: "payments",
      source_id: payment.id,
      entry_type: "payment",
      direction: "in",
      amount: 1650,
    });

    const { data: paidEvents, error: paidEventsError } = await admin
      .from("payment_events")
      .select("event_type, payment_id, account_id, new_status")
      .eq("payment_id", payment.id)
      .order("created_at", { ascending: false });

    expect(paidEventsError).toBeNull();
    expect((paidEvents || []).some((row) => row.event_type === "payment_paid")).toBe(true);

    const unpaidResult = await client.rpc("mark_payment_unpaid", {
      p_payment_id: payment.id,
    });

    expect(unpaidResult.error).toBeNull();

    const { data: unpaidRow, error: unpaidRowError } = await admin
      .from("payments")
      .select("status, paid_at")
      .eq("id", payment.id)
      .single();

    expect(unpaidRowError).toBeNull();
    expect(unpaidRow).toMatchObject({
      status: "due",
      paid_at: null,
    });

    const { data: remainingLedgerRows, error: remainingLedgerError } = await admin
      .from("ledger_entries")
      .select("id")
      .eq("source_table", "payments")
      .eq("source_id", payment.id);

    expect(remainingLedgerError).toBeNull();
    expect(remainingLedgerRows || []).toEqual([]);

    const { data: reopenedEvents, error: reopenedEventsError } = await admin
      .from("payment_events")
      .select("event_type, payment_id")
      .eq("payment_id", payment.id)
      .order("created_at", { ascending: false });

    expect(reopenedEventsError).toBeNull();
    expect((reopenedEvents || []).some((row) => row.event_type === "payment_reopened")).toBe(true);
  });

  it("denies staff status mutation and leaves payment plus side effects unchanged", async () => {
    const payment = await createTempPaymentAs("ownerA", {
      amount: 880,
      dueDate: "2026-04-10",
    });

    const { data: beforeEvents, error: beforeEventsError } = await admin
      .from("payment_events")
      .select("id", { count: "exact" })
      .eq("payment_id", payment.id);

    expect(beforeEventsError).toBeNull();
    const beforeEventCount = beforeEvents?.length ?? 0;

    const { client } = await signInAsFixtureUser("staffA");
    const result = await client.rpc("mark_payment_paid", {
      p_payment_id: payment.id,
      p_paid_at: "2026-04-11",
    });

    expectWriteDenied(result);

    const { data: paymentRow, error: paymentError } = await admin
      .from("payments")
      .select("status, paid_at")
      .eq("id", payment.id)
      .single();

    expect(paymentError).toBeNull();
    expect(paymentRow).toMatchObject({
      status: "due",
      paid_at: null,
    });

    const { data: ledgerRows, error: ledgerError } = await admin
      .from("ledger_entries")
      .select("id")
      .eq("source_table", "payments")
      .eq("source_id", payment.id);

    expect(ledgerError).toBeNull();
    expect(ledgerRows || []).toEqual([]);

    const { data: afterEvents, error: afterEventsError } = await admin
      .from("payment_events")
      .select("id")
      .eq("payment_id", payment.id);

    expect(afterEventsError).toBeNull();
    expect(afterEvents?.length ?? 0).toBe(beforeEventCount);
  });
});
