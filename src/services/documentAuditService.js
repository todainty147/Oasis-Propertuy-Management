// src/services/documentAuditService.js
import { supabase } from "../lib/supabase";
import { parseDocumentAuditRow, parseRpcRows } from "./rpcContracts";
import { logSecurityRelevantFailure } from "./securityFailureLogger";
import { assertUuid } from "../utils/validation";

function isMissingScopedAuditColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const hint = String(error?.hint || "").toLowerCase();
  const combined = `${message} ${details} ${hint}`;

  return (
    combined.includes("document_audit_log") &&
    combined.includes("does not exist") &&
    (combined.includes("property_id") || combined.includes("tenant_id"))
  );
}

export async function fetchDocumentAudit({
  accountId = null,
  documentId = null,
  propertyId = null,
  tenantId = null,
  limit = 50,
} = {}) {
  if (!accountId) return [];

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeDocumentId = documentId ? assertUuid(documentId, "Invalid document id") : null;
  const safePropertyId = propertyId ? assertUuid(propertyId, "Invalid property id") : null;
  const safeTenantId = tenantId ? assertUuid(tenantId, "Invalid tenant id") : null;

  let q = supabase
    .from("document_audit_log")
    .select("*")
    .eq("account_id", accountId)
    .order("performed_at", { ascending: false })
    .limit(safeLimit);

  if (safeDocumentId) q = q.eq("document_id", safeDocumentId);
  if (safePropertyId) q = q.eq("property_id", safePropertyId);
  if (safeTenantId) q = q.eq("tenant_id", safeTenantId);

  const { data, error } = await q;
  if (error) {
    if ((safePropertyId || safeTenantId) && isMissingScopedAuditColumnError(error)) {
      return [];
    }

    logSecurityRelevantFailure("document_audit_log_select", {
      error,
      context: {
        accountId,
        documentId: safeDocumentId,
        propertyId: safePropertyId,
        tenantId: safeTenantId,
        limit: safeLimit,
        operation: "fetch_document_audit",
      },
    });
    throw error;
  }
  return parseRpcRows(data ?? [], parseDocumentAuditRow, "document audit rows");
}
