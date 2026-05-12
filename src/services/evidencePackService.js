import { supabase } from "../lib/supabase";

// ---------------------------------------------------------------------------
// Evidence Pack
// ---------------------------------------------------------------------------

export async function getEvidencePack({ accountId, propertyId, tenantId }) {
  const { data, error } = await supabase.rpc("get_evidence_pack", {
    p_account_id:  accountId,
    p_property_id: propertyId,
    p_tenant_id:   tenantId,
  });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Document linking / unlinking
// ---------------------------------------------------------------------------

export async function linkDocumentToChecklistItem({
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

export async function removeDocumentFromChecklistItem({ accountId, itemId }) {
  const { data, error } = await supabase.rpc("remove_checklist_item_evidence", {
    p_account_id: accountId,
    p_item_id:    itemId,
  });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Document picker — lists account documents eligible for evidence linking
// ---------------------------------------------------------------------------

export async function listAccountDocuments({
  accountId,
  propertyId = null,
  tenantId   = null,
  limit      = 100,
}) {
  let query = supabase
    .from("documents")
    .select("id, name, mime_type, tags, uploaded_at, scope, upload_status, property_id, tenant_id")
    .eq("account_id", accountId)
    .eq("upload_status", "uploaded")
    .order("uploaded_at", { ascending: false })
    .limit(limit);

  // Prefer documents already scoped to this property/tenant, but include account-level too
  // We don't filter strictly — user can link any account document
  if (propertyId) {
    query = query.or(`property_id.eq.${propertyId},property_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// Handover protocols
// ---------------------------------------------------------------------------

export async function listHandoverProtocols({ accountId, propertyId = null, tenantId = null }) {
  const { data, error } = await supabase.rpc("list_handover_protocols", {
    p_account_id:  accountId,
    p_property_id: propertyId,
    p_tenant_id:   tenantId,
  });
  if (error) throw error;
  return data || [];
}

export async function saveHandoverProtocol({
  accountId,
  propertyId,
  tenantId,
  leaseId         = null,
  protocolType,
  generalCondition = null,
  roomNotes        = [],
  keysHandedOver   = false,
  appliancesNotes  = null,
  furnitureNotes   = null,
  additionalNotes  = null,
  protocolId       = null,
}) {
  const { data, error } = await supabase.rpc("create_or_update_handover_protocol", {
    p_account_id:       accountId,
    p_property_id:      propertyId,
    p_tenant_id:        tenantId,
    p_lease_id:         leaseId,
    p_protocol_type:    protocolType,
    p_general_condition: generalCondition,
    p_room_notes:       roomNotes,
    p_keys_handed_over: keysHandedOver,
    p_appliances_notes: appliancesNotes,
    p_furniture_notes:  furnitureNotes,
    p_additional_notes: additionalNotes,
    p_protocol_id:      protocolId,
  });
  if (error) throw error;
  return data;
}

export async function confirmHandoverProtocol({ accountId, protocolId }) {
  const { data, error } = await supabase.rpc("confirm_handover_protocol", {
    p_account_id:  accountId,
    p_protocol_id: protocolId,
  });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Meter readings
// ---------------------------------------------------------------------------

export async function listMeterReadings({
  accountId,
  propertyId         = null,
  tenantId           = null,
  handoverProtocolId = null,
}) {
  const { data, error } = await supabase.rpc("list_meter_readings", {
    p_account_id:          accountId,
    p_property_id:         propertyId,
    p_tenant_id:           tenantId,
    p_handover_protocol_id: handoverProtocolId,
  });
  if (error) throw error;
  return data || [];
}

export async function addMeterReading({
  accountId,
  propertyId,
  meterType,
  readingValue,
  unit               = null,
  readAt             = null,
  notes              = null,
  tenantId           = null,
  handoverProtocolId = null,
  evidenceDocumentId = null,
}) {
  const { data, error } = await supabase.rpc("add_meter_reading", {
    p_account_id:           accountId,
    p_property_id:          propertyId,
    p_meter_type:           meterType,
    p_reading_value:        readingValue,
    p_unit:                 unit,
    p_read_at:              readAt,
    p_notes:                notes,
    p_tenant_id:            tenantId,
    p_handover_protocol_id: handoverProtocolId,
    p_evidence_document_id: evidenceDocumentId,
  });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// AI-assisted checklist suggestions
// ---------------------------------------------------------------------------

export async function getAiChecklistSuggestions({
  accountId,
  documentId,
  propertyId = null,
  tenantId   = null,
}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
  const url = `${SUPABASE_URL}/functions/v1/suggest-checklist-item-match`;

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ accountId, documentId, propertyId, tenantId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `AI suggestion failed: ${res.status}`);
  }

  return res.json();
}
