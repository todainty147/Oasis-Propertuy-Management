import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

const integrationIt = isIntegrationHarnessConfigured() ? it : it.skip;

function dateAtMonthOffset(monthOffset, day = 1) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + monthOffset);
  date.setUTCDate(day);
  return date.toISOString().slice(0, 10);
}

async function requireSuccess(result, context) {
  expect(result.error, `${context}: ${result.error?.message || "unknown error"}`).toBeNull();
  return result.data;
}

describe("provenance finance cutover security", () => {
  async function createFinanceScenario({
    rent = 100,
    currency = "PLN",
    payments = [],
    leases = [],
    expectedCharges = [],
  } = {}) {
    const admin = getIntegrationAdminClient();
    const { client: ownerClient, user: ownerUser } = await signInAsFixtureUser("ownerA");
    const accountId = randomUUID();
    const propertyId = randomUUID();
    const tenantId = randomUUID();

    await requireSuccess(
      await admin.from("accounts").insert({
        id: accountId,
        name: `Provenance reconciliation ${accountId.slice(0, 8)}`,
        created_by: ownerUser.id,
        is_root: false,
        subscription_status: "active",
        subscription_plan: "pro",
        currency,
      }),
      "create scenario account",
    );
    await requireSuccess(
      await admin.from("account_members").insert({
        account_id: accountId,
        user_id: ownerUser.id,
        role: "owner",
      }),
      "create scenario membership",
    );
    await requireSuccess(
      await admin.from("properties").insert({
        id: propertyId,
        owner_id: ownerUser.id,
        account_id: accountId,
        address: "1 Provenance Test Lane",
        city: "Testville",
        rent,
        status: "Wolne",
        tenant_id: null,
      }),
      "create scenario property",
    );
    await requireSuccess(
      await admin.from("tenants").insert({
        id: tenantId,
        owner_id: ownerUser.id,
        account_id: accountId,
        property_id: propertyId,
        name: "Provenance Test Tenant",
        status: "active",
      }),
      "create scenario tenant",
    );
    await requireSuccess(
      await admin
        .from("properties")
        .update({ tenant_id: tenantId, status: "Wynajęte" })
        .eq("id", propertyId),
      "occupy scenario property",
    );

    const paymentRows = payments.map((payment) => ({
      id: payment.id || randomUUID(),
      owner_id: ownerUser.id,
      account_id: accountId,
      property_id: propertyId,
      tenant_id: tenantId,
      amount: payment.amount,
      status: payment.status,
      due_date: payment.dueDate || dateAtMonthOffset(0),
      paid_at: payment.paidAt || null,
      currency,
    }));
    if (paymentRows.length > 0) {
      await requireSuccess(
        await admin.from("payments").insert(paymentRows),
        "create scenario payments",
      );
    }

    const leaseRows = leases.map((lease) => ({
      id: lease.id || randomUUID(),
      account_id: accountId,
      property_id: propertyId,
      tenant_id: tenantId,
      lease_start_date: lease.startDate,
      lease_end_date: lease.endDate,
      renewal_status: lease.status || "active",
    }));
    if (leaseRows.length > 0) {
      await requireSuccess(
        await admin.from("leases").insert(leaseRows),
        "create scenario leases",
      );
    }

    const expectedChargeRows = expectedCharges.map((charge) => ({
      id: charge.id || randomUUID(),
      account_id: accountId,
      tenant_id: tenantId,
      property_id: propertyId,
      charge_type: charge.chargeType || "rent",
      period_start: charge.periodStart || dateAtMonthOffset(0),
      period_end: charge.periodEnd || dateAtMonthOffset(1),
      due_date: charge.dueDate || dateAtMonthOffset(0),
      amount: charge.amount,
      currency,
      status: charge.status || "scheduled",
      source: charge.source || "manual",
    }));
    if (expectedChargeRows.length > 0) {
      await requireSuccess(
        await admin.from("expected_charges").insert(expectedChargeRows),
        "create scenario expected charges",
      );
    }

    return {
      admin,
      ownerClient,
      ownerUser,
      accountId,
      propertyId,
      tenantId,
      paymentRows,
      leaseRows,
      expectedChargeRows,
    };
  }

  async function backfillAndGate(scenario) {
    const cutoverAt = new Date().toISOString();
    const backfill = await scenario.admin.rpc("provenance_finance_backfill", {
      p_account_id: scenario.accountId,
      p_cutover_at: cutoverAt,
    });
    await requireSuccess(backfill, "backfill scenario provenance");

    const gate = await scenario.ownerClient.rpc("provenance_reconciliation_gate", {
      p_account_id: scenario.accountId,
    });
    const rows = await requireSuccess(gate, "run scenario reconciliation gate");
    const propertyRow = rows.find((row) => row.property_id === scenario.propertyId);
    expect(propertyRow).toBeDefined();
    return { backfill: backfill.data, gate: propertyRow };
  }

  integrationIt("restricts reconciliation gate to owner and admin", async () => {
    await ensureIsolationHarnessSeed();
    const accountA = isolationFixtures.accounts.accountA.id;
    const [
      { client: ownerA },
      { client: adminA },
      { client: staffA },
      { client: tenantA },
      { client: ownerB },
    ] = await Promise.all([
      signInAsFixtureUser("ownerA"),
      signInAsFixtureUser("adminA"),
      signInAsFixtureUser("staffA"),
      signInAsFixtureUser("tenantA1"),
      signInAsFixtureUser("ownerB"),
    ]);

    const ownerResult = await ownerA.rpc("provenance_reconciliation_gate", {
      p_account_id: accountA,
    });
    expect(ownerResult.error).toBeNull();

    const adminResult = await adminA.rpc("provenance_reconciliation_gate", {
      p_account_id: accountA,
    });
    expect(adminResult.error).toBeNull();

    for (const [client, label] of [
      [staffA, "staff"],
      [tenantA, "tenant"],
      [ownerB, "cross-account owner"],
    ]) {
      const denied = await client.rpc("provenance_reconciliation_gate", {
        p_account_id: accountA,
      });
      expect(denied.data).toBeNull();
      expect(String(denied.error?.message || "").toLowerCase()).toContain(
        "role required",
      );
    }
  });

  integrationIt("restricts balance projection to owner, admin, and staff", async () => {
    await ensureIsolationHarnessSeed();
    const accountA = isolationFixtures.accounts.accountA.id;
    const [
      { client: ownerA },
      { client: staffA },
      { client: tenantA },
    ] = await Promise.all([
      signInAsFixtureUser("ownerA"),
      signInAsFixtureUser("staffA"),
      signInAsFixtureUser("tenantA1"),
    ]);

    const ownerResult = await ownerA.rpc("provenance_balance_projection", {
      p_account_id: accountA,
    });
    expect(ownerResult.error).toBeNull();

    const staffResult = await staffA.rpc("provenance_balance_projection", {
      p_account_id: accountA,
    });
    expect(staffResult.error).toBeNull();

    const tenantDenied = await tenantA.rpc("provenance_balance_projection", {
      p_account_id: accountA,
    });
    expect(tenantDenied.data).toBeNull();
    expect(
      String(tenantDenied.error?.message || "").toLowerCase(),
    ).toContain("role required");
  });

  integrationIt("cutover config table is read-only for authenticated users", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const insertAttempt = await client
      .from("provenance_finance_cutover")
      .insert({
        account_id: isolationFixtures.accounts.accountA.id,
        cutover_at: new Date().toISOString(),
      });
    expect(insertAttempt.error).not.toBeNull();
  });

  integrationIt("keeps native account summaries free of migration concepts", async () => {
    const scenario = await createFinanceScenario({
      rent: 100,
      leases: [{
        startDate: dateAtMonthOffset(0),
        endDate: dateAtMonthOffset(12),
      }],
    });

    const account = await scenario.admin
      .from("accounts")
      .select("account_provenance_mode")
      .eq("id", scenario.accountId)
      .single();
    expect(account.error).toBeNull();
    expect(account.data.account_provenance_mode).toBe("native");

    const payment = await scenario.ownerClient.rpc("create_payment", {
      p_account_id: scenario.accountId,
      p_property_id: scenario.propertyId,
      p_tenant_id: scenario.tenantId,
      p_amount: 100,
      p_due_date: dateAtMonthOffset(0),
    });
    await requireSuccess(payment, "create native payment");

    const accrual = await scenario.ownerClient.rpc("provenance_accrue_rent_charges", {
      p_account_id: scenario.accountId,
      p_property_id: scenario.propertyId,
    });
    const accrualResult = await requireSuccess(accrual, "accrue native rent");
    expect(accrualResult.emitted).toBe(1);

    const nativeEvents = await scenario.admin
      .from("provenance_events")
      .select("event_type")
      .eq("account_id", scenario.accountId)
      .order("sequence_number");
    expect(nativeEvents.error).toBeNull();
    expect(nativeEvents.data.map((row) => row.event_type)).toEqual([
      "payment.recorded",
      "rent.charged",
    ]);

    const explained = await scenario.ownerClient.rpc("explain_property_balance", {
      p_property_id: scenario.propertyId,
    });
    const result = await requireSuccess(explained, "explain native balance");

    expect(result.provenance_mode).toBe("native");
    expect(result.legacy_reconciliation).toBeNull();
    expect(result.reconciliation_bridge_lines).toEqual([]);
    expect(result.has_reconstructed).toBe(false);
    expect(result.accrued_past_lease_end).toBe(false);
    expect(result.balance.legacy_balance_minor).toBeNull();
    expect(Number(result.balance.provenance_balance_minor)).toBe(10000);
    expect(result.assurance).toEqual({
      ledger_integrity: "passed",
      internal_reconciliation: "not_applicable",
      balance_reliability: "usable",
    });
  });

  integrationIt("classifies an overpayment as an explained credit-clamp divergence", async () => {
    const scenario = await createFinanceScenario({
      rent: 100,
      leases: [{
        startDate: dateAtMonthOffset(0),
        endDate: dateAtMonthOffset(12),
      }],
      payments: [{
        amount: 150,
        status: "paid",
        paidAt: dateAtMonthOffset(0),
      }],
    });

    const { gate } = await backfillAndGate(scenario);

    expect(Number(gate.legacy_balance_minor)).toBe(0);
    expect(Number(gate.provenance_balance_minor)).toBe(-5000);
    expect(Number(gate.difference_minor)).toBe(-5000);
    expect(gate.status).toBe("explained_divergence");
    expect(gate.divergence_reason).toBe("overpayment_credit_clamp");
  });

  integrationIt("keeps a voided payment informational and reconciliation matched", async () => {
    const scenario = await createFinanceScenario({
      rent: 100,
      leases: [{
        startDate: dateAtMonthOffset(0),
        endDate: dateAtMonthOffset(12),
      }],
      payments: [{
        amount: 100,
        status: "void",
      }],
    });

    const { backfill, gate } = await backfillAndGate(scenario);

    expect(backfill.payments_voided).toBe(1);
    expect(Number(gate.legacy_balance_minor)).toBe(10000);
    expect(Number(gate.provenance_balance_minor)).toBe(10000);
    expect(gate.status).toBe("matched");
    expect(gate.divergence_reason).toBeNull();
  });

  integrationIt("classifies a post-cutover property rent change as an explained divergence", async () => {
    const scenario = await createFinanceScenario({
      rent: 100,
      leases: [{
        startDate: dateAtMonthOffset(0),
        endDate: dateAtMonthOffset(12),
      }],
    });
    await backfillAndGate(scenario);

    await requireSuccess(
      await scenario.admin
        .from("properties")
        .update({ rent: 125 })
        .eq("id", scenario.propertyId),
      "change property rent after backfill",
    );
    const gateResult = await scenario.ownerClient.rpc("provenance_reconciliation_gate", {
      p_account_id: scenario.accountId,
    });
    const rows = await requireSuccess(gateResult, "rerun gate after rent change");
    const gate = rows.find((row) => row.property_id === scenario.propertyId);

    expect(Number(gate.legacy_balance_minor)).toBe(12500);
    expect(Number(gate.provenance_balance_minor)).toBe(10000);
    expect(gate.status).toBe("explained_divergence");
    expect(gate.divergence_reason).toBe("post_cutover_rent_change");
  });

  integrationIt("uses the earliest non-ended lease across multiple lease rows", async () => {
    const scenario = await createFinanceScenario({
      rent: 100,
      leases: [
        {
          startDate: dateAtMonthOffset(-1),
          endDate: dateAtMonthOffset(5),
          status: "active",
        },
        {
          startDate: dateAtMonthOffset(0),
          endDate: dateAtMonthOffset(12),
          status: "renewal_in_progress",
        },
      ],
    });

    const { gate } = await backfillAndGate(scenario);

    expect(Number(gate.legacy_balance_minor)).toBe(20000);
    expect(Number(gate.provenance_balance_minor)).toBe(20000);
    expect(gate.status).toBe("matched");
  });

  integrationIt("rejects orphan payments without a property before reconciliation", async () => {
    const admin = getIntegrationAdminClient();
    const { user } = await signInAsFixtureUser("ownerA");

    const orphan = await admin.from("payments").insert({
      id: randomUUID(),
      owner_id: user.id,
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: null,
      tenant_id: isolationFixtures.users.tenantA1.tenantId,
      amount: 25,
      status: "due",
      due_date: dateAtMonthOffset(0),
      currency: "PLN",
    });

    expect(orphan.error).not.toBeNull();
    expect(String(orphan.error?.message || "").toLowerCase()).toContain(
      "property_id",
    );
  });

  integrationIt("excludes scheduled expected charges from both legacy and provenance balances", async () => {
    const scenario = await createFinanceScenario({
      rent: 100,
      leases: [{
        startDate: dateAtMonthOffset(0),
        endDate: dateAtMonthOffset(12),
      }],
      expectedCharges: [{
        amount: 75,
        status: "scheduled",
      }],
    });

    const { backfill, gate } = await backfillAndGate(scenario);

    expect(backfill.payments_recorded).toBe(0);
    expect(Number(gate.legacy_balance_minor)).toBe(10000);
    expect(Number(gate.provenance_balance_minor)).toBe(10000);
    expect(gate.status).toBe("matched");

    const provenanceForCharge = await scenario.admin
      .from("provenance_events")
      .select("id")
      .eq("account_id", scenario.accountId)
      .eq("source_id", scenario.expectedChargeRows[0].id);
    expect(provenanceForCharge.error).toBeNull();
    expect(provenanceForCharge.data).toHaveLength(0);
  });
});
