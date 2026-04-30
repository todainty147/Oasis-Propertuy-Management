import { supabase } from "../lib/supabase";
import { parseComplianceItemRow, parseRpcRows } from "./rpcContracts";

const TAX_SELECT = [
  "id", "account_id", "property_id", "tenant_id",
  "title", "category", "due_date", "status",
  "reminder_window_days", "recurrence_interval_months",
  "notes", "completed_at", "last_completed_at",
  "created_at", "updated_at",
  "jurisdiction", "tax_filing_type", "deadline_date", "filed_at", "filing_reference",
].join(", ");

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

export async function listTaxItems(accountId, { jurisdiction = null } = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .rpc("list_tax_items", {
      p_account_id: accountId,
      p_jurisdiction: jurisdiction ? String(jurisdiction).toUpperCase().slice(0, 2) : null,
    });

  if (error) {
    if (error.code === "PGRST202") return _listTaxItemsDirect(accountId, { jurisdiction });
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseComplianceItemRow, "tax items");
}

async function _listTaxItemsDirect(accountId, { jurisdiction = null } = {}) {
  let query = supabase
    .from("compliance_items")
    .select(TAX_SELECT)
    .eq("account_id", accountId)
    .eq("category", "tax")
    .order("deadline_date", { ascending: true, nullsFirst: false });

  if (jurisdiction) query = query.eq("jurisdiction", String(jurisdiction).toUpperCase().slice(0, 2));

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return parseRpcRows(data ?? [], parseComplianceItemRow, "tax items");
}

export async function createTaxItem(accountId, {
  title,
  jurisdiction,
  taxFilingType = null,
  deadlineDate,
  recurrenceIntervalMonths = 0,
  notes = "",
  propertyId = null,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!String(title || "").trim()) throw new Error("Missing title");
  if (!jurisdiction) throw new Error("Missing jurisdiction");
  if (!deadlineDate) throw new Error("Missing deadline date");

  const { data, error } = await supabase
    .rpc("create_tax_item", {
      p_account_id: accountId,
      p_title: String(title).trim(),
      p_jurisdiction: String(jurisdiction).toUpperCase().slice(0, 2),
      p_deadline_date: String(deadlineDate).slice(0, 10),
      p_tax_filing_type: String(taxFilingType || "").trim() || null,
      p_recurrence_interval_months: Math.max(0, Math.min(60, Number(recurrenceIntervalMonths) || 0)),
      p_notes: String(notes || "").trim() || null,
      p_property_id: propertyId || null,
    })
    .single();

  if (error) throw error;
  return parseComplianceItemRow(data);
}

export async function markTaxItemFiled(id, accountId, {
  filedAt = null,
  filingReference = null,
} = {}) {
  if (!id) throw new Error("Missing compliance item id");
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase
    .rpc("mark_tax_item_filed", {
      p_id: id,
      p_account_id: accountId,
      p_filed_at: filedAt || null,
      p_filing_reference: String(filingReference || "").trim() || null,
    })
    .single();

  if (error) throw error;
  return parseComplianceItemRow(data);
}

export async function deleteTaxItem(id, accountId) {
  if (!id) throw new Error("Missing compliance item id");
  if (!accountId) throw new Error("Missing accountId");

  const { error } = await supabase
    .rpc("delete_tax_item", {
      p_id: id,
      p_account_id: accountId,
    });

  if (error) throw error;
}

export function deriveTaxStatus(item, today = new Date()) {
  if (item.filed_at) return "compliant";
  const raw = item.due_date || item.deadline_date;
  if (!raw) return "scheduled";
  const deadline = new Date(`${String(raw).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(deadline.getTime())) return "scheduled";
  const daysUntil = Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000);
  if (daysUntil < 0) return "overdue";
  if (daysUntil <= 30) return "upcoming";
  return "scheduled";
}

export function exportTaxItemsAsCsv(items) {
  const HEADERS = ["Title", "Jurisdiction", "Type", "Deadline", "Status", "Filed Date", "Reference"];
  const rows = items.map((item) =>
    [
      item.title,
      item.jurisdiction || "",
      item.tax_filing_type || "",
      item.deadline_date || item.due_date || "",
      deriveTaxStatus(item),
      item.filed_at ? String(item.filed_at).slice(0, 10) : "",
      item.filing_reference || "",
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = [HEADERS.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tax-readiness-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
