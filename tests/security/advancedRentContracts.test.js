// tests/security/advancedRentContracts.test.js
// RLS/security contract tests for all Epic 2 advanced rent model tables.

import { describe, it, expect } from "vitest";
import { isIntegrationHarnessConfigured } from "../integration/helpers/env.js";
import { getIntegrationAdminClient, signInAsUser } from "../integration/helpers/localSupabaseHarness.js";
import { isolationFixtures } from "../fixtures/isolationFixtures.js";

const skip = !isIntegrationHarnessConfigured();
const accountA = isolationFixtures.accounts.accountA;
const ownerB   = isolationFixtures.users.ownerB;
const tenantA1 = isolationFixtures.users.tenantA1;

// ─────────────────────────────────────────────────────────────────────────────
// rent_splits
// ─────────────────────────────────────────────────────────────────────────────

describe("RLS: rent_splits — cross-account access denied", () => {
  it.skipIf(skip)("owner B cannot read account A rent splits", async () => {
    const admin = getIntegrationAdminClient();
    const { data: plan } = await admin.from("rent_plans").insert({
      account_id:       accountA.id,
      base_rent_amount: 1000,
      start_date:       "2026-01-01",
      currency:         "GBP",
      market:           "uk",
      billing_frequency: "monthly",
    }).select().single();

    const { data: split } = await admin.from("rent_splits").insert({
      account_id:   accountA.id,
      rent_plan_id: plan.id,
      split_type:   "equal_split",
      status:       "active",
    }).select().single();

    const ownerBClient = await signInAsUser(ownerB.email);
    const { data, error } = await ownerBClient.from("rent_splits").select("*").eq("id", split.id);
    expect((data ?? []).length === 0 || !!error).toBe(true);

    await admin.from("rent_splits").delete().eq("id", split.id);
    await admin.from("rent_plans").delete().eq("id", plan.id);
  });
});

describe("RLS: rent_splits — tenant visibility restricted", () => {
  it.skipIf(skip)("tenant cannot read rent_splits", async () => {
    const client = await signInAsUser(tenantA1.email);
    const { data, error } = await client.from("rent_splits").select("*").eq("account_id", accountA.id);
    expect((data ?? []).length === 0 || !!error).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// property_rooms
// ─────────────────────────────────────────────────────────────────────────────

describe("RLS: property_rooms — cross-account denied", () => {
  it.skipIf(skip)("owner B cannot read account A rooms", async () => {
    const admin = getIntegrationAdminClient();
    const { data: room } = await admin.from("property_rooms").insert({
      account_id:  accountA.id,
      property_id: isolationFixtures.users.tenantA1.propertyId,
      room_label:  "Test room",
      status:      "available",
    }).select().single();

    const ownerBClient = await signInAsUser(ownerB.email);
    const { data, error } = await ownerBClient.from("property_rooms").select("*").eq("id", room.id);
    expect((data ?? []).length === 0 || !!error).toBe(true);

    await admin.from("property_rooms").delete().eq("id", room.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// utility_charges
// ─────────────────────────────────────────────────────────────────────────────

describe("RLS: utility_charges — cross-account denied", () => {
  it.skipIf(skip)("owner B cannot read account A utility charges", async () => {
    const admin = getIntegrationAdminClient();
    const { data: charge } = await admin.from("utility_charges").insert({
      account_id:         accountA.id,
      utility_type:       "electricity",
      calculation_method: "fixed",
      invoice_amount:     50,
      currency:           "GBP",
      status:             "draft",
    }).select().single();

    const ownerBClient = await signInAsUser(ownerB.email);
    const { data, error } = await ownerBClient.from("utility_charges").select("*").eq("id", charge.id);
    expect((data ?? []).length === 0 || !!error).toBe(true);

    await admin.from("utility_charges").delete().eq("id", charge.id);
  });
});

describe("RLS: utility_charges — tenant cannot insert for other account", () => {
  it.skipIf(skip)("tenant cannot insert utility charges for account A", async () => {
    const client = await signInAsUser(tenantA1.email);
    const { error } = await client.from("utility_charges").insert({
      account_id:         accountA.id,
      utility_type:       "electricity",
      calculation_method: "fixed",
      invoice_amount:     50,
      currency:           "GBP",
    });
    expect(error).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rent_adjustments
// ─────────────────────────────────────────────────────────────────────────────

describe("RLS: rent_adjustments — cross-account denied", () => {
  it.skipIf(skip)("owner B cannot read account A adjustments", async () => {
    const admin = getIntegrationAdminClient();
    const { data: adj } = await admin.from("rent_adjustments").insert({
      account_id:      accountA.id,
      adjustment_type: "fixed_discount",
      amount:          50,
      applies_to_charge_type: "rent",
      start_date:      "2026-06-01",
      reason:          "Test discount",
      status:          "draft",
    }).select().single();

    const ownerBClient = await signInAsUser(ownerB.email);
    const { data, error } = await ownerBClient.from("rent_adjustments").select("*").eq("id", adj.id);
    expect((data ?? []).length === 0 || !!error).toBe(true);

    await admin.from("rent_adjustments").delete().eq("id", adj.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// str_booking_charges
// ─────────────────────────────────────────────────────────────────────────────

describe("RLS: str_booking_charges — cross-account denied", () => {
  it.skipIf(skip)("owner B cannot read account A STR bookings", async () => {
    const admin = getIntegrationAdminClient();
    const { data: booking } = await admin.from("str_booking_charges").insert({
      account_id:     accountA.id,
      market:         "uk",
      currency:       "GBP",
      check_in_date:  "2026-08-01",
      check_out_date: "2026-08-08",
      nights:         7,
      nightly_rate:   100,
      total_amount:   700,
      status:         "draft",
    }).select().single();

    const ownerBClient = await signInAsUser(ownerB.email);
    const { data, error } = await ownerBClient.from("str_booking_charges").select("*").eq("id", booking.id);
    expect((data ?? []).length === 0 || !!error).toBe(true);

    await admin.from("str_booking_charges").delete().eq("id", booking.id);
  });
});

describe("RLS: str_booking_charges — check-out before check-in rejected", () => {
  it.skipIf(skip)("DB constraint rejects invalid booking dates", async () => {
    const admin = getIntegrationAdminClient();
    const { error } = await admin.from("str_booking_charges").insert({
      account_id:     accountA.id,
      market:         "uk",
      currency:       "GBP",
      check_in_date:  "2026-08-08",
      check_out_date: "2026-08-01",  // before check-in — should fail constraint
      nights:         7,
      nightly_rate:   100,
      total_amount:   700,
      status:         "draft",
    });
    expect(error).toBeTruthy(); // str_checkout_after_checkin constraint
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// room_rent_assignments — overlap prevention
// ─────────────────────────────────────────────────────────────────────────────

describe("RLS: room_rent_assignments — overlap unique index", () => {
  it.skipIf(skip)("two active assignments for same room+tenant are rejected", async () => {
    const admin = getIntegrationAdminClient();
    const { data: room } = await admin.from("property_rooms").insert({
      account_id:  accountA.id,
      property_id: isolationFixtures.users.tenantA1.propertyId,
      room_label:  "Overlap test room",
      status:      "available",
    }).select().single();

    const base = {
      account_id:       accountA.id,
      property_id:      isolationFixtures.users.tenantA1.propertyId,
      room_id:          room.id,
      tenant_id:        isolationFixtures.users.tenantA1.tenantId,
      amount:           500,
      currency:         "GBP",
      billing_frequency: "monthly",
      proration_policy: "actual_days_in_month",
      effective_from:   "2026-01-01",
      status:           "active",
    };

    const { data: first }  = await admin.from("room_rent_assignments").insert(base).select().single();
    const { error: dupErr } = await admin.from("room_rent_assignments").insert(base);
    expect(dupErr).toBeTruthy(); // unique index blocks duplicate

    if (first?.id) await admin.from("room_rent_assignments").delete().eq("id", first.id);
    await admin.from("property_rooms").delete().eq("id", room.id);
  });
});
