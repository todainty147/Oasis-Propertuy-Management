import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  isolationSeedIds,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("operations foundations security", () => {
  const admin = getIntegrationAdminClient();
  const createdExpenseIds = new Set();
  const createdComplianceIds = new Set();
  const createdAutomationIds = new Set();
  const createdPaymentIds = new Set();
  let previousFinancialProfile = undefined;

  function expectWriteDenied(result) {
    expect(result.data ?? null).toBeNull();
    const message = String(result.error?.message || "").toLowerCase();
    expect(
      message.includes("row-level security") ||
        message.includes("violates row-level security") ||
        message.includes("permission") ||
        message.includes("access denied") ||
        message.includes("forbidden"),
    ).toBe(true);
  }

  function buildExpenseRow(overrides = {}) {
    return {
      id: randomUUID(),
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      category: "utilities",
      expense_date: "2026-04-06",
      amount: 149.5,
      notes: `ops-expense-${randomUUID()}`,
      created_by: isolationFixtures.users.ownerA.id,
      ...overrides,
    };
  }

  function buildComplianceItem(overrides = {}) {
    return {
      id: randomUUID(),
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationSeedIds.propertyIds.accountA,
      tenant_id: null,
      title: `Operations compliance ${randomUUID()}`,
      category: "gas_safety",
      due_date: "2026-05-01",
      status: "active",
      reminder_window_days: 21,
      notes: "operations foundations test item",
      ...overrides,
    };
  }

  function buildAutomationLog(overrides = {}) {
    return {
      id: randomUUID(),
      account_id: isolationFixtures.accounts.accountA.id,
      rule_id: `ops-rule-${randomUUID()}`,
      event_key: `ops-event-${randomUUID()}`,
      execution_type: "signal",
      status: "recorded",
      entity_type: "property",
      entity_id: isolationSeedIds.propertyIds.accountA,
      title: "Operations automation run",
      details: { source: "operations-security-test" },
      ...overrides,
    };
  }

  async function createPaymentAsOwnerA(overrides = {}) {
    const { client } = await signInAsFixtureUser("ownerA");
    const result = await client.rpc("create_payment", {
      p_account_id: overrides.accountId ?? isolationFixtures.accounts.accountA.id,
      p_property_id: overrides.propertyId ?? isolationSeedIds.propertyIds.accountA,
      p_tenant_id: overrides.tenantId ?? isolationFixtures.users.tenantA1.tenantId,
      p_amount: overrides.amount ?? 987.65,
      p_due_date: overrides.dueDate ?? "2026-04-08",
      p_paid_at: overrides.paidAt ?? null,
      p_notes: null,
    });

    expect(result.error).toBeNull();
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (row?.id) createdPaymentIds.add(row.id);
    return row;
  }

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdPaymentIds.size > 0) {
      await admin.from("payments").delete().in("id", Array.from(createdPaymentIds));
      createdPaymentIds.clear();
    }

    if (createdAutomationIds.size > 0) {
      const { error } = await admin.from("automation_execution_log").delete().in("id", Array.from(createdAutomationIds));
      createdAutomationIds.clear();
      if (error) throw error;
    }

    if (createdComplianceIds.size > 0) {
      const { error } = await admin.from("compliance_items").delete().in("id", Array.from(createdComplianceIds));
      createdComplianceIds.clear();
      if (error) throw error;
    }

    if (createdExpenseIds.size > 0) {
      const { error } = await admin.from("property_operating_expenses").delete().in("id", Array.from(createdExpenseIds));
      createdExpenseIds.clear();
      if (error) throw error;
    }

    if (previousFinancialProfile !== undefined) {
      const propertyId = isolationSeedIds.propertyIds.accountA;

      if (previousFinancialProfile === null) {
        const { error } = await admin.from("property_financial_profiles").delete().eq("property_id", propertyId);
        if (error) throw error;
      } else {
        const { error } = await admin.from("property_financial_profiles").upsert(previousFinancialProfile, {
          onConflict: "property_id",
        });
        if (error) throw error;
      }

      previousFinancialProfile = undefined;
    }
  });

  it("allows owner A to manage operations-foundation rows and read resulting payment events", async () => {
    const propertyId = isolationSeedIds.propertyIds.accountA;
    previousFinancialProfile = (
      await admin
        .from("property_financial_profiles")
        .select("property_id, account_id, estimated_market_value, target_cap_rate, notes")
        .eq("property_id", propertyId)
        .maybeSingle()
    ).data;

    const { client } = await signInAsFixtureUser("ownerA");

    const financialProfileResult = await client
      .from("property_financial_profiles")
      .upsert(
        {
          property_id: propertyId,
          account_id: isolationFixtures.accounts.accountA.id,
          estimated_market_value: 325000,
          target_cap_rate: 5.25,
          notes: "owner-managed profile",
        },
        { onConflict: "property_id" },
      )
      .select("property_id, account_id, estimated_market_value, target_cap_rate")
      .single();

    expect(financialProfileResult.error).toBeNull();
    expect(financialProfileResult.data).toMatchObject({
      property_id: propertyId,
      account_id: isolationFixtures.accounts.accountA.id,
    });

    const expenseInsert = await client
      .from("property_operating_expenses")
      .insert(buildExpenseRow())
      .select("id, account_id, property_id, amount")
      .single();

    expect(expenseInsert.error).toBeNull();
    createdExpenseIds.add(expenseInsert.data.id);

    const complianceInsert = await client
      .from("compliance_items")
      .insert(buildComplianceItem())
      .select("id, account_id, property_id, status")
      .single();

    expect(complianceInsert.error).toBeNull();
    createdComplianceIds.add(complianceInsert.data.id);

    const automationInsert = await client
      .from("automation_execution_log")
      .insert(buildAutomationLog())
      .select("id, account_id, rule_id, event_key")
      .single();

    expect(automationInsert.error).toBeNull();
    createdAutomationIds.add(automationInsert.data.id);

    const payment = await createPaymentAsOwnerA();
    const paymentEventsResult = await client
      .from("payment_events")
      .select("id, account_id, payment_id, event_type")
      .eq("payment_id", payment.id);

    expect(paymentEventsResult.error).toBeNull();
    expect((paymentEventsResult.data || []).some((row) => row.payment_id === payment.id)).toBe(true);
  });

  it("allows staff A to read operations-foundation rows for account A", async () => {
    const propertyId = isolationSeedIds.propertyIds.accountA;
    previousFinancialProfile = (
      await admin
        .from("property_financial_profiles")
        .select("property_id, account_id, estimated_market_value, target_cap_rate, notes")
        .eq("property_id", propertyId)
        .maybeSingle()
    ).data;

    const { error: profileSeedError } = await admin.from("property_financial_profiles").upsert(
      {
        property_id: propertyId,
        account_id: isolationFixtures.accounts.accountA.id,
        estimated_market_value: 350000,
        target_cap_rate: 5.1,
        notes: "seeded profile",
      },
      { onConflict: "property_id" },
    );
    if (profileSeedError) throw profileSeedError;

    const expense = await admin
      .from("property_operating_expenses")
      .insert(buildExpenseRow({ created_by: isolationFixtures.users.adminA.id }))
      .select("id, account_id")
      .single();
    if (expense.error) throw expense.error;
    createdExpenseIds.add(expense.data.id);

    const compliance = await admin
      .from("compliance_items")
      .insert(buildComplianceItem())
      .select("id, account_id")
      .single();
    if (compliance.error) throw compliance.error;
    createdComplianceIds.add(compliance.data.id);

    const automation = await admin
      .from("automation_execution_log")
      .insert(buildAutomationLog())
      .select("id, account_id")
      .single();
    if (automation.error) throw automation.error;
    createdAutomationIds.add(automation.data.id);

    const payment = await createPaymentAsOwnerA({ amount: 765.43, dueDate: "2026-04-09" });
    const { client } = await signInAsFixtureUser("staffA");

    const financialProfileRead = await client
      .from("property_financial_profiles")
      .select("property_id, account_id")
      .eq("property_id", propertyId)
      .single();
    expect(financialProfileRead.error).toBeNull();
    expect(financialProfileRead.data.account_id).toBe(isolationFixtures.accounts.accountA.id);

    const expenseRead = await client
      .from("property_operating_expenses")
      .select("id, account_id")
      .eq("id", expense.data.id)
      .single();
    expect(expenseRead.error).toBeNull();

    const complianceRead = await client
      .from("compliance_items")
      .select("id, account_id")
      .eq("id", compliance.data.id)
      .single();
    expect(complianceRead.error).toBeNull();

    const paymentEventsRead = await client
      .from("payment_events")
      .select("id, account_id, payment_id")
      .eq("payment_id", payment.id);
    expect(paymentEventsRead.error).toBeNull();
    expect((paymentEventsRead.data || []).some((row) => row.payment_id === payment.id)).toBe(true);

    const automationRead = await client
      .from("automation_execution_log")
      .select("id, account_id")
      .eq("id", automation.data.id)
      .single();
    expect(automationRead.error).toBeNull();
  });

  it("denies cross-account owners from reading foreign operations-foundation rows", async () => {
    const propertyId = isolationSeedIds.propertyIds.accountA;
    previousFinancialProfile = (
      await admin
        .from("property_financial_profiles")
        .select("property_id, account_id, estimated_market_value, target_cap_rate, notes")
        .eq("property_id", propertyId)
        .maybeSingle()
    ).data;

    const { error: profileSeedError } = await admin.from("property_financial_profiles").upsert(
      {
        property_id: propertyId,
        account_id: isolationFixtures.accounts.accountA.id,
        estimated_market_value: 351000,
        target_cap_rate: 4.9,
        notes: "cross-account profile seed",
      },
      { onConflict: "property_id" },
    );
    if (profileSeedError) throw profileSeedError;

    const expense = await admin
      .from("property_operating_expenses")
      .insert(buildExpenseRow())
      .select("id")
      .single();
    if (expense.error) throw expense.error;
    createdExpenseIds.add(expense.data.id);

    const compliance = await admin
      .from("compliance_items")
      .insert(buildComplianceItem())
      .select("id")
      .single();
    if (compliance.error) throw compliance.error;
    createdComplianceIds.add(compliance.data.id);

    const automation = await admin
      .from("automation_execution_log")
      .insert(buildAutomationLog())
      .select("id")
      .single();
    if (automation.error) throw automation.error;
    createdAutomationIds.add(automation.data.id);

    const payment = await createPaymentAsOwnerA();
    const { client } = await signInAsFixtureUser("ownerB");

    const financialProfileRead = await client
      .from("property_financial_profiles")
      .select("property_id")
      .eq("property_id", propertyId)
      .maybeSingle();
    expect(financialProfileRead.error).toBeNull();
    expect(financialProfileRead.data).toBeNull();

    const expenseRead = await client
      .from("property_operating_expenses")
      .select("id")
      .eq("id", expense.data.id)
      .maybeSingle();
    expect(expenseRead.error).toBeNull();
    expect(expenseRead.data).toBeNull();

    const complianceRead = await client
      .from("compliance_items")
      .select("id")
      .eq("id", compliance.data.id)
      .maybeSingle();
    expect(complianceRead.error).toBeNull();
    expect(complianceRead.data).toBeNull();

    const paymentEventsRead = await client
      .from("payment_events")
      .select("id")
      .eq("payment_id", payment.id);
    expect(paymentEventsRead.error).toBeNull();
    expect(paymentEventsRead.data || []).toHaveLength(0);

    const automationRead = await client
      .from("automation_execution_log")
      .select("id")
      .eq("id", automation.data.id)
      .maybeSingle();
    expect(automationRead.error).toBeNull();
    expect(automationRead.data).toBeNull();
  });

  it("denies tenants from writing manager-only operations-foundation rows", async () => {
    const propertyId = isolationSeedIds.propertyIds.accountA;
    const { client } = await signInAsFixtureUser("tenantA1");

    const financialProfileWrite = await client
      .from("property_financial_profiles")
      .upsert(
        {
          property_id: propertyId,
          account_id: isolationFixtures.accounts.accountA.id,
          estimated_market_value: 250000,
          target_cap_rate: 4.5,
          notes: "tenant should not write profile",
        },
        { onConflict: "property_id" },
      )
      .select("property_id");
    expectWriteDenied(financialProfileWrite);

    const expenseWrite = await client
      .from("property_operating_expenses")
      .insert(buildExpenseRow({ created_by: isolationFixtures.users.tenantA1.id }))
      .select("id");
    expectWriteDenied(expenseWrite);

    const complianceWrite = await client
      .from("compliance_items")
      .insert(buildComplianceItem({ tenant_id: isolationFixtures.users.tenantA1.tenantId }))
      .select("id");
    expectWriteDenied(complianceWrite);

    const automationWrite = await client
      .from("automation_execution_log")
      .insert(buildAutomationLog())
      .select("id");
    expectWriteDenied(automationWrite);
  });
});
