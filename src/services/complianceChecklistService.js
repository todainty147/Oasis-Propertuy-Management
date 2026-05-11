import { supabase } from "../lib/supabase";

// ---------------------------------------------------------------------------
// Checklist item CRUD
// ---------------------------------------------------------------------------

export async function listChecklistItems({ accountId, propertyId, tenantId, checklistType }) {
  let query = supabase
    .from("compliance_checklist_items")
    .select("*")
    .eq("account_id", accountId);

  if (propertyId) query = query.eq("property_id", propertyId);
  if (tenantId)   query = query.eq("tenant_id", tenantId);
  if (checklistType) query = query.eq("checklist_type", checklistType);

  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function updateChecklistItemStatus({
  accountId,
  itemId,
  status,
  completedBy = null,
}) {
  const update = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "complete") {
    update.completed_at = new Date().toISOString();
    if (completedBy) update.completed_by = completedBy;
  }

  if (status === "pending" || status === "not_applicable") {
    update.completed_at = null;
    update.completed_by = null;
  }

  const { data, error } = await supabase
    .from("compliance_checklist_items")
    .update(update)
    .eq("id", itemId)
    .eq("account_id", accountId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Setup RPCs
// ---------------------------------------------------------------------------

export async function setupNajemOkazjonalnyChecklist({
  accountId,
  propertyId,
  tenantId,
  leaseId = null,
  leaseStart = null,
}) {
  const { data, error } = await supabase.rpc("setup_najem_okazjonalny_checklist", {
    p_account_id:  accountId,
    p_property_id: propertyId,
    p_tenant_id:   tenantId,
    p_lease_id:    leaseId,
    p_lease_start: leaseStart,
  });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Evidence document linking (cross-account guard enforced by RPC)
// ---------------------------------------------------------------------------

export async function linkEvidenceDocument({
  accountId,
  itemId,
  documentId,
  markComplete = false,
}) {
  const { data, error } = await supabase.rpc("update_checklist_item_evidence", {
    p_account_id:    accountId,
    p_item_id:       itemId,
    p_document_id:   documentId,
    p_mark_complete: markComplete,
  });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Deadline notifications (manual trigger)
// ---------------------------------------------------------------------------

export async function triggerPlComplianceNotifications(accountId) {
  const { data, error } = await supabase.rpc("notify_pl_compliance_deadlines", {
    p_account_id: accountId,
  });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Command-center items (merged into commandCenterService client-side)
// ---------------------------------------------------------------------------

export async function getPlComplianceCommandItems(accountId, limit = 40) {
  const { data, error } = await supabase.rpc("pl_compliance_checklist_command_items", {
    p_account_id: accountId,
    p_limit:      limit,
  });
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Property list helper (used by PolandCompliancePage)
// ---------------------------------------------------------------------------

export async function listPropertiesForAccount(accountId) {
  const { data, error } = await supabase
    .from("properties")
    .select("id, address, city, market")
    .eq("account_id", accountId)
    .order("address");
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Tenant list helper (filtered by property)
// ---------------------------------------------------------------------------

export async function listTenantsForProperty(accountId, propertyId) {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, property_id")
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Active lease helper (for lease_start_date to calculate Tax Office deadline)
// ---------------------------------------------------------------------------

export async function getActiveLease(accountId, propertyId, tenantId) {
  const { data, error } = await supabase
    .from("leases")
    .select("id, lease_start_date, lease_end_date, lease_type")
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .eq("tenant_id", tenantId)
    .order("lease_start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
