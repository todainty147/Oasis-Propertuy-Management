import { supabase } from "../lib/supabase";

export async function getDocumentServiceTimeline(documentId) {
  const { data, error } = await supabase.rpc("get_document_service_timeline", {
    p_document_id: documentId,
  });
  if (error) throw error;
  return data;
}

export async function getDocumentServiceProjection(documentId) {
  const { data, error } = await supabase.rpc("document_service_projection", {
    p_document_id: documentId,
  });
  if (error) throw error;
  return data;
}

export async function recordDocumentUploaded(documentId) {
  const { data, error } = await supabase.rpc("record_document_uploaded", {
    p_document_id: documentId,
  });
  if (error) throw error;
  return data;
}

export async function recordDocumentServedAsserted(documentId, {
  serviceMethod,
  recipient,
  assertedServiceDate,
  assertionNote = null,
  supportingEvidenceReference = null,
}) {
  const { data, error } = await supabase.rpc("record_document_served_asserted", {
    p_document_id: documentId,
    p_service_method: serviceMethod,
    p_recipient: recipient,
    p_asserted_service_date: assertedServiceDate,
    p_assertion_note: assertionNote,
    p_supporting_evidence_reference: supportingEvidenceReference,
  });
  if (error) throw error;
  return data;
}

// record_document_served_system, record_document_delivery_confirmed, and
// record_document_service_failed are service_role-only. They must be called
// from Edge Functions (notification/webhook handlers), not from the browser.

export async function recordDocumentAvailable(documentId, {
  tenantUserId,
  accessGrantId,
  accessChannel,
  availableFrom = null,
  availableUntil = null,
}) {
  const { data, error } = await supabase.rpc("record_document_available", {
    p_document_id: documentId,
    p_tenant_user_id: tenantUserId,
    p_access_grant_id: accessGrantId,
    p_access_channel: accessChannel,
    p_available_from: availableFrom,
    p_available_until: availableUntil,
  });
  if (error) throw error;
  return data;
}

// record_document_viewed and record_document_downloaded are service_role-only.
// They must be called from the authoritative access/download path (Edge Function),
// not directly from the browser. No frontend wrapper is provided.

export async function recordDocumentAcknowledged(documentId, {
  acknowledgementText,
  acknowledgementTextVersion,
  acknowledgementMethod = "click",
  locale = "en",
  accessGrantId = null,
  submissionNonce = null,
}) {
  const { data, error } = await supabase.rpc("record_document_acknowledged", {
    p_document_id: documentId,
    p_acknowledgement_text: acknowledgementText,
    p_acknowledgement_text_version: acknowledgementTextVersion,
    p_acknowledgement_method: acknowledgementMethod,
    p_locale: locale,
    p_access_grant_id: accessGrantId,
    p_submission_nonce: submissionNonce,
  });
  if (error) throw error;
  return data;
}

export async function recordDocumentExpired(documentId, reason = null) {
  const { data, error } = await supabase.rpc("record_document_expired", {
    p_document_id: documentId,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function recordDocumentReplaced(documentId, replacementDocumentId) {
  const { data, error } = await supabase.rpc("record_document_replaced", {
    p_document_id: documentId,
    p_replacement_document_id: replacementDocumentId,
  });
  if (error) throw error;
  return data;
}

export async function recordDocumentWithdrawn(documentId, reason = null) {
  const { data, error } = await supabase.rpc("record_document_withdrawn", {
    p_document_id: documentId,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}
