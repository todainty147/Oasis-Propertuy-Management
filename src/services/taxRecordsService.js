import { supabase } from "../lib/supabase";
import { parseTaxRecordRow, parseTaxExportRow, parseRpcRows } from "./rpcContracts";

const RECORD_SELECT = [
  "id", "account_id", "property_id", "tenant_id",
  "payment_id", "document_id",
  "country_code", "record_type", "amount", "currency",
  "tax_category_code", "tax_treatment",
  "source_table", "source_id",
  "record_date", "description",
  "evidence_status", "review_status",
  "metadata", "created_at", "updated_at",
].join(", ");

const EXPORT_SELECT = [
  "id", "account_id", "country_code", "tax_mode",
  "period_label", "export_type", "status",
  "generated_by", "generated_at", "metadata", "created_at",
].join(", ");

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

// ── Period helpers ────────────────────────────────────────────────────────────

export function periodLabelToDateRange(label) {
  if (!label) return { from: null, to: null };
  const s = String(label).trim();

  // YYYY-QN
  const qMatch = s.match(/^(\d{4})-Q([1-4])$/i);
  if (qMatch) {
    const y = qMatch[1];
    const q = Number(qMatch[2]);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const endDay = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][endMonth - 1];
    return {
      from: `${y}-${String(startMonth).padStart(2, "0")}-01`,
      to:   `${y}-${String(endMonth).padStart(2, "0")}-${endDay}`,
    };
  }

  // YYYY-MM
  const mMatch = s.match(/^(\d{4})-(\d{2})$/);
  if (mMatch) {
    const y = Number(mMatch[1]);
    const m = Number(mMatch[2]);
    const endDay = new Date(y, m, 0).getDate();
    return {
      from: `${mMatch[1]}-${mMatch[2]}-01`,
      to:   `${mMatch[1]}-${mMatch[2]}-${endDay}`,
    };
  }

  // YYYY
  const yMatch = s.match(/^(\d{4})$/);
  if (yMatch) {
    return { from: `${yMatch[1]}-01-01`, to: `${yMatch[1]}-12-31` };
  }

  return { from: null, to: null };
}

// ── Tax Records ───────────────────────────────────────────────────────────────

export async function listTaxRecords(accountId, {
  countryCode = null,
  recordType = null,
  reviewStatus = null,
  recordDateFrom = null,
  recordDateTo = null,
  limit = 100,
  offset = 0,
} = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .rpc("list_tax_records", {
      p_account_id:    accountId,
      p_country_code:  countryCode  ? String(countryCode).toUpperCase().slice(0, 2) : null,
      p_record_type:   recordType   || null,
      p_review_status: reviewStatus || null,
      p_date_from:     recordDateFrom || null,
      p_date_to:       recordDateTo   || null,
      p_limit:         limit,
      p_offset:        offset,
    });
  if (error) {
    if (error.code === "PGRST202") return _listTaxRecordsDirect(accountId, { countryCode, recordType, reviewStatus, recordDateFrom, recordDateTo, limit, offset });
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseTaxRecordRow, "tax records");
}

async function _listTaxRecordsDirect(accountId, { countryCode, recordType, reviewStatus, recordDateFrom, recordDateTo, limit, offset } = {}) {
  let query = supabase
    .from("tax_records")
    .select(RECORD_SELECT)
    .eq("account_id", accountId)
    .order("record_date", { ascending: false });

  if (countryCode) query = query.eq("country_code", String(countryCode).toUpperCase().slice(0, 2));
  if (recordType) query = query.eq("record_type", recordType);
  if (reviewStatus) query = query.eq("review_status", reviewStatus);
  if (recordDateFrom) query = query.gte("record_date", recordDateFrom);
  if (recordDateTo) query = query.lte("record_date", recordDateTo);
  query = query.range(offset ?? 0, (offset ?? 0) + (limit ?? 100) - 1);

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseTaxRecordRow, "tax records");
}

export async function createTaxRecord(accountId, {
  recordType,
  countryCode,
  amount = null,
  currency = "GBP",
  taxCategoryCode = null,
  taxTreatment = "review_required",
  recordDate,
  description = "",
  evidenceStatus = "missing",
  propertyId = null,
  tenantId = null,
  paymentId = null,
  documentId = null,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!recordType) throw new Error("Missing record type");
  if (!countryCode) throw new Error("Missing country code");
  if (!recordDate) throw new Error("Missing record date");

  const { data, error } = await supabase
    .rpc("create_tax_record", {
      p_account_id: accountId,
      p_record_type: recordType,
      p_country_code: String(countryCode).toUpperCase().slice(0, 2),
      p_record_date: String(recordDate).slice(0, 10),
      p_amount: amount != null && amount !== "" ? Number(amount) : null,
      p_currency: String(currency || "GBP").toUpperCase().slice(0, 3),
      p_tax_category_code: String(taxCategoryCode || "").trim() || null,
      p_tax_treatment: taxTreatment,
      p_description: String(description || "").trim() || null,
      p_evidence_status: evidenceStatus,
      p_property_id: propertyId || null,
      p_tenant_id: tenantId || null,
      p_payment_id: paymentId || null,
      p_document_id: documentId || null,
    })
    .single();

  if (error) throw error;
  return parseTaxRecordRow(data);
}

export async function updateTaxRecordReviewStatus(id, accountId, reviewStatus) {
  if (!id) throw new Error("Missing record id");
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase
    .rpc("update_tax_record_review_status", {
      p_id: id,
      p_account_id: accountId,
      p_review_status: reviewStatus,
    })
    .single();

  if (error) throw error;
  return parseTaxRecordRow(data);
}

export async function deleteTaxRecord(id, accountId) {
  if (!id) throw new Error("Missing record id");
  if (!accountId) throw new Error("Missing accountId");

  const { error } = await supabase
    .rpc("delete_tax_record", {
      p_id: id,
      p_account_id: accountId,
    });

  if (error) throw error;
}

// ── Tax Exports ───────────────────────────────────────────────────────────────

export async function listTaxExports(accountId, { limit = 50, offset = 0 } = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .rpc("list_tax_exports", {
      p_account_id: accountId,
      p_limit:      limit,
      p_offset:     offset,
    });

  if (error) {
    if (error.code === "PGRST202") return _listTaxExportsDirect(accountId, { limit, offset });
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseTaxExportRow, "tax exports");
}

async function _listTaxExportsDirect(accountId, { limit = 50, offset = 0 } = {}) {
  const { data, error } = await supabase
    .from("tax_exports")
    .select(EXPORT_SELECT)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseTaxExportRow, "tax exports");
}

export async function recordTaxExport(accountId, {
  countryCode,
  taxMode,
  periodLabel,
  exportType = "csv",
  rowCount = 0,
}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase
    .rpc("record_tax_export", {
      p_account_id: accountId,
      p_country_code: String(countryCode || "").toUpperCase().slice(0, 2) || null,
      p_tax_mode: String(taxMode || "").trim(),
      p_period_label: String(periodLabel || "").trim(),
      p_export_type: exportType,
      p_row_count: rowCount,
    })
    .single();

  if (error) throw error;
  return parseTaxExportRow(data);
}

// ── Summary helpers ───────────────────────────────────────────────────────────

export function summariseTaxRecords(records) {
  const byCurrency = {};
  let needsReview = 0;

  for (const r of records) {
    const cur = r.currency || "GBP";
    if (!byCurrency[cur]) byCurrency[cur] = { income: 0, expenses: 0 };
    const amount = r.amount ?? 0;
    if (r.record_type === "income") byCurrency[cur].income += amount;
    if (r.record_type === "expense") byCurrency[cur].expenses += amount;
    if (r.review_status === "unreviewed") needsReview += 1;
  }

  const currencies = Object.keys(byCurrency);
  const hasMultipleCurrencies = currencies.length > 1;
  // Keep single-currency totals for backward compat; undefined when mixed
  const primaryCurrency = currencies.length === 1 ? currencies[0] : null;
  const totalIncome   = primaryCurrency ? byCurrency[primaryCurrency].income   : null;
  const totalExpenses = primaryCurrency ? byCurrency[primaryCurrency].expenses : null;

  return { byCurrency, currencies, hasMultipleCurrencies, totalIncome, totalExpenses, needsReview };
}

// ── CSV generation ────────────────────────────────────────────────────────────

export function generateTaxRecordsCsv(records, { skipExcluded = true } = {}) {
  const source = skipExcluded
    ? records.filter((r) => r.review_status !== "excluded")
    : records;
  const HEADERS = [
    "Date", "Type", "Country", "Category",
    "Amount", "Currency", "Treatment", "Review Status", "Description",
  ];
  const rows = source.map((r) =>
    [
      r.record_date || "",
      r.record_type,
      r.country_code || "",
      r.tax_category_code || "",
      r.amount != null ? r.amount : "",
      r.currency,
      r.tax_treatment,
      r.review_status,
      r.description || "",
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [HEADERS.join(","), ...rows].join("\n");
}

export function downloadCsvBlob(csvContent, filename) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
