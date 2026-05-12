// tests/unit/advancedRentModels.test.js
// Unit tests for all Epic 2 advanced rent model calculations.

import { describe, it, expect } from "vitest";
import {
  toPence,
  fromPence,
  runSplitRentCalculation,
  runRoomRentCalculation,
  runUtilityCalculation,
  calculateRentIncreaseSummary,
  applyRentAdjustment,
  runStrCalculation,
} from "../../src/utils/rentCalculationEngine.js";

// ─────────────────────────────────────────────────────────────────────────────
// Model 1: Split Rent
// ─────────────────────────────────────────────────────────────────────────────

describe("runSplitRentCalculation — equal_split", () => {
  it("splits equally between 2 tenants", () => {
    const total   = toPence(1500);
    const splits  = [{ tenantId: "t1" }, { tenantId: "t2" }];
    const result  = runSplitRentCalculation(total, splits, "equal_split");
    expect(result.shares).toHaveLength(2);
    expect(result.shares[0].amount).toBe(750);
    expect(result.shares[1].amount).toBe(750);
    expect(result.total).toBe(1500);
  });

  it("assigns rounding penny to first tenant", () => {
    const total  = toPence(1000);
    const splits = [{ tenantId: "t1" }, { tenantId: "t2" }, { tenantId: "t3" }];
    const result = runSplitRentCalculation(total, splits, "equal_split");
    const sum    = result.shares.reduce((s, sh) => s + sh.amountPence, 0);
    expect(sum).toBe(total); // no pence lost
    const firstShare = result.shares[0].amountPence;
    const lastShare  = result.shares[2].amountPence;
    expect(firstShare >= lastShare).toBe(true);
  });

  it("returns warning for empty tenants", () => {
    const result = runSplitRentCalculation(toPence(1000), [], "equal_split");
    expect(result.warnings.some((w) => w.code === "no_tenants")).toBe(true);
  });
});

describe("runSplitRentCalculation — percentage_split", () => {
  it("splits by percentage correctly", () => {
    const total   = toPence(1000);
    const splits  = [
      { tenantId: "t1", percentage: 60 },
      { tenantId: "t2", percentage: 40 },
    ];
    const result = runSplitRentCalculation(total, splits, "percentage_split");
    expect(result.shares[0].amount).toBe(600);
    expect(result.shares[1].amount).toBe(400);
  });

  it("warns when percentages do not total 100%", () => {
    const splits  = [
      { tenantId: "t1", percentage: 60 },
      { tenantId: "t2", percentage: 30 },
    ];
    const result = runSplitRentCalculation(toPence(1000), splits, "percentage_split");
    expect(result.warnings.some((w) => w.code === "percentage_not_100")).toBe(true);
  });

  it("allocates remainder to last tenant (no pence lost)", () => {
    const total  = toPence(1000);
    const splits = [{ tenantId: "t1", percentage: 33.33 }, { tenantId: "t2", percentage: 66.67 }];
    const result = runSplitRentCalculation(total, splits, "percentage_split");
    const sum    = result.shares.reduce((s, sh) => s + sh.amountPence, 0);
    expect(sum).toBe(total);
  });
});

describe("runSplitRentCalculation — fixed_amount_split", () => {
  it("uses fixed amounts when they match total", () => {
    const total  = toPence(1500);
    const splits = [{ tenantId: "t1", fixedAmount: 900 }, { tenantId: "t2", fixedAmount: 600 }];
    const result = runSplitRentCalculation(total, splits, "fixed_amount_split");
    expect(result.shares[0].amount).toBe(900);
    expect(result.shares[1].amount).toBe(600);
    expect(result.warnings.some((w) => w.code === "fixed_mismatch")).toBe(false);
  });

  it("warns when fixed amounts do not match total", () => {
    const total  = toPence(1500);
    const splits = [{ tenantId: "t1", fixedAmount: 800 }, { tenantId: "t2", fixedAmount: 600 }];
    const result = runSplitRentCalculation(total, splits, "fixed_amount_split");
    expect(result.warnings.some((w) => w.code === "fixed_mismatch")).toBe(true);
  });
});

describe("runSplitRentCalculation — custom_manual_split", () => {
  it("requires reason for each tenant", () => {
    const splits = [{ tenantId: "t1", fixedAmount: 750 }]; // no overrideReason
    const result = runSplitRentCalculation(toPence(750), splits, "custom_manual_split");
    expect(result.warnings.some((w) => w.code === "reason_required")).toBe(true);
  });

  it("passes when all tenants have reasons", () => {
    const splits = [{ tenantId: "t1", fixedAmount: 750, overrideReason: "Room size" }];
    const result = runSplitRentCalculation(toPence(750), splits, "custom_manual_split");
    expect(result.warnings.some((w) => w.code === "reason_required")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Model 2: Room-Based Rent
// ─────────────────────────────────────────────────────────────────────────────

describe("runRoomRentCalculation", () => {
  const baseAssignment = {
    amount: 600,
    billing_frequency: "monthly",
    proration_policy:  "actual_days_in_month",
    tenant_id: "tenant-abc",
    currency: "GBP",
  };
  const room = { room_label: "Room 1", status: "occupied" };

  it("calculates full month room rent", () => {
    const result = runRoomRentCalculation({
      assignment:  baseAssignment,
      room,
      periodStart: "2026-05-01",
      periodEnd:   "2026-05-31",
      isPartMonth: false,
    });
    expect(result.amount).toBe(600);
    expect(result.roomLabel).toBe("Room 1");
    expect(result.tenantId).toBe("tenant-abc");
  });

  it("prorates part-month room rent", () => {
    const result = runRoomRentCalculation({
      assignment:  baseAssignment,
      room,
      periodStart: "2026-05-15",
      periodEnd:   "2026-05-31",
      isPartMonth: true,
    });
    expect(result.prorated).toBe(true);
    expect(result.amount).toBeLessThan(600);
    expect(result.amount).toBeGreaterThan(0);
  });

  it("returns zero charge for vacant room (no tenant_id)", () => {
    const result = runRoomRentCalculation({
      assignment:  { ...baseAssignment, tenant_id: null },
      room,
      periodStart: "2026-05-01",
      periodEnd:   "2026-05-31",
    });
    expect(result.amount).toBe(0);
    expect(result.tenantId).toBeNull();
    expect(result.warnings.some((w) => w.code === "vacant_room")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Model 3: Variable Utilities
// ─────────────────────────────────────────────────────────────────────────────

describe("runUtilityCalculation — fixed", () => {
  it("returns the fixed amount", () => {
    const result = runUtilityCalculation({ utility_type: "electricity", calculation_method: "fixed", invoice_amount: 75, currency: "GBP" });
    expect(result.amount).toBe(75);
    expect(result.warnings).toHaveLength(0);
  });
});

describe("runUtilityCalculation — manual", () => {
  it("returns amount and warns if no evidence note", () => {
    const result = runUtilityCalculation({ utility_type: "gas", calculation_method: "manual", invoice_amount: 50, currency: "GBP" });
    expect(result.amount).toBe(50);
    expect(result.warnings.some((w) => w.code === "no_evidence_note")).toBe(true);
  });

  it("passes with evidence note", () => {
    const result = runUtilityCalculation({ utility_type: "gas", calculation_method: "manual", invoice_amount: 50, evidence_note: "Invoice #123", currency: "GBP" });
    expect(result.warnings.some((w) => w.code === "no_evidence_note")).toBe(false);
  });
});

describe("runUtilityCalculation — meter_usage", () => {
  it("calculates usage correctly", () => {
    const result = runUtilityCalculation({
      utility_type: "electricity",
      calculation_method: "meter_usage",
      previous_reading: 1000,
      current_reading:  1200,
      unit_rate:        0.30,       // £0.30/unit
      standing_charge:  10,         // £10
      currency: "GBP",
    });
    expect(result.usage).toBe(200); // 1200 - 1000
    // 200 * 30p = £60 + £10 standing = £70
    expect(result.amount).toBeCloseTo(70, 0);
  });

  it("warns when current reading < previous", () => {
    const result = runUtilityCalculation({
      utility_type: "electricity",
      calculation_method: "meter_usage",
      previous_reading: 1200,
      current_reading:  1100,
      unit_rate: 0.30,
      currency: "GBP",
    });
    expect(result.warnings.some((w) => w.code === "invalid_reading")).toBe(true);
    expect(result.amount).toBe(0);
  });

  it("overridden invalid reading requires override_reason", () => {
    const result = runUtilityCalculation({
      utility_type: "electricity",
      calculation_method: "meter_usage",
      previous_reading: 1200,
      current_reading:  1100,
      unit_rate: 0.30,
      override_reason: "Meter replaced",
      currency: "GBP",
    });
    // With override_reason, does not return invalid_reading warning
    expect(result.warnings.some((w) => w.code === "invalid_reading")).toBe(false);
  });

  it("warns on zero usage (same reading)", () => {
    const result = runUtilityCalculation({
      utility_type: "electricity",
      calculation_method: "meter_usage",
      previous_reading: 1000,
      current_reading:  1000,
      unit_rate: 0.30,
      currency: "GBP",
    });
    expect(result.warnings.some((w) => w.code === "zero_usage")).toBe(true);
  });
});

describe("runUtilityCalculation — invoice_split", () => {
  it("splits invoice by ratio", () => {
    const result = runUtilityCalculation({
      utility_type: "water",
      calculation_method: "invoice_split",
      invoice_amount: 120,
      split_ratio: 0.5,
      currency: "GBP",
    });
    expect(result.amount).toBe(60);
  });

  it("warns on invalid split ratio", () => {
    const result = runUtilityCalculation({
      utility_type: "water",
      calculation_method: "invoice_split",
      invoice_amount: 120,
      split_ratio: 1.5,
      currency: "GBP",
    });
    expect(result.warnings.some((w) => w.code === "invalid_split_ratio")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Model 4: Rent Increase
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateRentIncreaseSummary", () => {
  it("calculates increase amount and percentage", () => {
    const result = calculateRentIncreaseSummary(toPence(1000), toPence(1100), "2026-09-01");
    expect(result.diff).toBe(100);
    expect(result.percentChange).toBeCloseTo(10, 1);
    expect(result.effectiveDate).toBe("2026-09-01");
  });

  it("warns for rent decrease", () => {
    const result = calculateRentIncreaseSummary(toPence(1100), toPence(1000), "2026-09-01");
    expect(result.warnings.some((w) => w.code === "rent_decrease")).toBe(true);
  });

  it("warns for backdated effective date", () => {
    const result = calculateRentIncreaseSummary(toPence(1000), toPence(1100), "2020-01-01");
    expect(result.warnings.some((w) => w.code === "backdated_effective")).toBe(true);
  });

  it("calculates zero diff correctly", () => {
    const result = calculateRentIncreaseSummary(toPence(1000), toPence(1000), "2026-09-01");
    expect(result.diff).toBe(0);
    expect(result.percentChange).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Model 5: Discounts and Promotions
// ─────────────────────────────────────────────────────────────────────────────

describe("applyRentAdjustment", () => {
  const base = toPence(1000); // £1000 base

  it("applies fixed discount", () => {
    const result = applyRentAdjustment(base, { adjustment_type: "fixed_discount", amount: 100, reason: "Goodwill" });
    expect(result.final).toBe(900);
    expect(result.adjustment).toBe(100);
  });

  it("applies percentage discount", () => {
    const result = applyRentAdjustment(base, { adjustment_type: "percentage_discount", percentage: 10, reason: "Introductory" });
    expect(result.final).toBeCloseTo(900, 0);
  });

  it("rent holiday sets final to zero", () => {
    const result = applyRentAdjustment(base, { adjustment_type: "rent_holiday", reason: "No charge this month" });
    expect(result.final).toBe(0);
    expect(result.adjustment).toBe(fromPence(base));
  });

  it("clamps to zero if fixed discount exceeds base (non-holiday)", () => {
    const result = applyRentAdjustment(base, { adjustment_type: "fixed_discount", amount: 2000, reason: "Test" });
    expect(result.final).toBe(0);
    expect(result.warnings.some((w) => w.code === "below_zero")).toBe(true);
  });

  it("warns for large discount (> 20%)", () => {
    const result = applyRentAdjustment(base, { adjustment_type: "fixed_discount", amount: 250, reason: "Large" });
    expect(result.warnings.some((w) => w.code === "large_discount")).toBe(true);
  });

  it("warns when reason is missing", () => {
    const result = applyRentAdjustment(base, { adjustment_type: "fixed_discount", amount: 50, reason: "" });
    expect(result.warnings.some((w) => w.code === "reason_required")).toBe(true);
  });

  it("goodwill credit reduces charge", () => {
    const result = applyRentAdjustment(base, { adjustment_type: "goodwill_credit", amount: 50, reason: "Maintenance delay" });
    expect(result.final).toBe(950);
  });

  it("introductory_offer uses percentage", () => {
    const result = applyRentAdjustment(base, { adjustment_type: "introductory_offer", percentage: 50, reason: "First month" });
    expect(result.final).toBeCloseTo(500, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Model 6: STR Nightly
// ─────────────────────────────────────────────────────────────────────────────

describe("runStrCalculation", () => {
  const base = { check_in_date: "2026-07-01", check_out_date: "2026-07-08", nightly_rate: 100, currency: "GBP" };

  it("calculates 7 nights correctly", () => {
    const result = runStrCalculation(base);
    expect(result.nights).toBe(7);
    expect(result.nightlySubtotal).toBe(700);
    expect(result.total).toBe(700);
  });

  it("adds cleaning fee", () => {
    const result = runStrCalculation({ ...base, cleaning_fee: 50 });
    expect(result.total).toBe(750);
    expect(result.cleaningFee).toBe(50);
  });

  it("subtracts discount", () => {
    const result = runStrCalculation({ ...base, discount_amount: 100 });
    expect(result.total).toBe(600);
    expect(result.discount).toBe(100);
  });

  it("includes platform fee", () => {
    const result = runStrCalculation({ ...base, platform_fee: 35 });
    expect(result.total).toBe(735);
  });

  it("rejects invalid dates (check-out before check-in)", () => {
    const result = runStrCalculation({ ...base, check_in_date: "2026-07-08", check_out_date: "2026-07-01" });
    expect(result.warnings.some((w) => w.code === "invalid_dates")).toBe(true);
    expect(result.nights).toBe(0);
  });

  it("warns when discount exceeds gross", () => {
    const result = runStrCalculation({ ...base, discount_amount: 9999 });
    expect(result.warnings.some((w) => w.code === "discount_exceeds_gross")).toBe(true);
    expect(result.total).toBe(0);
  });

  it("includes tax placeholder", () => {
    const result = runStrCalculation({ ...base, tax_amount: 20 });
    expect(result.tax).toBe(20);
    expect(result.total).toBe(720);
  });

  it("handles same day check-in/check-out as zero nights", () => {
    const result = runStrCalculation({ ...base, check_out_date: "2026-07-01" });
    expect(result.warnings.some((w) => w.code === "invalid_dates")).toBe(true);
  });

  it("line items include all fee types", () => {
    const result = runStrCalculation({ ...base, cleaning_fee: 50, platform_fee: 20, service_fee: 10, tax_amount: 15, discount_amount: 25 });
    const types  = result.lineItems.map((li) => li.chargeType);
    expect(types).toContain("str_nightly");
    expect(types).toContain("cleaning_fee");
    expect(types).toContain("platform_fee");
    expect(types).toContain("service_fee");
    expect(types).toContain("tax_placeholder");
    expect(types).toContain("discount");
  });
});
