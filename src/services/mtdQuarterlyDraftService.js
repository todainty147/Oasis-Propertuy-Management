import { supabase } from "../lib/supabase";
import {
  aggregateDraftTotals,
  generatePayloadPreview,
  mapRecordsToDraftLines,
  validateDraftLines,
} from "../lib/mtd/mtdQuarterlyDraft";
import { collectMtdQuarterlyDraftSourceRecords } from "./mtdQuarterlyDraftSourceService";
import { downloadCsvBlob } from "./taxRecordsService";

export {
  aggregateDraftTotals,
  generatePayloadPreview,
  mapRecordsToDraftLines,
  validateDraftLines,
};

const DRAFT_SELECT = [
  "id", "account_id", "tax_year", "period_label", "period_start", "period_end",
  "obligation_id", "property_business_id", "income_source_id", "hmrc_connection_id",
  "status", "source_summary", "category_totals", "validation_summary", "payload_preview",
  "reviewed_by", "reviewed_at", "locked_at", "locked_by", "archived_at",
  "sandbox_submitted_at", "sandbox_submission_status", "sandbox_submission_attempt_id",
  "sandbox_submission_id", "sandbox_receipt_summary",
  "created_by", "created_at", "updated_at",
].join(", ");

const LINE_SELECT = [
  "id", "account_id", "draft_id", "source_type", "source_table", "source_id",
  "property_id", "transaction_date", "description", "amount", "direction",
  "tenaqo_category", "mtd_category", "hmrc_category_key", "include_in_draft",
  "issue_status", "issue_reason", "evidence_status", "created_at",
].join(", ");

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST404" || message.includes("relation") || message.includes("does not exist");
}

function assertEditable(draft) {
  if (["locked", "archived"].includes(draft?.status)) {
    throw new Error("This quarterly draft is locked or archived and cannot be edited.");
  }
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function listQuarterlyDrafts({ accountId, taxYear = null } = {}) {
  if (!accountId) return [];
  let query = supabase
    .from("mtd_quarterly_update_drafts")
    .select(DRAFT_SELECT)
    .eq("account_id", accountId)
    .order("period_start", { ascending: false });
  if (taxYear) query = query.eq("tax_year", taxYear);
  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function getQuarterlyDraft(draftId) {
  if (!draftId) return null;
  const { data: draft, error } = await supabase
    .from("mtd_quarterly_update_drafts")
    .select(DRAFT_SELECT)
    .eq("id", draftId)
    .maybeSingle();
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  if (!draft) return null;
  const { data: lines, error: lineError } = await supabase
    .from("mtd_quarterly_update_draft_lines")
    .select(LINE_SELECT)
    .eq("draft_id", draft.id)
    .eq("account_id", draft.account_id)
    .order("transaction_date", { ascending: true });
  if (lineError) throw lineError;
  const { data: attempts, error: attemptError } = await supabase
    .from("mtd_quarterly_submission_attempts")
    .select("id, status, submission_mode, submission_type, hmrc_submission_id, hmrc_correlation_id, hmrc_http_status, hmrc_error_code, hmrc_error_message, response_summary, submitted_at, completed_at")
    .eq("draft_id", draft.id)
    .eq("account_id", draft.account_id)
    .order("submitted_at", { ascending: false })
    .limit(5);
  if (attemptError && !isMissingBackendObject(attemptError)) throw attemptError;
  return { ...draft, lines: lines || [], submissionAttempts: attempts || [] };
}

export async function createQuarterlyDraft({
  accountId,
  taxYear,
  periodStart,
  periodEnd,
  obligationId = null,
  periodLabel = "",
} = {}) {
  if (!accountId) throw new Error("Missing account id.");
  if (!taxYear) throw new Error("Choose a tax year.");
  if (!periodStart || !periodEnd) throw new Error("Choose a draft period.");
  if (String(periodStart) > String(periodEnd)) throw new Error("Period start must be before period end.");

  const { data, error } = await supabase
    .from("mtd_quarterly_update_drafts")
    .insert({
      account_id: accountId,
      tax_year: taxYear,
      period_label: periodLabel || `${periodStart} to ${periodEnd}`,
      period_start: periodStart,
      period_end: periodEnd,
      obligation_id: obligationId || null,
      status: "draft",
    })
    .select(DRAFT_SELECT)
    .single();
  if (error) throw error;
  await writeMtdDraftAuditEvent(accountId, { draftId: data.id, eventType: "draft_created" });
  return rebuildQuarterlyDraft(data.id);
}

export async function rebuildQuarterlyDraft(draftId) {
  const draft = await getQuarterlyDraft(draftId);
  if (!draft) throw new Error("Quarterly draft not found.");
  assertEditable(draft);
  const { sourceRecords, sourceSummary, warnings } = await collectSourceRecords({
    accountId: draft.account_id,
    taxYear: draft.tax_year,
    periodStart: draft.period_start,
    periodEnd: draft.period_end,
  });
  await writeMtdDraftAuditEvent(draft.account_id, {
    draftId: draft.id,
    eventType: "source_records_collected",
    metadata: { collectedRecords: sourceRecords.length, sourceSummary },
  });
  const lines = mapRecordsToDraftLines(sourceRecords).map((line) => ({
    ...line,
    account_id: draft.account_id,
    draft_id: draft.id,
  }));
  const categoryTotals = aggregateDraftTotals(lines);
  const validationSummary = validateDraftLines(lines);
  const payloadPreview = generatePayloadPreview({ ...draft, source_summary: sourceSummary }, lines, validationSummary, categoryTotals);
  const nextStatus = validationSummary.issueCount > 0 ? "needs_review" : "draft";

  await supabase.from("mtd_quarterly_update_draft_lines").delete().eq("draft_id", draft.id).eq("account_id", draft.account_id);
  if (lines.length) {
    const { error: lineError } = await supabase.from("mtd_quarterly_update_draft_lines").insert(lines);
    if (lineError) throw lineError;
  }
  const { error: updateError } = await supabase
    .from("mtd_quarterly_update_drafts")
    .update({
      source_summary: { ...sourceSummary, warnings },
      category_totals: categoryTotals,
      validation_summary: validationSummary,
      payload_preview: payloadPreview,
      status: nextStatus,
    })
    .eq("id", draft.id)
    .eq("account_id", draft.account_id);
  if (updateError) throw updateError;
  await writeMtdDraftAuditEvent(draft.account_id, {
    draftId: draft.id,
    eventType: "draft_rebuilt",
    metadata: { lineCount: lines.length, issueCount: validationSummary.issueCount },
  });
  return getQuarterlyDraft(draft.id);
}

export async function collectSourceRecords(args) {
  return collectMtdQuarterlyDraftSourceRecords(args);
}

async function setDraftStatus(draftId, status, patch = {}, eventType) {
  const draft = await getQuarterlyDraft(draftId);
  if (!draft) throw new Error("Quarterly draft not found.");
  if (draft.status === "archived") throw new Error("Archived drafts cannot be changed.");
  if (draft.status === "locked" && status !== "archived") throw new Error("Locked drafts can only be archived.");
  const { error } = await supabase
    .from("mtd_quarterly_update_drafts")
    .update({ status, ...patch })
    .eq("id", draft.id)
    .eq("account_id", draft.account_id);
  if (error) throw error;
  await writeMtdDraftAuditEvent(draft.account_id, { draftId: draft.id, eventType });
  return getQuarterlyDraft(draft.id);
}

async function refreshDraftComputedFields(draftId) {
  const draft = await getQuarterlyDraft(draftId);
  if (!draft) throw new Error("Quarterly draft not found.");
  const lines = draft.lines || [];
  const categoryTotals = aggregateDraftTotals(lines);
  const validationSummary = validateDraftLines(lines);
  const payloadPreview = generatePayloadPreview(draft, lines, validationSummary, categoryTotals);
  const { error } = await supabase
    .from("mtd_quarterly_update_drafts")
    .update({
      category_totals: categoryTotals,
      validation_summary: validationSummary,
      payload_preview: payloadPreview,
      status: draft.status === "draft" || draft.status === "needs_review"
        ? (validationSummary.issueCount > 0 ? "needs_review" : "draft")
        : draft.status,
    })
    .eq("id", draft.id)
    .eq("account_id", draft.account_id);
  if (error) throw error;
  return getQuarterlyDraft(draft.id);
}

export function markDraftReadyForAccountant(draftId) {
  return setDraftStatus(draftId, "ready_for_accountant", {}, "draft_marked_ready");
}

export function markDraftReviewed(draftId) {
  return setDraftStatus(draftId, "reviewed", { reviewed_at: new Date().toISOString() }, "draft_reviewed");
}

export function lockDraft(draftId) {
  return setDraftStatus(draftId, "locked", { locked_at: new Date().toISOString() }, "draft_locked");
}

export function archiveDraft(draftId) {
  return setDraftStatus(draftId, "archived", { archived_at: new Date().toISOString() }, "draft_archived");
}

export async function setDraftLineIncluded(draftId, lineId, includeInDraft) {
  const draft = await getQuarterlyDraft(draftId);
  if (!draft) throw new Error("Quarterly draft not found.");
  assertEditable(draft);
  const line = draft.lines.find((row) => row.id === lineId);
  if (!line) throw new Error("Draft line not found.");
  const { error } = await supabase
    .from("mtd_quarterly_update_draft_lines")
    .update({
      include_in_draft: Boolean(includeInDraft),
      issue_status: includeInDraft ? (line.issue_status === "excluded" ? "ok" : line.issue_status) : "excluded",
    })
    .eq("id", lineId)
    .eq("draft_id", draft.id)
    .eq("account_id", draft.account_id);
  if (error) throw error;
  await writeMtdDraftAuditEvent(draft.account_id, { draftId: draft.id, eventType: includeInDraft ? "line_included" : "line_excluded" });
  return refreshDraftComputedFields(draft.id);
}

export function generateQuarterlyDraftLinesCsv(lines = []) {
  const headers = ["Date", "Property", "Description", "Source", "Source table", "Source id", "Direction", "Tenaqo category", "MTD category", "Amount", "Included", "Issue"];
  const body = lines.map((line) => [
    line.transaction_date,
    line.property_id || "",
    line.description || "",
    line.source_type,
    line.source_table || "",
    line.source_id || "",
    line.direction,
    line.tenaqo_category || "",
    line.hmrc_category_key || line.mtd_category || "",
    line.amount,
    line.include_in_draft ? "Yes" : "No",
    line.issue_status,
  ].map(csvCell).join(","));
  return [headers.join(","), ...body].join("\n");
}

export function formatHmrcSandboxReceipt(attempt = null) {
  const status = String(attempt?.status || "").toLowerCase();
  const httpStatus = Number(attempt?.hmrc_http_status || 0);
  const submissionId = attempt?.hmrc_submission_id || "";
  const readBack = String(attempt?.response_summary?.readBack || "").toLowerCase();
  const accepted = status === "success";
  return {
    accepted,
    statusLabel: accepted ? "Accepted by HMRC sandbox" : (status ? status.replaceAll("_", " ") : "Not submitted"),
    submissionReference: submissionId || (accepted && httpStatus === 204
      ? "No submission ID returned; 204 No Content accepted."
      : "Not recorded"),
    correlationId: attempt?.hmrc_correlation_id || "Not recorded",
    submittedAt: attempt?.submitted_at || "",
    readBackLabel: readBack === "succeeded" ? "Read-back verified." : (readBack ? readBack.replaceAll("_", " ") : "Not run"),
    propertyBusinessReadLabel: readBack === "succeeded" ? "Property Business read confirmed submitted data." : "Not confirmed",
  };
}

export function generateQuarterlyDraftSummaryCsv(draft) {
  const summary = draft?.validation_summary || {};
  const latestAttempt = draft?.submissionAttempts?.[0] || null;
  const receipt = formatHmrcSandboxReceipt(latestAttempt);
  const rows = [
    ["Export timestamp", new Date().toISOString()],
    ["Disclaimer", "This export is for review. It is not a tax return and has not been submitted to HMRC."],
    ["Tax year", draft?.tax_year],
    ["Period", draft?.period_label || `${draft?.period_start} to ${draft?.period_end}`],
    ["Status", draft?.status],
    ["Income total", summary.incomeTotal || 0],
    ["Expense total", summary.expenseTotal || 0],
    ["Issue count", summary.issueCount || 0],
    ["Included lines", summary.includedLines || 0],
    ["Excluded lines", summary.excludedLines || 0],
    ["Sandbox accepted status", receipt.statusLabel],
    ["Sandbox submission reference", receipt.submissionReference],
    ["HMRC correlation ID", receipt.correlationId],
    ["Read-back verification", receipt.readBackLabel],
    ["Submitted timestamp", receipt.submittedAt],
    ["Sandbox disclaimer", "Sandbox submission records do not represent a live HMRC filing."],
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function downloadQuarterlyDraftCsv(csvContent, filename) {
  downloadCsvBlob(csvContent, filename);
}

export async function exportDraftSummary(draftId) {
  const draft = await getQuarterlyDraft(draftId);
  if (!draft) throw new Error("Quarterly draft not found.");
  await writeMtdDraftAuditEvent(draft.account_id, { draftId: draft.id, eventType: "draft_exported" });
  return {
    summaryCsv: generateQuarterlyDraftSummaryCsv(draft),
    linesCsv: generateQuarterlyDraftLinesCsv(draft.lines || []),
  };
}

export async function writeMtdDraftAuditEvent(accountId, {
  draftId = null,
  eventType,
  metadata = {},
} = {}) {
  if (!accountId || !eventType) return null;
  const { data, error } = await supabase
    .from("mtd_quarterly_update_audit_events")
    .insert({
      account_id: accountId,
      draft_id: draftId,
      event_type: eventType,
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
