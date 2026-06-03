import { listTaxRecords } from "./taxRecordsService";
import {
  listTaxCarriedForwardFinanceCosts,
  listTaxExpenseClassifications,
  listTaxFinanceCostSummaries,
} from "./taxToolsService";

function inPeriod(dateValue, start, end) {
  const date = String(dateValue || "").slice(0, 10);
  return date && (!start || date >= start) && (!end || date <= end);
}

function amountOrZero(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function taxRecordToSource(row) {
  const direction = row.record_type || "expense";
  const sourceReliability = row.review_status === "reviewed" ? "reviewed" : "needs_review";
  return {
    sourceType: "tax_record",
    sourceTable: "tax_records",
    sourceId: row.id,
    propertyId: row.property_id || null,
    date: row.record_date,
    description: row.description || "Tax record",
    amount: amountOrZero(row.amount),
    direction,
    tenaqoCategory: row.tax_category_code || (direction === "income" ? "rent_income" : ""),
    taxTreatment: row.tax_treatment,
    mtdReady: row.review_status === "reviewed",
    evidenceStatus: row.evidence_status,
    sourceReliability,
  };
}

function expenseClassificationToSource(row) {
  const reviewStatus = String(row.review_status || "manual").toLowerCase();
  const explicitlyIncluded = row.include_in_mtd === true && reviewStatus === "reviewed";
  const legacyManualReady = row.source_type === "manual" && row.mtd_ready === true && ["manual", "reviewed"].includes(reviewStatus);
  const readyForDraft = explicitlyIncluded || legacyManualReady;
  const possibleDuplicate = row.source_metadata?.possible_duplicate === true;

  return {
    sourceType: "mtd_expense_tracker",
    sourceTable: "tax_expense_classifications",
    sourceId: row.id,
    propertyId: row.property_id || null,
    date: row.expense_date,
    description: row.description || "Expense classification",
    amount: amountOrZero(row.amount),
    direction: "expense",
    tenaqoCategory: row.category || "",
    taxTreatment: row.category === "capital_improvement" || row.category === "finance_cost"
      ? "review_required"
      : (readyForDraft ? "likely_allowable" : "review_required"),
    mtdReady: readyForDraft,
    evidenceStatus: readyForDraft ? "complete" : "partial",
    sourceReliability: possibleDuplicate
      ? "possible_duplicate"
      : (readyForDraft ? "manual_ready" : "needs_review"),
  };
}

function financeSummaryToSource(row) {
  return {
    sourceType: "section24_finance_cost_summary",
    sourceTable: "tax_finance_cost_summaries",
    sourceId: row.id,
    propertyId: row.property_id || null,
    date: `${String(row.tax_year || "").slice(0, 4) || new Date().getFullYear()}-12-31`,
    description: "Section 24 finance cost summary context",
    amount: amountOrZero(row.finance_costs),
    direction: "adjustment",
    tenaqoCategory: "finance_cost",
    taxTreatment: "review_required",
    mtdReady: false,
    evidenceStatus: "partial",
    sourceReliability: "estimate_only",
  };
}

function carriedForwardToSource(row) {
  return {
    sourceType: "carried_forward_finance_cost_context",
    sourceTable: "tax_carried_forward_finance_costs",
    sourceId: row.id,
    propertyId: row.property_id || null,
    date: `${String(row.tax_year || "").slice(0, 4) || new Date().getFullYear()}-12-31`,
    description: "Carried-forward finance cost context",
    amount: amountOrZero(row.carried_forward_amount),
    direction: "adjustment",
    tenaqoCategory: "finance_cost",
    taxTreatment: "review_required",
    mtdReady: false,
    evidenceStatus: "partial",
    sourceReliability: "estimate_only",
  };
}

export async function collectMtdQuarterlyDraftSourceRecords({
  accountId,
  taxYear,
  periodStart,
  periodEnd,
} = {}) {
  if (!accountId) return { sourceRecords: [], sourceSummary: {}, warnings: ["Missing account id."] };

  const [taxRecords, expenseRows, financeRows, carriedRows] = await Promise.all([
    listTaxRecords(accountId, {
      countryCode: "GB",
      recordDateFrom: periodStart,
      recordDateTo: periodEnd,
      limit: 1000,
    }),
    listTaxExpenseClassifications(accountId, { taxYear }),
    listTaxFinanceCostSummaries(accountId, { taxYear }),
    listTaxCarriedForwardFinanceCosts(accountId, { taxYear }),
  ]);

  const sourceRecords = [
    ...taxRecords.filter((row) => inPeriod(row.record_date, periodStart, periodEnd)).map(taxRecordToSource),
    ...expenseRows.filter((row) => inPeriod(row.expense_date, periodStart, periodEnd)).map(expenseClassificationToSource),
    ...financeRows.map(financeSummaryToSource),
    ...carriedRows.map(carriedForwardToSource),
  ];

  const sourceSummary = {
    taxRecords: taxRecords.length,
    expenseTrackerRows: expenseRows.length,
    section24ContextRows: financeRows.length,
    carriedForwardContextRows: carriedRows.length,
    collectedRecords: sourceRecords.length,
    canonicalSource: "tax_records plus existing Tax Tools tables",
  };

  const warnings = [];
  if (financeRows.length) warnings.push("Section 24 finance costs are included as accountant-review context, not ordinary quarterly expenses.");
  if (carriedRows.length) warnings.push("Carried-forward finance costs are annual/accountant context and are excluded from ordinary quarterly totals.");

  return { sourceRecords, sourceSummary, warnings };
}
