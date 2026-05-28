export type MtdReadinessInput = {
  propertyIncome?: number;
  selfEmploymentIncome?: number;
  usesSpreadsheets?: boolean;
  keepsReceiptsDigitally?: boolean;
  tracksExpensesByProperty?: boolean;
  usesAccountant?: boolean;
  ownsMoreThanOneRentalProperty?: boolean;
};

export function getMtdThresholdMessage(currentDate: Date | string = new Date(), qualifyingIncome = 0) {
  const income = Math.max(0, Number(qualifyingIncome) || 0);
  const year = currentDate instanceof Date ? currentDate.getFullYear() : new Date(currentDate).getFullYear();

  if (income > 50000) return `Over £50,000: prepare for 6 April 2026${year >= 2026 ? " and check your current obligations" : ""}.`;
  if (income > 30000) return "Over £30,000: prepare for 6 April 2027.";
  if (income > 20000) return "Over £20,000: prepare for 6 April 2028.";
  return "Under threshold: keep monitoring.";
}

export function getReadinessScore(input: MtdReadinessInput = {}) {
  let score = 0;
  if (!input.usesSpreadsheets) score += 20;
  if (input.keepsReceiptsDigitally) score += 25;
  if (input.tracksExpensesByProperty) score += 25;
  if (input.usesAccountant) score += 15;
  if (!input.ownsMoreThanOneRentalProperty || input.tracksExpensesByProperty) score += 15;
  return Math.min(100, score);
}

export function calculateMtdReadiness(input: MtdReadinessInput = {}) {
  const propertyIncome = Math.max(0, Number(input.propertyIncome) || 0);
  const selfEmploymentIncome = Math.max(0, Number(input.selfEmploymentIncome) || 0);
  const qualifyingIncome = propertyIncome + selfEmploymentIncome;
  const readinessScore = getReadinessScore(input);

  const nextSteps = [];
  if (input.usesSpreadsheets) nextSteps.push("Plan how spreadsheet records would move into compatible digital record keeping.");
  if (!input.keepsReceiptsDigitally) nextSteps.push("Start storing receipts and invoices digitally by property.");
  if (!input.tracksExpensesByProperty) nextSteps.push("Track income and expenses against each rental property.");
  if (!input.usesAccountant) nextSteps.push("Consider speaking to an accountant before deadlines get close.");
  if (nextSteps.length === 0) nextSteps.push("Keep reviewing thresholds and keep records tidy throughout the tax year.");

  return {
    qualifyingIncome,
    thresholdStatus: getMtdThresholdMessage(new Date(), qualifyingIncome),
    readinessScore,
    readinessLabel: readinessScore >= 75 ? "Strong digital record readiness" : readinessScore >= 45 ? "Some gaps to close" : "Needs a record-keeping plan",
    nextSteps,
  };
}
