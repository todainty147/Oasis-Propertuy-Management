// tests/unit/rentCalculationEngine.test.js
// Unit tests for the pure rent calculation engine.
// No DB, no network — all pure function assertions.

import { describe, it, expect } from "vitest";
import {
  toPence, fromPence, applyRounding,
  daysInMonth, daysInYear, isLeapYear, daysBetween,
  toMonthlyPence, fromMonthlyPence,
  prorateMonthlyPence,
  checkUkDepositCap, checkPlDepositWarning, checkDepositForMarket,
  calculateUtilities,
  splitRent,
  runRentCalculation,
  generateBillingPeriods,
} from "../../src/utils/rentCalculationEngine.js";

// ─────────────────────────────────────────────────────────────────────────────
// Currency helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("toPence / fromPence", () => {
  it("converts 1500.00 to 150000 pence", () => expect(toPence(1500)).toBe(150000));
  it("converts 1500.50 to 150050 pence", () => expect(toPence(1500.50)).toBe(150050));
  it("converts 0 to 0", () => expect(toPence(0)).toBe(0));
  it("round-trips correctly", () => expect(fromPence(toPence(1234.56))).toBe(1234.56));
  it("handles null/undefined gracefully", () => {
    expect(toPence(null)).toBe(0);
    expect(toPence(undefined)).toBe(0);
  });
});

describe("applyRounding", () => {
  it("nearest_penny rounds 100.4 → 100", () => expect(applyRounding(100.4)).toBe(100));
  it("nearest_penny rounds 100.5 → 101", () => expect(applyRounding(100.5)).toBe(101));
  it("round_up rounds 100.1 → 101",  () => expect(applyRounding(100.1, "round_up")).toBe(101));
  it("round_down rounds 100.9 → 100", () => expect(applyRounding(100.9, "round_down")).toBe(100));
  it("none leaves fractional", ()     => expect(applyRounding(100.7, "none")).toBe(100.7));
});

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("daysInMonth", () => {
  it("January has 31 days",   () => expect(daysInMonth(2026, 1)).toBe(31));
  it("February 2026 has 28",  () => expect(daysInMonth(2026, 2)).toBe(28));
  it("February 2024 has 29 (leap)", () => expect(daysInMonth(2024, 2)).toBe(29));
  it("April has 30 days",     () => expect(daysInMonth(2026, 4)).toBe(30));
});

describe("isLeapYear", () => {
  it("2024 is a leap year",   () => expect(isLeapYear(2024)).toBe(true));
  it("2026 is not a leap year", () => expect(isLeapYear(2026)).toBe(false));
  it("2000 is a leap year",   () => expect(isLeapYear(2000)).toBe(true));
  it("1900 is not a leap year", () => expect(isLeapYear(1900)).toBe(false));
});

describe("daysBetween", () => {
  it("same day = 1",          () => expect(daysBetween("2026-05-01", "2026-05-01")).toBe(1));
  it("full May = 31",         () => expect(daysBetween("2026-05-01", "2026-05-31")).toBe(31));
  it("15 days mid-month",     () => expect(daysBetween("2026-05-01", "2026-05-15")).toBe(15));
});

// ─────────────────────────────────────────────────────────────────────────────
// Frequency conversion
// ─────────────────────────────────────────────────────────────────────────────

describe("toMonthlyPence — frequency conversion", () => {
  it("monthly £1000 stays £1000",    () => expect(toMonthlyPence(1000, "monthly")).toBe(100000));
  it("weekly £230.77 ≈ monthly £1000",() => {
    // 230.77 * 52 / 12 ≈ 1000
    const result = toMonthlyPence(230.77, "weekly");
    expect(result).toBeGreaterThan(99900);
    expect(result).toBeLessThan(100100);
  });
  it("annual £12000 → monthly £1000",() => expect(toMonthlyPence(12000, "annual")).toBe(100000));
  it("fortnightly £500 → monthly ≈ £1083", () => {
    const result = toMonthlyPence(500, "fortnightly");
    expect(result).toBe(Math.round(50000 * 26 / 12));
  });
  it("four_weekly £923.08 ≈ monthly £1000", () => {
    const result = toMonthlyPence(923.08, "four_weekly");
    expect(result).toBeGreaterThan(99900);
    expect(result).toBeLessThan(100200);
  });
});

describe("fromMonthlyPence — frequency back-conversion", () => {
  it("monthly 100000 pence → 100000",  () => expect(fromMonthlyPence(100000, "monthly")).toBe(100000));
  it("annual 100000/month → 1200000",  () => expect(fromMonthlyPence(100000, "annual")).toBe(1200000));
  it("weekly 100000/month → ≈23077",   () => {
    const result = fromMonthlyPence(100000, "weekly");
    expect(result).toBe(Math.round(100000 * 12 / 52));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Proration
// ─────────────────────────────────────────────────────────────────────────────

describe("prorateMonthlyPence", () => {
  const rentP = 100000; // £1000

  it("actual_days_in_month — full month returns full rent", () => {
    const result = prorateMonthlyPence(rentP, "2026-05-01", "2026-05-31", "actual_days_in_month");
    expect(result).toBe(rentP); // 31/31 = 1
  });

  it("actual_days_in_month — 15 days in 30-day month = 50%", () => {
    const result = prorateMonthlyPence(rentP, "2026-04-01", "2026-04-15", "actual_days_in_month");
    expect(result).toBe(Math.round(rentP * 15 / 30));
  });

  it("thirty_day_month — 15 days = exactly 50%", () => {
    const result = prorateMonthlyPence(rentP, "2026-05-01", "2026-05-15", "thirty_day_month");
    expect(result).toBe(Math.round(rentP * 15 / 30));
  });

  it("annual_daily_365 — 30 days ≈ 1 month", () => {
    const result = prorateMonthlyPence(rentP, "2026-05-01", "2026-05-30", "annual_daily_365");
    const expected = Math.round(rentP * 12 / 365 * 30);
    expect(result).toBe(expected);
  });

  it("annual_daily_actual_year — leap year uses 366", () => {
    const resultLeap    = prorateMonthlyPence(rentP, "2024-02-01", "2024-02-29", "annual_daily_actual_year");
    const resultNonLeap = prorateMonthlyPence(rentP, "2026-02-01", "2026-02-28", "annual_daily_actual_year");
    // Leap year divides by 366, non-leap by 365 — different results for same day count
    expect(resultLeap).toBe(Math.round(rentP * 12 / 366 * 29));
    expect(resultNonLeap).toBe(Math.round(rentP * 12 / 365 * 28));
  });

  it("no_proration — always returns full amount", () => {
    const result = prorateMonthlyPence(rentP, "2026-05-15", "2026-05-31", "no_proration");
    expect(result).toBe(rentP);
  });

  it("manual_override — uses provided amount", () => {
    const result = prorateMonthlyPence(rentP, "2026-05-01", "2026-05-15", "manual_override", 55000);
    expect(result).toBe(55000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Deposit checks
// ─────────────────────────────────────────────────────────────────────────────

describe("checkUkDepositCap", () => {
  it("deposit within 5-week cap (annual rent < £50k) passes", () => {
    const monthly = toPence(1000);   // £12,000/year
    const deposit = toPence(1153);   // ≈ 5 weeks
    const result  = checkUkDepositCap(monthly, deposit);
    expect(result.withinCap).toBe(true);
    expect(result.capWeeks).toBe(5);
    expect(result.warning).toBeNull();
  });

  it("deposit exceeding 5-week cap triggers warning", () => {
    const monthly = toPence(1000);
    const deposit = toPence(1500);   // exceeds 5-week cap
    const result  = checkUkDepositCap(monthly, deposit);
    expect(result.withinCap).toBe(false);
    expect(result.warning).toMatch(/Tenant Fees Act/);
  });

  it("annual rent ≥ £50k switches cap to 6 weeks", () => {
    const monthly = toPence(5000);   // £60,000/year → weekly ≈ £1153.85 → 6-week cap ≈ £6923
    const deposit = toPence(6500);   // £6500 — within 6-week cap
    const result  = checkUkDepositCap(monthly, deposit);
    expect(result.capWeeks).toBe(6);
    expect(result.withinCap).toBe(true);
  });

  it("annual rent exactly £50k uses 6-week cap", () => {
    const monthly = toPence(50000 / 12);
    const result  = checkUkDepositCap(monthly, toPence(1000));
    expect(result.capWeeks).toBe(6);
  });
});

describe("checkPlDepositWarning", () => {
  it("deposit within 3x monthly rent passes", () => {
    const monthly = toPence(1000);
    const deposit = toPence(2500);
    const result  = checkPlDepositWarning(monthly, deposit, 3);
    expect(result.withinGuideline).toBe(true);
    expect(result.warning).toBeNull();
  });

  it("deposit exceeding 3x triggers warning with disclaimer", () => {
    const monthly = toPence(1000);
    const deposit = toPence(4000);
    const result  = checkPlDepositWarning(monthly, deposit, 3);
    expect(result.withinGuideline).toBe(false);
    expect(result.warning).toMatch(/market-practice guideline only/);
    expect(result.warning).toMatch(/not legal advice/);
  });

  it("custom multiplier is respected", () => {
    const monthly = toPence(1000);
    const deposit = toPence(2500);
    expect(checkPlDepositWarning(monthly, deposit, 2).withinGuideline).toBe(false);
    expect(checkPlDepositWarning(monthly, deposit, 3).withinGuideline).toBe(true);
  });
});

describe("checkDepositForMarket", () => {
  it("returns empty array for generic market", () => {
    expect(checkDepositForMarket("generic", toPence(1000), toPence(5000))).toHaveLength(0);
  });
  it("returns warning for UK overage", () => {
    const warnings = checkDepositForMarket("uk", toPence(1000), toPence(5000));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("deposit_cap_uk");
  });
  it("returns warning for PL overage", () => {
    const warnings = checkDepositForMarket("pl", toPence(1000), toPence(5000));
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("deposit_guideline_pl");
  });
  it("returns empty when deposit is zero", () => {
    expect(checkDepositForMarket("uk", toPence(1000), 0)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateUtilities", () => {
  it("rent_only returns 0 pence", () => {
    expect(calculateUtilities("rent_only").pence).toBe(0);
    expect(calculateUtilities("rent_only").included).toBe(false);
  });
  it("bills_inclusive returns 0 pence and included=true", () => {
    const r = calculateUtilities("bills_inclusive");
    expect(r.pence).toBe(0);
    expect(r.included).toBe(true);
  });
  it("fixed_utility_charge returns provided amount", () => {
    expect(calculateUtilities("fixed_utility_charge", 15000).pence).toBe(15000);
  });
  it("variable_utility_charge returns 0 pence (metered)", () => {
    expect(calculateUtilities("variable_utility_charge", 0).pence).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Split rent
// ─────────────────────────────────────────────────────────────────────────────

describe("splitRent", () => {
  const tenants = [{ id: "t1" }, { id: "t2" }, { id: "t3" }];

  it("equal split — total is preserved", () => {
    const result = splitRent(100000, tenants, "equal");
    const total  = result.reduce((s, t) => s + t.amountPence, 0);
    expect(total).toBe(100000);
    expect(result).toHaveLength(3);
  });

  it("equal split — remainder penny goes to first tenant", () => {
    const result = splitRent(100001, tenants, "equal");
    const total  = result.reduce((s, t) => s + t.amountPence, 0);
    expect(total).toBe(100001);
    // first tenant gets the extra penny
    expect(result[0].amountPence).toBeGreaterThanOrEqual(result[1].amountPence);
  });

  it("percentage split — total is preserved", () => {
    const overrides = [{ percentage: 50 }, { percentage: 30 }, { percentage: 20 }];
    const result    = splitRent(100000, tenants, "percentage", overrides);
    const total     = result.reduce((s, t) => s + t.amountPence, 0);
    expect(total).toBe(100000);
  });

  it("fixed split — uses provided amounts", () => {
    const overrides = [{ amount: 600 }, { amount: 300 }, { amount: 100 }];
    const result    = splitRent(100000, tenants, "fixed", overrides);
    expect(result[0].amountPence).toBe(60000);
    expect(result[1].amountPence).toBe(30000);
    expect(result[2].amountPence).toBe(10000);
  });

  it("returns empty for empty tenants array", () => {
    expect(splitRent(100000, [], "equal")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full calculation
// ─────────────────────────────────────────────────────────────────────────────

describe("runRentCalculation", () => {
  const basePlan = {
    id: "plan-1",
    base_rent_amount: 1000,
    billing_frequency: "monthly",
    proration_policy:  "actual_days_in_month",
    utilities_policy:  "rent_only",
    rounding_policy:   "nearest_penny",
    deposit_amount:    null,
    deposit_policy:    "none",
    market:            "generic",
    currency:          "GBP",
    rent_charge_rules: [],
  };

  it("full month — total equals base rent", () => {
    const result = runRentCalculation({
      plan: basePlan,
      periodStart: "2026-05-01",
      periodEnd:   "2026-05-31",
    });
    expect(result.total).toBe(1000);
    expect(result.currency).toBe("GBP");
    expect(result.warnings).toHaveLength(0);
  });

  it("part month — total is prorated", () => {
    const result = runRentCalculation({
      plan: basePlan,
      periodStart:  "2026-05-15",
      periodEnd:    "2026-05-31",
      isPartMonth:  true,
    });
    // 17 days / 31 days * 1000 = 548.39
    expect(result.total).toBeCloseTo(17 / 31 * 1000, 0);
    expect(result.total).toBeLessThan(1000);
  });

  it("includes fixed utility charge as separate line item", () => {
    const plan = { ...basePlan, utilities_policy: "fixed_utility_charge" };
    const chargeRules = [{
      id: "rule-1", charge_type: "utilities", label: "Utilities", amount: 150,
      calculation_type: "fixed", frequency: "monthly", included_in_rent: false, taxable_flag: false,
    }];
    const result = runRentCalculation({ plan, chargeRules, periodStart: "2026-05-01", periodEnd: "2026-05-31" });
    expect(result.total).toBe(1150); // 1000 + 150
    expect(result.lineItems).toHaveLength(2);
  });

  it("UK deposit cap warning appears when exceeded", () => {
    const plan = {
      ...basePlan,
      market:         "uk",
      deposit_policy: "market_default",
      deposit_amount: 5000, // far exceeds 5-week cap for £1000/month
    };
    const result = runRentCalculation({ plan, periodStart: "2026-05-01", periodEnd: "2026-05-31" });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].code).toBe("deposit_cap_uk");
  });

  it("explanation is a non-empty string", () => {
    const result = runRentCalculation({
      plan: basePlan,
      periodStart: "2026-05-01",
      periodEnd:   "2026-05-31",
    });
    expect(typeof result.explanation).toBe("string");
    expect(result.explanation.length).toBeGreaterThan(10);
  });

  it("policyUsed reflects plan settings", () => {
    const result = runRentCalculation({
      plan: basePlan,
      periodStart: "2026-05-01",
      periodEnd:   "2026-05-31",
    });
    expect(result.policyUsed.billing_frequency).toBe("monthly");
    expect(result.policyUsed.proration_policy).toBe("actual_days_in_month");
  });

  it("result is not NaN", () => {
    const result = runRentCalculation({
      plan: basePlan,
      periodStart: "2026-05-01",
      periodEnd:   "2026-05-31",
    });
    expect(Number.isNaN(result.total)).toBe(false);
    expect(Number.isFinite(result.total)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Billing periods
// ─────────────────────────────────────────────────────────────────────────────

describe("generateBillingPeriods", () => {
  const plan = {
    start_date:        "2026-01-01",
    due_day:           1,
    billing_frequency: "monthly",
  };

  it("generates 5 months from Jan to May 2026", () => {
    const periods = generateBillingPeriods(plan, new Date("2026-05-15"));
    expect(periods).toHaveLength(5);
    expect(periods[0].year).toBe(2026);
    expect(periods[0].month).toBe(1);
    expect(periods[4].month).toBe(5);
  });

  it("each period has a periodStart, periodEnd, and dueDate", () => {
    const periods = generateBillingPeriods(plan, new Date("2026-02-15"));
    for (const p of periods) {
      expect(typeof p.periodStart).toBe("string");
      expect(typeof p.periodEnd).toBe("string");
      expect(typeof p.dueDate).toBe("string");
    }
  });

  it("due day is clamped to month's max days (e.g. Feb)", () => {
    const febPlan = { ...plan, due_day: 31 };
    const periods = generateBillingPeriods(febPlan, new Date("2026-02-15"));
    const febPeriod = periods.find((p) => p.month === 2);
    expect(febPeriod).toBeTruthy();
    expect(febPeriod.periodStart).toMatch(/2026-02-28/);
  });
});
