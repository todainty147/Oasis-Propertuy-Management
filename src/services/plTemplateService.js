import { supabase } from "../lib/supabase";

export async function listLegalTemplates({
  market       = "pl",
  templateType = null,
  includeAll   = false,   // true = include draft/requires_review (admin only)
} = {}) {
  const { data, error } = await supabase.rpc("list_legal_templates", {
    p_market:        market,
    p_template_type: templateType,
    p_include_all:   includeAll,
  });
  if (error) throw error;
  return data || [];
}

export async function createLegalTemplate({
  accountId,
  market,
  language,
  templateType,
  title,
  version      = "1.0",
  status       = "draft",
  disclaimer,
  documentId   = null,
  parentId     = null,
}) {
  const { data, error } = await supabase
    .from("pl_legal_templates")
    .insert({
      account_id:        accountId,
      market,
      language,
      template_type:     templateType,
      title,
      version,
      status,
      is_active:         false,
      disclaimer:        disclaimer || "This template is provided for reference only and does not constitute legal advice.",
      document_id:       documentId,
      parent_template_id: parentId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTemplateStatus({ templateId, accountId, status, reviewedBy = null }) {
  const updates = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "reviewed" && reviewedBy) {
    updates.reviewed_by = reviewedBy;
    updates.reviewed_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from("pl_legal_templates")
    .update(updates)
    .eq("id", templateId)
    .eq("account_id", accountId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
