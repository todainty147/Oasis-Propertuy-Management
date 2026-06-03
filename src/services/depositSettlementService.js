import { supabase } from "../lib/supabase";

export const DEPOSIT_STATEMENT_DISCLAIMER =
  "This statement is an organisational record prepared in Tenaqo. It does not guarantee the outcome of any deposit dispute and does not replace legal advice. Tenaqo does not hold or process deposit funds.";

export function calculateSettlementTotals(settlement = {}) {
  const deductions = settlement.deductions || settlement.deposit_deductions || [];
  const depositHeld = Number(settlement.deposit_held_amount ?? settlement.depositHeldAmount ?? 0) || 0;
  const proposedDeductionsTotal = deductions.reduce(
    (total, deduction) => total + (Number(deduction.amount ?? deduction.claimed_amount ?? 0) || 0),
    0,
  );
  const proposedReturnAmount = depositHeld - proposedDeductionsTotal;
  const evidenceAttachedCount = deductions.filter((deduction) =>
    deduction.evidence_status === "attached" ||
    (deduction.evidenceLinks || deduction.deposit_deduction_evidence_links || []).length > 0
  ).length;
  const missingEvidenceCount = deductions.length - evidenceAttachedCount;

  return {
    depositHeldAmount: depositHeld,
    proposedDeductionsTotal,
    proposedReturnAmount,
    negativeReturnWarning: proposedReturnAmount < 0,
    needsReview: proposedReturnAmount < 0 || deductions.some((deduction) => deduction.evidence_status === "needs_review"),
    evidenceAttachedCount,
    missingEvidenceCount,
    readyForStatement: deductions.length > 0 && missingEvidenceCount === 0,
  };
}

function normalizeSettlementPayload(payload = {}) {
  const totals = calculateSettlementTotals({ ...payload, deductions: payload.deductions || [] });
  return {
    account_id: payload.accountId || payload.account_id,
    property_id: payload.propertyId || payload.property_id,
    tenant_id: payload.tenantId || payload.tenant_id || null,
    tenancy_id: payload.tenancyId || payload.tenancy_id || null,
    currency: payload.currency || "GBP",
    deposit_held_amount: Number(payload.depositHeldAmount ?? payload.deposit_held_amount ?? 0) || 0,
    proposed_deductions_total: Number(payload.proposedDeductionsTotal ?? payload.proposed_deductions_total ?? totals.proposedDeductionsTotal) || 0,
    proposed_return_amount: Number(payload.proposedReturnAmount ?? payload.proposed_return_amount ?? totals.proposedReturnAmount) || 0,
    jurisdiction: payload.jurisdiction || "UK",
    status: payload.status || "draft",
    tenant_response_status: payload.tenantResponseStatus || payload.tenant_response_status || "not_shared",
    summary: payload.summary || null,
  };
}

function normalizeDeductionPayload(payload = {}) {
  return {
    account_id: payload.accountId || payload.account_id,
    deduction_type: payload.deductionType || payload.deduction_type || "other",
    title: payload.title || "Deposit deduction",
    description: payload.description || null,
    amount: Number(payload.amount || 0),
    evidence_status: payload.evidenceStatus || payload.evidence_status || "missing",
    linked_maintenance_request_id: payload.linkedMaintenanceRequestId || payload.linked_maintenance_request_id || null,
    linked_work_order_id: payload.linkedWorkOrderId || payload.linked_work_order_id || null,
    linked_inspection_report_id: payload.linkedInspectionReportId || payload.linked_inspection_report_id || null,
    linked_evidence_item_id: payload.linkedEvidenceItemId || payload.linked_evidence_item_id || null,
    linked_document_id: payload.linkedDocumentId || payload.linked_document_id || null,
    sort_order: Number(payload.sortOrder ?? payload.sort_order ?? 0) || 0,
  };
}

function assertUnlocked(settlement) {
  if (settlement?.locked_at || settlement?.status === "locked") {
    throw new Error("Locked deposit settlements cannot be edited.");
  }
}

async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

async function refreshSettlementTotals(settlementId, settlementOverride = null) {
  const settlement = settlementOverride || await getDepositSettlement(settlementId);
  const totals = calculateSettlementTotals(settlement || {});
  const { data, error } = await supabase
    .from("deposit_settlements")
    .update({
      proposed_deductions_total: totals.proposedDeductionsTotal,
      proposed_return_amount: totals.proposedReturnAmount,
    })
    .eq("id", settlementId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

function withDeductions(settlement, deductions) {
  return {
    ...(settlement || {}),
    deductions,
    deposit_deductions: deductions,
  };
}

export async function listDepositSettlements({ accountId, propertyId, tenantId, status } = {}) {
  if (!accountId) return [];
  let query = supabase
    .from("deposit_settlements")
    .select("*, deposit_deductions(*, deposit_deduction_evidence_links(*)), properties:property_id(id,address), tenants:tenant_id(id,name,email)")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false });
  if (propertyId) query = query.eq("property_id", propertyId);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getDepositSettlement(settlementId) {
  if (!settlementId) return null;
  const { data, error } = await supabase
    .from("deposit_settlements")
    .select("*, deposit_deductions(*, deposit_deduction_evidence_links(*)), deposit_settlement_exports(*), properties:property_id(id,address), tenants:tenant_id(id,name,email)")
    .eq("id", settlementId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function createDepositSettlement(payload) {
  const row = normalizeSettlementPayload(payload);
  const { data, error } = await supabase
    .from("deposit_settlements")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  await writeDepositSettlementAuditEvent({
    accountId: row.account_id,
    settlementId: data.id,
    eventType: "settlement_created",
    metadata: { status: data.status },
  });
  return data;
}

export async function updateDepositSettlement(settlementId, payload) {
  const current = await getDepositSettlement(settlementId);
  assertUnlocked(current);
  const { data, error } = await supabase
    .from("deposit_settlements")
    .update(normalizeSettlementPayload({ ...current, ...payload }))
    .eq("id", settlementId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addDepositDeduction(settlementId, payload) {
  const settlement = await getDepositSettlement(settlementId);
  assertUnlocked(settlement);
  const row = { ...normalizeDeductionPayload(payload), settlement_id: settlementId, account_id: payload.accountId || settlement.account_id };
  const { data, error } = await supabase.from("deposit_deductions").insert(row).select().single();
  if (error) throw error;
  const existingDeductions = settlement.deposit_deductions || settlement.deductions || [];
  await refreshSettlementTotals(settlementId, withDeductions(settlement, [...existingDeductions, data]));
  await writeDepositSettlementAuditEvent({
    accountId: row.account_id,
    settlementId,
    deductionId: data.id,
    eventType: "deduction_added",
    metadata: { amount: data.amount, deduction_type: data.deduction_type },
  });
  return data;
}

export async function updateDepositDeduction(deductionId, payload) {
  const { data: current, error: loadError } = await supabase
    .from("deposit_deductions")
    .select("*, deposit_settlements!inner(id, status, locked_at, deposit_held_amount, deposit_deductions(*, deposit_deduction_evidence_links(*)))")
    .eq("id", deductionId)
    .single();
  if (loadError) throw loadError;
  assertUnlocked(current.deposit_settlements);
  const { data, error } = await supabase
    .from("deposit_deductions")
    .update(normalizeDeductionPayload({ ...current, ...payload }))
    .eq("id", deductionId)
    .select()
    .single();
  if (error) throw error;
  const existingDeductions = current.deposit_settlements?.deposit_deductions || [];
  const nextDeductions = existingDeductions.map((deduction) => deduction.id === data.id ? data : deduction);
  await refreshSettlementTotals(data.settlement_id, withDeductions(current.deposit_settlements, nextDeductions));
  await writeDepositSettlementAuditEvent({
    accountId: data.account_id,
    settlementId: data.settlement_id,
    deductionId: data.id,
    eventType: "deduction_updated",
  });
  return data;
}

export async function removeDepositDeduction(deductionId) {
  const { data: current, error: loadError } = await supabase
    .from("deposit_deductions")
    .select("*, deposit_settlements!inner(id, status, locked_at, deposit_held_amount, deposit_deductions(*, deposit_deduction_evidence_links(*)))")
    .eq("id", deductionId)
    .single();
  if (loadError) throw loadError;
  assertUnlocked(current.deposit_settlements);
  const { error } = await supabase.from("deposit_deductions").delete().eq("id", deductionId);
  if (error) throw error;
  const existingDeductions = current.deposit_settlements?.deposit_deductions || [];
  await refreshSettlementTotals(
    current.settlement_id,
    withDeductions(current.deposit_settlements, existingDeductions.filter((deduction) => deduction.id !== deductionId)),
  );
  return true;
}

export async function linkDeductionEvidence(deductionId, evidence = {}) {
  const { data: deduction, error: loadError } = await supabase
    .from("deposit_deductions")
    .select("id, account_id, settlement_id, deposit_settlements!inner(id, status, locked_at)")
    .eq("id", deductionId)
    .single();
  if (loadError) throw loadError;
  assertUnlocked(deduction.deposit_settlements);
  const { data, error } = await supabase
    .from("deposit_deduction_evidence_links")
    .insert({
      account_id: evidence.accountId || deduction.account_id,
      deduction_id: deductionId,
      evidence_type: evidence.evidenceType || evidence.evidence_type || "note",
      evidence_id: evidence.evidenceId || evidence.evidence_id || null,
      evidence_label: evidence.evidenceLabel || evidence.evidence_label || null,
      notes: evidence.notes || null,
    })
    .select()
    .single();
  if (error) throw error;
  const { error: statusError } = await supabase
    .from("deposit_deductions")
    .update({ evidence_status: "attached" })
    .eq("id", deductionId);
  if (statusError) throw statusError;
  await writeDepositSettlementAuditEvent({
    accountId: deduction.account_id,
    settlementId: deduction.settlement_id,
    deductionId,
    eventType: "evidence_linked",
    metadata: { evidence_type: data.evidence_type },
  });
  return data;
}

function normalizeStatementEvidenceLink(link = {}, deductionNumber) {
  return {
    deductionNumber,
    type: link.evidence_type || link.evidenceType || "other",
    label: link.evidence_label || link.evidenceLabel || "Evidence reference",
    notes: link.notes || "",
  };
}

export function buildDepositSettlementStatement(settlement = {}) {
  const deductions = settlement.deposit_deductions || settlement.deductions || [];
  const totals = calculateSettlementTotals({ ...settlement, deductions });
  const statementDeductions = deductions.map((deduction, index) => {
    const deductionNumber = index + 1;
    const evidenceLinks = deduction.deposit_deduction_evidence_links || deduction.evidenceLinks || [];
    return {
      number: deductionNumber,
      title: deduction.title,
      type: deduction.deduction_type,
      amount: Number(deduction.amount || 0),
      explanation: deduction.description || "",
      evidence: evidenceLinks.map((link) => normalizeStatementEvidenceLink(link, deductionNumber)),
    };
  });
  const evidenceIndex = statementDeductions
    .flatMap((deduction) => deduction.evidence)
    .map((evidenceLink, index) => ({ number: index + 1, ...evidenceLink }));

  return {
    brand: "Tenaqo",
    title: "Deposit Settlement Statement",
    property: settlement.properties?.address || settlement.property_label || settlement.property_id || "Property not recorded",
    tenant: settlement.tenants?.name || settlement.tenant_label || settlement.tenant_id || "Tenant not recorded",
    generatedAt: new Date().toISOString(),
    jurisdiction: settlement.jurisdiction || "UK",
    summary: totals,
    deductions: statementDeductions,
    evidenceIndex,
    disclaimer: DEPOSIT_STATEMENT_DISCLAIMER,
  };
}

export async function generateDepositSettlementStatement(settlementId) {
  const settlement = await getDepositSettlement(settlementId);
  if (!settlement) throw new Error("Deposit settlement not found.");
  const statement = buildDepositSettlementStatement(settlement);
  const { data, error } = await supabase
    .from("deposit_settlement_exports")
    .insert({
      account_id: settlement.account_id,
      settlement_id: settlementId,
      export_type: "pdf",
      status: "generated",
      metadata: statement,
    })
    .select()
    .single();
  if (error) throw error;
  if (settlement.status !== "locked" && settlement.status !== "archived") {
    await supabase.from("deposit_settlements").update({ status: "statement_generated" }).eq("id", settlementId);
  }
  await writeDepositSettlementAuditEvent({
    accountId: settlement.account_id,
    settlementId,
    eventType: "statement_generated",
    metadata: { export_id: data.id },
  });
  return { export: data, statement };
}

export async function lockDepositSettlement(settlementId) {
  const settlement = await getDepositSettlement(settlementId);
  const { data, error } = await supabase
    .from("deposit_settlements")
    .update({ status: "locked", tenant_response_status: "pending", locked_at: new Date().toISOString() })
    .eq("id", settlementId)
    .select()
    .single();
  if (error) throw error;
  await writeDepositSettlementAuditEvent({ accountId: settlement?.account_id, settlementId, eventType: "settlement_locked" });
  return data;
}

export async function archiveDepositSettlement(settlementId) {
  const settlement = await getDepositSettlement(settlementId);
  const { data, error } = await supabase
    .from("deposit_settlements")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", settlementId)
    .select()
    .single();
  if (error) throw error;
  await writeDepositSettlementAuditEvent({ accountId: settlement?.account_id, settlementId, eventType: "settlement_archived" });
  return data;
}

export async function writeDepositSettlementAuditEvent({
  accountId,
  settlementId = null,
  deductionId = null,
  eventType,
  metadata = {},
  userId = undefined,
} = {}) {
  if (!accountId || !eventType) return null;
  const { data, error } = await supabase
    .from("deposit_settlement_audit_events")
    .insert({
      account_id: accountId,
      settlement_id: settlementId,
      deduction_id: deductionId,
      user_id: userId === undefined ? await getCurrentUserId() : userId,
      event_type: eventType,
      metadata,
    })
    .select()
    .single();
  if (error) {
    console.warn("[deposit-settlement] audit insert failed", { accountId, settlementId, eventType, error });
    return null;
  }
  return data;
}
