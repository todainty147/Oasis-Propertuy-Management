import { supabase } from "../lib/supabase";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

const PACKET_SELECT = `
  *,
  document_templates(id, name, country_code, language, template_type, status, storage_path, mime_type, size_bytes, version),
  tenants(id, name, email),
  contractors(id, name, email),
  properties(id, address, city),
  document_packet_recipients(*),
  document_packet_events(*)
`;

function normalizePacket(row) {
  if (!row) return null;
  return {
    id: row.id,
    account_id: row.account_id,
    template_id: row.template_id,
    target_role: row.target_role,
    tenant_id: row.tenant_id || null,
    contractor_id: row.contractor_id || null,
    property_id: row.property_id || null,
    packet_type: row.packet_type,
    title: row.title,
    message: row.message || "",
    status: row.status,
    created_by: row.created_by || null,
    sent_by: row.sent_by || null,
    sent_at: row.sent_at || null,
    completed_at: row.completed_at || null,
    voided_at: row.voided_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    template: row.document_templates || row.template || null,
    tenant: row.tenants || null,
    contractor: row.contractors || null,
    property: row.properties || null,
    recipients: row.document_packet_recipients || row.recipients || [],
    events: row.document_packet_events || row.events || [],
  };
}

function context(extra = {}) {
  return {
    surface: "document_packets",
    ...extra,
  };
}

export async function fetchDocumentPackets({ accountId, status = "" } = {}) {
  if (!accountId) return [];

  let query = supabase
    .from("document_packets")
    .select(PACKET_SELECT)
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    logSecurityRelevantFailure("document_packets_select", {
      error,
      context: context({ accountId, status }),
    });
    throw error;
  }

  return (data || []).map(normalizePacket).filter(Boolean);
}

export async function createDocumentPacket({
  accountId,
  templateId,
  targetRole,
  tenantId = null,
  contractorId = null,
  propertyId = null,
  packetType = "agreement",
  title,
  message = "",
}) {
  const { data, error } = await supabase.rpc("create_document_packet", {
    p_account_id: accountId,
    p_template_id: templateId,
    p_target_role: targetRole,
    p_tenant_id: targetRole === "tenant" ? tenantId || null : null,
    p_contractor_id: targetRole === "contractor" ? contractorId || null : null,
    p_property_id: propertyId || null,
    p_packet_type: packetType,
    p_title: title,
    p_message: message || null,
  });

  if (error) {
    logSecurityRelevantFailure("create_document_packet", {
      error,
      context: context({ accountId, templateId, targetRole, tenantId, contractorId }),
    });
    throw error;
  }

  return normalizePacket(data);
}

export async function sendDocumentPacket({ packetId }) {
  const { data, error } = await supabase.rpc("send_document_packet", {
    p_packet_id: packetId,
  });

  if (error) {
    logSecurityRelevantFailure("send_document_packet", {
      error,
      context: context({ packetId }),
    });
    throw error;
  }

  return normalizePacket(data);
}

export async function markDocumentPacketViewed({ packetId }) {
  const { data, error } = await supabase.rpc("mark_document_packet_viewed", {
    p_packet_id: packetId,
  });

  if (error) {
    logSecurityRelevantFailure("mark_document_packet_viewed", {
      error,
      context: context({ packetId }),
    });
    throw error;
  }

  return normalizePacket(data);
}

export async function completeDocumentPacket({ packetId }) {
  const { data, error } = await supabase.rpc("complete_document_packet", {
    p_packet_id: packetId,
  });

  if (error) {
    logSecurityRelevantFailure("complete_document_packet", {
      error,
      context: context({ packetId }),
    });
    throw error;
  }

  return normalizePacket(data);
}

export async function voidDocumentPacket({ packetId }) {
  const { data, error } = await supabase.rpc("void_document_packet", {
    p_packet_id: packetId,
  });

  if (error) {
    logSecurityRelevantFailure("void_document_packet", {
      error,
      context: context({ packetId }),
    });
    throw error;
  }

  return normalizePacket(data);
}
