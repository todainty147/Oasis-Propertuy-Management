import { supabase } from "../lib/supabase";
import { buildDefaultEvidenceItemsPayload, getDefaultInspectionRoomNames } from "../data/inspectionRoomTemplates";
import { normalizeDisputePackEvidenceReferenceType, normalizeDisputePackItemType } from "../lib/depositDisputePack";
import { getDocumentServiceProjection, recordDocumentServedAsserted } from "./provenanceDocumentService.js";

const COMPLIANCE_SELECT = [
  "id", "account_id", "property_id", "tenant_id", "tenancy_id",
  "requirement_id", "status", "due_date", "completed_at", "expires_at",
  "served_at", "evidence_document_id", "evidence_source_type", "evidence_source_id",
  "reminder_days_before", "last_reminder_sent_at", "marked_not_applicable_at", "marked_not_applicable_by",
  "acknowledged_by_tenant_at", "needs_review_reason", "notes",
  "ocr_source_extraction_id", "human_verified_at", "human_verified_by",
  "import_batch_id",
  "created_by", "created_at", "updated_at",
  "compliance_requirements(label, description, requirement_key, requirement_type, expiry_tracking, acknowledgement_required, compliance_templates(country_code, jurisdiction, name))",
  "compliance_item_acknowledgements(id, tenant_id, acknowledgement_status, message, acknowledged_at, comment, created_at, updated_at)",
].join(", ");

const COMPLIANCE_TEMPLATE_SELECT = [
  "id", "country_code", "jurisdiction", "template_key", "name", "description",
  "compliance_requirements(id, requirement_key, label, description, requirement_type, expiry_tracking, acknowledgement_required, default_due_offset_days, sort_order, active)",
].join(", ");

const COMPLIANCE_ACK_SELECT = [
  "id", "account_id", "compliance_item_id", "tenant_id", "acknowledged_by",
  "acknowledgement_status", "message", "acknowledged_at", "comment", "created_at", "updated_at",
  "tenancy_compliance_items(id, account_id, property_id, tenant_id, status, due_date, served_at, expires_at, evidence_document_id, evidence_source_type, evidence_source_id, notes, compliance_requirements(label, description, requirement_key, requirement_type, compliance_templates(country_code, jurisdiction, name)))",
].join(", ");

const COMPLIANCE_EVENT_SELECT = "id, account_id, compliance_item_id, user_id, event_type, metadata, created_at";

const INSPECTION_SELECT = [
  "id", "account_id", "property_id", "tenant_id", "inspection_type", "status",
  "title", "inspection_date", "locked_at", "locked_by", "archived_at", "archived_by", "created_by", "created_at", "updated_at",
  "inspection_rooms(id, room_name, sort_order, inspection_evidence_items(id, condition_rating, inspection_photos(id)))",
].join(", ");

const INSPECTION_DETAIL_SELECT = [
  "id", "account_id", "property_id", "tenant_id", "inspection_type", "status",
  "title", "inspection_date", "locked_at", "locked_by", "archived_at", "archived_by", "created_by", "created_at", "updated_at",
  "inspection_rooms(id, room_name, sort_order, inspection_evidence_items(id, item_label, condition_rating, notes, sort_order, created_at, updated_at, inspection_photos(id, document_id, storage_path, caption, captured_at)))",
  "inspection_signatures(id, signer_type, signer_role, signer_name, signed_at, signed_from, tenant_id, share_id, signature_status, metadata)",
  "inspection_report_shares(id, account_id, inspection_report_id, tenant_id, share_status, message, response_due_at, shared_at, viewed_at, responded_at, revoked_at, created_at, updated_at, inspection_report_tenant_comments(id, evidence_item_id, comment_type, comment, created_at, updated_at))",
].join(", ");

const INSPECTION_AUDIT_SELECT = "id, account_id, inspection_report_id, user_id, event_type, metadata, created_at";
const TENANT_SHARE_SELECT = [
  "id", "account_id", "inspection_report_id", "tenant_id", "share_status", "message",
  "response_due_at", "shared_at", "viewed_at", "responded_at", "revoked_at", "created_at", "updated_at",
  "inspection_reports(id, account_id, property_id, tenant_id, inspection_type, status, title, inspection_date, locked_at, created_at, updated_at, inspection_rooms(id, room_name, sort_order, inspection_evidence_items(id, item_label, condition_rating, notes, sort_order, inspection_photos(id, document_id, caption, captured_at))), inspection_signatures(id, signer_type, signer_role, signer_name, signed_at, signed_from, tenant_id, share_id, signature_status, metadata))",
  "inspection_report_tenant_comments(id, evidence_item_id, comment_type, comment, created_at, updated_at)",
].join(", ");

const DISPUTE_PACK_SELECT = [
  "id", "account_id", "property_id", "tenant_id", "tenancy_id", "title", "status",
  "deposit_amount", "proposed_deduction_amount", "summary", "created_by", "created_at", "updated_at", "locked_at", "archived_at",
  "deposit_dispute_pack_items(id, item_type, title, description, claimed_amount, evidence_reference_type, evidence_reference_id, sort_order, created_at, updated_at)",
  "deposit_dispute_pack_exports(id, export_type, status, document_id, storage_path, generated_at, metadata)",
].join(", ");

const APPLICATION_LINK_SELECT = [
  "id", "account_id", "property_id", "public_token", "title", "status",
  "available_from", "monthly_rent", "preferences", "created_by", "created_at", "expires_at",
].join(", ");

const APPLICATION_SELECT = [
  "id", "account_id", "property_id", "application_link_id", "tenant_id",
  "applicant_name", "applicant_email", "applicant_phone",
  "preferred_move_in_date", "occupants_count", "pets_status", "smoking_status",
  "estimated_income_band", "employment_status", "guarantor_available",
  "message", "consent_accepted", "status", "score", "score_reasons",
  "created_at", "updated_at",
].join(", ");

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes("relation") || message.includes("does not exist");
}

export async function listComplianceSafeItems(accountId, filters = {}) {
  if (!accountId) return [];
  let query = supabase
    .from("tenancy_compliance_items")
    .select(COMPLIANCE_SELECT)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (filters.propertyId) query = query.eq("property_id", filters.propertyId);
  if (filters.tenantId) query = query.eq("tenant_id", filters.tenantId);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query.limit(500);
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function getComplianceSafeItemDetails(accountId, itemId) {
  if (!accountId || !itemId) return null;
  const { data, error } = await supabase
    .from("tenancy_compliance_items")
    .select(COMPLIANCE_SELECT)
    .eq("account_id", accountId)
    .eq("id", itemId)
    .single();
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  return data;
}

export async function listComplianceEvidenceEvents(accountId, itemId) {
  if (!accountId || !itemId) return [];
  const { data, error } = await supabase
    .from("compliance_evidence_events")
    .select(COMPLIANCE_EVENT_SELECT)
    .eq("account_id", accountId)
    .eq("compliance_item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

async function writeComplianceEvidenceEvent(accountId, itemId, eventType, metadata = {}) {
  if (!accountId || !itemId || !eventType) return null;
  const { data, error } = await supabase
    .from("compliance_evidence_events")
    .insert({
      account_id: accountId,
      compliance_item_id: itemId,
      event_type: eventType,
      metadata,
    })
    .select(COMPLIANCE_EVENT_SELECT)
    .single();
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  return data;
}

export async function listComplianceTemplates() {
  const { data, error } = await supabase
    .from("compliance_templates")
    .select(COMPLIANCE_TEMPLATE_SELECT)
    .eq("active", true)
    .order("country_code", { ascending: true });
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return (data || []).map((template) => ({
    ...template,
    compliance_requirements: (template.compliance_requirements || [])
      .filter((requirement) => requirement.active !== false)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)),
  }));
}

export async function createComplianceChecklistFromTemplate(accountId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!payload.propertyId) throw new Error("Choose a property");
  if (!payload.templateId) throw new Error("Choose a compliance template");

  const { data: requirements, error: requirementsError } = await supabase
    .from("compliance_requirements")
    .select("id, default_due_offset_days, active")
    .eq("template_id", payload.templateId)
    .eq("active", true);
  if (requirementsError) throw requirementsError;
  if (!requirements?.length) throw new Error("This compliance template has no active requirements.");

  let existingQuery = supabase
    .from("tenancy_compliance_items")
    .select("requirement_id")
    .eq("account_id", accountId)
    .eq("property_id", payload.propertyId)
    .in("requirement_id", requirements.map((requirement) => requirement.id));
  existingQuery = payload.tenantId ? existingQuery.eq("tenant_id", payload.tenantId) : existingQuery.is("tenant_id", null);

  const { data: existing, error: existingError } = await existingQuery;
  if (existingError) throw existingError;
  const existingIds = new Set((existing || []).map((item) => item.requirement_id));
  const today = new Date();
  const rows = requirements
    .filter((requirement) => !existingIds.has(requirement.id))
    .map((requirement) => {
      const due = new Date(today);
      due.setDate(due.getDate() + Number(requirement.default_due_offset_days || 0));
      return {
        account_id: accountId,
        property_id: payload.propertyId,
        tenant_id: payload.tenantId || null,
        requirement_id: requirement.id,
        status: "missing",
        due_date: due.toISOString().slice(0, 10),
        notes: payload.notes || null,
      };
    });

  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from("tenancy_compliance_items")
    .insert(rows)
    .select(COMPLIANCE_SELECT);
  if (error) throw error;
  await Promise.all((data || []).map((item) =>
    writeComplianceEvidenceEvent(accountId, item.id, "checklist_created", {
      template_id: payload.templateId,
      property_id: payload.propertyId,
      tenant_id: payload.tenantId || null,
    }).catch(() => null),
  ));
  return data || [];
}

export async function updateComplianceSafeItem(id, accountId, patch = {}) {
  if (!id) throw new Error("Missing compliance item id");
  if (!accountId) throw new Error("Missing accountId");
  const nextPatch = {};
  if (Object.prototype.hasOwnProperty.call(patch, "status")) nextPatch.status = patch.status === "" ? null : patch.status;
  if (Object.prototype.hasOwnProperty.call(patch, "notes")) nextPatch.notes = patch.notes || null;
  if (Object.prototype.hasOwnProperty.call(patch, "expires_at")) nextPatch.expires_at = patch.expires_at || null;
  if (Object.prototype.hasOwnProperty.call(patch, "evidence_document_id")) nextPatch.evidence_document_id = patch.evidence_document_id || null;
  if (Object.prototype.hasOwnProperty.call(patch, "evidence_source_type")) nextPatch.evidence_source_type = patch.evidence_source_type || null;
  if (Object.prototype.hasOwnProperty.call(patch, "evidence_source_id")) nextPatch.evidence_source_id = patch.evidence_source_id || null;
  if (Object.prototype.hasOwnProperty.call(patch, "reminder_days_before")) nextPatch.reminder_days_before = patch.reminder_days_before === "" ? null : Number(patch.reminder_days_before);
  if (Object.prototype.hasOwnProperty.call(patch, "needs_review_reason")) nextPatch.needs_review_reason = patch.needs_review_reason || null;
  if (Object.prototype.hasOwnProperty.call(patch, "marked_not_applicable_at")) nextPatch.marked_not_applicable_at = patch.marked_not_applicable_at || null;
  if (Object.prototype.hasOwnProperty.call(patch, "marked_not_applicable_by")) nextPatch.marked_not_applicable_by = patch.marked_not_applicable_by || null;
  Object.keys(nextPatch).forEach((key) => nextPatch[key] === undefined && delete nextPatch[key]);
  if (["logged", "acknowledged"].includes(nextPatch.status)) nextPatch.completed_at = new Date().toISOString();
  if (nextPatch.status === "not_applicable") {
    nextPatch.marked_not_applicable_at = nextPatch.marked_not_applicable_at || new Date().toISOString();
    nextPatch.marked_not_applicable_by = nextPatch.marked_not_applicable_by || await getCurrentUserId();
  }

  const { data, error } = await supabase
    .from("tenancy_compliance_items")
    .update(nextPatch)
    .eq("id", id)
    .eq("account_id", accountId)
    .select(COMPLIANCE_SELECT)
    .single();
  if (error) throw error;
  const auditEvents = [];
  if (patch.eventType) {
    auditEvents.push([patch.eventType, patch.eventMetadata || {}]);
  } else {
    if (nextPatch.evidence_document_id) auditEvents.push(["document_attached", { document_id: nextPatch.evidence_document_id }]);
    if (nextPatch.expires_at) auditEvents.push(["expiry_date_set", { expires_at: nextPatch.expires_at }]);
    if (nextPatch.status === "not_applicable") auditEvents.push(["item_marked_not_applicable", {}]);
    if (nextPatch.status === "needs_review") auditEvents.push(["item_marked_needs_review", { reason: nextPatch.needs_review_reason || null }]);
    if (nextPatch.status === "logged") auditEvents.push(["item_logged", {}]);
  }
  await Promise.all(auditEvents.map(([eventType, metadata]) =>
    writeComplianceEvidenceEvent(accountId, id, eventType, metadata).catch(() => null),
  ));
  return data;
}

export async function recordHumanVerification(id, accountId) {
  if (!id) throw new Error("Missing compliance item id");
  if (!accountId) throw new Error("Missing accountId");
  const result = await supabase.rpc("record_compliance_value_human_verified", {
    p_account_id: accountId,
    p_item_id: id,
  });
  if (result.error) throw result.error;
  await writeComplianceEvidenceEvent(accountId, id, "value_human_verified", {}).catch(() => null);
  return getComplianceSafeItemDetails(accountId, id);
}

export async function attachComplianceDocument(accountId, itemId, documentId) {
  if (!documentId) throw new Error("Choose a document to attach.");
  return updateComplianceSafeItem(itemId, accountId, {
    status: "logged",
    evidence_document_id: documentId,
    evidence_source_type: "document",
    evidence_source_id: documentId,
    eventType: "document_attached",
    eventMetadata: { document_id: documentId },
  });
}

/**
 * Records that a landlord asserted a compliance document was served.
 *
 * Wires the Sprint 3 strong service-event path:
 *   record_document_served_asserted() → provenance chain (immutable, attributed)
 *
 * Also writes served_at for backward-compat display. served_at alone is NOT
 * authoritative service evidence — use deriveComplianceServiceStatus() with
 * getServiceProjectionForComplianceItem() to check provenance-backed status.
 *
 * E-035 Option C: served_at remains as a mutable display field until the
 * bifurcation tripwire test in mediumSecurityContracts.test.js is satisfied.
 */
export async function recordComplianceServiceAsserted(accountId, itemId, payload = {}) {
  if (!accountId || !itemId) throw new Error("Missing compliance item");
  const documentId = payload.documentId;
  if (!documentId) throw new Error("Attach a document before recording service");
  const serviceMethod = String(payload.serviceMethod || "").trim();
  if (!serviceMethod) throw new Error("Choose a service method");
  const assertedServiceDate = payload.assertedServiceDate;
  if (!assertedServiceDate) throw new Error("Provide a service date");
  const recipient = payload.recipient || `tenant:${payload.tenantId || "unknown"}`;

  await recordDocumentServedAsserted(documentId, {
    serviceMethod,
    recipient,
    assertedServiceDate,
    assertionNote: payload.assertionNote || null,
    supportingEvidenceReference: itemId,
  });

  return updateComplianceSafeItem(itemId, accountId, {
    served_at: assertedServiceDate,
    eventType: "service_recorded",
    eventMetadata: {
      service_method: serviceMethod,
      document_id: documentId,
      provenance_event_recorded: true,
    },
  });
}

/**
 * Returns the document service projection for the evidence document attached
 * to a compliance item, or null if no document is attached.
 *
 * Use deriveComplianceServiceStatus(item, projection) to evaluate service
 * evidence strength — never use served_at alone as the authoritative check.
 */
export async function getServiceProjectionForComplianceItem(item) {
  const documentId = item?.evidence_document_id;
  if (!documentId) return null;
  return getDocumentServiceProjection(documentId).catch(() => null);
}

export async function linkComplianceInspectionReport(accountId, itemId, reportId) {
  if (!accountId || !itemId) throw new Error("Missing compliance item.");
  if (!reportId) throw new Error("Choose an inspection report to link.");
  const [item, reportResult] = await Promise.all([
    getComplianceSafeItemDetails(accountId, itemId),
    supabase
      .from("inspection_reports")
      .select("id, account_id, property_id, tenant_id, title, status, inspection_date")
      .eq("account_id", accountId)
      .eq("id", reportId)
      .maybeSingle(),
  ]);
  if (!item) throw new Error("Compliance item not found.");
  if (reportResult.error) throw reportResult.error;
  const report = reportResult.data;
  if (!report) throw new Error("Evidence Vault report not found.");
  if ((item.property_id || report.property_id) && String(item.property_id || "") !== String(report.property_id || "")) {
    throw new Error("The Evidence Vault report must belong to the same property as this compliance item.");
  }
  if ((item.tenant_id || report.tenant_id) && String(item.tenant_id || "") !== String(report.tenant_id || "")) {
    throw new Error("The Evidence Vault report must belong to the same tenant as this compliance item.");
  }
  return updateComplianceSafeItem(itemId, accountId, {
    status: "logged",
    evidence_source_type: "inspection_report",
    evidence_source_id: reportId,
    eventType: "evidence_vault_report_linked",
    eventMetadata: {
      evidence_source_type: "inspection_report",
      evidence_source_id: reportId,
      report_title: report.title || null,
      report_status: report.status || null,
    },
  });
}

export async function requestComplianceTenantAcknowledgement(accountId, itemId, payload = {}) {
  if (!accountId || !itemId) throw new Error("Missing compliance item.");
  if (!payload.tenantId) throw new Error("Link a tenant before requesting acknowledgement.");
  const { data, error } = await supabase
    .from("compliance_item_acknowledgements")
    .insert({
      account_id: accountId,
      compliance_item_id: itemId,
      tenant_id: payload.tenantId,
      message: payload.message || null,
      acknowledgement_status: "pending",
    })
    .select(COMPLIANCE_ACK_SELECT)
    .single();
  if (error) throw error;
  await writeComplianceEvidenceEvent(accountId, itemId, "acknowledgement_requested", {
    tenant_id: payload.tenantId,
    acknowledgement_id: data.id,
  }).catch(() => null);
  return data;
}

export async function revokeComplianceTenantAcknowledgement(accountId, acknowledgementId) {
  if (!accountId || !acknowledgementId) throw new Error("Missing acknowledgement.");
  const { data, error } = await supabase
    .from("compliance_item_acknowledgements")
    .update({ acknowledgement_status: "revoked" })
    .eq("account_id", accountId)
    .eq("id", acknowledgementId)
    .select(COMPLIANCE_ACK_SELECT)
    .single();
  if (error) throw error;
  const itemId = data?.tenancy_compliance_items?.id || data?.compliance_item_id;
  if (itemId) {
    await writeComplianceEvidenceEvent(accountId, itemId, "acknowledgement_revoked", {
      acknowledgement_id: acknowledgementId,
      tenant_id: data.tenant_id || null,
    }).catch(() => null);
  }
  return data;
}

export async function listTenantComplianceAcknowledgements(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase
    .from("compliance_item_acknowledgements")
    .select(COMPLIANCE_ACK_SELECT)
    .eq("account_id", accountId)
    .neq("acknowledgement_status", "revoked")
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function getTenantComplianceAcknowledgement(accountId, acknowledgementId) {
  if (!accountId || !acknowledgementId) return null;
  const { data, error } = await supabase
    .from("compliance_item_acknowledgements")
    .select(COMPLIANCE_ACK_SELECT)
    .eq("account_id", accountId)
    .eq("id", acknowledgementId)
    .neq("acknowledgement_status", "revoked")
    .single();
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  return data;
}

export async function markTenantComplianceAcknowledgementViewed(accountId, acknowledgementId) {
  if (!accountId || !acknowledgementId) return null;
  const { data, error } = await supabase
    .from("compliance_item_acknowledgements")
    .update({ acknowledgement_status: "viewed" })
    .eq("account_id", accountId)
    .eq("id", acknowledgementId)
    .in("acknowledgement_status", ["pending"])
    .select(COMPLIANCE_ACK_SELECT)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function respondToComplianceAcknowledgement(accountId, acknowledgementId, payload = {}) {
  if (!accountId || !acknowledgementId) throw new Error("Missing acknowledgement.");
  const status = payload.disputed ? "disputed" : "acknowledged";
  const comment = String(payload.comment || "").trim();
  if (payload.disputed && !comment) {
    throw new Error("Add a comment before marking this compliance document as disputed.");
  }
  const { data, error } = await supabase
    .from("compliance_item_acknowledgements")
    .update({
      acknowledgement_status: status,
      comment: comment || null,
      acknowledged_at: new Date().toISOString(),
    })
    .eq("account_id", accountId)
    .eq("id", acknowledgementId)
    .select(COMPLIANCE_ACK_SELECT)
    .single();
  if (error) throw error;
  // The compliance_safe_phase2 SQL trigger applies the item status update and
  // audit event in the database, so tenant clients never need direct write
  // access to landlord-controlled compliance rows.
  return data;
}

export async function listInspectionReports(accountId, filters = {}) {
  if (!accountId) return [];
  let query = supabase
    .from("inspection_reports")
    .select(INSPECTION_SELECT)
    .eq("account_id", accountId)
    .order("inspection_date", { ascending: false })
    .limit(100);
  if (filters.propertyId) query = query.eq("property_id", filters.propertyId);
  if (filters.tenantId) query = query.eq("tenant_id", filters.tenantId);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function getInspectionReportDetails(accountId, reportId) {
  if (!accountId || !reportId) return null;
  const { data, error } = await supabase
    .from("inspection_reports")
    .select(INSPECTION_DETAIL_SELECT)
    .eq("account_id", accountId)
    .eq("id", reportId)
    .single();
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  return data;
}

export async function createInspectionReport(accountId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!payload.propertyId) throw new Error("Choose a property");
  const rooms = Array.isArray(payload.rooms) && payload.rooms.length > 0 ? payload.rooms : getDefaultInspectionRoomNames();
  const { data: report, error } = await supabase.rpc("create_inspection_report_with_rooms", {
    p_account_id: accountId,
    p_property_id: payload.propertyId,
    p_tenant_id: payload.tenantId || null,
    p_inspection_type: payload.inspectionType || "check_in",
    p_title: String(payload.title || "Inspection report").trim(),
    p_inspection_date: payload.inspectionDate || new Date().toISOString().slice(0, 10),
    p_rooms: rooms,
    p_room_items: buildDefaultEvidenceItemsPayload(rooms),
  });
  if (error) throw error;
  return report;
}

async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

function assertEditableStatus(status) {
  if (["locked", "archived"].includes(status)) {
    throw new Error("This report is locked or archived. Editing is disabled to preserve the evidence record.");
  }
}

async function getInspectionStatusForReport(accountId, reportId) {
  const { data, error } = await supabase
    .from("inspection_reports")
    .select("id, status")
    .eq("account_id", accountId)
    .eq("id", reportId)
    .single();
  if (error) throw error;
  return data;
}

async function getInspectionStatusForRoom(accountId, roomId) {
  const { data, error } = await supabase
    .from("inspection_rooms")
    .select("id, room_name, inspection_reports(id, status)")
    .eq("account_id", accountId)
    .eq("id", roomId)
    .single();
  if (error) throw error;
  return {
    roomName: data?.room_name || "Room",
    reportId: data?.inspection_reports?.id,
    status: data?.inspection_reports?.status,
  };
}

async function getInspectionStatusForItem(accountId, itemId) {
  const { data, error } = await supabase
    .from("inspection_evidence_items")
    .select("id, item_label, inspection_rooms(id, room_name, inspection_reports(id, status))")
    .eq("account_id", accountId)
    .eq("id", itemId)
    .single();
  if (error) throw error;
  return {
    itemLabel: data?.item_label || "Evidence item",
    roomName: data?.inspection_rooms?.room_name || "Room",
    reportId: data?.inspection_rooms?.inspection_reports?.id,
    status: data?.inspection_rooms?.inspection_reports?.status,
  };
}

async function writeInspectionAuditEvent(accountId, reportId, eventType, metadata = {}, userId = undefined) {
  if (!accountId || !reportId || !eventType) return null;
  const { data, error } = await supabase
    .from("inspection_audit_events")
    .insert({
      account_id: accountId,
      inspection_report_id: reportId,
      user_id: userId === undefined ? await getCurrentUserId() : userId,
      event_type: eventType,
      metadata,
    })
    .select(INSPECTION_AUDIT_SELECT)
    .single();
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  return data;
}

export async function createInspectionEvidenceItem(accountId, roomId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!roomId) throw new Error("Missing room id");
  const itemLabel = String(payload.item_label || "").trim();
  if (!itemLabel) throw new Error("Add an item label");
  const report = await getInspectionStatusForRoom(accountId, roomId);
  assertEditableStatus(report.status);
  const { data, error } = await supabase
    .from("inspection_evidence_items")
    .insert({
      account_id: accountId,
      inspection_room_id: roomId,
      item_label: itemLabel,
      condition_rating: payload.condition_rating || null,
      notes: payload.notes ? String(payload.notes).trim() : null,
      sort_order: Number(payload.sort_order || 0),
    })
    .select("id, item_label, condition_rating, notes, sort_order, created_at, updated_at")
    .single();
  if (error) throw error;
  await writeInspectionAuditEvent(accountId, report.reportId, "evidence_item_created", {
    room_name: report.roomName,
    item_label: itemLabel,
  });
  return data;
}

export async function populateInspectionReportDefaults(accountId, reportId) {
  if (!accountId) throw new Error("Missing accountId");
  if (!reportId) throw new Error("Missing report id");
  const report = await getInspectionStatusForReport(accountId, reportId);
  assertEditableStatus(report.status);

  const defaultRoomNames = getDefaultInspectionRoomNames();
  const defaultItemsByRoom = buildDefaultEvidenceItemsPayload(defaultRoomNames);

  const { data: existingRooms, error: roomsError } = await supabase
    .from("inspection_rooms")
    .select("id, room_name")
    .eq("account_id", accountId)
    .eq("inspection_report_id", reportId);
  if (roomsError) throw roomsError;

  const existingRoomNames = new Set((existingRooms || []).map((room) => String(room.room_name || "").toLowerCase()));
  const roomsToCreate = defaultRoomNames
    .filter((roomName) => !existingRoomNames.has(roomName.toLowerCase()))
    .map((roomName, index) => ({
      account_id: accountId,
      inspection_report_id: reportId,
      room_name: roomName,
      sort_order: index * 10,
    }));

  let createdRooms = [];
  if (roomsToCreate.length > 0) {
    const { data, error } = await supabase
      .from("inspection_rooms")
      .insert(roomsToCreate)
      .select("id, room_name, sort_order");
    if (error) throw error;
    createdRooms = data || [];
  }

  const allRooms = [...(existingRooms || []), ...createdRooms];
  const itemRows = allRooms.flatMap((room) => {
    const template = defaultItemsByRoom.find((entry) => String(entry.room_name).toLowerCase() === String(room.room_name || "").toLowerCase());
    return (template?.items || []).map((label, index) => ({
      account_id: accountId,
      inspection_room_id: room.id,
      item_label: label,
      condition_rating: null,
      sort_order: index * 10,
    }));
  });

  let createdItemCount = 0;
  if (itemRows.length > 0) {
    const { data: existingItems, error: itemsError } = await supabase
      .from("inspection_evidence_items")
      .select("inspection_room_id, item_label")
      .eq("account_id", accountId)
      .in("inspection_room_id", allRooms.map((room) => room.id));
    if (itemsError) throw itemsError;

    const existingItemKeys = new Set((existingItems || []).map((item) => `${item.inspection_room_id}:${String(item.item_label || "").toLowerCase()}`));
    const itemsToCreate = itemRows.filter((item) => !existingItemKeys.has(`${item.inspection_room_id}:${String(item.item_label || "").toLowerCase()}`));
    if (itemsToCreate.length > 0) {
      const { error } = await supabase.from("inspection_evidence_items").insert(itemsToCreate);
      if (error) throw error;
      createdItemCount = itemsToCreate.length;
    }
  }

  await writeInspectionAuditEvent(accountId, reportId, "default_evidence_items_populated", {
    source: "default_room_template_recovery",
    room_count: allRooms.length,
    created_room_count: createdRooms.length,
    created_item_count: createdItemCount,
  });

  return true;
}

export async function updateInspectionEvidenceItem(accountId, itemId, patch = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!itemId) throw new Error("Missing item id");
  const report = await getInspectionStatusForItem(accountId, itemId);
  assertEditableStatus(report.status);
  const nextPatch = {};
  if (Object.prototype.hasOwnProperty.call(patch, "condition_rating")) nextPatch.condition_rating = patch.condition_rating || null;
  if (Object.prototype.hasOwnProperty.call(patch, "notes")) nextPatch.notes = patch.notes ? String(patch.notes).trim() : null;
  if (Object.prototype.hasOwnProperty.call(patch, "item_label")) nextPatch.item_label = String(patch.item_label || "").trim();
  Object.keys(nextPatch).forEach((key) => nextPatch[key] === undefined && delete nextPatch[key]);
  const { data, error } = await supabase
    .from("inspection_evidence_items")
    .update(nextPatch)
    .eq("id", itemId)
    .eq("account_id", accountId)
    .select("id, item_label, condition_rating, notes, sort_order, created_at, updated_at")
    .single();
  if (error) throw error;
  await writeInspectionAuditEvent(accountId, report.reportId, "evidence_item_updated", {
    room_name: report.roomName,
    item_label: report.itemLabel,
    changed_fields: Object.keys(nextPatch),
  });
  return data;
}

export async function attachInspectionEvidenceFile(accountId, evidenceItemId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!evidenceItemId) throw new Error("Missing evidence item id");
  if (!payload.documentId && !payload.storagePath) throw new Error("Choose a file to attach");
  const report = await getInspectionStatusForItem(accountId, evidenceItemId);
  assertEditableStatus(report.status);
  const { data, error } = await supabase
    .from("inspection_photos")
    .insert({
      account_id: accountId,
      evidence_item_id: evidenceItemId,
      document_id: payload.documentId || null,
      storage_path: payload.storagePath || null,
      caption: payload.caption ? String(payload.caption).trim() : null,
    })
    .select("id, document_id, storage_path, caption, captured_at")
    .single();
  if (error) throw error;
  await writeInspectionAuditEvent(accountId, report.reportId, "photo_added", {
    room_name: report.roomName,
    item_label: report.itemLabel,
    has_document: Boolean(payload.documentId),
  });
  return data;
}

export async function recordInspectionSignature(accountId, reportId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!reportId) throw new Error("Missing report id");
  const report = await getInspectionStatusForReport(accountId, reportId);
  assertEditableStatus(report.status);
  const signerName = String(payload.signerName || "").trim();
  if (!signerName) throw new Error("Add signer name");
  const signerType = payload.signerType === "agent" ? "agent" : "landlord";
  // Route through provenance-anchored RPC — no direct table insert (E-033).
  const { data, error } = await supabase.rpc("capture_inspection_signature", {
    p_account_id: accountId,
    p_report_id: reportId,
    p_signer_name: signerName,
    p_signer_type: signerType,
    p_signer_role: "landlord",
    p_signed_from: "landlord_portal",
  });
  if (error) throw error;
  return data;
}

export function getActiveInspectionShare(report = {}) {
  return (report.inspection_report_shares || []).find((share) => !share.revoked_at && !["revoked", "expired"].includes(share.share_status)) || null;
}

export async function shareInspectionReportWithTenant(accountId, reportId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!reportId) throw new Error("Missing report id");
  const { data: report, error: reportError } = await supabase
    .from("inspection_reports")
    .select("id, account_id, tenant_id, status")
    .eq("account_id", accountId)
    .eq("id", reportId)
    .single();
  if (reportError) throw reportError;
  if (!report?.tenant_id) throw new Error("Link a tenant before sharing this inspection report.");

  const userId = await getCurrentUserId();
  const row = {
    account_id: accountId,
    inspection_report_id: reportId,
    tenant_id: report.tenant_id,
    shared_by: userId,
    share_status: "shared",
    message: payload.message ? String(payload.message).trim() : null,
    response_due_at: payload.response_due_at || null,
    revoked_at: null,
  };

  const { data: existing, error: existingError } = await supabase
    .from("inspection_report_shares")
    .select("id")
    .eq("account_id", accountId)
    .eq("inspection_report_id", reportId)
    .eq("tenant_id", report.tenant_id)
    .is("revoked_at", null)
    .maybeSingle();
  if (existingError) throw existingError;

  const query = existing?.id
    ? supabase.from("inspection_report_shares").update(row).eq("account_id", accountId).eq("id", existing.id)
    : supabase.from("inspection_report_shares").insert(row);
  const { data, error } = await query
    .select("id, account_id, inspection_report_id, tenant_id, share_status, message, response_due_at, shared_at, viewed_at, responded_at, revoked_at, created_at, updated_at")
    .single();
  if (error) throw error;
  await writeInspectionAuditEvent(accountId, reportId, "report_shared_with_tenant", {
    tenant_id: report.tenant_id,
  }, userId);
  return data;
}

export async function revokeInspectionReportShare(accountId, shareId) {
  if (!accountId) throw new Error("Missing accountId");
  if (!shareId) throw new Error("Missing share id");
  const { data, error } = await supabase
    .from("inspection_report_shares")
    .update({ share_status: "revoked", revoked_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("id", shareId)
    .select("id, account_id, inspection_report_id, tenant_id, share_status, revoked_at")
    .single();
  if (error) throw error;
  await writeInspectionAuditEvent(accountId, data.inspection_report_id, "report_share_revoked", {
    tenant_id: data.tenant_id,
  });
  return data;
}

export async function listTenantInspectionReportShares(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase
    .from("inspection_report_shares")
    .select(TENANT_SHARE_SELECT)
    .eq("account_id", accountId)
    .is("revoked_at", null)
    .not("share_status", "in", "(revoked,expired)")
    .order("shared_at", { ascending: false });
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function getTenantInspectionReportShare(accountId, shareId) {
  if (!accountId || !shareId) return null;
  const { data, error } = await supabase
    .from("inspection_report_shares")
    .select(TENANT_SHARE_SELECT)
    .eq("account_id", accountId)
    .eq("id", shareId)
    .is("revoked_at", null)
    .not("share_status", "in", "(revoked,expired)")
    .single();
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  return data;
}

export async function markTenantInspectionReportViewed(accountId, shareId) {
  if (!accountId || !shareId) return null;
  const now = new Date().toISOString();
  const { data: current, error: currentError } = await supabase
    .from("inspection_report_shares")
    .select("id, share_status, viewed_at, inspection_report_id")
    .eq("account_id", accountId)
    .eq("id", shareId)
    .is("revoked_at", null)
    .not("share_status", "in", "(revoked,expired)")
    .single();
  if (currentError) throw currentError;
  if (current.viewed_at) return current;
  const { data, error } = await supabase
    .from("inspection_report_shares")
    .update({ viewed_at: now, share_status: current.share_status === "shared" ? "viewed" : current.share_status })
    .eq("account_id", accountId)
    .eq("id", shareId)
    .is("revoked_at", null)
    .not("share_status", "in", "(revoked,expired)")
    .select("id, share_status, viewed_at, inspection_report_id")
    .single();
  if (error) throw error;
  await writeInspectionAuditEvent(accountId, data.inspection_report_id, "tenant_viewed_report", {});
  return data;
}

export async function addTenantInspectionReportComment(accountId, shareId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!shareId) throw new Error("Missing share id");
  const comment = String(payload.comment || "").trim();
  if (!comment) throw new Error("Add a comment");
  const { data: share, error: shareError } = await supabase
    .from("inspection_report_shares")
    .select("id, account_id, inspection_report_id, tenant_id, share_status")
    .eq("account_id", accountId)
    .eq("id", shareId)
    .is("revoked_at", null)
    .not("share_status", "in", "(revoked,expired)")
    .single();
  if (shareError) throw shareError;
  const commentType = ["general", "agree", "dispute", "clarification"].includes(payload.comment_type) ? payload.comment_type : "general";
  const { data, error } = await supabase
    .from("inspection_report_tenant_comments")
    .insert({
      account_id: accountId,
      inspection_report_id: share.inspection_report_id,
      share_id: share.id,
      tenant_id: share.tenant_id,
      evidence_item_id: payload.evidence_item_id || null,
      comment_type: commentType,
      comment,
    })
    .select("id, evidence_item_id, comment_type, comment, created_at, updated_at")
    .single();
  if (error) throw error;
  if (commentType === "dispute") {
    const { error: shareUpdateError } = await supabase
      .from("inspection_report_shares")
      .update({ share_status: "tenant_disputed", responded_at: new Date().toISOString() })
      .eq("account_id", accountId)
      .eq("id", share.id)
      .is("revoked_at", null)
      .not("share_status", "in", "(revoked,expired)");
    if (shareUpdateError) throw shareUpdateError;
  }
  await writeInspectionAuditEvent(accountId, share.inspection_report_id, commentType === "dispute" ? "tenant_disputed_report" : "tenant_commented_on_report", {
    comment_type: commentType,
    evidence_item_id: payload.evidence_item_id || null,
  });
  return data;
}

export async function recordTenantInspectionSignature(accountId, shareId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!shareId) throw new Error("Missing share id");
  const signerName = String(payload.signerName || "").trim();
  if (!signerName) throw new Error("Add signer name");
  const { data: share, error: shareError } = await supabase
    .from("inspection_report_shares")
    .select("id, account_id, inspection_report_id, tenant_id, share_status, inspection_report_tenant_comments(comment_type)")
    .eq("account_id", accountId)
    .eq("id", shareId)
    .is("revoked_at", null)
    .not("share_status", "in", "(revoked,expired)")
    .single();
  if (shareError) throw shareError;
  // JS-level duplicate guard — gives a clear error message before hitting the DB unique constraint.
  const { data: existingSignature, error: existingSignatureError } = await supabase
    .from("inspection_signatures")
    .select("id")
    .eq("account_id", accountId)
    .eq("share_id", share.id)
    .eq("tenant_id", share.tenant_id)
    .eq("signer_role", "tenant")
    .maybeSingle();
  if (existingSignatureError) throw existingSignatureError;
  if (existingSignature) throw new Error("This inspection report has already been signed from the tenant portal.");
  const hasDispute = (share.inspection_report_tenant_comments || []).some((comment) => comment.comment_type === "dispute");
  // Route through provenance-anchored RPC — no direct table insert (E-033).
  // signer_type/signer_role/signed_from/tenant_id are server-derived from the share on the RPC side.
  const { data: sigResult, error: sigError } = await supabase.rpc("capture_inspection_signature", {
    p_account_id: accountId,
    p_report_id: share.inspection_report_id,
    p_signer_name: signerName,
    p_share_id: shareId,
  });
  if (sigError) throw sigError;
  const nextStatus = hasDispute ? "tenant_disputed" : "tenant_signed";
  const { error: shareUpdateError } = await supabase
    .from("inspection_report_shares")
    .update({ share_status: nextStatus, responded_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("id", share.id)
    .is("revoked_at", null)
    .not("share_status", "in", "(revoked,expired)");
  if (shareUpdateError) throw shareUpdateError;
  await writeInspectionAuditEvent(accountId, share.inspection_report_id, hasDispute ? "tenant_disputed_report" : "tenant_signed_report", {
    tenant_id: share.tenant_id,
  });
  return sigResult;
}

export async function lockInspectionReport(id, accountId) {
  const { error: rpcErr } = await supabase.rpc("lock_inspection_report", {
    p_account_id: accountId,
    p_report_id: id,
  });
  if (rpcErr) throw rpcErr;
  const { data, error } = await supabase
    .from("inspection_reports")
    .select(INSPECTION_SELECT)
    .eq("id", id)
    .eq("account_id", accountId)
    .single();
  if (error) throw error;
  return data;
}

export async function archiveInspectionReport(id, accountId) {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("inspection_reports")
    .update({ status: "archived", archived_at: new Date().toISOString(), archived_by: userId })
    .eq("id", id)
    .eq("account_id", accountId)
    .select(INSPECTION_SELECT)
    .single();
  if (error) throw error;
  await writeInspectionAuditEvent(accountId, id, "report_archived", {}, userId);
  return data;
}

async function writeDepositDisputePackAuditEvent(accountId, packId, eventType, metadata = {}, userId = undefined) {
  if (!accountId || !eventType) return null;
  const { data, error } = await supabase
    .from("deposit_dispute_pack_audit_events")
    .insert({
      account_id: accountId,
      dispute_pack_id: packId || null,
      user_id: userId === undefined ? await getCurrentUserId() : userId,
      event_type: eventType,
      metadata,
    })
    .select("id, account_id, dispute_pack_id, user_id, event_type, metadata, created_at")
    .single();
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  return data;
}

function parseOptionalNonNegativeAmount(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} must be a positive number`);
  return amount;
}

function normalizeEvidenceReferenceType(value) {
  if (!value) return null;
  const nextType = normalizeDisputePackEvidenceReferenceType(value);
  if (!nextType) throw new Error("Choose a valid evidence reference type");
  return nextType;
}

async function assertDepositDisputePackOwned(accountId, packId) {
  const { data, error } = await supabase
    .from("deposit_dispute_packs")
    .select("id, account_id, status")
    .eq("account_id", accountId)
    .eq("id", packId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Dispute pack not found");
  return data;
}

function assertDisputePackEditable(status) {
  if (["locked", "archived"].includes(status)) {
    throw new Error("This dispute pack is locked or archived. Editing is disabled to preserve the evidence bundle.");
  }
}

export async function listDepositDisputePacks(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase
    .from("deposit_dispute_packs")
    .select(DISPUTE_PACK_SELECT)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function getDepositDisputePackDetails(accountId, packId) {
  if (!accountId || !packId) return null;
  const { data, error } = await supabase
    .from("deposit_dispute_packs")
    .select(DISPUTE_PACK_SELECT)
    .eq("account_id", accountId)
    .eq("id", packId)
    .single();
  if (error) {
    if (isMissingBackendObject(error)) return null;
    throw error;
  }
  return data;
}

export async function createDepositDisputePack(accountId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!payload.propertyId) throw new Error("Choose a property");
  const depositAmount = parseOptionalNonNegativeAmount(payload.depositAmount, "Deposit amount");
  const proposedDeductionAmount = parseOptionalNonNegativeAmount(payload.proposedDeductionAmount, "Proposed deduction amount");
  const title = String(payload.title || "").trim() || "Deposit dispute pack";
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("deposit_dispute_packs")
    .insert({
      account_id: accountId,
      property_id: payload.propertyId,
      tenant_id: payload.tenantId || null,
      title,
      deposit_amount: depositAmount,
      proposed_deduction_amount: proposedDeductionAmount,
      summary: payload.summary ? String(payload.summary).trim() : null,
      created_by: userId,
    })
    .select(DISPUTE_PACK_SELECT)
    .single();
  if (error) throw error;
  await writeDepositDisputePackAuditEvent(accountId, data.id, "pack_created", {
    property_id: payload.propertyId,
    tenant_id: payload.tenantId || null,
  }, userId);
  return data;
}

export async function addDepositDisputePackItem(accountId, packId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!packId) throw new Error("Missing dispute pack id");
  const pack = await assertDepositDisputePackOwned(accountId, packId);
  assertDisputePackEditable(pack.status);
  const title = String(payload.title || "").trim();
  if (!title) throw new Error("Add an item title");
  const itemType = normalizeDisputePackItemType(payload.itemType || payload.item_type, "deduction");
  if (!itemType) throw new Error("Choose a valid item type");
  const claimedAmount = parseOptionalNonNegativeAmount(payload.claimedAmount ?? payload.claimed_amount, "Claimed amount");
  const evidenceReferenceType = normalizeEvidenceReferenceType(payload.evidenceReferenceType || payload.evidence_reference_type);
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("deposit_dispute_pack_items")
    .insert({
      account_id: accountId,
      dispute_pack_id: packId,
      item_type: itemType,
      title,
      description: payload.description ? String(payload.description).trim() : null,
      claimed_amount: claimedAmount,
      evidence_reference_type: evidenceReferenceType,
      evidence_reference_id: payload.evidenceReferenceId || payload.evidence_reference_id || null,
      sort_order: Number(payload.sortOrder || payload.sort_order || 0),
    })
    .select("id, item_type, title, description, claimed_amount, evidence_reference_type, evidence_reference_id, sort_order, created_at, updated_at")
    .single();
  if (error) throw error;
  await writeDepositDisputePackAuditEvent(accountId, packId, itemType === "deduction" ? "deduction_added" : "evidence_added", {
    item_type: itemType,
    has_evidence_reference: Boolean(payload.evidenceReferenceId || payload.evidence_reference_id),
  }, userId);
  return data;
}

export async function updateDepositDisputePackItem(accountId, packId, itemId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!packId) throw new Error("Missing dispute pack id");
  if (!itemId) throw new Error("Missing dispute pack item id");
  const pack = await assertDepositDisputePackOwned(accountId, packId);
  assertDisputePackEditable(pack.status);
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(payload, "itemType") || Object.prototype.hasOwnProperty.call(payload, "item_type")) {
    const itemType = normalizeDisputePackItemType(payload.itemType || payload.item_type);
    if (!itemType) throw new Error("Choose a valid item type");
    patch.item_type = itemType;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "title")) {
    const title = String(payload.title || "").trim();
    if (!title) throw new Error("Add an item title");
    patch.title = title;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "description")) {
    patch.description = payload.description ? String(payload.description).trim() : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "claimedAmount") || Object.prototype.hasOwnProperty.call(payload, "claimed_amount")) {
    patch.claimed_amount = parseOptionalNonNegativeAmount(payload.claimedAmount ?? payload.claimed_amount, "Claimed amount");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "evidenceReferenceType") || Object.prototype.hasOwnProperty.call(payload, "evidence_reference_type")) {
    patch.evidence_reference_type = normalizeEvidenceReferenceType(payload.evidenceReferenceType || payload.evidence_reference_type);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "evidenceReferenceId") || Object.prototype.hasOwnProperty.call(payload, "evidence_reference_id")) {
    patch.evidence_reference_id = payload.evidenceReferenceId || payload.evidence_reference_id || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "sortOrder") || Object.prototype.hasOwnProperty.call(payload, "sort_order")) {
    patch.sort_order = Number(payload.sortOrder || payload.sort_order || 0);
  }
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("deposit_dispute_pack_items")
    .update(patch)
    .eq("account_id", accountId)
    .eq("dispute_pack_id", packId)
    .eq("id", itemId)
    .select("id, item_type, title, description, claimed_amount, evidence_reference_type, evidence_reference_id, sort_order, created_at, updated_at")
    .single();
  if (error) throw error;
  await writeDepositDisputePackAuditEvent(accountId, packId, "pack_item_updated", {
    item_type: data.item_type,
  }, userId);
  return data;
}

export async function removeDepositDisputePackItem(accountId, packId, itemId) {
  if (!accountId) throw new Error("Missing accountId");
  if (!packId) throw new Error("Missing dispute pack id");
  if (!itemId) throw new Error("Missing dispute pack item id");
  const pack = await assertDepositDisputePackOwned(accountId, packId);
  assertDisputePackEditable(pack.status);
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("deposit_dispute_pack_items")
    .delete()
    .eq("account_id", accountId)
    .eq("dispute_pack_id", packId)
    .eq("id", itemId);
  if (error) throw error;
  await writeDepositDisputePackAuditEvent(accountId, packId, "pack_item_removed", {
    item_id: itemId,
  }, userId);
  return true;
}

export async function updateDepositDisputePackStatus(accountId, packId, status) {
  if (!accountId) throw new Error("Missing accountId");
  if (!packId) throw new Error("Missing dispute pack id");
  const allowedStatuses = new Set(["draft", "ready", "exported", "locked", "archived"]);
  if (!allowedStatuses.has(status)) throw new Error("Choose a valid dispute pack status");
  const pack = await assertDepositDisputePackOwned(accountId, packId);
  if (pack.status === "archived") throw new Error("An archived dispute pack cannot be changed.");
  if (pack.status === "locked" && status !== "archived") {
    throw new Error("A locked dispute pack can only be archived.");
  }
  if (pack.status === "exported" && status === "draft") {
    throw new Error("An exported dispute pack cannot be reset to draft.");
  }
  const patch = { status };
  if (status === "locked") patch.locked_at = new Date().toISOString();
  if (status === "archived") patch.archived_at = new Date().toISOString();
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("deposit_dispute_packs")
    .update(patch)
    .eq("account_id", accountId)
    .eq("id", packId)
    .select(DISPUTE_PACK_SELECT)
    .single();
  if (error) throw error;
  await writeDepositDisputePackAuditEvent(accountId, packId, `pack_${status}`, {}, userId);
  return data;
}

export async function recordDepositDisputePackExport(accountId, packId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!packId) throw new Error("Missing dispute pack id");
  const pack = await assertDepositDisputePackOwned(accountId, packId);
  if (pack.status === "archived") throw new Error("An archived dispute pack cannot be exported.");
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("deposit_dispute_pack_exports")
    .insert({
      account_id: accountId,
      dispute_pack_id: packId,
      export_type: payload.exportType || "pdf",
      status: "generated",
      generated_by: userId,
      metadata: payload.metadata || {},
    })
    .select("id, export_type, status, document_id, storage_path, generated_at, metadata")
    .single();
  if (error) throw error;
  if (!["locked", "archived"].includes(pack.status)) {
    const { error: updateError } = await supabase
      .from("deposit_dispute_packs")
      .update({ status: "exported" })
      .eq("account_id", accountId)
      .eq("id", packId);
    if (updateError) throw updateError;
  }
  await writeDepositDisputePackAuditEvent(accountId, packId, "pack_exported", {
    export_type: payload.exportType || "pdf",
  }, userId);
  return data;
}

export async function listInspectionAuditEvents(accountId, reportId) {
  if (!accountId || !reportId) return [];
  const { data, error } = await supabase
    .from("inspection_audit_events")
    .select(INSPECTION_AUDIT_SELECT)
    .eq("account_id", accountId)
    .eq("inspection_report_id", reportId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function listDiagnosticTemplates() {
  const { data, error } = await supabase
    .from("maintenance_diagnostic_templates")
    .select("id, issue_type, title, description, emergency_warning, maintenance_diagnostic_steps(id, step_key, question, answer_type, options, help_text, sort_order)")
    .eq("active", true)
    .order("title", { ascending: true });
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function listPropertyApplicationLinks(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase
    .from("property_application_links")
    .select(APPLICATION_LINK_SELECT)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function createPropertyApplicationLink(accountId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!payload.propertyId) throw new Error("Choose a property");
  const { data, error } = await supabase
    .from("property_application_links")
    .insert({
      account_id: accountId,
      property_id: payload.propertyId,
      title: String(payload.title || "Rental application").trim(),
      monthly_rent: Number(payload.monthlyRent) || null,
      available_from: payload.availableFrom || null,
      preferences: payload.preferences || {},
    })
    .select(APPLICATION_LINK_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function listRentalApplications(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase
    .from("rental_applications")
    .select(APPLICATION_SELECT)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  return data || [];
}

export async function updateRentalApplicationStatus(accountId, id, status) {
  const { data, error } = await supabase
    .from("rental_applications")
    .update({ status })
    .eq("account_id", accountId)
    .eq("id", id)
    .select(APPLICATION_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function submitPublicRentalApplication(publicToken, payload) {
  const { data, error } = await supabase.rpc("submit_public_rental_application", {
    p_public_token: publicToken,
    p_payload: payload,
  });
  if (error) throw error;
  return data;
}
