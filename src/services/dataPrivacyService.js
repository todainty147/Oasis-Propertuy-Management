import { supabase } from "../lib/supabase";

function friendly(error, fallback) {
  return new Error(error?.message || fallback);
}

export async function submitDataDeletionRequest({
  accountId = null,
  requestType,
  scope,
  targetUserId = null,
  targetTenantId = null,
  targetContractorId = null,
  reason = "",
  requesterNotes = "",
} = {}) {
  const { data, error } = await supabase.rpc("submit_data_deletion_request", {
    p_account_id: accountId,
    p_request_type: requestType,
    p_scope: scope,
    p_target_user_id: targetUserId,
    p_target_tenant_id: targetTenantId,
    p_target_contractor_id: targetContractorId,
    p_reason: reason,
    p_requester_notes: requesterNotes,
  });

  if (error) throw friendly(error, "Could not submit deletion request");
  return data;
}

export async function submitDataExportRequest({ accountId = null, exportType = "user" } = {}) {
  const { data, error } = await supabase.rpc("submit_data_export_request", {
    p_account_id: accountId,
    p_export_type: exportType,
  });

  if (error) throw friendly(error, "Could not submit export request");
  return data;
}

export async function listMyDataDeletionRequests() {
  const { data, error } = await supabase
    .from("data_deletion_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw friendly(error, "Could not load deletion requests");
  return data || [];
}

export async function listRootDataDeletionRequests() {
  const { data, error } = await supabase
    .from("data_deletion_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw friendly(error, "Could not load data requests");
  return data || [];
}

export async function listProcessingLog(requestId) {
  const { data, error } = await supabase
    .from("data_deletion_processing_log")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) throw friendly(error, "Could not load processing log");
  return data || [];
}

export async function updateDataDeletionRequest({
  requestId,
  status,
  adminNotes = "",
  rejectedReason = "",
  scheduledFor = null,
} = {}) {
  const { data, error } = await supabase.rpc("admin_update_data_deletion_request", {
    p_request_id: requestId,
    p_status: status,
    p_admin_notes: adminNotes,
    p_rejected_reason: rejectedReason,
    p_scheduled_for: scheduledFor,
  });

  if (error) throw friendly(error, "Could not update deletion request");
  return data;
}

export async function processDataDeletionRequest(requestId) {
  const { data, error } = await supabase.rpc("process_data_deletion_request", {
    p_request_id: requestId,
  });

  if (error) throw friendly(error, "Could not process deletion request");
  return data;
}

export function requestStatusLabel(status) {
  return String(status || "submitted")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
