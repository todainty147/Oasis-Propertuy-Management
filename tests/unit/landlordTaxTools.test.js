import { describe, expect, it } from "vitest";

import { classifyExpense } from "../../marketing-site/lib/landlordTaxTools/expenseTester.ts";
import { calculateSection24Comparison } from "../../marketing-site/lib/landlordTaxTools/section24Calculator.ts";
import { calculateMtdReadiness, getMtdThresholdMessage } from "../../marketing-site/lib/landlordTaxTools/mtdReadiness.ts";

describe("classifyExpense", () => {
  it.each([
    ["replacing a broken boiler", "repairs_maintenance"],
    ["upgrade kitchen worktop to granite", "capital_improvement"],
    ["landlord insurance", "insurance"],
    ["letting agent fee", "professional_fee"],
    ["mortgage interest", "finance_cost"],
    ["new sofa replacement", "domestic_item_replacement"],
    ["mixed personal/rental broadband", "mixed_use_review"],
  ])("classifies %s", (description, category) => {
    expect(classifyExpense({ description }).category).toBe(category);
  });

  it("returns needs_review for empty input", () => {
    expect(classifyExpense({ description: "" }).category).toBe("needs_review");
  });

  it("returns needs_review for conflicting repair and improvement answers", () => {
    expect(
      classifyExpense({
        description: "repair and upgrade kitchen",
        restoresSameStandard: true,
        improvesOrAddsSomething: true,
      }).category,
    ).toBe("needs_review");
  });
});

describe("calculateSection24Comparison", () => {
  it("shows a higher current-rule tax estimate for a higher-rate scenario with large finance costs", () => {
    const result = calculateSection24Comparison({
      employmentIncome: 60000,
      rentalIncome: 24000,
      nonFinanceExpenses: 4000,
      financeCosts: 15000,
      taxYear: "2026/27",
    });

    expect(result.difference.estimatedExtraTax).toBeGreaterThan(0);
    expect(result.currentRules.estimatedIncomeTaxAfterCredit).toBeGreaterThan(
      result.oldRules.estimatedIncomeTaxBeforeCredits,
    );
  });

  it("shows no shock for a basic-rate scenario where the credit offsets the restriction", () => {
    const result = calculateSection24Comparison({
      employmentIncome: 20000,
      rentalIncome: 10000,
      nonFinanceExpenses: 2000,
      financeCosts: 3000,
      taxYear: "2026/27",
    });

    expect(result.difference.estimatedExtraTax).toBe(0);
  });

  it("shows no Section 24 impact with zero finance costs", () => {
    const result = calculateSection24Comparison({
      employmentIncome: 70000,
      rentalIncome: 12000,
      nonFinanceExpenses: 3000,
      financeCosts: 0,
      taxYear: "2026/27",
    });

    expect(result.difference.estimatedExtraTax).toBe(0);
    expect(result.currentRules.basicRateFinanceCostCredit).toBe(0);
  });

  it("warns when old-style view is a rental loss but current-style view has taxable property profit", () => {
    const result = calculateSection24Comparison({
      employmentIncome: 40000,
      rentalIncome: 10000,
      nonFinanceExpenses: 8000,
      financeCosts: 5000,
      taxYear: "2026/27",
    });

    expect(result.oldRules.taxableRentalProfit).toBeLessThan(0);
    expect(result.currentRules.taxableRentalProfitBeforeFinanceCosts).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes("rental loss"))).toBe(true);
  });

  it("handles invalid, negative, and empty values safely", () => {
    const result = calculateSection24Comparison({
      employmentIncome: -1,
      rentalIncome: undefined,
      nonFinanceExpenses: Number.NaN,
      financeCosts: -20,
      taxYear: "2026/27",
    });

    expect(result.oldRules.taxableRentalProfit).toBe(0);
    expect(result.difference.estimatedExtraTax).toBe(0);
  });
});

describe("calculateMtdReadiness", () => {
  it("returns threshold messages and readiness score", () => {
    expect(getMtdThresholdMessage(new Date("2026-05-28"), 51000)).toContain("6 April 2026");
    expect(getMtdThresholdMessage(new Date("2026-05-28"), 31000)).toContain("6 April 2027");
    expect(getMtdThresholdMessage(new Date("2026-05-28"), 21000)).toContain("6 April 2028");

    const result = calculateMtdReadiness({
      propertyIncome: 32000,
      selfEmploymentIncome: 0,
      usesSpreadsheets: true,
      keepsReceiptsDigitally: true,
      tracksExpensesByProperty: true,
      usesAccountant: false,
      ownsMoreThanOneRentalProperty: true,
    });

    expect(result.thresholdStatus).toContain("6 April 2027");
    expect(result.readinessScore).toBeGreaterThan(0);
  });
});
