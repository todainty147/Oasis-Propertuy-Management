function normalizeReason(value) {
  return String(value || "edge function failed")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "edge_function_failed";
}

export function buildEdgeFunctionFailure({
  payload = null,
  status = null,
  surface,
  fallback,
  accountId = null,
  entityType = null,
  entityId = null,
  hint = null,
} = {}) {
  const message = payload?.error || fallback || "Edge Function failed";
  const error = new Error(message);
  error.code = status ? String(status) : payload?.code || null;
  error.hint = payload?.hint || hint || null;
  error.details = JSON.stringify({
    event: surface || "edge_function",
    reason: payload?.classification?.reason || normalizeReason(message),
    account_id: payload?.classification?.accountId || accountId || null,
    entity_type: payload?.classification?.entityType || entityType || null,
    entity_id: payload?.classification?.entityId || entityId || null,
    correlation_id: payload?.classification?.correlationId || null,
  });
  return error;
}
