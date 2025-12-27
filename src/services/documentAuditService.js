import { supabase } from "../lib/supabase";

export async function fetchDocumentAudit({ tenantId = null, propertyId = null } = {}) {
  let q = supabase
    .from("document_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (tenantId) q = q.eq("tenant_id", tenantId);
  if (propertyId) q = q.eq("property_id", propertyId);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
