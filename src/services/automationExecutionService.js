import { supabase } from "../lib/supabase";

let automationExecutionLogUnavailable = false;

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function isPermissionDenied(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42501" || message.includes("permission denied");
}

export async function recordAutomationExecution(entry) {
  if (!entry?.accountId || !entry?.ruleId || !entry?.eventKey) return null;
  if (automationExecutionLogUnavailable) return null;

  const payload = {
    account_id: entry.accountId,
    rule_id: entry.ruleId,
    event_key: entry.eventKey,
    execution_type: entry.executionType || "signal",
    status: entry.status || "recorded",
    entity_type: entry.entityType || null,
    entity_id: entry.entityId || null,
    title: entry.title || null,
    details: entry.details || {},
    executed_at: entry.executedAt || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("automation_execution_log")
    .insert(payload)
    .select("id, account_id, rule_id, event_key, execution_type, status, entity_type, entity_id, title, details, executed_at, created_at")
    .single();

  if (error && (isMissingBackendObject(error) || isPermissionDenied(error))) {
    automationExecutionLogUnavailable = true;
    return null;
  }
  if (error) throw error;
  return data;
}

export async function listAutomationExecutions(accountId, limit = 12) {
  if (!accountId) return [];
  if (automationExecutionLogUnavailable) return null;

  const { data, error } = await supabase
    .from("automation_execution_log")
    .select("id, account_id, rule_id, event_key, execution_type, status, entity_type, entity_id, title, details, executed_at, created_at")
    .eq("account_id", accountId)
    .order("executed_at", { ascending: false })
    .limit(limit);

  if (error && (isMissingBackendObject(error) || isPermissionDenied(error))) {
    automationExecutionLogUnavailable = true;
    return null;
  }
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
