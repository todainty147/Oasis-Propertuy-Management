import { supabase } from "../lib/supabase";

function friendly(error, fallback) {
  return new Error(error?.message ?? fallback);
}

function normalizeEntityType(entityType) {
  return String(entityType || "").trim().toLowerCase();
}

function normalizeFieldType(fieldType) {
  return String(fieldType || "").trim().toLowerCase();
}

function normalizeDefinitionRow(row) {
  return {
    id: String(row?.id || ""),
    accountId: String(row?.account_id || ""),
    entityType: normalizeEntityType(row?.entity_type),
    fieldType: normalizeFieldType(row?.field_type),
    name: String(row?.name || ""),
    createdAt: row?.created_at ? String(row.created_at) : "",
    updatedAt: row?.updated_at ? String(row.updated_at) : "",
  };
}

export async function listCustomFieldDefinitions(accountId) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .from("custom_field_definitions")
    .select("id, account_id, entity_type, field_type, name, created_at, updated_at")
    .eq("account_id", accountId)
    .order("entity_type", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw friendly(error, "Failed to load custom fields");
  return (Array.isArray(data) ? data : []).map(normalizeDefinitionRow);
}

export async function createCustomFieldDefinition({
  accountId,
  entityType,
  fieldType,
  name,
} = {}) {
  const { data, error } = await supabase
    .from("custom_field_definitions")
    .insert({
      account_id: accountId,
      entity_type: normalizeEntityType(entityType),
      field_type: normalizeFieldType(fieldType),
      name: String(name || "").trim(),
    })
    .select("id, account_id, entity_type, field_type, name, created_at, updated_at")
    .single();

  if (error) throw friendly(error, "Failed to create custom field");
  return normalizeDefinitionRow(data);
}

export async function deleteCustomFieldDefinition({ accountId, definitionId } = {}) {
  const { error } = await supabase
    .from("custom_field_definitions")
    .delete()
    .eq("account_id", accountId)
    .eq("id", definitionId);

  if (error) throw friendly(error, "Failed to delete custom field");
  return true;
}
