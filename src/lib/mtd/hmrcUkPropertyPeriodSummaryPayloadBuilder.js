const SAFE_MONEY_PRECISION = 100;
const REVIEW_BLOCKING_STATUSES = new Set([
  "uncategorised",
  "missing_evidence",
  "needs_review",
  "source_estimate_only",
  "possible_duplicate",
]);

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * SAFE_MONEY_PRECISION) / SAFE_MONEY_PRECISION;
}

function sumLines(lines, predicate) {
  return roundMoney(lines.filter(predicate).reduce((total, line) => total + Number(line.amount || 0), 0));
}

function safeTaxYear(value) {
  return String(value || "").trim();
}

function collectIncludedLines(lines = []) {
  return lines.filter((line) => Boolean(line.include_in_draft));
}

export function validateUkPropertyPeriodSummaryInput({ draft, lines = [], nino, businessId } = {}) {
  const issues = [];
  const status = String(draft?.status || "").toLowerCase();
  const includedLines = collectIncludedLines(lines);

  if (!["reviewed", "locked"].includes(status)) {
    issues.push("Draft must be reviewed or locked before sandbox submission.");
  }
  if (!safeTaxYear(draft?.tax_year)) issues.push("Tax year is missing.");
  if (!isDateOnly(draft?.period_start)) issues.push("Period start date is missing or invalid.");
  if (!isDateOnly(draft?.period_end)) issues.push("Period end date is missing or invalid.");
  if (String(draft?.period_start || "") > String(draft?.period_end || "")) {
    issues.push("Period start must be before period end.");
  }
  if (!String(nino || "").trim()) issues.push("Sandbox NINO is missing.");
  if (!String(businessId || "").trim()) issues.push("UK property business ID is missing.");
  if (includedLines.length === 0) issues.push("Draft has no included income or expense lines.");

  includedLines.forEach((line) => {
    const issueStatus = String(line.issue_status || "ok").toLowerCase();
    const amount = Number(line.amount);
    if (REVIEW_BLOCKING_STATUSES.has(issueStatus)) {
      issues.push(`Included line needs review: ${line.description || line.id || "source record"}.`);
    }
    if (!Number.isFinite(amount) || amount < 0) {
      issues.push(`Included line has an invalid amount: ${line.description || line.id || "source record"}.`);
    }
    if (!["income", "expense"].includes(String(line.direction || "").toLowerCase())) {
      issues.push(`Included line has an unsupported direction: ${line.description || line.id || "source record"}.`);
    }
  });

  return [...new Set(issues)];
}

export function buildUkPropertyPeriodSummaryPayload({
  draft,
  lines = [],
  nino = "",
  businessId = "",
} = {}) {
  const validationIssues = validateUkPropertyPeriodSummaryInput({ draft, lines, nino, businessId });
  const includedLines = collectIncludedLines(lines);
  const incomeLines = includedLines.filter((line) => line.direction === "income");
  const expenseLines = includedLines.filter((line) => line.direction === "expense");
  const rentIncome = sumLines(incomeLines, (line) => (line.hmrc_category_key || line.mtd_category) === "rent_income");
  const otherIncome = sumLines(incomeLines, (line) => (line.hmrc_category_key || line.mtd_category) !== "rent_income");
  const expenseTotal = sumLines(expenseLines, () => true);
  const incomeTotal = roundMoney(rentIncome + otherIncome);

  if (incomeTotal <= 0 && expenseTotal <= 0 && validationIssues.length === 0) {
    validationIssues.push("Payload requires at least one income or expense total.");
  }

  const ukProperty = {};
  if (incomeTotal > 0) {
    ukProperty.income = {
      ...(rentIncome > 0 ? { periodAmount: roundMoney(rentIncome) } : {}),
      ...(otherIncome > 0 ? { otherIncome: roundMoney(otherIncome) } : {}),
    };
  }
  if (expenseTotal > 0) {
    ukProperty.expenses = {
      consolidatedExpenses: roundMoney(expenseTotal),
    };
  }

  const payload = {
    fromDate: draft?.period_start || null,
    toDate: draft?.period_end || null,
    ukProperty,
  };
  const categoryCount = new Set(
    includedLines.map((line) => line.hmrc_category_key || line.mtd_category || line.tenaqo_category || "uncategorised"),
  ).size;
  const payloadSummary = {
    previewOnly: false,
    submissionMode: "sandbox",
    submissionType: "uk_property_period_summary",
    tax_year: draft?.tax_year || null,
    period_start: draft?.period_start || null,
    period_end: draft?.period_end || null,
    income_total: incomeTotal,
    expense_total: expenseTotal,
    category_count: categoryCount,
    included_line_count: includedLines.length,
    issue_count: validationIssues.length,
  };

  return {
    method: "PUT",
    payload,
    payloadSummary,
    validationIssues,
  };
}
