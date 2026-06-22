import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const integrationIt = isIntegrationHarnessConfigured() ? it : it.skip;
const RENT_MAJOR = 1000;
const RENT_MINOR = 100000;

function monthDate(offset, day = 1) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  date.setUTCDate(day);
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(offset) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset + 1);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

async function requireSuccess(result, context) {
  expect(result.error, `${context}: ${result.error?.message || "unknown error"}`).toBeNull();
  return result.data;
}

function propertyFinanceFrom(snapshot, propertyId) {
  const propertyFinance = Array.isArray(snapshot.property_finance)
    ? snapshot.property_finance
    : JSON.parse(snapshot.property_finance || "[]");
  return propertyFinance.find((row) => row.propertyId === propertyId);
}

function forceCleanup(accountId) {
  const sql = `
begin;
set local session_replication_role = 'replica';

delete from public.provenance_chain_anchors where account_id = '${accountId}';
delete from public.provenance_events where account_id = '${accountId}';
delete from public.provenance_event_counters where account_id = '${accountId}';
delete from public.provenance_finance_cutover where account_id = '${accountId}';
delete from public.payment_events where account_id = '${accountId}';
delete from public.ledger_entries where account_id = '${accountId}';
delete from public.lease_tenants
where lease_id in (select id from public.leases where account_id = '${accountId}');
delete from public.payments where account_id = '${accountId}';
delete from public.leases where account_id = '${accountId}';
update public.properties set tenant_id = null, status = 'Wolne'
where account_id = '${accountId}';
delete from public.tenants where account_id = '${accountId}';
delete from public.properties where account_id = '${accountId}';
delete from public.account_members where account_id = '${accountId}';
delete from public.accounts where id = '${accountId}';

commit;
`.trim();

  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      process.env.SUPABASE_DB_CONTAINER || "supabase_db_oasisrentalmanagementapp",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: sql,
      stdio: ["pipe", "ignore", "pipe"],
      timeout: 60_000,
    },
  );
}

async function createScenario() {
  await ensureIsolationHarnessSeed();
  const admin = getIntegrationAdminClient();
  const { client: ownerClient, user: owner } = await signInAsFixtureUser("ownerA");
  const accountId = randomUUID();
  const propertyId = randomUUID();
  const tenantId = randomUUID();
  const leaseId = randomUUID();

  await requireSuccess(
    await admin.from("accounts").insert({
      id: accountId,
      name: `Lease-end provenance ${accountId.slice(0, 8)}`,
      created_by: owner.id,
      subscription_status: "active",
      subscription_plan: "pro",
      currency: "GBP",
    }),
    "create account",
  );
  await requireSuccess(
    await admin.from("account_members").insert({
      account_id: accountId,
      user_id: owner.id,
      role: "owner",
    }),
    "create owner membership",
  );
  await requireSuccess(
    await admin.from("properties").insert({
      id: propertyId,
      owner_id: owner.id,
      account_id: accountId,
      address: "1 Lease End Characterisation Way",
      city: "London",
      rent: RENT_MAJOR,
      status: "Wolne",
    }),
    "create property",
  );
  await requireSuccess(
    await admin.from("tenants").insert({
      id: tenantId,
      owner_id: owner.id,
      account_id: accountId,
      property_id: propertyId,
      name: "Lease End Characterisation Tenant",
      status: "active",
    }),
    "create tenant",
  );
  await requireSuccess(
    await admin
      .from("properties")
      .update({ tenant_id: tenantId, status: "Wynajęte" })
      .eq("id", propertyId),
    "occupy property",
  );

  const leaseEnd = lastDayOfMonth(-3);
  const cutoverAt = monthDate(-4);

  await requireSuccess(
    await admin.from("leases").insert({
      id: leaseId,
      account_id: accountId,
      property_id: propertyId,
      tenant_id: tenantId,
      lease_start_date: monthDate(-11),
      lease_end_date: leaseEnd,
      renewal_status: "active",
    }),
    "create lease",
  );
  await requireSuccess(
    await admin.from("lease_tenants").insert({
      lease_id: leaseId,
      tenant_id: tenantId,
      role: "occupant",
      created_by: owner.id,
    }),
    "link lease tenant",
  );

  const payments = Array.from({ length: 9 }, (_, index) => {
    const dueDate = monthDate(-11 + index);
    return {
      id: randomUUID(),
      owner_id: owner.id,
      account_id: accountId,
      property_id: propertyId,
      tenant_id: tenantId,
      amount: RENT_MAJOR,
      status: "paid",
      due_date: dueDate,
      paid_at: dueDate,
      currency: "GBP",
    };
  });
  await requireSuccess(
    await admin.from("payments").insert(payments),
    "create paid-through-lease-end payments",
  );
  await requireSuccess(
    await admin.from("provenance_finance_cutover").insert({
      account_id: accountId,
      cutover_at: `${cutoverAt}T00:00:00.000Z`,
      cutover_version: 1,
      status: "active",
      notes: "Sprint 2B lease-end integration fixture",
      created_by: owner.id,
    }),
    "create active finance cutover",
  );

  await requireSuccess(
    await admin.rpc("provenance_finance_backfill", {
      p_account_id: accountId,
      p_cutover_at: `${cutoverAt}T00:00:00.000Z`,
    }),
    "run 2A backfill",
  );
  return {
    admin,
    ownerClient,
    accountId,
    propertyId,
    leaseId,
    leaseEnd,
  };
}

async function captureState(scenario, label) {
  await requireSuccess(
    await scenario.ownerClient.rpc("provenance_accrue_rent_charges", {
      p_account_id: scenario.accountId,
      p_property_id: scenario.propertyId,
    }),
    `${label}: accrue rent`,
  );

  const financeRows = await requireSuccess(
    await scenario.ownerClient.rpc("finance_snapshot", {
      p_account_id: scenario.accountId,
    }),
    `${label}: finance snapshot`,
  );
  const financeProperty = propertyFinanceFrom(financeRows[0], scenario.propertyId);
  expect(financeProperty).toBeDefined();

  const projectionRows = await requireSuccess(
    await scenario.ownerClient.rpc("provenance_balance_projection", {
      p_account_id: scenario.accountId,
      p_property_id: scenario.propertyId,
    }),
    `${label}: provenance projection`,
  );
  const projection = projectionRows.find((row) => row.property_id === scenario.propertyId);
  expect(projection).toBeDefined();

  const chargedEvents = await requireSuccess(
    await scenario.admin
      .from("provenance_events")
      .select("id, occurred_at, metadata, reversal_of_event_id")
      .eq("account_id", scenario.accountId)
      .eq("property_id", scenario.propertyId)
      .eq("event_type", "rent.charged")
      .order("sequence_number"),
    `${label}: rent.charged events`,
  );

  const gateRows = await requireSuccess(
    await scenario.ownerClient.rpc("provenance_reconciliation_gate", {
      p_account_id: scenario.accountId,
    }),
    `${label}: reconciliation gate`,
  );
  const gate = gateRows.find((row) => row.property_id === scenario.propertyId);
  expect(gate).toBeDefined();

  const legacyBalanceMinor = Math.round(Number(financeProperty.remaining) * 100);
  const provenanceBalanceMinor = Number(projection.balance_minor);
  const eventSummary = chargedEvents.map((event) => ({
    event_id: event.id,
    period_key: event.metadata?.period_key,
    period_start: event.metadata?.charge_period_start,
    rent_minor_used: Number(event.metadata?.rent_minor_used),
    accrued_past_lease_end:
      event.metadata?.accrual_continues_past_lease_end_date === true,
  }));

  console.info(`[provenance lease-end ${label}]`, {
    legacy_balance_minor: legacyBalanceMinor,
    provenance_balance_minor: provenanceBalanceMinor,
    rent_charged: eventSummary,
    flagged_event_count: eventSummary.filter((event) => event.accrued_past_lease_end).length,
    reconciliation_status: gate.status,
    divergence_reason: gate.divergence_reason,
  });

  return {
    legacyBalanceMinor,
    provenanceBalanceMinor,
    chargedEvents,
    eventSummary,
    gate,
  };
}

describe("provenance Sprint 2B lease-end accrual characterisation", () => {
  let scenario;

  afterEach(() => {
    if (scenario?.accountId) {
      forceCleanup(scenario.accountId);
    }
    scenario = null;
  });

  integrationIt("mirrors legacy false arrears before and after an active lease is marked ended", async () => {
    scenario = await createScenario();

    const active = await captureState(scenario, "active");
    const postLeaseEndEvents = active.eventSummary.filter(
      (event) => event.period_start > scenario.leaseEnd,
    );
    const expectedFalseArrears = postLeaseEndEvents.length * RENT_MINOR;

    expect(postLeaseEndEvents.length).toBeGreaterThan(0);
    expect(active.legacyBalanceMinor).toBe(expectedFalseArrears);
    expect(active.provenanceBalanceMinor).toBe(expectedFalseArrears);
    expect(active.gate.status).toBe("matched");
    expect(active.gate.divergence_reason).toBeNull();
    expect(
      postLeaseEndEvents.every((event) => event.accrued_past_lease_end),
    ).toBe(true);

    await requireSuccess(
      await scenario.admin
        .from("leases")
        .update({ renewal_status: "ended" })
        .eq("id", scenario.leaseId),
      "mark lease ended",
    );

    const ended = await captureState(scenario, "ended");
    expect(ended.provenanceBalanceMinor).toBe(ended.legacyBalanceMinor);
    expect(ended.gate.status).toBe("matched");
    expect(ended.gate.divergence_reason).toBeNull();
  });

  // Known evidential gap from the Phase 0 lease-end decision: correcting the
  // operational status does not yet reverse rent.charged events already
  // enshrined after lease_end_date. Keep this pending until a correction path
  // is deliberately implemented.
  integrationIt.skip("reverses post-lease-end accrual when status is corrected to ended", async () => {
    scenario = await createScenario();
    const active = await captureState(scenario, "correction-probe-active");
    const postLeaseEndEvents = active.eventSummary.filter(
      (event) => event.period_start > scenario.leaseEnd,
    );

    await requireSuccess(
      await scenario.admin
        .from("leases")
        .update({ renewal_status: "ended" })
        .eq("id", scenario.leaseId),
      "correction probe: mark lease ended",
    );
    await captureState(scenario, "correction-probe-ended");

    const corrections = await requireSuccess(
      await scenario.admin
        .from("provenance_events")
        .select("id, reversal_of_event_id")
        .eq("account_id", scenario.accountId)
        .in(
          "reversal_of_event_id",
          postLeaseEndEvents.map((event) => event.event_id),
        ),
      "correction probe: reversal events",
    );

    expect(corrections).toHaveLength(postLeaseEndEvents.length);
  });
});
