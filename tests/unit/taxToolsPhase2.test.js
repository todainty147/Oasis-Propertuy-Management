import { describe, expect, it } from "vitest";

import {
  calculateCarriedForwardFinanceCost,
  calculateMtdReadiness,
  calculateSection24Comparison,
  getMtdThresholdMessage,
} from "../../src/utils/taxTools.js";

describe("Phase 2 tax tools utilities", () => {
  it("shows a higher current Section 24 estimate for a higher-rate landlord with large finance costs", () => {
    const result = calculateSection24Comparison({
      employmentIncome: 60000,
      rentalIncome: 24000,
      nonFinanceExpenses: 4000,
      financeCosts: 16000,
      taxYear: "2026/27",
    });

    expect(result.currentRules.estimatedIncomeTaxAfterCredit)
      .toBeGreaterThan(result.oldRules.estimatedIncomeTaxBeforeCredits);
    expect(result.difference.estimatedExtraTax).toBeGreaterThan(0);
  });

  it("has no Section 24 impact when finance costs are zero", () => {
    const result = calculateSection24Comparison({
      employmentIncome: 30000,
      rentalIncome: 12000,
      nonFinanceExpenses: 3000,
      financeCosts: 0,
    });

    expect(result.currentRules.basicRateFinanceCostCredit).toBe(0);
    expect(result.difference.estimatedExtraTax).toBe(0);
  });

  it("warns when old-style profit is a loss but current-style profit is taxable", () => {
    const result = calculateSection24Comparison({
      employmentIncome: 50000,
      rentalIncome: 12000,
      nonFinanceExpenses: 2000,
      financeCosts: 14000,
    });

    expect(result.oldRules.taxableRentalProfit).toBe(0);
    expect(result.currentRules.taxableRentalProfitBeforeFinanceCosts).toBe(10000);
    expect(result.warnings.join(" ")).toMatch(/Old-style rental loss/i);
  });

  it("handles invalid and negative values safely", () => {
    const result = calculateSection24Comparison({
      employmentIncome: -1,
      rentalIncome: "not a number",
      nonFinanceExpenses: -200,
      financeCosts: -300,
    });

    expect(result.oldRules.taxableRentalProfit).toBe(0);
    expect(result.currentRules.estimatedIncomeTaxAfterCredit).toBe(0);
  });

  it("returns MTD threshold messages for the published staged thresholds", () => {
    expect(getMtdThresholdMessage(new Date("2026-05-28"), 51000).deadline).toBe("2026-04-06");
    expect(getMtdThresholdMessage(new Date("2026-05-28"), 31000).deadline).toBe("2027-04-06");
    expect(getMtdThresholdMessage(new Date("2026-05-28"), 21000).deadline).toBe("2028-04-06");
    expect(getMtdThresholdMessage(new Date("2026-05-28"), 10000).status).toBe("under_threshold");
  });

  it("scores digital record readiness and combines property plus self-employment income", () => {
    const result = calculateMtdReadiness({
      propertyIncome: 22000,
      selfEmploymentIncome: 10000,
      usesSpreadsheets: false,
      keepsReceiptsDigitally: true,
      tracksExpensesByProperty: true,
      usesAccountant: true,
      ownsMoreThanOneProperty: true,
    });

    expect(result.qualifyingIncome).toBe(32000);
    expect(result.threshold.deadline).toBe("2027-04-06");
    expect(result.score).toBe(100);
  });

  it("calculates carried-forward finance costs without going negative", () => {
    expect(calculateCarriedForwardFinanceCost({
      broughtForwardAmount: 5000,
      financeCostsThisYear: 4000,
      usedAmount: 3000,
    }).carriedForwardAmount).toBe(6000);

    expect(calculateCarriedForwardFinanceCost({
      broughtForwardAmount: 1000,
      financeCostsThisYear: 1000,
      usedAmount: 5000,
    }).carriedForwardAmount).toBe(0);
  });
});
