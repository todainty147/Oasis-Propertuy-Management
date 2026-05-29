import { supabase } from "../lib/supabase";
import { buildDefaultEvidenceItemsPayload, getDefaultInspectionRoomNames } from "../data/inspectionRoomTemplates";

const COMPLIANCE_SELECT = [
  "id", "account_id", "property_id", "tenant_id", "tenancy_id",
  "requirement_id", "status", "due_date", "completed_at", "expires_at",
  "evidence_document_id", "acknowledged_by_tenant_at", "notes",
  "created_by", "created_at", "updated_at",
  "compliance_requirements(label, requirement_key, expiry_tracking, acknowledgement_required, compliance_templates(country_code, jurisdiction, name))",
].join(", ");

const COMPLIANCE_TEMPLATE_SELECT = [
  "id", "country_code", "jurisdiction", "template_key", "name", "description",
  "compliance_requirements(id, requirement_key, label, default_due_offset_days, sort_order, active)",
].join(", ");

const INSPECTION_SELECT = [
  "id", "account_id", "property_id", "tenant_id", "inspection_type", "status",
  "title", "inspection_date", "locked_at", "locked_by", "archived_at", "archived_by", "created_by", "created_at", "updated_at",
  "inspection_rooms(id, room_name, sort_order, inspection_evidence_items(id, condition_rating, inspection_photos(id)))",
].join(", ");

const INSPECTION_DETAIL_SELECT = [
  "id", "account_id", "property_id", "tenant_id", "inspection_type", "status",
  "title", "inspection_date", "locked_at", "locked_by", "archived_at", "archived_by", "created_by", "created_at", "updated_at",
  "inspection_rooms(id, room_name, sort_order, inspection_evidence_items(id, item_label, condition_rating, notes, sort_order, created_at, updated_at, inspection_photos(id, document_id, storage_path, caption, captured_at)))",
  "inspection_signatures(id, signer_type, signer_name, signed_at, metadata)",
].join(", ");

const INSPECTION_AUDIT_SELECT = "id, account_id, inspection_report_id, user_id, event_type, metadata, created_at";

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
  return error?.code === "PGRST404" || message.includes("relation") || message.includes("does not exist");
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
  return data || [];
}

export async function updateComplianceSafeItem(id, accountId, patch = {}) {
  if (!id) throw new Error("Missing compliance item id");
  if (!accountId) throw new Error("Missing accountId");
  const nextPatch = {
    status: patch.status,
    notes: patch.notes,
  };
  if (Object.prototype.hasOwnProperty.call(patch, "expires_at")) nextPatch.expires_at = patch.expires_at || null;
  if (Object.prototype.hasOwnProperty.call(patch, "evidence_document_id")) nextPatch.evidence_document_id = patch.evidence_document_id || null;
  Object.keys(nextPatch).forEach((key) => nextPatch[key] === undefined && delete nextPatch[key]);
  if (["logged", "acknowledged"].includes(nextPatch.status)) nextPatch.completed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("tenancy_compliance_items")
    .update(nextPatch)
    .eq("id", id)
    .eq("account_id", accountId)
    .select(COMPLIANCE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function listInspectionReports(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase
    .from("inspection_reports")
    .select(INSPECTION_SELECT)
    .eq("account_id", accountId)
    .order("inspection_date", { ascending: false })
    .limit(100);
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

async function writeInspectionAuditEvent(accountId, reportId, eventType, metadata = {}) {
  if (!accountId || !reportId || !eventType) return null;
  const { data, error } = await supabase
    .from("inspection_audit_events")
    .insert({
      account_id: accountId,
      inspection_report_id: reportId,
      user_id: await getCurrentUserId(),
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
  await writeInspectionAuditEvent(accountId, report.reportId, "room_created", {
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
    }
  }

  await writeInspectionAuditEvent(accountId, reportId, "room_created", {
    source: "default_room_template_recovery",
    room_count: defaultRoomNames.length,
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
  const { data, error } = await supabase
    .from("inspection_signatures")
    .insert({
      account_id: accountId,
      inspection_report_id: reportId,
      signer_type: payload.signerType || "landlord",
      signer_name: signerName,
      metadata: { source: "evidence_vault_manual_acknowledgement" },
    })
    .select("id, signer_type, signer_name, signed_at, metadata")
    .single();
  if (error) throw error;
  await writeInspectionAuditEvent(accountId, reportId, "report_updated", {
    action: "signature_acknowledgement_recorded",
    signer_type: payload.signerType || "landlord",
  });
  return data;
}

export async function lockInspectionReport(id, accountId) {
  const current = await getInspectionStatusForReport(accountId, id);
  assertEditableStatus(current.status);
  const { data, error } = await supabase
    .from("inspection_reports")
    .update({ status: "locked", locked_at: new Date().toISOString(), locked_by: await getCurrentUserId() })
    .eq("id", id)
    .eq("account_id", accountId)
    .select(INSPECTION_SELECT)
    .single();
  if (error) throw error;
  await writeInspectionAuditEvent(accountId, id, "report_locked", {});
  return data;
}

export async function archiveInspectionReport(id, accountId) {
  const { data, error } = await supabase
    .from("inspection_reports")
    .update({ status: "archived", archived_at: new Date().toISOString(), archived_by: await getCurrentUserId() })
    .eq("id", id)
    .eq("account_id", accountId)
    .select(INSPECTION_SELECT)
    .single();
  if (error) throw error;
  await writeInspectionAuditEvent(accountId, id, "report_archived", {});
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
