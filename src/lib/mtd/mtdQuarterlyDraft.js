import {
  aggregateDraftLinesByCategory,
  getCategoryMappingIssue,
  mapRecordToHmrcCategoryKey,
  mapTenaqoCategoryToMtdCategory,
} from "./mtdCategoryMapping";

export function mapRecordsToDraftLines(records = []) {
  return records.map((record) => {
    const mappingIssue = getCategoryMappingIssue(record);
    let issueStatus = mappingIssue.issueStatus;
    let issueReason = mappingIssue.reason;
    if (record.sourceReliability === "estimate_only") {
      issueStatus = "source_estimate_only";
      issueReason = "This is a summary or estimate-only source and should be reviewed before use.";
    } else if (record.evidenceStatus === "missing" && issueStatus === "ok") {
      issueStatus = "missing_evidence";
      issueReason = "Evidence is missing or incomplete for this source record.";
    } else if (!record.propertyId && ["income", "expense"].includes(record.direction) && issueStatus === "ok") {
      issueStatus = "needs_review";
      issueReason = "Add a property link before relying on this quarterly draft line.";
    }
    if (!Number.isFinite(Number(record.amount))) {
      issueStatus = "needs_review";
      issueReason = "This source amount is missing or invalid.";
    }
    const includeInDraft = !["evidence", "adjustment"].includes(record.direction) && !["source_estimate_only", "excluded"].includes(issueStatus);
    return {
      source_type: record.sourceType,
      source_table: record.sourceTable || null,
      source_id: record.sourceId || null,
      property_id: record.propertyId || null,
      transaction_date: String(record.date || new Date().toISOString()).slice(0, 10),
      description: record.description || null,
      amount: Number(record.amount || 0),
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
    period: {
      taxYear: draft?.tax_year,
      label: draft?.period_label,
      start: draft?.period_start,
      end: draft?.period_end,
      obligationId: draft?.obligation_id || null,
    },
    categoryTotals,
    validationSummary,
    sourceSummary: draft?.source_summary || {},
  };
}
