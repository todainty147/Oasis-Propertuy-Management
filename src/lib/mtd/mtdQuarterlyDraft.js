import {
  aggregateDraftLinesByCategory,
  getCategoryMappingIssue,
  mapRecordToHmrcCategoryKey,
  mapTenaqoCategoryToMtdCategory,
  normalizeTenaqoTaxCategory,
} from "./mtdCategoryMapping";

const REVIEW_ONLY_CATEGORIES = new Set([
  "capital_improvement",
  "finance_cost",
  "mixed_use_review",
  "needs_accountant_review",
  "needs_review",
]);

const SECRET_KEY_PATTERN = /(token|secret|password|authorization|client_secret|access_token|refresh_token)/i;

function isValidDateOnly(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function safeTransactionDate(value) {
  const text = String(value || "").slice(0, 10);
  return isValidDateOnly(text) ? text : new Date().toISOString().slice(0, 10);
}

function sanitizePreviewValue(value) {
  if (Array.isArray(value)) return value.map((item) => sanitizePreviewValue(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SECRET_KEY_PATTERN.test(key))
      .map(([key, nextValue]) => [key, sanitizePreviewValue(nextValue)]),
  );
}

function shouldIncludeDraftLine(record, issueStatus) {
  const category = normalizeTenaqoTaxCategory(record.tenaqoCategory);
  if (["evidence", "adjustment"].includes(record.direction)) return false;
  if (["source_estimate_only", "excluded"].includes(issueStatus)) return false;
  if (REVIEW_ONLY_CATEGORIES.has(category)) return false;
  return true;
}

export function mapRecordsToDraftLines(records = []) {
  return records.map((record) => {
    const mappingIssue = getCategoryMappingIssue(record);
    let issueStatus = mappingIssue.issueStatus;
    let issueReason = mappingIssue.reason;
    const amount = Number(record.amount);
    const hasValidAmount = Number.isFinite(amount);
    const hasValidDate = isValidDateOnly(record.date);

    if (record.sourceReliability === "estimate_only") {
      issueStatus = "source_estimate_only";
      issueReason = "This is a summary or estimate-only source and should be reviewed before use.";
    } else if (!hasValidDate) {
      issueStatus = "needs_review";
      issueReason = "This source date is missing or invalid.";
    } else if (record.evidenceStatus === "missing" && issueStatus === "ok") {
      issueStatus = "missing_evidence";
      issueReason = "Evidence is missing or incomplete for this source record.";
    } else if (!record.propertyId && ["income", "expense"].includes(record.direction) && issueStatus === "ok") {
      issueStatus = "needs_review";
      issueReason = "Add a property link before relying on this quarterly draft line.";
    }
    if (!hasValidAmount) {
      issueStatus = "needs_review";
      issueReason = "This source amount is missing or invalid.";
    }
    const includeInDraft = shouldIncludeDraftLine(record, issueStatus);
    return {
      source_type: record.sourceType || "unknown",
      source_table: record.sourceTable || null,
      source_id: record.sourceId || null,
      property_id: record.propertyId || null,
      transaction_date: safeTransactionDate(record.date),
      description: record.description || null,
      amount: hasValidAmount ? amount : 0,
      direction: record.direction || "expense",
      tenaqo_category: record.tenaqoCategory || null,
      mtd_category: mapTenaqoCategoryToMtdCategory(record.tenaqoCategory) || null,
      hmrc_category_key: mapRecordToHmrcCategoryKey(record) || null,
      include_in_draft: includeInDraft,
      issue_status: issueStatus,
      issue_reason: issueReason,
      evidence_status: record.evidenceStatus || null,
    };
  });
}

export function validateDraftLines(lines = []) {
  const included = lines.filter((line) => line.include_in_draft);
  const sum = (direction) => included
    .filter((line) => line.direction === direction)
    .reduce((total, line) => total + Number(line.amount || 0), 0);
  return {
    totalLines: lines.length,
    includedLines: included.length,
    excludedLines: lines.length - included.length,
    incomeTotal: sum("income"),
    expenseTotal: sum("expense"),
    adjustmentTotal: sum("adjustment"),
    issueCount: lines.filter((line) => line.issue_status && !["ok", "excluded"].includes(line.issue_status)).length,
    uncategorisedCount: lines.filter((line) => line.issue_status === "uncategorised").length,
    missingEvidenceCount: lines.filter((line) => line.issue_status === "missing_evidence").length,
    needsReviewCount: lines.filter((line) => line.issue_status === "needs_review").length,
    estimateOnlyCount: lines.filter((line) => line.issue_status === "source_estimate_only").length,
    possibleDuplicateCount: lines.filter((line) => line.issue_status === "possible_duplicate").length,
  };
}

export function aggregateDraftTotals(lines = []) {
  return aggregateDraftLinesByCategory(lines);
}

export function generatePayloadPreview(draft, lines = [], validationSummary = validateDraftLines(lines), categoryTotals = aggregateDraftTotals(lines)) {
  return {
    previewOnly: true,
    hmrcSubmissionDisabled: true,
    warning: "This is a preview only. It is not submitted to HMRC.",
    submission: {
      enabled: false,
      sandboxSubmissionEnabled: false,
      liveSubmissionEnabled: false,
    },
    period: {
      taxYear: draft?.tax_year,
      label: draft?.period_label,
      start: draft?.period_start,
      end: draft?.period_end,
      obligationId: draft?.obligation_id || null,
    },
    categoryTotals,
    validationSummary,
    sourceSummary: sanitizePreviewValue(draft?.source_summary || {}),
  };
}
