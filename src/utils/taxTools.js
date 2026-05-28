export const TAX_TOOL_ADVICE_NOTICE =
  "Track figures to review with your accountant. Tenaqo does not replace tax advice or HMRC submission software.";

export const TAX_TOOL_NO_HMRC_NOTICE =
  "No HMRC submission is made from these tools. Live HMRC submission remains disabled.";

export const TAX_CATEGORIES = [
  "repairs_maintenance",
  "capital_improvement",
  "domestic_item_replacement",
  "finance_cost",
  "professional_fee",
  "insurance",
  "running_cost",
  "mixed_use_review",
  "needs_review",
];

export const TAX_CATEGORY_LABELS = {
  repairs_maintenance: "Repairs & maintenance",
  capital_improvement: "Capital improvement",
  domestic_item_replacement: "Domestic item replacement",
  finance_cost: "Finance cost",
  professional_fee: "Professional or agent fee",
  insurance: "Insurance",
  running_cost: "Property running cost",
  mixed_use_review: "Mixed-use review",
  needs_review: "Needs accountant review",
};

export const DEFAULT_TAX_YEAR = "2026/27";

export const TAX_YEAR_OPTIONS = ["2025/26", "2026/27", "2027/28", "2028/29"];

const SIMPLE_TAX_BANDS_BY_YEAR = {
  "2025/26": {
    personalAllowance: 12570,
    basicRateLimit: 37700,
    higherRateLimit: 125140,
    basicRate: 0.2,
    higherRate: 0.4,
    additionalRate: 0.45,
  },
  "2026/27": {
    personalAllowance: 12570,
    basicRateLimit: 37700,
    higherRateLimit: 125140,
    basicRate: 0.2,
    higherRate: 0.4,
    additionalRate: 0.45,
  },
  "2027/28": {
    personalAllowance: 12570,
    basicRateLimit: 37700,
    higherRateLimit: 125140,
    basicRate: 0.2,
    higherRate: 0.4,
    additionalRate: 0.45,
  },
  "2028/29": {
    personalAllowance: 12570,
    basicRateLimit: 37700,
    higherRateLimit: 125140,
    basicRate: 0.2,
    higherRate: 0.4,
    additionalRate: 0.45,
  },
};

export function toMoneyNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(toMoneyNumber(value));
}

export function getUkTaxBandsForSimpleEstimate(taxYear = DEFAULT_TAX_YEAR) {
  return SIMPLE_TAX_BANDS_BY_YEAR[taxYear] || SIMPLE_TAX_BANDS_BY_YEAR[DEFAULT_TAX_YEAR];
}

export function estimateIncomeTax(income, taxYear = DEFAULT_TAX_YEAR) {
  const bands = getUkTaxBandsForSimpleEstimate(taxYear);
  const taxableAfterAllowance = Math.max(0, toMoneyNumber(income) - bands.personalAllowance);
  const basicSlice = Math.min(taxableAfterAllowance, bands.basicRateLimit);
  const higherSlice = Math.min(
    Math.max(0, taxableAfterAllowance - bands.basicRateLimit),
    bands.higherRateLimit - bands.basicRateLimit,
  );
  const additionalSlice = Math.max(0, taxableAfterAllowance - bands.higherRateLimit);

  return basicSlice * bands.basicRate
    + higherSlice * bands.higherRate
    + additionalSlice * bands.additionalRate;
}

export function calculateSection24Comparison(input = {}) {
  const employmentIncome = toMoneyNumber(input.employmentIncome);
  const rentalIncome = toMoneyNumber(input.rentalIncome);
  const nonFinanceExpenses = toMoneyNumber(input.nonFinanceExpenses);
  const financeCosts = toMoneyNumber(input.financeCosts);
  const taxYear = input.taxYear || DEFAULT_TAX_YEAR;

  const oldProfitRaw = rentalIncome - nonFinanceExpenses - financeCosts;
  const oldTaxableRentalProfit = Math.max(0, oldProfitRaw);
  const currentProfitRaw = rentalIncome - nonFinanceExpenses;
  const currentTaxableRentalProfit = Math.max(0, currentProfitRaw);

  const oldTotalIncome = employmentIncome + oldTaxableRentalProfit;
  const currentTotalIncome = employmentIncome + currentTaxableRentalProfit;
  const oldTax = estimateIncomeTax(oldTotalIncome, taxYear);
  const currentTaxBeforeCredit = estimateIncomeTax(currentTotalIncome, taxYear);
  const basicRateFinanceCostCredit = Math.min(financeCosts * 0.2, currentTaxBeforeCredit);
  const currentTaxAfterCredit = Math.max(0, currentTaxBeforeCredit - basicRateFinanceCostCredit);
  const estimatedExtraTax = Math.max(0, currentTaxAfterCredit - oldTax);

  const warnings = [
    "This simplified estimate does not handle Scotland/Wales differences, child benefit charge, student loans, pension contributions, personal allowance tapering, ownership splits, companies, furnished holiday lettings, losses, or all Self Assessment adjustments.",
  ];

  if (oldProfitRaw < 0 && currentProfitRaw > 0) {
    warnings.push("Old-style rental loss but current-style taxable property profit: review carefully with an accountant.");
  }

  return {
    oldRules: {
      taxableRentalProfit: oldTaxableRentalProfit,
      estimatedTotalTaxableIncome: oldTotalIncome,
      estimatedIncomeTaxBeforeCredits: oldTax,
    },
    currentRules: {
      taxableRentalProfitBeforeFinanceCosts: currentTaxableRentalProfit,
      estimatedTotalTaxableIncome: currentTotalIncome,
      estimatedIncomeTaxBeforeCredit: currentTaxBeforeCredit,
      basicRateFinanceCostCredit,
      estimatedIncomeTaxAfterCredit: currentTaxAfterCredit,
    },
    difference: {
      estimatedExtraTax,
      effectiveImpactMessage: estimatedExtraTax > 0
        ? `Estimated additional tax impact: ${formatCurrency(estimatedExtraTax)}`
        : "No additional Section 24 impact in this simplified estimate.",
    },
    warnings,
    assumptions: [
      "Uses a simplified non-Scottish UK individual income tax estimate.",
      "Finance costs are shown as a basic-rate tax credit estimate, not an official tax return calculation.",
      TAX_TOOL_ADVICE_NOTICE,
    ],
  };
}

export function getMtdThresholdMessage(currentDate = new Date(), qualifyingIncome = 0) {
  const income = toMoneyNumber(qualifyingIncome);
  const today = currentDate instanceof Date ? currentDate : new Date(currentDate);
  const year = Number.isNaN(today.getTime()) ? new Date().getFullYear() : today.getFullYear();

  if (income > 50000) return { status: "over_50000", message: "Over £50,000: prepare for 6 April 2026.", deadline: "2026-04-06" };
  if (income > 30000) return { status: "over_30000", message: "Over £30,000: prepare for 6 April 2027.", deadline: "2027-04-06" };
  if (income > 20000) return { status: "over_20000", message: "Over £20,000: prepare for 6 April 2028.", deadline: "2028-04-06" };
  return {
    status: "under_threshold",
    message: `Under threshold: keep monitoring for the ${year}/${String(year + 1).slice(2)} tax year.`,
    deadline: null,
  };
}

export function getReadinessScore(input = {}) {
  const checks = [
    input.usesSpreadsheets === false,
    input.keepsReceiptsDigitally === true,
    input.tracksExpensesByProperty === true,
    input.usesAccountant === true,
    input.ownsMoreThanOneProperty === false || input.tracksExpensesByProperty === true,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function calculateMtdReadiness(input = {}) {
  const propertyIncome = toMoneyNumber(input.propertyIncome);
  const selfEmploymentIncome = toMoneyNumber(input.selfEmploymentIncome);
  const qualifyingIncome = propertyIncome + selfEmploymentIncome;
  const threshold = getMtdThresholdMessage(new Date(), qualifyingIncome);
  const score = getReadinessScore(input);
  const nextSteps = [
    "Keep digital copies of receipts and invoices.",
    "Track income and expenses by property.",
    "Separate finance costs from repairs, insurance, professional fees, and running costs.",
  ];

  if (score < 70) nextSteps.unshift("Tighten digital record habits before the relevant MTD deadline.");
  if (input.ownsMoreThanOneProperty) nextSteps.push("Use property-level views so accountant review is cleaner.");

  return { qualifyingIncome, threshold, score, nextSteps };
}

export function calculateCarriedForwardFinanceCost({
  broughtForwardAmount = 0,
  financeCostsThisYear = 0,
  usedAmount = 0,
} = {}) {
  const broughtForward = toMoneyNumber(broughtForwardAmount);
  const currentYearCosts = toMoneyNumber(financeCostsThisYear);
  const used = Math.min(toMoneyNumber(usedAmount), broughtForward + currentYearCosts);
  const carriedForwardAmount = Math.max(0, broughtForward + currentYearCosts - used);
  return {
    broughtForwardAmount: broughtForward,
    financeCostsThisYear: currentYearCosts,
    usedAmount: used,
    carriedForwardAmount,
  };
}

export function rollCarriedForwardYears(rows = []) {
  return [...rows]
    .sort((a, b) => String(a.tax_year || "").localeCompare(String(b.tax_year || "")))
    .map((row, index, sorted) => {
      const previous = index > 0 ? sorted[index - 1] : null;
      const broughtForwardAmount = index > 0
        ? toMoneyNumber(previous?.carried_forward_amount)
        : toMoneyNumber(row.brought_forward_amount);
      return calculateCarriedForwardFinanceCost({
        broughtForwardAmount,
        financeCostsThisYear: row.finance_costs_this_year || row.financeCostsThisYear,
        usedAmount: row.used_amount,
      });
    });
}
