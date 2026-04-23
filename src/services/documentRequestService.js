import { supabase } from "../lib/supabase";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "./documentService";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

function normalizeUpload(row) {
  if (!row) return null;
  return {
    id: row.id,
    account_id: row.account_id,
    request_id: row.request_id,
    document_id: row.document_id,
    uploaded_by: row.uploaded_by,
    uploaded_by_role: row.uploaded_by_role,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes || 0),
    review_status: row.review_status,
    review_note: row.review_note || "",
    reviewed_by: row.reviewed_by || null,
    reviewed_at: row.reviewed_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    document: row.documents || row.document || null,
  };
}

function normalizeRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    account_id: row.account_id,
    target_role: row.target_role,
    tenant_id: row.tenant_id || null,
    contractor_id: row.contractor_id || null,
    property_id: row.property_id || null,
    template_id: row.template_id || null,
    request_type: row.request_type,
    title: row.title,
    instructions: row.instructions || "",
    due_at: row.due_at || null,
    status: row.status,
    requested_by: row.requested_by || null,
    reviewed_by: row.reviewed_by || null,
    reviewed_at: row.reviewed_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    uploads: (row.document_request_uploads || row.uploads || []).map(normalizeUpload).filter(Boolean),
    tenant: row.tenants || null,
    contractor: row.contractors || null,
    property: row.properties || null,
  };
}

function context(extra = {}) {
  return {
    surface: "document_requests",
    ...extra,
  };
}

function assertRequestFile(file) {
  if (!file) throw new Error("File is required");
  if (!ALLOWED_MIME_TYPES.includes(file.type)) throw new Error("Unsupported file type");
  if (file.size > MAX_FILE_SIZE) throw new Error("File is too large");
}

export async function fetchDocumentRequests({ accountId, targetRole = "", status = "" } = {}) {
  if (!accountId) return [];

  let query = supabase
    .from("document_requests")
    .select(`
      *,
      tenants(id, name, email),
      contractors(id, name, email),
      properties(id, address, city),
      document_request_uploads(*, documents(id, name, storage_path, mime_type, size_bytes, review_status, upload_status))
    `)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (targetRole) query = query.eq("target_role", targetRole);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    logSecurityRelevantFailure("document_requests_select", {
      error,
      context: context({ accountId, targetRole, status }),
    });
    throw error;
  }

  return (data || []).map(normalizeRequest).filter(Boolean);
}

export async function fetchContractorsForDocumentRequests(accountId) {
  if (!accountId) return [];
  const { data, error } = await supabase
    .from("contractors")
    .select("id, name, email, user_id, active")
    .eq("account_id", accountId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) {
    logSecurityRelevantFailure("document_request_contractors_select", {
      error,
      context: context({ accountId }),
    });
    throw error;
  }

  return data || [];
}

export async function createDocumentRequest({
  accountId,
  targetRole,
  tenantId = null,
  contractorId = null,
  propertyId = null,
  templateId = null,
  requestType = "other",
  title,
  instructions = "",
  dueAt = null,
}) {
  const { data, error } = await supabase.rpc("create_document_request", {
    p_account_id: accountId,
    p_target_role: targetRole,
    p_tenant_id: tenantId || null,
    p_contractor_id: contractorId || null,
    p_property_id: propertyId || null,
    p_template_id: templateId || null,
    p_request_type: requestType,
    p_title: title,
    p_instructions: instructions || null,
    p_due_at: dueAt || null,
  });

  if (error) {
    logSecurityRelevantFailure("create_document_request", {
      error,
      context: context({ accountId, targetRole, tenantId, contractorId, requestType }),
    });
    throw error;
  }

  return normalizeRequest(data);
}

export async function uploadDocumentRequestFile({ requestId, file }) {
  assertRequestFile(file);

  const { data: stub, error: stubError } = await supabase.rpc("create_document_request_upload_stub", {
    p_request_id: requestId,
    p_filename: file.name,
    p_mime_type: file.type,
    p_size_bytes: file.size,
  });

  const doc = Array.isArray(stub) ? stub[0] : stub;
  if (stubError || !doc?.id || !doc?.storage_path) {
    logSecurityRelevantFailure("create_document_request_upload_stub", {
      error: stubError || new Error("Document request upload stub missing id/storage path"),
      context: context({ requestId }),
    });
    throw stubError || new Error("Could not create upload stub");
  }

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(doc.storage_path, file, {
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    logSecurityRelevantFailure("document_request_storage_upload", {
      error: uploadError,
      context: context({ requestId, documentId: doc.id }),
    });
    throw uploadError;
  }

  const { data: finalized, error: finalizeError } = await supabase.rpc("finalize_document_request_upload", {
    p_document_id: doc.id,
    p_size_bytes: file.size,
    p_mime_type: file.type,
    p_original_filename: file.name,
  });

  if (finalizeError || !finalized?.id) {
    logSecurityRelevantFailure("finalize_document_request_upload", {
      error: finalizeError || new Error("Finalize document request upload returned empty row"),
      context: context({ requestId, documentId: doc.id }),
    });
    throw finalizeError || new Error("Could not finalize upload");
  }

  return finalized;
}

export async function reviewDocumentRequestUpload({ uploadId, reviewStatus, reviewNote = "" }) {
  const { data, error } = await supabase.rpc("review_document_request_upload", {
    p_upload_id: uploadId,
    p_review_status: reviewStatus,
    p_review_note: reviewNote || null,
  });

  if (error) {
    logSecurityRelevantFailure("review_document_request_upload", {
      error,
      context: context({ uploadId, reviewStatus }),
    });
    throw error;
  }

  return normalizeUpload(data);
}
