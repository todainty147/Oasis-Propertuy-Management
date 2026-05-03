// src/services/rentersRightsService.js
//
// Service layer for the Renters' Rights Readiness Pack (Phase 1).
//
// LEGAL DISCLAIMER: This module tracks operational tasks and evidence only.
// It does not provide legal advice and does not determine whether any action
// is legally valid. Users should seek advice from a qualified professional.

import { supabase } from "../lib/supabase";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

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
