import { TAX_TOOL_DISCLAIMER, formatCurrency, toMoney } from "./shared";

type TaxBand = { from: number; to: number; rate: number };
type SimpleTaxBands = {
  taxYear: string;
  personalAllowance: number;
  basicRateLimit: number;
  higherRateLimit: number;
  rates: TaxBand[];
};

export type Section24Input = {
  employmentIncome?: number;
  rentalIncome?: number;
  nonFinanceExpenses?: number;
  financeCosts?: number;
  taxYear?: string;
};

const SIMPLE_TAX_BANDS_BY_YEAR: Record<string, SimpleTaxBands> = {
  "2024/25": {
    taxYear: "2024/25",
    personalAllowance: 12570,
    basicRateLimit: 50270,
    higherRateLimit: 125140,
    rates: [
      { from: 0, to: 12570, rate: 0 },
      { from: 12570, to: 50270, rate: 0.2 },
      { from: 50270, to: 125140, rate: 0.4 },
      { from: 125140, to: Infinity, rate: 0.45 },
    ],
  },
  "2025/26": {
    taxYear: "2025/26",
    personalAllowance: 12570,
    basicRateLimit: 50270,
    higherRateLimit: 125140,
    rates: [
      { from: 0, to: 12570, rate: 0 },
      { from: 12570, to: 50270, rate: 0.2 },
      { from: 50270, to: 125140, rate: 0.4 },
      { from: 125140, to: Infinity, rate: 0.45 },
    ],
  },
  "2026/27": {
    taxYear: "2026/27",
    personalAllowance: 12570,
    basicRateLimit: 50270,
    higherRateLimit: 125140,
    rates: [
      { from: 0, to: 12570, rate: 0 },
      { from: 12570, to: 50270, rate: 0.2 },
      { from: 50270, to: 125140, rate: 0.4 },
      { from: 125140, to: Infinity, rate: 0.45 },
    ],
  },
};

export function getUkTaxBandsForSimpleEstimate(taxYear = "2026/27") {
  return SIMPLE_TAX_BANDS_BY_YEAR[taxYear] || SIMPLE_TAX_BANDS_BY_YEAR["2026/27"];
}

export function getAvailableSection24TaxYears() {
  return {
    years: Object.keys(SIMPLE_TAX_BANDS_BY_YEAR),
    note: "This estimate uses the same simplified non-Scottish income tax band structure for all available years.",
  };
}

function estimateIncomeTax(income: number, bands: SimpleTaxBands) {
  const taxableIncome = Math.max(0, income);
  return bands.rates.reduce((tax, band) => {
    const upper = Number.isFinite(band.to) ? band.to : taxableIncome;
    const amountInBand = Math.max(0, Math.min(taxableIncome, upper) - band.from);
    return tax + amountInBand * band.rate;
  }, 0);
}

export function getSection24Disclaimer() {
  return TAX_TOOL_DISCLAIMER;
}

export function calculateSection24Comparison(input: Section24Input = {}) {
  const employmentIncome = toMoney(input.employmentIncome);
  const rentalIncome = toMoney(input.rentalIncome);
  const nonFinanceExpenses = toMoney(input.nonFinanceExpenses);
  const financeCosts = toMoney(input.financeCosts);
  const bands = getUkTaxBandsForSimpleEstimate(input.taxYear);

  const oldTaxableRentalProfit = rentalIncome - nonFinanceExpenses - financeCosts;
  const oldTotalIncome = employmentIncome + Math.max(0, oldTaxableRentalProfit);
  const oldTax = estimateIncomeTax(oldTotalIncome, bands);

  const currentTaxableRentalProfit = rentalIncome - nonFinanceExpenses;
  const currentTotalIncome = employmentIncome + Math.max(0, currentTaxableRentalProfit);
  const currentTaxBeforeCredit = estimateIncomeTax(currentTotalIncome, bands);
  const propertyTaxBeforeCredit = Math.max(0, currentTaxBeforeCredit - estimateIncomeTax(employmentIncome, bands));
  const basicRateFinanceCostCredit = Math.min(financeCosts * 0.2, propertyTaxBeforeCredit);
  const currentTaxAfterCredit = Math.max(0, currentTaxBeforeCredit - basicRateFinanceCostCredit);
  const estimatedExtraTax = Math.max(0, currentTaxAfterCredit - oldTax);

  const warnings = [
    "This simplified calculator does not handle Scotland/Wales differences, child benefit charge, student loan, pension contributions, personal allowance tapering, ownership splits, companies, furnished holiday lettings, losses, or all Self Assessment adjustments.",
  ];

  if (oldTaxableRentalProfit < 0 && currentTaxableRentalProfit > 0) {
    warnings.push("The old-style view shows a rental loss, but the current finance-cost restriction view shows taxable property profit before finance costs.");
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
      effectiveImpactMessage:
        estimatedExtraTax > 0
          ? `This simplified view estimates an additional ${formatCurrency(estimatedExtraTax)} compared with deducting finance costs from rental profit.`
          : "This simplified view does not show an extra Section 24 impact from the inputs provided.",
    },
    warnings,
    assumptions: [
      "Uses a simple UK non-Scottish income tax estimate.",
      "Treats residential finance costs as a basic-rate tax credit estimate.",
      "Does not submit anything to HMRC and is for education only.",
    ],
  };
}

export function formatSection24Result(result: ReturnType<typeof calculateSection24Comparison>) {
  return {
    oldTaxableRentalProfit: formatCurrency(result.oldRules.taxableRentalProfit),
    currentTaxableRentalProfit: formatCurrency(result.currentRules.taxableRentalProfitBeforeFinanceCosts),
    estimatedExtraTax: formatCurrency(result.difference.estimatedExtraTax),
  };
}
