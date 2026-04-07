import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";
import { isIntegrationHarnessConfigured } from "./helpers/env.js";

describe.skipIf(!isIntegrationHarnessConfigured())("maintenance expense and budget security", () => {
  const admin = getIntegrationAdminClient();
  const createdExpenseIds = new Set();
  const createdBudgetIds = new Set();

  function buildExpenseRow(overrides = {}) {
    return {
      id: randomUUID(),
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: isolationFixtures.users.tenantA1.propertyId,
      work_order_id: null,
      maintenance_request_id: null,
      vendor_id: null,
      vendor_name: "Integration Vendor",
      category: "electrical",
      approval_state: "approved",
      amount: 120,
      currency: "GBP",
      expense_date: "2026-03-20",
      posted_at: new Date("2026-03-20T12:00:00Z").toISOString(),
      source: `integration-expense-${randomUUID()}`,
      source_key: `integration-expense-key-${randomUUID()}`,
      notes: "integration maintenance expense",
      ...overrides,
    };
  }

  function buildBudgetRow(overrides = {}) {
    return {
      id: randomUUID(),
      account_id: isolationFixtures.accounts.accountA.id,
      property_id: null,
      category: null,
      period_month: "2026-03-01",
      budget_amount: 500,
      ...overrides,
    };
  }

  async function insertExpense(row = {}) {
    const payload = buildExpenseRow(row);
    const { data, error } = await admin
      .from("maintenance_expenses")
      .insert(payload)
      .select("id, account_id, amount, category")
      .single();

    if (error) throw error;
    createdExpenseIds.add(data.id);
    return data;
  }

  async function insertBudget(row = {}) {
    const payload = buildBudgetRow(row);
    const { data, error } = await admin
      .from("maintenance_budgets")
      .insert(payload)
      .select("id, account_id, budget_amount, period_month")
      .single();

    if (error) throw error;
    createdBudgetIds.add(data.id);
    return data;
  }

  beforeAll(async () => {
    await ensureIsolationHarnessSeed();
  });

  afterEach(async () => {
    if (createdExpenseIds.size > 0) {
      const ids = Array.from(createdExpenseIds);
      createdExpenseIds.clear();
      const { error } = await admin.from("maintenance_expenses").delete().in("id", ids);
      if (error) throw error;
    }

    if (createdBudgetIds.size > 0) {
      const ids = Array.from(createdBudgetIds);
      createdBudgetIds.clear();
      const { error } = await admin.from("maintenance_budgets").delete().in("id", ids);
      if (error) throw error;
    }
  });

  it("allows owner A to create and read maintenance expenses and budgets", async () => {
    const { client } = await signInAsFixtureUser("ownerA");

    const expenseInsert = await client
      .from("maintenance_expenses")
      .insert(buildExpenseRow({ notes: "owner-created expense" }))
      .select("id, account_id, amount")
      .single();

    expect(expenseInsert.error).toBeNull();
    createdExpenseIds.add(expenseInsert.data.id);
    expect(expenseInsert.data.account_id).toBe(isolationFixtures.accounts.accountA.id);

    const budgetInsert = await client
      .from("maintenance_budgets")
      .insert(buildBudgetRow({ budget_amount: 750 }))
      .select("id, account_id, budget_amount")
      .single();

    expect(budgetInsert.error).toBeNull();
    createdBudgetIds.add(budgetInsert.data.id);
    expect(Number(budgetInsert.data.budget_amount)).toBe(750);
  });

  it("allows staff A to read account A expenses and budgets", async () => {
    const expense = await insertExpense();
    const budget = await insertBudget();
    const { client } = await signInAsFixtureUser("staffA");

    const expenseRead = await client
      .from("maintenance_expenses")
      .select("id, account_id")
      .eq("id", expense.id)
      .single();

    expect(expenseRead.error).toBeNull();
    expect(expenseRead.data.account_id).toBe(isolationFixtures.accounts.accountA.id);

    const budgetRead = await client
      .from("maintenance_budgets")
      .select("id, account_id")
      .eq("id", budget.id)
      .single();

    expect(budgetRead.error).toBeNull();
    expect(budgetRead.data.account_id).toBe(isolationFixtures.accounts.accountA.id);
  });

  it("denies cross-account owners from reading foreign expenses and budgets", async () => {
    const expense = await insertExpense();
    const budget = await insertBudget();
    const { client } = await signInAsFixtureUser("ownerB");

    const expenseRead = await client
      .from("maintenance_expenses")
      .select("id, account_id")
      .eq("id", expense.id)
      .maybeSingle();

    expect(expenseRead.error).toBeNull();
    expect(expenseRead.data).toBeNull();

    const budgetRead = await client
      .from("maintenance_budgets")
      .select("id, account_id")
      .eq("id", budget.id)
      .maybeSingle();

    expect(budgetRead.error).toBeNull();
    expect(budgetRead.data).toBeNull();
  });

  it("denies tenants from creating maintenance expenses and budgets", async () => {
    const { client } = await signInAsFixtureUser("tenantA1");

    const expenseInsert = await client
      .from("maintenance_expenses")
      .insert(buildExpenseRow({ notes: "tenant-created expense" }))
      .select("id")
      .single();

    expect(expenseInsert.data ?? null).toBeNull();
    expect(String(expenseInsert.error?.message || "").toLowerCase()).toContain("row-level security");

    const budgetInsert = await client
      .from("maintenance_budgets")
      .insert(buildBudgetRow({ budget_amount: 900 }))
      .select("id")
      .single();

    expect(budgetInsert.data ?? null).toBeNull();
    expect(String(budgetInsert.error?.message || "").toLowerCase()).toContain("row-level security");
  });
});
