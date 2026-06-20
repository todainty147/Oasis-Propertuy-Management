const REVIEW_BLOCKING_STATUSES = new Set([
  "uncategorised",
  "missing_evidence",
  "needs_review",
  "source_estimate_only",
  "possible_duplicate",
]);

function isDateOnly(value: unknown) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function roundMoney(value: unknown) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function includedLines(lines: Record<string, unknown>[] = []) {
  return lines.filter((line) => Boolean(line.include_in_draft));
}

function lineLabel(line: Record<string, unknown>) {
  return String(line.description || line.id || "source record");
}

export function validateUkPropertyPeriodSummaryInput({
  draft,
  lines = [],
  nino,
  businessId,
}: {
  draft?: Record<string, unknown> | null;
  lines?: Record<string, unknown>[];
  nino?: string;
  businessId?: string;
}) {
  const issues: string[] = [];
  const status = String(draft?.status || "").toLowerCase();
  const rows = includedLines(lines);

  if (!["reviewed", "locked"].includes(status)) issues.push("Draft must be reviewed or locked before sandbox submission.");
  if (!String(draft?.tax_year || "").trim()) issues.push("Tax year is missing.");
  if (!isDateOnly(draft?.period_start)) issues.push("Period start date is missing or invalid.");
  if (!isDateOnly(draft?.period_end)) issues.push("Period end date is missing or invalid.");
  if (String(draft?.period_start || "") > String(draft?.period_end || "")) issues.push("Period start must be before period end.");
  if (!String(nino || "").trim()) issues.push("Sandbox NINO is missing.");
  if (!String(businessId || "").trim()) issues.push("UK property business ID is missing.");
  if (rows.length === 0) issues.push("Draft has no included income or expense lines.");

  rows.forEach((line) => {
    const issueStatus = String(line.issue_status || "ok").toLowerCase();
    const amount = Number(line.amount);
    const direction = String(line.direction || "").toLowerCase();
    if (REVIEW_BLOCKING_STATUSES.has(issueStatus)) issues.push(`Included line needs review: ${lineLabel(line)}.`);
    if (!Number.isFinite(amount) || amount < 0) issues.push(`Included line has an invalid amount: ${lineLabel(line)}.`);
    if (!["income", "expense"].includes(direction)) issues.push(`Included line has an unsupported direction: ${lineLabel(line)}.`);
    if (!String(line.source_type || "").trim() || !String(line.source_table || "").trim() || !String(line.source_id || "").trim()) {
      issues.push(`Included line has no digital source provenance: ${lineLabel(line)}.`);
    }
  });

  return [...new Set(issues)];
}

function sumLines(lines: Record<string, unknown>[], predicate: (line: Record<string, unknown>) => boolean) {
  return roundMoney(lines.filter(predicate).reduce((total, line) => total + Number(line.amount || 0), 0));
}

export function buildUkPropertyPeriodSummaryPayload({
  draft,
  lines = [],
  nino = "",
  businessId = "",
}: {
  draft?: Record<string, unknown> | null;
  lines?: Record<string, unknown>[];
  nino?: string;
  businessId?: string;
}) {
  const validationIssues = validateUkPropertyPeriodSummaryInput({ draft, lines, nino, businessId });
  const rows = includedLines(lines);
  const incomeRows = rows.filter((line) => line.direction === "income");
  const expenseRows = rows.filter((line) => line.direction === "expense");
  const rentIncome = sumLines(incomeRows, (line) => (line.hmrc_category_key || line.mtd_category) === "rent_income");
  const otherIncome = sumLines(incomeRows, (line) => (line.hmrc_category_key || line.mtd_category) !== "rent_income");
  const expenseTotal = sumLines(expenseRows, () => true);
  const incomeTotal = roundMoney(rentIncome + otherIncome);

  if (incomeTotal <= 0 && expenseTotal <= 0 && validationIssues.length === 0) {
    validationIssues.push("Payload requires at least one income or expense total.");
  }

  const ukProperty: Record<string, unknown> = {};
  if (incomeTotal > 0) {
    ukProperty.income = {
      ...(rentIncome > 0 ? { periodAmount: roundMoney(rentIncome) } : {}),
      ...(otherIncome > 0 ? { otherIncome: roundMoney(otherIncome) } : {}),
    };
  }
  if (expenseTotal > 0) {
    ukProperty.expenses = { consolidatedExpenses: roundMoney(expenseTotal) };
  }

  const categoryCount = new Set(rows.map((line) => line.hmrc_category_key || line.mtd_category || line.tenaqo_category || "uncategorised")).size;
  return {
    method: "PUT",
    payload: {
      fromDate: draft?.period_start || null,
      toDate: draft?.period_end || null,
      ukProperty,
    },
    payloadSummary: {
      previewOnly: false,
      submissionMode: "sandbox",
      submissionType: draft?.draft_type === "amendment"
        ? "uk_property_quarterly_amendment"
        : "uk_property_period_summary",
      tax_year: draft?.tax_year || null,
      period_start: draft?.period_start || null,
      period_end: draft?.period_end || null,
      income_total: incomeTotal,
      expense_total: expenseTotal,
      category_count: categoryCount,
      included_line_count: rows.length,
      issue_count: validationIssues.length,
    },
    validationIssues,
  };
}
