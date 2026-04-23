import { supabase } from "../lib/supabase";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "./documentService";
import { createSignedStorageUrl } from "./storageUrlService";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

const DEFAULT_TEMPLATE_STATUSES = ["active", "draft"];

function normalizeTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    account_id: row.account_id,
    country_code: row.country_code,
    language: row.language,
    template_type: row.template_type,
    name: row.name,
    description: row.description || "",
    storage_path: row.storage_path,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes || 0),
    version: Number(row.version || 1),
    status: row.status,
    upload_status: row.upload_status,
    created_by: row.created_by || null,
    uploaded_by: row.uploaded_by || null,
    uploaded_at: row.uploaded_at || null,
    archived_at: row.archived_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function assertTemplateFile(file) {
  if (!file) throw new Error("Template file is required");
  if (!ALLOWED_MIME_TYPES.includes(file.type)) throw new Error("Unsupported template file type");
  if (file.size > MAX_FILE_SIZE) throw new Error("Template file is too large");
}

function templateContext({
  accountId = null,
  templateId = null,
  countryCode = null,
  templateType = null,
  operation = null,
} = {}) {
  return {
    accountId,
    templateId,
    countryCode,
    templateType,
    operation,
    storageBucket: "documents",
    documentSurface: "template_repository",
  };
}

export async function fetchDocumentTemplates({
  accountId,
  countryCode = "",
  templateType = "",
  status = "",
} = {}) {
  if (!accountId) return [];

  let query = supabase
    .from("document_templates")
    .select("*")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false });

  if (countryCode) query = query.eq("country_code", String(countryCode).toUpperCase());
  if (templateType) query = query.eq("template_type", templateType);
  if (status) query = query.eq("status", status);
  else query = query.in("status", DEFAULT_TEMPLATE_STATUSES);

  const { data, error } = await query;
  if (error) {
    logSecurityRelevantFailure("document_templates_select", {
      error,
      context: templateContext({
        accountId,
        countryCode,
        templateType,
        operation: "list_document_templates",
      }),
    });
    throw error;
  }

  return (data || []).map(normalizeTemplate).filter(Boolean);
}

export async function uploadDocumentTemplate({
  file,
  accountId,
  countryCode,
  language = "en",
  templateType,
  name,
  description = "",
}) {
  if (!accountId) throw new Error("No active account");
  if (!countryCode) throw new Error("Country is required");
  if (!templateType) throw new Error("Template type is required");
  if (!name?.trim()) throw new Error("Template name is required");
  assertTemplateFile(file);

  const { data: stub, error: stubError } = await supabase.rpc("create_document_template_stub", {
    p_account_id: accountId,
    p_country_code: String(countryCode).toUpperCase(),
    p_language: language || "en",
    p_template_type: templateType,
    p_name: name.trim(),
    p_description: description || null,
    p_filename: file.name,
    p_mime_type: file.type,
    p_size_bytes: file.size,
  });

  const template = Array.isArray(stub) ? stub[0] : stub;
  if (stubError || !template?.id || !template?.storage_path) {
    logSecurityRelevantFailure("create_document_template_stub", {
      error: stubError || new Error("Template stub missing id/storage path"),
      context: templateContext({
        accountId,
        countryCode,
        templateType,
        operation: "create_template_stub",
      }),
    });
    throw stubError || new Error("Could not create template stub");
  }

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(template.storage_path, file, {
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    logSecurityRelevantFailure("document_template_storage_upload", {
      error: uploadError,
      context: templateContext({
        accountId,
        templateId: template.id,
        countryCode,
        templateType,
        operation: "template_storage_upload",
      }),
    });
    throw uploadError;
  }

  const { data: finalized, error: finalizeError } = await supabase.rpc(
    "finalize_document_template_upload",
    {
      p_template_id: template.id,
      p_size_bytes: file.size,
      p_mime_type: file.type,
    },
  );

  if (finalizeError || !finalized?.id) {
    logSecurityRelevantFailure("finalize_document_template_upload", {
      error: finalizeError || new Error("Finalize template upload returned empty row"),
      context: templateContext({
        accountId,
        templateId: template.id,
        countryCode,
        templateType,
        operation: "finalize_template_upload",
      }),
    });
    throw finalizeError || new Error("Could not finalize template upload");
  }

  return normalizeTemplate(finalized);
}

export async function archiveDocumentTemplate({ templateId, accountId = null }) {
  if (!templateId) throw new Error("Template id is required");

  const { data, error } = await supabase.rpc("archive_document_template", {
    p_template_id: templateId,
  });

  if (error) {
    logSecurityRelevantFailure("archive_document_template", {
      error,
      context: templateContext({
        accountId,
        templateId,
        operation: "archive_document_template",
      }),
    });
    throw error;
  }

  return normalizeTemplate(data);
}

export async function getDocumentTemplatePreviewUrl(template) {
  if (!template?.storage_path) throw new Error("Template storage path is required");
  return createSignedStorageUrl("documents", template.storage_path, 60 * 10);
}
