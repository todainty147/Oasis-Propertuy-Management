import { supabase } from "../lib/supabase";

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
  "title", "inspection_date", "locked_at", "locked_by", "created_by", "created_at", "updated_at",
  "inspection_rooms(id, room_name, sort_order)",
].join(", ");

const DEFAULT_INSPECTION_ROOMS = [
  "Entrance / hallway",
  "Kitchen",
  "Living room",
  "Bedroom",
  "Bathroom",
  "Garden / exterior",
  "Meters",
  "Keys",
  "Appliances",
];

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

export async function createInspectionReport(accountId, payload = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!payload.propertyId) throw new Error("Choose a property");
  const rooms = Array.isArray(payload.rooms) && payload.rooms.length > 0 ? payload.rooms : DEFAULT_INSPECTION_ROOMS;
  const { data: report, error } = await supabase.rpc("create_inspection_report_with_rooms", {
    p_account_id: accountId,
    p_property_id: payload.propertyId,
    p_tenant_id: payload.tenantId || null,
    p_inspection_type: payload.inspectionType || "check_in",
    p_title: String(payload.title || "Inspection report").trim(),
    p_inspection_date: payload.inspectionDate || new Date().toISOString().slice(0, 10),
    p_rooms: rooms,
  });
  if (error) throw error;
  return report;
}

export async function lockInspectionReport(id, accountId) {
  const { data, error } = await supabase
    .from("inspection_reports")
    .update({ status: "locked", locked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("account_id", accountId)
    .select(INSPECTION_SELECT)
    .single();
  if (error) throw error;
  return data;
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
