// tests/security/rentEngineContracts.test.js
// Security contract tests for the Rent Calculation Engine.
// Verifies RLS, cross-account isolation, and ledger immutability invariants.

import { describe, it, expect } from "vitest";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { getIntegrationAdminClient, signInAsUser } from "../integration/helpers/localSupabaseHarness.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";

const skip = !isIntegrationHarnessConfigured();

describe("Rent engine RLS — cross-account isolation", () => {
  it.skipIf(skip)("owner B cannot read account A rent plans", async () => {
    const adminClient = getIntegrationAdminClient();

    // Insert a rent plan in account A
    const { data: plan } = await adminClient.from("rent_plans").insert({
      account_id:       isolationFixtures.accounts.accountA.id,
      base_rent_amount: 1000,
      start_date:       "2026-01-01",
      currency:         "GBP",
      market:           "uk",
      billing_frequency: "monthly",
    }).select().single();

    expect(plan?.id).toBeTruthy();

    // Owner B tries to read account A plans
    const ownerBClient = await signInAsUser(isolationFixtures.users.ownerB.email);
    const { data, error } = await ownerBClient
      .from("rent_plans")
      .select("*")
      .eq("id", plan.id);

    expect(data ?? []).toHaveLength(0); // RLS blocks it

    // Cleanup
    await adminClient.from("rent_plans").delete().eq("id", plan.id);
  });
});

describe("Rent engine RLS — cross-account expected charges denied", () => {
  it.skipIf(skip)("owner B cannot insert expected charges into account A", async () => {
    const ownerBClient = await signInAsUser(isolationFixtures.users.ownerB.email);

    const { error } = await ownerBClient.from("expected_charges").insert({
      account_id:   isolationFixtures.accounts.accountA.id, // wrong account
      charge_type:  "rent",
      period_start: "2026-05-01",
      period_end:   "2026-05-31",
      due_date:     "2026-05-01",
      amount:       1000,
      currency:     "GBP",
    });

    expect(error).toBeTruthy(); // should be denied
  });
});

describe("Rent engine — ledger immutability", () => {
  it.skipIf(skip)("post_expected_charge does not write directly to ledger_entries", async () => {
    const adminClient = getIntegrationAdminClient();

    // Count ledger entries before
    const { count: before } = await adminClient
      .from("ledger_entries")
      .select("*", { count: "exact", head: true })
      .eq("account_id", isolationFixtures.accounts.accountA.id);

    // Create minimal expected charge
    const { data: charge } = await adminClient.from("expected_charges").insert({
      account_id:   isolationFixtures.accounts.accountA.id,
      charge_type:  "rent",
      period_start: "2026-01-01",
      period_end:   "2026-01-31",
      due_date:     "2026-01-01",
      amount:       1000,
      currency:     "GBP",
    }).select().single();

    // Call post_expected_charge — this should create a payment, NOT a ledger entry directly
    const { data: payment, error: postError } = await adminClient.rpc("post_expected_charge", {
      p_account_id:         isolationFixtures.accounts.accountA.id,
      p_expected_charge_id: charge.id,
    });

    if (!postError) {
      // Ledger entries count should be the same — post_expected_charge only creates payments
      const { count: after } = await adminClient
        .from("ledger_entries")
        .select("*", { count: "exact", head: true })
        .eq("account_id", isolationFixtures.accounts.accountA.id);

      expect(after).toBe(before); // no direct ledger writes from calculation engine
    }

    // Cleanup
    await adminClient.from("expected_charges").delete().eq("id", charge?.id);
    if (payment?.id) {
      await adminClient.from("payments").delete().eq("id", payment.id);
    }
  });
});

describe("Rent engine RLS — tenant visibility restricted", () => {
  it.skipIf(skip)("tenant A1 cannot read rent plans (manager-only resource)", async () => {
    const tenantClient = await signInAsUser(isolationFixtures.users.tenantA1.email);

    const { data, error } = await tenantClient
      .from("rent_plans")
      .select("*")
      .eq("account_id", isolationFixtures.accounts.accountA.id);

    // RLS restricts tenants: expect empty result or denied
    expect((data ?? []).length === 0 || !!error).toBe(true);
  });
});

describe("Rent engine RLS — contractor access denied", () => {
  it.skipIf(skip)("contractor A1 cannot read rent plans", async () => {
    const contractorClient = await signInAsUser(isolationFixtures.users.contractorA1.email);

    const { data, error } = await contractorClient
      .from("rent_plans")
      .select("*")
      .eq("account_id", isolationFixtures.accounts.accountA.id);

    expect((data ?? []).length === 0 || !!error).toBe(true);
  });
});

describe("Rent engine — duplicate expected charge prevention", () => {
  it.skipIf(skip)("second identical expected charge is rejected by unique index", async () => {
    const adminClient = getIntegrationAdminClient();

    const base = {
      account_id:   isolationFixtures.accounts.accountA.id,
      tenant_id:    isolationFixtures.users.tenantA1.tenantId,
      property_id:  isolationFixtures.users.tenantA1.propertyId,
      charge_type:  "rent",
      period_start: "2026-06-01",
      period_end:   "2026-06-30",
      due_date:     "2026-06-01",
      amount:       1000,
      currency:     "GBP",
    };

    const { data: first  } = await adminClient.from("expected_charges").insert(base).select().single();
    const { error: dup }    = await adminClient.from("expected_charges").insert(base);

    expect(dup).toBeTruthy(); // unique index should reject

    // Cleanup
    if (first?.id) await adminClient.from("expected_charges").delete().eq("id", first.id);
  });
});

describe("Rent engine — cannot activate non-draft plan", () => {
  it.skipIf(skip)("activating an already-active plan returns an error", async () => {
    const adminClient = getIntegrationAdminClient();

    const { data: plan } = await adminClient.from("rent_plans").insert({
      account_id:       isolationFixtures.accounts.accountA.id,
      base_rent_amount: 1000,
      start_date:       "2026-01-01",
      status:           "active",
      currency:         "GBP",
      market:           "generic",
      billing_frequency: "monthly",
    }).select().single();

    const { error } = await adminClient.rpc("activate_rent_plan", {
      p_account_id:   isolationFixtures.accounts.accountA.id,
      p_rent_plan_id: plan?.id,
    });

    expect(error).toBeTruthy(); // "only draft plans can be activated"

    // Cleanup
    if (plan?.id) await adminClient.from("rent_plans").delete().eq("id", plan.id);
  });
});
