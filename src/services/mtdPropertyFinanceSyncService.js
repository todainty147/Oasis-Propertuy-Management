import { supabase } from "../lib/supabase";
import { updateTaxExpenseClassification, recordTaxToolAuditEvent } from "./taxToolsService";

export const PROPERTY_FINANCE_SOURCE_TYPE = "property_operating_expense";

const PROPERTY_EXPENSE_SELECT = [
  "id", "account_id", "property_id", "category", "expense_date", "amount", "notes",
  "created_by", "created_at", "updated_at",
].join(", ");

const MTD_CANDIDATE_SELECT = [
  "id", "account_id", "property_id", "source_type", "source_table", "source_id",
  "source_label", "source_original_category", "source_metadata", "tax_year",
  "expense_date", "amount", "description", "category", "mtd_ready", "confidence",
  "notes", "review_status", "include_in_mtd", "classification_confidence",
  "reviewed_by", "reviewed_at", "excluded_reason", "synced_at", "created_at", "updated_at",
].join(", ");

const CATEGORY_SUGGESTIONS = Object.freeze({
  mortgage: {
    suggestedCategory: "finance_cost",
    includeInMtd: false,
    reviewStatus: "needs_review",
    classificationConfidence: "accountant_review_required",
  },
  insurance: {
    suggestedCategory: "insurance",
    includeInMtd: false,
    reviewStatus: "needs_review",
    classificationConfidence: "suggested",
  },
  utilities: {
    suggestedCategory: "running_cost",
    includeInMtd: false,
    reviewStatus: "needs_review",
    classificationConfidence: "suggested",
  },
  tax: {
    suggestedCategory: "needs_review",
    includeInMtd: false,
    reviewStatus: "needs_review",
    classificationConfidence: "accountant_review_required",
  },
  repairs: {
    suggestedCategory: "repairs_maintenance",
    includeInMtd: false,
    reviewStatus: "needs_review",
    classificationConfidence: "suggested",
  },
  maintenance: {
    suggestedCategory: "repairs_maintenance",
    includeInMtd: false,
    reviewStatus: "needs_review",
    classificationConfidence: "suggested",
  },
  management_fees: {
    suggestedCategory: "professional_fee",
    includeInMtd: false,
    reviewStatus: "needs_review",
    classificationConfidence: "suggested",
  },
  other: {
    suggestedCategory: "needs_review",
    includeInMtd: false,
    reviewStatus: "needs_review",
    classificationConfidence: "suggested",
  },
});

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || error?.code === "PGRST404" || message.includes("relation") || message.includes("does not exist");
}

function normalizeCategory(category) {
  const key = String(category || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key.includes("repair")) return "repairs";
  if (key.includes("maintenance")) return "maintenance";
  if (key.includes("management") || key.includes("agent")) return "management_fees";
  return CATEGORY_SUGGESTIONS[key] ? key : "other";
}

function amountOrZero(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function taxYearToRange(taxYear = "2026/27") {
  const startYear = Number(String(taxYear).slice(0, 4));
  if (!Number.isFinite(startYear)) {
    return { start: null, end: null };
  }
  return {
    start: `${startYear}-04-06`,
    end: `${startYear + 1}-04-05`,
  };
}

function compactDescription(expense) {
  const category = String(expense?.category || "Operating expense").replace(/_/g, " ");
  const notes = String(expense?.notes || "").trim();
  return notes || `${category.charAt(0).toUpperCase()}${category.slice(1)} from Property Finance`;
}

function sameDateOrClose(left, right) {
  const leftTime = Date.parse(`${String(left || "").slice(0, 10)}T00:00:00Z`);
  const rightTime = Date.parse(`${String(right || "").slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return false;
  return Math.abs(leftTime - rightTime) <= 3 * 24 * 60 * 60 * 1000;
}

function textSimilarityHint(left, right) {
  const a = String(left || "").toLowerCase();
  const b = String(right || "").toLowerCase();
  if (!a || !b) return false;
  return a.includes(b.slice(0, 16)) || b.includes(a.slice(0, 16));
}

function isPossibleMtdDuplicate(row, candidate) {
  const amount = amountOrZero(candidate.amount);
  const description = compactDescription(candidate);
  return (
    row.source_id !== candidate.id
    && Math.abs(amountOrZero(row.amount) - amount) < 0.01
    && sameDateOrClose(row.expense_date, candidate.expense_date)
    && (
      row.category === candidate.suggestedCategory
      || textSimilarityHint(row.description, description)
      || textSimilarityHint(row.source_original_category, candidate.category)
    )
  );
}

export function mapPropertyFinanceCategoryToMtdSuggestion(expense = {}) {
  const key = normalizeCategory(expense.category);
  return {
    originalCategory: String(expense.category || "other"),
    normalizedCategory: key,
    ...CATEGORY_SUGGESTIONS[key],
  };
}

export async function findUnsyncedPropertyOperatingExpenses({ accountId, propertyId = null, taxYear = "2026/27" } = {}) {
  if (!accountId) return { expenses: [], syncedRows: [] };
  const { start, end } = taxYearToRange(taxYear);

  let expenseQuery = supabase
    .from("property_operating_expenses")
    .select(PROPERTY_EXPENSE_SELECT)
    .eq("account_id", accountId)
    .order("expense_date", { ascending: false });
  if (propertyId) expenseQuery = expenseQuery.eq("property_id", propertyId);
  if (start) expenseQuery = expenseQuery.gte("expense_date", start);
  if (end) expenseQuery = expenseQuery.lte("expense_date", end);

  const [expenseResult, syncedResult] = await Promise.all([
    expenseQuery,
    supabase
      .from("tax_expense_classifications")
      .select("id, source_id, source_type")
      .eq("account_id", accountId)
      .eq("source_type", PROPERTY_FINANCE_SOURCE_TYPE),
  ]);

  if (expenseResult.error) {
    if (isMissingBackendObject(expenseResult.error)) return { expenses: [], syncedRows: [] };
    throw expenseResult.error;
  }
  if (syncedResult.error) {
    if (isMissingBackendObject(syncedResult.error)) return { expenses: expenseResult.data || [], syncedRows: [] };
    throw syncedResult.error;
  }

  const syncedSourceIds = new Set((syncedResult.data || []).map((row) => row.source_id).filter(Boolean));
  return {
    expenses: (expenseResult.data || []).filter((row) => !syncedSourceIds.has(row.id)),
    syncedRows: syncedResult.data || [],
  };
}

async function fetchMtdClassificationsForDuplicateComparison({ accountId, propertyId = null, taxYear = "2026/27" } = {}) {
  if (!accountId) return [];
  let query = supabase
    .from("tax_expense_classifications")
    .select(MTD_CANDIDATE_SELECT)
    .eq("account_id", accountId)
    .eq("tax_year", taxYear);
  if (propertyId) query = query.eq("property_id", propertyId);

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }

  return data || [];
}

export async function detectPossibleMtdDuplicates({ accountId, candidate, existingRows = null } = {}) {
  if (!accountId || !candidate) return [];
  const comparisonRows = Array.isArray(existingRows)
    ? existingRows
    : await fetchMtdClassificationsForDuplicateComparison({
      accountId,
      propertyId: candidate.property_id,
      taxYear: candidate.taxYear || candidate.tax_year || "2026/27",
    });

  return comparisonRows
    .filter((row) => !candidate.property_id || row.property_id === candidate.property_id)
    .filter((row) => isPossibleMtdDuplicate(row, candidate));
}

export async function previewPropertyFinanceSync({ accountId, propertyId = null, taxYear = "2026/27" } = {}) {
  const { expenses, syncedRows } = await findUnsyncedPropertyOperatingExpenses({ accountId, propertyId, taxYear });
  const comparisonRows = await fetchMtdClassificationsForDuplicateComparison({ accountId, propertyId, taxYear });
  const candidates = [];
  let duplicateCount = 0;

  for (const expense of expenses) {
    const suggestion = mapPropertyFinanceCategoryToMtdSuggestion(expense);
    const duplicateRows = await detectPossibleMtdDuplicates({
      accountId,
      candidate: { ...expense, taxYear, suggestedCategory: suggestion.suggestedCategory },
      existingRows: comparisonRows,
    });
    if (duplicateRows.length) duplicateCount += 1;
    candidates.push({
      ...expense,
      taxYear,
      description: compactDescription(expense),
      suggestion,
      possibleDuplicate: duplicateRows.length > 0,
      duplicateRecordIds: duplicateRows.map((row) => row.id),
    });
  }

  await writeMtdSyncAuditEvent(accountId, {
    action: "property_finance_sync_previewed",
    metadata: { propertyId, taxYear, candidates: candidates.length, possibleDuplicates: duplicateCount },
  });

  return {
    taxYear,
    propertyId,
    totalFound: expenses.length + syncedRows.length,
    alreadySyncedCount: syncedRows.length,
    newCandidateCount: candidates.length,
    possibleDuplicateCount: duplicateCount,
    skippedCount: 0,
    candidates,
  };
}

export async function syncPropertyFinanceToMtdCandidates({
  accountId,
  propertyId = null,
  taxYear = "2026/27",
  selectedSourceIds = [],
  preview = null,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  const resolvedPreview = preview || await previewPropertyFinanceSync({ accountId, propertyId, taxYear });
  const selected = new Set((selectedSourceIds || []).map(String));
  const candidates = resolvedPreview.candidates.filter((candidate) => selected.size === 0 || selected.has(String(candidate.id)));

  if (!candidates.length) return [];

  const rows = candidates.map((candidate) => {
    const suggestion = candidate.suggestion || mapPropertyFinanceCategoryToMtdSuggestion(candidate);
    return {
      account_id: accountId,
      property_id: candidate.property_id,
      source_type: PROPERTY_FINANCE_SOURCE_TYPE,
      source_table: "property_operating_expenses",
      source_id: candidate.id,
      source_label: "Property Finance",
      source_original_category: candidate.category,
      source_metadata: {
        possible_duplicate: Boolean(candidate.possibleDuplicate),
        duplicate_record_ids: candidate.duplicateRecordIds || [],
      },
      tax_year: taxYear,
      expense_date: String(candidate.expense_date).slice(0, 10),
      amount: amountOrZero(candidate.amount),
      description: candidate.description || compactDescription(candidate),
      category: suggestion.suggestedCategory,
      mtd_ready: false,
      confidence: "source_sync_candidate",
      notes: candidate.notes || null,
      review_status: "needs_review",
      include_in_mtd: false,
      classification_confidence: suggestion.classificationConfidence,
      synced_at: new Date().toISOString(),
    };
  });

  const { data, error } = await supabase
    .from("tax_expense_classifications")
    .upsert(rows, { onConflict: "account_id,source_type,source_id", ignoreDuplicates: true })
    .select(MTD_CANDIDATE_SELECT);
  if (error) throw error;

  await Promise.all((data || []).map((row) => writeMtdSyncAuditEvent(accountId, {
    action: row.source_metadata?.possible_duplicate
      ? "property_finance_candidate_duplicate_flagged"
      : "property_finance_candidate_created",
    entityId: row.id,
    metadata: {
      source_type: row.source_type,
      source_id: row.source_id,
      property_id: row.property_id,
      new_category: row.category,
      include_in_mtd: row.include_in_mtd,
      review_status: row.review_status,
    },
  })));

  return data || [];
}

export async function markMtdCandidateReviewed(recordId, payload = {}) {
  const data = await updateTaxExpenseClassification(recordId, {
    ...payload,
    reviewStatus: payload.reviewStatus || "reviewed",
    classificationConfidence: payload.classificationConfidence || "landlord_confirmed",
    mtdReady: payload.mtdReady ?? Boolean(payload.includeInMtd),
    markReviewed: true,
  });
  await writeMtdSyncAuditEvent(data?.account_id, {
    action: "mtd_candidate_reviewed",
    entityId: data?.id,
    metadata: {
      source_type: data?.source_type,
      source_id: data?.source_id,
      property_id: data?.property_id,
      new_category: data?.category,
      include_in_mtd: data?.include_in_mtd,
      review_status: data?.review_status,
    },
  });
  return data;
}

export function includeMtdCandidate(recordId) {
  return markMtdCandidateReviewed(recordId, {
    reviewStatus: "reviewed",
    includeInMtd: true,
    mtdReady: true,
    classificationConfidence: "landlord_confirmed",
    excludedReason: null,
  }).then(async (data) => {
    await writeMtdSyncAuditEvent(data?.account_id, {
      action: "mtd_candidate_included",
      entityId: data?.id,
      metadata: {
        source_type: data?.source_type,
        source_id: data?.source_id,
        property_id: data?.property_id,
        new_category: data?.category,
        include_in_mtd: true,
        review_status: "reviewed",
      },
    });
    return data;
  });
}

export async function excludeMtdCandidate(recordId, reason = "Excluded by landlord review") {
  const data = await updateTaxExpenseClassification(recordId, {
    reviewStatus: "excluded",
    includeInMtd: false,
    mtdReady: false,
    classificationConfidence: "landlord_confirmed",
    excludedReason: reason,
    markReviewed: true,
  });
  await writeMtdSyncAuditEvent(data?.account_id, {
    action: "mtd_candidate_excluded",
    entityId: data?.id,
    metadata: {
      source_type: data?.source_type,
      source_id: data?.source_id,
      property_id: data?.property_id,
      include_in_mtd: false,
      review_status: "excluded",
      excluded_reason: reason,
    },
  });
  return data;
}

export function syncPropertyFinanceBackfill({ accountId, taxYear, propertyId = null, selectedSourceIds = [] } = {}) {
  return syncPropertyFinanceToMtdCandidates({ accountId, propertyId, taxYear, selectedSourceIds });
}

export async function writeMtdSyncAuditEvent(accountId, {
  action,
  entityId = null,
  metadata = {},
} = {}) {
  return recordTaxToolAuditEvent(accountId, {
    action,
    entityType: "tax_expense_classifications",
    entityId,
    metadata,
  });
}
