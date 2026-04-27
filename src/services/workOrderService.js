// src/services/workOrderService.js
import { supabase } from "../lib/supabase";
import {
  assertMaxLength,
  assertPhone,
  assertRequiredText,
  normalizeText,
} from "../utils/validation";
import {
  parseAllowedActions,
  parseAllowedActionsBulkRow,
  parsePendingCancellationWorkOrderRow,
  parseRpcRows,
  parseWorkOrderAuditLogRow,
  parseWorkOrderMutationAck,
  parseWorkOrderStatusDefinitionRow,
  parseWorkOrderRow,
} from "./rpcContracts";
import { listActiveContractors } from "./contractorDirectoryService";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

function friendlyError(err, fallback) {
  return new Error(err?.message ?? fallback);
}

function friendly(err, fallback) {
  return new Error(err?.message ?? fallback);
}

function toIsoOrNull(value) {
  if (!value) return null;

  // already ISO
  if (typeof value === "string" && value.includes("T") && value.includes("Z")) {
    return value;
  }

  // datetime-local like "2026-02-07T12:30"
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return null;
  }

  // Date object
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return null;
}
/* ======================
   LIST (by property)
   ====================== */

export async function fetchWorkOrders({
  accountId,
  propertyId,
  maintenanceRequestId = null,

  // ✅ keep old behavior
  limit = 50,

  // ✅ new optional pagination
  page = undefined,       // 1-based
  pageSize = 20,          // used only when page is provided

  signal = undefined, // optional AbortSignal
} = {}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!propertyId) throw new Error("Brak propertyId");

  const baseSelect = `
    id,
    account_id,
    property_id,
    maintenance_request_id,
    contractor_user_id,
    contractor_name,
    contractor_phone,
    status,
    scheduled_at,
    notes,
    quote_amount,
    invoice_amount,
    created_by,
    created_at,
    updated_at,
    pending_cancel_request,
    last_cancel_request_at,
    last_cancel_request_by,
    last_cancel_resolution_at,
    last_cancel_resolution_action,
    last_cancel_resolution_by,
    maintenance_requests:maintenance_request_id ( id, title, status, priority )
  `;

  let q = supabase
    .from("work_orders_with_flags")
    // ✅ only ask for count when paginating (keeps old calls fast)
    .select(baseSelect, page != null ? { count: "exact" } : undefined)
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  if (maintenanceRequestId) q = q.eq("maintenance_request_id", maintenanceRequestId);

  if (page != null) {
    // ✅ Pagination mode (server-side)
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 20)); // clamp
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;
    q = q.range(from, to);
  } else {
    // ✅ Old mode (limit only)
    q = q.limit(limit);
  }

  if (signal) q = q.abortSignal(signal);

  const { data, error, count } = await q;
  if (error) throw error;
  const rows = (data ?? []).map(parseWorkOrderRow);

  if (page != null) {
    return {
      data: rows,
      count: count ?? 0,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.max(1, Math.min(200, Number(pageSize) || 20)),
    };
  }

  return rows;
}

export async function fetchWorkOrderById(id, { signal } = {}) {
  if (!id) throw new Error("Brak ID zlecenia");

  let q = supabase
    .from("work_orders_with_flags")
    .select(
      `
      id,
      account_id,
      property_id,
      maintenance_request_id,
      contractor_user_id,
      contractor_name,
      contractor_phone,
      status,
      scheduled_at,
      notes,
      quote_amount,
      invoice_amount,
      created_by,
      created_at,
      updated_at,
      pending_cancel_request,
      last_cancel_request_at,
      last_cancel_request_by,
      last_cancel_resolution_at,
      last_cancel_resolution_action,
      last_cancel_resolution_by,
      assigned_at,
      acknowledged_at,
      acknowledgement_due_at,
      acknowledgement_status,
      maintenance_requests:maintenance_request_id ( id, title, status, priority ),
      properties:property_id ( id, address, city )
      `
    )
    .eq("id", id)
    .maybeSingle();

  if (signal) q = q.abortSignal(signal);

  const { data, error } = await q;
  if (error) throw error;
  return data ? parseWorkOrderRow(data) : null;
}

export async function listWorkOrderAuditLog(workOrderId, { limit = 100, signal } = {}) {
  if (!workOrderId) return [];

  let query = supabase
    .from("work_order_audit_log")
    .select("id, work_order_id, action, actor_user_id, old_value, new_value, created_at")
    .eq("work_order_id", workOrderId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) throw error;
  return parseRpcRows(data || [], parseWorkOrderAuditLogRow, "work order audit rows");
}

export async function listWorkOrderStatusDefinitions() {
  const { data, error } = await supabase
    .from("work_order_status_definitions")
    .select("status, label");

  if (error) throw error;
  const rows = parseRpcRows(data || [], parseWorkOrderStatusDefinitionRow, "work order status definition rows");
  return Object.fromEntries(rows.map((row) => [row.status, row.label || row.status]));
}

export async function listPendingCancellationWorkOrders({
  accountId,
  propertyId = null,
  limit = 20,
} = {}) {
  if (!accountId) return [];

  let query = supabase
    .from("work_orders_pending_cancellation")
    .select(
      "id, account_id, property_id, status, contractor_name, contractor_phone, scheduled_at, last_cancel_request_at, last_cancel_request_by",
    )
    .eq("account_id", accountId)
    .order("last_cancel_request_at", { ascending: false })
    .limit(limit);

  if (propertyId) query = query.eq("property_id", propertyId);

  const { data, error } = await query;
  if (error) throw error;
  return parseRpcRows(
    data || [],
    parsePendingCancellationWorkOrderRow,
    "pending cancellation work order rows",
  );
}

export async function listAssignableContractors(accountId) {
  return listActiveContractors(accountId);
}

export async function getWorkOrderAllowedActions(workOrderId, context = {}) {
  if (!workOrderId) throw new Error("Missing workOrderId");

  const { data, error } = await supabase.rpc("work_order_allowed_actions", {
    p_work_order_id: workOrderId,
  });

  if (error) {
    logSecurityRelevantFailure("work_order_allowed_actions", {
      error,
      context: { ...context, workOrderId },
    });
    throw friendly(error, "Failed to load work order allowed actions");
  }

  return parseAllowedActions(data);
}

export async function getWorkOrderAllowedActionsBulk(workOrderIds = [], context = {}) {
  const ids = (workOrderIds ?? []).filter(Boolean);
  if (ids.length === 0) return {};

  const { data, error } = await supabase.rpc("work_order_allowed_actions_bulk", {
    p_work_order_ids: ids,
  });

  if (error) {
    logSecurityRelevantFailure("work_order_allowed_actions_bulk", {
      error,
      context: { ...context, workOrderIds: ids },
    });
    throw friendly(error, "Failed to load work order allowed actions");
  }

  const rows = parseRpcRows(data || [], parseAllowedActionsBulkRow, "work order allowed actions bulk");
  return Object.fromEntries(rows.map((row) => [row.work_order_id, row.actions]));
}

export async function setWorkOrderStatus(
  { workOrderId, newStatus, applyIfTenantAllowed = false } = {},
  context = {},
) {
  if (!workOrderId) throw new Error("Missing workOrderId");
  if (!newStatus) throw new Error("Missing newStatus");

  const { error } = await supabase.rpc("work_order_set_status", {
    p_work_order_id: workOrderId,
    p_new_status: newStatus,
    p_apply_if_tenant_allowed: applyIfTenantAllowed,
  });

  if (error) {
    logSecurityRelevantFailure("work_order_set_status", {
      error,
      context: { ...context, workOrderId, requestedStatus: newStatus },
    });
    throw friendly(error, "Failed to update work order status");
  }

  return parseWorkOrderMutationAck({
    ok: true,
    work_order_id: workOrderId,
    status: newStatus,
  });
}

export async function assignWorkOrderContractor(
  { workOrderId, contractorId } = {},
  context = {},
) {
  if (!workOrderId) throw new Error("Missing workOrderId");
  if (!contractorId) throw new Error("Missing contractorId");

  const { error } = await supabase.rpc("work_order_assign_contractor", {
    p_work_order_id: workOrderId,
    p_contractor_id: contractorId,
  });

  if (error) {
    logSecurityRelevantFailure("work_order_assign_contractor", {
      error,
      context: { ...context, workOrderId, contractorId },
    });
    throw friendly(error, "Failed to assign contractor");
  }

  return parseWorkOrderMutationAck({
    ok: true,
    work_order_id: workOrderId,
    contractor_id: contractorId,
  });
}

export async function approveWorkOrderTenantCancellation(workOrderId, context = {}) {
  if (!workOrderId) throw new Error("Missing workOrderId");

  const { error } = await supabase.rpc("work_order_approve_tenant_cancellation", {
    p_work_order_id: workOrderId,
  });

  if (error) {
    logSecurityRelevantFailure("work_order_approve_tenant_cancellation", {
      error,
      context: { ...context, workOrderId },
    });
    throw friendly(error, "Failed to approve tenant cancellation");
  }

  return parseWorkOrderMutationAck({
    ok: true,
    work_order_id: workOrderId,
    status: "cancelled",
  });
}

export async function denyWorkOrderTenantCancellation(
  { workOrderId, reason = null } = {},
  context = {},
) {
  if (!workOrderId) throw new Error("Missing workOrderId");

  const { error } = await supabase.rpc("work_order_deny_tenant_cancellation", {
    p_work_order_id: workOrderId,
    p_reason: reason,
  });

  if (error) {
    logSecurityRelevantFailure("work_order_deny_tenant_cancellation", {
      error,
      context: { ...context, workOrderId, reason },
    });
    throw friendly(error, "Failed to deny tenant cancellation");
  }

  return parseWorkOrderMutationAck({
    ok: true,
    work_order_id: workOrderId,
    reason,
  });
}
/* ======================
   CREATE (RPC-driven)
   ====================== */
/**
 * IMPORTANT:
 * Notifications are DB-driven (authoritative).
 * - work_order_create() does the creation
 * - DB triggers/functions create notifications reliably (even if client disconnects)
 */
export async function createWorkOrder({
  accountId,
  propertyId,
  maintenanceRequestId = null,

  // contractorId from `contractors.id` (not auth.users.id)
  contractorId = null,

  contractorName = null,
  contractorPhone = null,
  scheduledAt = null,
  notes = null,

  signal = undefined, // optional AbortSignal
} = {}) {
  assertRequiredText(accountId, "Missing accountId");
  assertRequiredText(propertyId, "Missing propertyId");
  assertPhone(contractorPhone, { required: false, message: "Invalid contractor phone number" });
  assertMaxLength(contractorName, 200, "Contractor name is too long");
  assertMaxLength(notes, 5000, "Notes are too long");

  const { data: workOrderId, error: rpcError } = await supabase.rpc(
    "work_order_create",
    {
      p_account_id: accountId,
      p_property_id: propertyId,
      p_maintenance_request_id: maintenanceRequestId,
      p_contractor_id: contractorId,
      p_contractor_name: normalizeText(contractorName) || null,
      p_contractor_phone: normalizeText(contractorPhone) || null,
      p_scheduled_at: toIsoOrNull(scheduledAt),
      p_notes: normalizeText(notes) || null,
    },
    signal ? { signal } : undefined
  );

  if (rpcError) throw friendlyError(rpcError, "Nie udało się utworzyć zlecenia");

  // Optional read-back for immediate UI refresh.
  // Use maybeSingle so RLS/view timing returning 0 rows doesn't throw.
  let read = supabase
    .from("work_orders_with_flags")
    .select(
      `
      id,
      account_id,
      property_id,
      maintenance_request_id,
      contractor_user_id,
      contractor_name,
      contractor_phone,
      status,
      scheduled_at,
      notes,
      quote_amount,
      invoice_amount,
      created_by,
      created_at,
      updated_at,
      pending_cancel_request,
      last_cancel_request_at,
      last_cancel_request_by,
      last_cancel_resolution_at,
      last_cancel_resolution_action,
      last_cancel_resolution_by,
      maintenance_requests:maintenance_request_id ( id, title, status, priority )
    `
    )
    .eq("id", workOrderId)
    .maybeSingle();

  if (signal) read = read.abortSignal(signal);

  const { data: row, error: readErr } = await read;

  if (readErr || !row) return { id: workOrderId };
  return parseWorkOrderRow(row);
}

/* ======================
   UPDATE
   ====================== */
/**
 * IMPORTANT:
 * If you also have DB notifications for status/assignment changes,
 * DO NOT send notifications from the client here (avoids duplicates/loops).
 */
export async function updateWorkOrder(id, patch = {}, { signal } = {}) {
  if (!id) throw new Error("Brak ID zlecenia");

  // Normalize scheduled_at if passed as a datetime-local string/Date
  const nextPatch = { ...patch };
  if ("contractor_phone" in nextPatch) {
    assertPhone(nextPatch.contractor_phone, {
      required: false,
      message: "Invalid contractor phone number",
    });
    nextPatch.contractor_phone = normalizeText(nextPatch.contractor_phone) || null;
  }
  if ("contractor_name" in nextPatch) {
    assertMaxLength(nextPatch.contractor_name, 200, "Contractor name is too long");
    nextPatch.contractor_name = normalizeText(nextPatch.contractor_name) || null;
  }
  if ("notes" in nextPatch) {
    assertMaxLength(nextPatch.notes, 5000, "Notes are too long");
    nextPatch.notes = normalizeText(nextPatch.notes) || null;
  }
  if ("scheduled_at" in nextPatch) {
    nextPatch.scheduled_at = toIsoOrNull(nextPatch.scheduled_at);
  }

  let q = supabase
    .from("work_orders")
    .update(nextPatch)
    .eq("id", id)
    // keep response lighter & predictable (adjust if you need more fields)
    .select("id, account_id, property_id, contractor_user_id, status, scheduled_at, updated_at")
    .single();

  if (signal) q = q.abortSignal(signal);

  const { data, error } = await q;

  if (error) throw friendlyError(error, "Nie udało się zaktualizować zlecenia");
  return parseWorkOrderRow(data);
}

/* ======================
   DELETE
   ====================== */

export async function deleteWorkOrder(id, { signal } = {}) {
  if (!id) throw new Error("Brak ID zlecenia");

  let q = supabase.from("work_orders").delete().eq("id", id);

  if (signal) q = q.abortSignal(signal);

  const { error } = await q;
  if (error) throw friendlyError(error, "Nie udało się usunąć zlecenia");
}
