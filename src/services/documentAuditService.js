// src/services/documentAuditService.js
import { supabase } from "../lib/supabase";

export async function fetchDocumentAudit({
  accountId = null,
  documentId = null,
  limit = 50,
} = {}) {
  if (!accountId) return [];

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

  let q = supabase
    .from("document_audit_log")
    .select("*")
    .eq("account_id", accountId)
    .order("performed_at", { ascending: false })
    .limit(safeLimit);

  if (documentId) q = q.eq("document_id", documentId);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
