// src/services/rentersRightsService.js
//
// Service layer for the Renters' Rights Readiness Pack (Phase 1).
//
// LEGAL DISCLAIMER: This module tracks operational tasks and evidence only.
// It does not provide legal advice and does not determine whether any action
// is legally valid. Users should seek advice from a qualified professional.

import { supabase } from "../lib/supabase";
import { logSecurityRelevantFailure } from "./securityFailureLogger";
import {
  runRraInfoSheetEvaluationForTenancy,
  captureAndDischargeRraInfoSheetObligation,
} from "./regulatoryProofEngineService";

// ── Bridge helpers ────────────────────────────────────────────────────────────

function deliveryMethodToEvidenceType(_method) {
  // All customer "Mark as sent" actions are landlord self-attestations.
  // No delivery receipt is independently held by Tenaqo, so all methods map
  // to manual_attestation regardless of the channel chosen.
  return "manual_attestation";
}

// Resolves a lease_id for the given task.
// Uses task.leaseId if already present (tasks created via upsertRentersRightsTask).
// Falls back to the most recently created lease for the tenant (tasks from the
// auto-sync path which omit lease_id at creation time).
async function resolveLeaseIdForTask({ accountId, task }) {
  if (task.leaseId) return task.leaseId;
  if (!task.tenantId) return null;
  const { data } = await supabase
    .from("leases")
    .select("id")
    .eq("account_id", accountId)
    .eq("tenant_id", task.tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

export function parseRrTaskRow(row) {
  if (!row) return null;
  return {
    id:              String(row.id || ""),
    accountId:       String(row.account_id || ""),
    propertyId:      row.property_id   || null,
    tenantId:        row.tenant_id     || null,
    leaseId:         row.lease_id      || null,
    requirementType: String(row.requirement_type || "renters_rights_information_sheet"),
    jurisdiction:    String(row.jurisdiction     || "GB-ENG"),
    dueDate:         row.due_date      || null,
    status:          String(row.status || "required"),
    sentAt:          row.sent_at       || null,
    sentBy:          row.sent_by       || null,
    deliveryMethod:  row.delivery_method || null,
    documentId:      row.document_id   || null,
    notes:           row.notes         || null,
    metadata:        row.metadata      || {},
    createdAt:       row.created_at    || null,
    updatedAt:       row.updated_at    || null,
    tenantName:      String(row.tenant_name      || "—"),
    propertyAddress: String(row.property_address || "—"),
  };
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function listRentersRightsTasks({
  accountId,
  status = null,
  limit  = 100,
  offset = 0,
} = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase.rpc("list_renters_rights_tasks", {
    p_account_id: accountId,
    p_status:     status,
    p_limit:      limit,
    p_offset:     offset,
  });

  if (error) {
    logSecurityRelevantFailure("list_renters_rights_tasks", { error, context: { accountId } });
    throw friendly(error, "Failed to load Renters' Rights tasks");
  }

  return (data ?? []).map(parseRrTaskRow);
}

export async function listRrAttentionItems({ accountId, limit = 20 } = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase.rpc("list_rr_attention_items", {
    p_account_id: accountId,
    p_limit:      limit,
  });

  if (error) return []; // Non-fatal — attention feed degrades gracefully
  return data ?? [];
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function upsertRentersRightsTask({
  accountId,
  propertyId      = null,
  tenantId        = null,
  leaseId         = null,
  requirementType = "renters_rights_information_sheet",
  dueDate         = "2026-05-31",
  notes           = null,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("upsert_renters_rights_task", {
    p_account_id:       accountId,
    p_property_id:      propertyId,
    p_tenant_id:        tenantId,
    p_lease_id:         leaseId,
    p_requirement_type: requirementType,
    p_due_date:         dueDate,
    p_notes:            notes,
  });

  if (error) throw friendly(error, "Failed to add Renters' Rights task");
  if (!data) throw new Error("upsert_renters_rights_task returned no data");
  return parseRrTaskRow(data);
}

export async function createRrTasksForActiveTenants({
  accountId,
  requirementType = "renters_rights_information_sheet",
  dueDate         = "2026-05-31",
} = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("create_rr_tasks_for_active_tenants", {
    p_account_id:       accountId,
    p_requirement_type: requirementType,
    p_due_date:         dueDate,
  });

  if (error) throw friendly(error, "Failed to sync tenant tasks");
  return Number(data ?? 0);
}

export async function markRrTaskSent({
  taskId,
  accountId,
  deliveryMethod,
  sentAt = null,
  notes  = null,
} = {}) {
  if (!taskId)         throw new Error("Missing taskId");
  if (!accountId)      throw new Error("Missing accountId");
  if (!deliveryMethod) throw new Error("Missing deliveryMethod");

  const { data, error } = await supabase.rpc("mark_rr_task_sent", {
    p_task_id:         taskId,
    p_account_id:      accountId,
    p_delivery_method: deliveryMethod,
    p_sent_at:         sentAt,
    p_notes:           notes,
  });

  if (error) throw friendly(error, "Failed to mark task as sent");
  if (!data) throw new Error("mark_rr_task_sent returned no data");
  return parseRrTaskRow(data);
}

export async function setRrTaskNotRequired({ taskId, accountId, notes = null } = {}) {
  if (!taskId)    throw new Error("Missing taskId");
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("set_rr_task_not_required", {
    p_task_id:    taskId,
    p_account_id: accountId,
    p_notes:      notes,
  });

  if (error) throw friendly(error, "Failed to update task status");
  if (!data) throw new Error("set_rr_task_not_required returned no data");
  return parseRrTaskRow(data);
}

export async function linkRrTaskDocument({ taskId, accountId, documentId } = {}) {
  if (!taskId)     throw new Error("Missing taskId");
  if (!accountId)  throw new Error("Missing accountId");
  if (!documentId) throw new Error("Missing documentId");

  const { data, error } = await supabase.rpc("link_rr_task_document", {
    p_task_id:     taskId,
    p_account_id:  accountId,
    p_document_id: documentId,
  });

  if (error) throw friendly(error, "Failed to link evidence document");
  if (!data) throw new Error("link_rr_task_document returned no data");
  return parseRrTaskRow(data);
}

// ── Bridge: Mark Sent → RPE obligation reconciliation ────────────────────────
//
// On "Mark as sent", atomically:
//   1. marks the task sent (mark_rr_task_sent RPC)
//   2. resolves the lease for the tenancy
//   3. runs the RRA information-sheet evaluation (client-side + 3 RPCs)
//   4. reconciles / creates the obligation_instance
//   5. captures service evidence + discharges the obligation (demo_mode = true)
//
// Returns a bridgeStatus to guide UI messaging:
//   "full"             — all steps succeeded; proof pack dropdown will show the record
//   "obligation_only"  — obligation created but service evidence capture failed
//   "not_obligated"    — evaluation ran but result was not_affected / needs_data / deferred
//   "evaluation_failed"— task marked sent; evaluation threw (DB or logic error)
//   "no_lease"         — task marked sent; no lease found for the tenant
//
// The task is always marked sent regardless of the bridge outcome.
// Does NOT claim legal proof — all records carry demo_mode = true.
// Uses authenticated supabase client only — no service_role / admin client.
export async function markRrTaskSentAndReconcileObligation({
  taskId,
  accountId,
  deliveryMethod,
  sentAt = null,
  notes = null,
} = {}) {
  // Step 1: mark the task sent (this is the primary user action; it must succeed)
  const task = await markRrTaskSent({ taskId, accountId, deliveryMethod, sentAt, notes });

  // Step 2: resolve the lease
  const leaseId = await resolveLeaseIdForTask({ accountId, task });
  if (!leaseId) {
    return { task, obligationInstanceId: null, bridgeStatus: "no_lease" };
  }

  // Step 3+4: run evaluation and reconcile obligation_instance
  let evaluationResult;
  try {
    evaluationResult = await runRraInfoSheetEvaluationForTenancy({
      accountId,
      tenancyId: leaseId,
      demoMode: true,
    });
  } catch (err) {
    return {
      task,
      obligationInstanceId: null,
      bridgeStatus:  "evaluation_failed",
      bridgeError:   err?.message || "Evaluation failed",
    };
  }

  const obligationInstanceId =
    evaluationResult?.obligation?.obligation_instance_id ?? null;

  if (!obligationInstanceId) {
    return {
      task,
      obligationInstanceId: null,
      bridgeStatus: "not_obligated",
      evaluationResult: evaluationResult?.result ?? null,
    };
  }

  // Step 5: capture service evidence + discharge (best-effort; does not block proof pack creation)
  const resolvedSentAt = sentAt || new Date().toISOString();
  try {
    await captureAndDischargeRraInfoSheetObligation({
      accountId,
      obligationInstanceId,
      officialInfoSheetIdentity: "govuk-rra-information-sheet-2025",
      serviceEvidenceTimestamp:  resolvedSentAt,
      evidenceType:              deliveryMethodToEvidenceType(deliveryMethod),
      evidenceBasis:             `Landlord recorded as sent via ${deliveryMethod}. Operational record only — not legal proof.`,
      captureSource:             "rra_task_mark_sent_bridge",
    });
    return { task, obligationInstanceId, bridgeStatus: "full" };
  } catch (err) {
    return {
      task,
      obligationInstanceId,
      bridgeStatus: "obligation_only",
      bridgeError:  err?.message || "Service evidence capture failed",
    };
  }
}

// ── Phase 2: Tenancy Review Prompts ──────────────────────────────────────────

export async function generateTenancyReviewPrompts({ accountId } = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("generate_tenancy_review_prompts", {
    p_account_id: accountId,
  });

  if (error) throw friendly(error, "Failed to generate tenancy review prompts");
  return Number(data ?? 0);
}

export async function dismissTenancyReviewPrompt({ taskId, accountId, notes = null } = {}) {
  if (!taskId)    throw new Error("Missing taskId");
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("dismiss_tenancy_review_prompt", {
    p_task_id:    taskId,
    p_account_id: accountId,
    p_notes:      notes,
  });

  if (error) throw friendly(error, "Failed to dismiss review prompt");
  if (!data) throw new Error("dismiss_tenancy_review_prompt returned no data");
  return parseRrTaskRow(data);
}

export function parseReviewPromptRow(row) {
  if (!row) return null;
  const base = parseRrTaskRow(row);
  if (!base) return null;
  return {
    ...base,
    findingType:     String(row.metadata?.finding_type || ""),
    severity:        String(row.metadata?.severity     || "info"),
    explanation:     String(row.metadata?.explanation  || ""),
    suggestedAction: String(row.metadata?.suggested_action || ""),
  };
}

// ── Phase 2: Rent Review Records ─────────────────────────────────────────────

export function parseRentReviewRow(row) {
  if (!row) return null;
  return {
    id:                   String(row.id || ""),
    accountId:            String(row.account_id || ""),
    propertyId:           row.property_id || null,
    tenantId:             row.tenant_id   || null,
    leaseId:              row.lease_id    || null,
    currentRent:          row.current_rent           != null ? Number(row.current_rent)           : null,
    proposedRent:         row.proposed_rent          != null ? Number(row.proposed_rent)          : null,
    proposedEffectiveDate:row.proposed_effective_date || null,
    lastRentReviewDate:   row.last_rent_review_date  || null,
    evidenceDocumentId:   row.evidence_document_id   || null,
    noticeDocumentId:     row.notice_document_id     || null,
    status:               String(row.status || "draft"),
    notes:                row.notes      || null,
    createdBy:            row.created_by || null,
    createdAt:            row.created_at || null,
    updatedAt:            row.updated_at || null,
    tenantName:           String(row.tenant_name      || "—"),
    propertyAddress:      String(row.property_address || "—"),
  };
}

export async function listRentReviewRecords({ accountId, status = null, limit = 100, offset = 0 } = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase.rpc("list_rent_review_records", {
    p_account_id: accountId,
    p_status:     status,
    p_limit:      limit,
    p_offset:     offset,
  });

  if (error) {
    logSecurityRelevantFailure("list_rent_review_records", { error, context: { accountId } });
    throw friendly(error, "Failed to load rent review records");
  }
  return (data ?? []).map(parseRentReviewRow);
}

export async function createRentReviewRecord({
  accountId,
  propertyId             = null,
  tenantId               = null,
  leaseId                = null,
  currentRent            = null,
  proposedRent           = null,
  proposedEffectiveDate  = null,
  lastRentReviewDate     = null,
  notes                  = null,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("create_rent_review_record", {
    p_account_id:              accountId,
    p_property_id:             propertyId,
    p_tenant_id:               tenantId,
    p_lease_id:                leaseId,
    p_current_rent:            currentRent,
    p_proposed_rent:           proposedRent,
    p_proposed_effective_date: proposedEffectiveDate,
    p_last_rent_review_date:   lastRentReviewDate,
    p_notes:                   notes,
  });

  if (error) throw friendly(error, "Failed to create rent review record");
  if (!data) throw new Error("create_rent_review_record returned no data");
  return parseRentReviewRow(data);
}

export async function updateRentReviewStatus({ recordId, accountId, status, notes = null } = {}) {
  if (!recordId)  throw new Error("Missing recordId");
  if (!accountId) throw new Error("Missing accountId");
  if (!status)    throw new Error("Missing status");

  const { data, error } = await supabase.rpc("update_rent_review_status", {
    p_record_id:  recordId,
    p_account_id: accountId,
    p_status:     status,
    p_notes:      notes,
  });

  if (error) throw friendly(error, "Failed to update rent review status");
  if (!data) throw new Error("update_rent_review_status returned no data");
  return parseRentReviewRow(data);
}

export async function linkRentReviewDocument({ recordId, accountId, documentId, docType } = {}) {
  if (!recordId)   throw new Error("Missing recordId");
  if (!accountId)  throw new Error("Missing accountId");
  if (!documentId) throw new Error("Missing documentId");
  if (!docType || !["evidence", "notice"].includes(docType)) {
    throw new Error("docType must be 'evidence' or 'notice'");
  }

  const { data, error } = await supabase.rpc("link_rent_review_document", {
    p_record_id:   recordId,
    p_account_id:  accountId,
    p_document_id: documentId,
    p_doc_type:    docType,
  });

  if (error) throw friendly(error, "Failed to link document to rent review");
  if (!data) throw new Error("link_rent_review_document returned no data");
  return parseRentReviewRow(data);
}

// ── Phase 3: Pet Requests ─────────────────────────────────────────────────────

export function parsePetRequestRow(row) {
  if (!row) return null;
  const today   = new Date().toISOString().slice(0, 10);
  const dueDate = row.decision_due_date || null;
  const openStatuses = ["received", "under_review"];
  return {
    id:                  String(row.id || ""),
    accountId:           String(row.account_id || ""),
    propertyId:          row.property_id || null,
    tenantId:            row.tenant_id   || null,
    leaseId:             row.lease_id    || null,
    jurisdiction:        String(row.jurisdiction || "GB-ENG"),
    petType:             String(row.pet_type || "other"),
    petDescription:      row.pet_description || null,
    requestDate:         row.request_date || null,
    decisionDueDate:     dueDate,
    isOverdue:           dueDate !== null && dueDate < today && openStatuses.includes(String(row.status)),
    status:              String(row.status || "received"),
    decisionDate:        row.decision_date || null,
    refusalReason:       row.refusal_reason || null,
    insuranceRequired:   Boolean(row.insurance_required),
    insuranceDocumentId: row.insurance_document_id || null,
    notes:               row.notes     || null,
    createdBy:           row.created_by || null,
    createdAt:           row.created_at || null,
    updatedAt:           row.updated_at || null,
    tenantName:          String(row.tenant_name      || "—"),
    propertyAddress:     String(row.property_address || "—"),
  };
}

export async function listPetRequests({ accountId, status = null, limit = 100, offset = 0 } = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase.rpc("list_pet_requests", {
    p_account_id: accountId,
    p_status:     status,
    p_limit:      limit,
    p_offset:     offset,
  });

  if (error) {
    logSecurityRelevantFailure("list_pet_requests", { error, context: { accountId } });
    throw friendly(error, "Failed to load pet requests");
  }
  return (data ?? []).map(parsePetRequestRow);
}

export async function createPetRequest({
  accountId,
  propertyId     = null,
  tenantId       = null,
  leaseId        = null,
  petType        = "other",
  petDescription = null,
  requestDate    = null,
  notes          = null,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!petType)   throw new Error("Missing petType");

  const { data, error } = await supabase.rpc("create_pet_request", {
    p_account_id:      accountId,
    p_property_id:     propertyId,
    p_tenant_id:       tenantId,
    p_lease_id:        leaseId,
    p_pet_type:        petType,
    p_pet_description: petDescription,
    p_request_date:    requestDate,
    p_notes:           notes,
  });

  if (error) throw friendly(error, "Failed to log pet request");
  if (!data) throw new Error("create_pet_request returned no data");
  return parsePetRequestRow(data);
}

export async function updatePetRequestStatus({
  requestId,
  accountId,
  status,
  decisionDate      = null,
  refusalReason     = null,
  insuranceRequired = null,
  notes             = null,
} = {}) {
  if (!requestId)  throw new Error("Missing requestId");
  if (!accountId)  throw new Error("Missing accountId");
  if (!status)     throw new Error("Missing status");

  const { data, error } = await supabase.rpc("update_pet_request_status", {
    p_request_id:         requestId,
    p_account_id:         accountId,
    p_status:             status,
    p_decision_date:      decisionDate,
    p_refusal_reason:     refusalReason,
    p_insurance_required: insuranceRequired,
    p_notes:              notes,
  });

  if (error) throw friendly(error, "Failed to update pet request status");
  if (!data) throw new Error("update_pet_request_status returned no data");
  return parsePetRequestRow(data);
}

export async function linkPetRequestDocument({ requestId, accountId, documentId } = {}) {
  if (!requestId)  throw new Error("Missing requestId");
  if (!accountId)  throw new Error("Missing accountId");
  if (!documentId) throw new Error("Missing documentId");

  const { data, error } = await supabase.rpc("link_pet_request_document", {
    p_request_id:  requestId,
    p_account_id:  accountId,
    p_document_id: documentId,
  });

  if (error) throw friendly(error, "Failed to link document to pet request");
  if (!data) throw new Error("link_pet_request_document returned no data");
  return parsePetRequestRow(data);
}

export async function listActiveTenantsForPetRequest({ accountId } = {}) {
  if (!accountId) return [];
  const { data } = await supabase
    .from("tenants")
    .select("id, name, property_id")
    .eq("account_id", accountId)
    .eq("status", "active")
    .order("name");
  return data ?? [];
}

export async function listPropertiesForPetRequest({ accountId } = {}) {
  if (!accountId) return [];
  const { data } = await supabase
    .from("properties")
    .select("id, address")
    .eq("account_id", accountId)
    .order("address");
  return data ?? [];
}
