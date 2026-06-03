import { supabase } from "../lib/supabase";
import { downloadCsvBlob } from "./taxRecordsService";

const EXPENSE_SELECT = [
  "id", "account_id", "property_id", "source_type", "source_id",
  "source_table", "source_label", "source_original_category", "source_metadata",
  "tax_year", "expense_date", "amount", "description", "category",
  "mtd_ready", "confidence", "notes", "review_status", "include_in_mtd",
  "classification_confidence", "reviewed_by", "reviewed_at", "excluded_reason",
  "synced_at", "created_by", "created_at", "updated_at",
].join(", ");

const FINANCE_SELECT = [
  "id", "account_id", "property_id", "tax_year",
  "rental_income", "non_finance_expenses", "finance_costs",
  "taxable_property_profit_before_finance", "estimated_basic_rate_credit",
  "estimated_unused_finance_costs", "created_by", "created_at", "updated_at",
].join(", ");

const CARRIED_FORWARD_SELECT = [
  "id", "account_id", "property_id", "tax_year",
  "brought_forward_amount", "finance_costs_this_year", "used_amount",
  "carried_forward_amount", "notes", "created_by", "created_at", "updated_at",
].join(", ");

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST404" || message.includes("relation") || message.includes("does not exist");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function listTaxExpenseClassifications(accountId, { taxYear = null } = {}) {
  if (!accountId) return [];
  let query = supabase
    .from("tax_expense_classifications")
    .select(EXPENSE_SELECT)
    .eq("account_id", accountId)
    .order("expense_date", { ascending: false });
  if (taxYear) query = query.eq("tax_year", taxYear);

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function createTaxExpenseClassification(accountId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!payload.expenseDate) throw new Error("Missing expense date");
  if (!String(payload.description || "").trim()) throw new Error("Missing description");

  const row = {
    account_id: accountId,
    property_id: payload.propertyId || null,
    source_type: payload.sourceType || "manual",
    source_table: payload.sourceTable || null,
    source_id: payload.sourceId || null,
    source_label: payload.sourceLabel || null,
    source_original_category: payload.sourceOriginalCategory || null,
    source_metadata: payload.sourceMetadata || {},
    tax_year: payload.taxYear || "2026/27",
    expense_date: String(payload.expenseDate).slice(0, 10),
    amount: Number(payload.amount) || 0,
    description: String(payload.description || "").trim(),
    category: payload.category || "needs_review",
    mtd_ready: Boolean(payload.mtdReady),
    confidence: payload.confidence || "manual",
    review_status: payload.reviewStatus || (payload.mtdReady ? "reviewed" : "manual"),
    include_in_mtd: Boolean(payload.includeInMtd ?? payload.mtdReady),
    classification_confidence: payload.classificationConfidence || (payload.mtdReady ? "landlord_confirmed" : null),
    reviewed_at: payload.mtdReady ? new Date().toISOString() : null,
    notes: String(payload.notes || "").trim() || null,
  };

  const { data, error } = await supabase
    .from("tax_expense_classifications")
    .insert(row)
    .select(EXPENSE_SELECT)
    .single();
  if (error) throw error;
  await recordTaxToolAuditEvent(accountId, {
    action: "tax_expense_classification.created",
    entityType: "tax_expense_classifications",
    entityId: data?.id,
    metadata: { taxYear: row.tax_year, category: row.category },
  });
  return data;
}

export async function updateTaxExpenseClassification(recordId, payload = {}) {
  if (!recordId) throw new Error("Missing recordId");
  const row = {};

  if (payload.category != null) row.category = payload.category;
  if (payload.mtdReady != null) row.mtd_ready = Boolean(payload.mtdReady);
  if (payload.includeInMtd != null) row.include_in_mtd = Boolean(payload.includeInMtd);
  if (payload.reviewStatus != null) row.review_status = payload.reviewStatus;
  if (payload.classificationConfidence != null) row.classification_confidence = payload.classificationConfidence;
  if (payload.excludedReason !== undefined) row.excluded_reason = String(payload.excludedReason || "").trim() || null;
  if (payload.notes !== undefined) row.notes = String(payload.notes || "").trim() || null;
  if (payload.markReviewed) row.reviewed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("tax_expense_classifications")
    .update(row)
    .eq("id", recordId)
    .select(EXPENSE_SELECT)
    .single();
  if (error) throw error;

  await recordTaxToolAuditEvent(data?.account_id, {
    action: "tax_expense_classification.updated",
    entityType: "tax_expense_classifications",
    entityId: data?.id,
    metadata: {
      category: data?.category,
      include_in_mtd: data?.include_in_mtd,
      review_status: data?.review_status,
      source_type: data?.source_type,
      source_id: data?.source_id,
    },
  });
  return data;
}

export async function listTaxFinanceCostSummaries(accountId, { taxYear = null } = {}) {
  if (!accountId) return [];
  let query = supabase
    .from("tax_finance_cost_summaries")
    .select(FINANCE_SELECT)
    .eq("account_id", accountId)
    .order("tax_year", { ascending: false });
  if (taxYear) query = query.eq("tax_year", taxYear);

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function upsertTaxFinanceCostSummary(accountId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  const row = {
    account_id: accountId,
    property_id: payload.propertyId || null,
    tax_year: payload.taxYear || "2026/27",
    rental_income: Number(payload.rentalIncome) || 0,
    non_finance_expenses: Number(payload.nonFinanceExpenses) || 0,
    finance_costs: Number(payload.financeCosts) || 0,
    taxable_property_profit_before_finance: Number(payload.taxablePropertyProfitBeforeFinance) || 0,
    estimated_basic_rate_credit: Number(payload.estimatedBasicRateCredit) || 0,
    estimated_unused_finance_costs: Number(payload.estimatedUnusedFinanceCosts) || 0,
  };

  const { data, error } = await supabase
    .from("tax_finance_cost_summaries")
    .upsert(row, { onConflict: "account_id,property_id,tax_year" })
    .select(FINANCE_SELECT)
    .single();
  if (error) throw error;
  await recordTaxToolAuditEvent(accountId, {
    action: "tax_finance_cost_summary.upserted",
    entityType: "tax_finance_cost_summaries",
    entityId: data?.id,
    metadata: { taxYear: row.tax_year },
  });
  return data;
}

export async function listTaxCarriedForwardFinanceCosts(accountId, { taxYear = null } = {}) {
  if (!accountId) return [];
  let query = supabase
    .from("tax_carried_forward_finance_costs")
    .select(CARRIED_FORWARD_SELECT)
    .eq("account_id", accountId)
    .order("tax_year", { ascending: true });
  if (taxYear) query = query.eq("tax_year", taxYear);

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function upsertTaxCarriedForwardFinanceCost(accountId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  const row = {
    account_id: accountId,
    property_id: payload.propertyId || null,
    tax_year: payload.taxYear || "2026/27",
    brought_forward_amount: Number(payload.broughtForwardAmount) || 0,
    finance_costs_this_year: Number(payload.financeCostsThisYear) || 0,
    used_amount: Number(payload.usedAmount) || 0,
    carried_forward_amount: Number(payload.carriedForwardAmount) || 0,
    notes: String(payload.notes || "").trim() || null,
  };

  const { data, error } = await supabase
    .from("tax_carried_forward_finance_costs")
    .upsert(row, { onConflict: "account_id,property_id,tax_year" })
    .select(CARRIED_FORWARD_SELECT)
    .single();
  if (error) throw error;
  await recordTaxToolAuditEvent(accountId, {
    action: "tax_carried_forward_finance_cost.upserted",
    entityType: "tax_carried_forward_finance_costs",
    entityId: data?.id,
    metadata: { taxYear: row.tax_year },
  });
  return data;
}

export async function recordTaxToolAuditEvent(accountId, {
  action,
  entityType = null,
  entityId = null,
  metadata = {},
} = {}) {
  if (!accountId || !action) return null;
  const { data, error } = await supabase
    .from("tax_tool_audit_log")
    .insert({
      account_id: accountId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  return data;
}

export function generateTaxExpenseClassificationsCsv(rows = []) {
  const headers = ["Date", "Tax Year", "Property", "Amount", "Category", "MTD Ready", "Description", "Notes"];
  const body = rows.map((row) => [
    row.expense_date,
    row.tax_year,
    row.property_id || "",
    row.amount,
    row.category,
    row.mtd_ready ? "Yes" : "No",
    row.description,
    row.notes || "",
  ].map(csvCell).join(","));
  return [headers.join(","), ...body].join("\n");
}

export function generateTaxFinanceCostSummariesCsv(rows = []) {
  const headers = ["Tax Year", "Property", "Rental Income", "Non-Finance Expenses", "Finance Costs", "Profit Before Finance", "Basic-Rate Credit", "Unused Finance Costs"];
  const body = rows.map((row) => [
    row.tax_year,
    row.property_id || "",
    row.rental_income,
    row.non_finance_expenses,
    row.finance_costs,
    row.taxable_property_profit_before_finance,
    row.estimated_basic_rate_credit,
    row.estimated_unused_finance_costs,
  ].map(csvCell).join(","));
  return [headers.join(","), ...body].join("\n");
}

export function generateTaxCarriedForwardCsv(rows = []) {
  const headers = ["Tax Year", "Property", "Brought Forward", "Finance Costs This Year", "Used", "Carried Forward", "Notes"];
  const body = rows.map((row) => [
    row.tax_year,
    row.property_id || "",
    row.brought_forward_amount,
    row.finance_costs_this_year,
    row.used_amount,
    row.carried_forward_amount,
    row.notes || "",
  ].map(csvCell).join(","));
  return [headers.join(","), ...body].join("\n");
}

export function downloadTaxToolsCsv(csvContent, filename) {
  downloadCsvBlob(csvContent, filename);
}
