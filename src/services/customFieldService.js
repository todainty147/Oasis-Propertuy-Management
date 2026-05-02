import { supabase } from "../lib/supabase";

function normalizeEntityType(entityType) {
  return String(entityType || "").trim().toLowerCase();
}

function normalizeFieldType(fieldType) {
  return String(fieldType || "").trim().toLowerCase();
}

function normalizeTextValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized;
}

function isBlankValue(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function friendly(error, fallback) {
  return new Error(error?.message ?? fallback);
}

function isValidIsoDateString(value) {
  const normalized = normalizeTextValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const [year, month, day] = normalized.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function validateCustomFieldInput(definition, rawValue) {
  const fieldType = normalizeFieldType(definition?.fieldType ?? definition?.field_type);
  const normalizedValue = normalizeTextValue(rawValue);

  if (normalizedValue === "") {
    return {
      isValid: true,
      error: "",
      normalizedValue: "",
    };
  }

  if (fieldType === "number") {
    const parsed = Number(normalizedValue);
    if (!Number.isFinite(parsed)) {
      return {
        isValid: false,
        error: "Enter a valid number.",
        normalizedValue,
      };
    }
    return {
      isValid: true,
      error: "",
      normalizedValue: String(parsed),
    };
  }

  if (fieldType === "date") {
    if (!isValidIsoDateString(normalizedValue)) {
      return {
        isValid: false,
        error: "Enter a valid date in YYYY-MM-DD format.",
        normalizedValue,
      };
    }
    return {
      isValid: true,
      error: "",
      normalizedValue,
    };
  }

  if (normalizedValue.length > 500) {
    return {
      isValid: false,
      error: "Text custom fields must be 500 characters or fewer.",
      normalizedValue,
    };
  }

  return {
    isValid: true,
    error: "",
    normalizedValue,
  };
}

export function validateCustomFieldEntries(definitions = [], values = {}) {
  const errors = {};
  const normalizedValues = {};

  for (const definition of Array.isArray(definitions) ? definitions : []) {
    const definitionId = String(definition?.id || "");
    if (!definitionId) continue;
    const result = validateCustomFieldInput(definition, values?.[definitionId]);
    normalizedValues[definitionId] = result.normalizedValue;
    if (!result.isValid && result.error) {
      errors[definitionId] = result.error;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalizedValues,
  };
}

export function formatCustomFieldDisplayValue(fieldType, valueRow = {}) {
  const normalizedType = normalizeFieldType(fieldType);

  if (normalizedType === "number") {
    if (valueRow.number_value === null || valueRow.number_value === undefined) return "—";
    return String(valueRow.number_value);
  }

  if (normalizedType === "date") {
    if (!valueRow.date_value) return "—";
    return String(valueRow.date_value);
  }

  if (!valueRow.text_value) return "—";
  return String(valueRow.text_value);
}

export async function listEntityCustomFieldValues({ accountId, entityType, entityId } = {}) {
  const normalizedEntityType = normalizeEntityType(entityType);
  if (!accountId || !entityId || !["property", "tenant"].includes(normalizedEntityType)) {
    return [];
  }

  const definitionsResult = await supabase
    .from("custom_field_definitions")
    .select("id, name, field_type, entity_type")
    .eq("account_id", accountId)
    .eq("entity_type", normalizedEntityType)
    .order("name", { ascending: true });

  if (definitionsResult.error) {
    throw friendly(definitionsResult.error, "Failed to load custom field definitions");
  }

  const definitions = Array.isArray(definitionsResult.data) ? definitionsResult.data : [];
  if (definitions.length === 0) return [];

  const definitionIds = definitions
    .map((definition) => String(definition?.id || "").trim())
    .filter(Boolean);

  const valuesResult = await supabase
    .from("custom_field_values")
    .select("definition_id, entity_id, text_value, number_value, date_value")
    .eq("account_id", accountId)
    .eq("entity_id", entityId)
    .in("definition_id", definitionIds);

  if (valuesResult.error) {
    throw friendly(valuesResult.error, "Failed to load custom field values");
  }

  const valuesByDefinitionId = new Map(
    (Array.isArray(valuesResult.data) ? valuesResult.data : []).map((row) => [
      String(row?.definition_id || ""),
      row,
    ]),
  );

  return definitions.map((definition) => {
    const definitionId = String(definition?.id || "");
    const valueRow = valuesByDefinitionId.get(definitionId) || {};
    const fieldType = normalizeFieldType(definition?.field_type);

    return {
      id: definitionId,
      name: String(definition?.name || ""),
      entityType: normalizedEntityType,
      fieldType,
      value: formatCustomFieldDisplayValue(fieldType, valueRow),
      hasValue:
        valueRow.text_value !== null && valueRow.text_value !== undefined && valueRow.text_value !== "" ||
        valueRow.number_value !== null && valueRow.number_value !== undefined ||
        valueRow.date_value !== null && valueRow.date_value !== undefined && valueRow.date_value !== "",
    };
  });
}

export async function listEntityCustomFieldDefinitions({ accountId, entityType } = {}) {
  const normalizedEntityType = normalizeEntityType(entityType);
  if (!accountId || !["property", "tenant"].includes(normalizedEntityType)) {
    return [];
  }

  const { data, error } = await supabase
    .from("custom_field_definitions")
    .select("id, name, field_type, entity_type")
    .eq("account_id", accountId)
    .eq("entity_type", normalizedEntityType)
    .order("name", { ascending: true });

  if (error) {
    throw friendly(error, "Failed to load custom field definitions");
  }

  return (Array.isArray(data) ? data : []).map((definition) => ({
    id: String(definition?.id || ""),
    name: String(definition?.name || ""),
    entityType: normalizedEntityType,
    fieldType: normalizeFieldType(definition?.field_type),
  }));
}

export async function listEntityCustomFieldEditorState({ accountId, entityType, entityId = null } = {}) {
  const definitions = await listEntityCustomFieldDefinitions({ accountId, entityType });
  if (!entityId || definitions.length === 0) {
    return { definitions, values: {} };
  }

  const definitionIds = definitions.map((definition) => definition.id).filter(Boolean);
  const { data, error } = await supabase
    .from("custom_field_values")
    .select("definition_id, text_value, number_value, date_value")
    .eq("account_id", accountId)
    .eq("entity_id", entityId)
    .in("definition_id", definitionIds);

  if (error) {
    throw friendly(error, "Failed to load custom field values");
  }

  const values = {};
  for (const row of Array.isArray(data) ? data : []) {
    const definition = definitions.find(
      (item) => item.id === String(row?.definition_id || ""),
    );
    if (!definition) continue;
    if (definition.fieldType === "number") {
      values[definition.id] =
        row?.number_value === null || row?.number_value === undefined ? "" : String(row.number_value);
      continue;
    }
    if (definition.fieldType === "date") {
      values[definition.id] = row?.date_value ? String(row.date_value) : "";
      continue;
    }
    values[definition.id] = row?.text_value ? String(row.text_value) : "";
  }

  return { definitions, values };
}

export async function saveEntityCustomFieldValues({
  accountId,
  entityId,
  definitions = [],
  values = {},
} = {}) {
  if (!accountId || !entityId || !Array.isArray(definitions) || definitions.length === 0) {
    return [];
  }

  const validation = validateCustomFieldEntries(definitions, values);
  if (!validation.isValid) {
    const firstMessage = Object.values(validation.errors)[0] || "Please correct the custom field values.";
    const error = new Error(firstMessage);
    error.fieldErrors = validation.errors;
    throw error;
  }

  for (const definition of definitions) {
    const definitionId = String(definition?.id || "");
    if (!definitionId) continue;
    const fieldType = normalizeFieldType(definition?.fieldType ?? definition?.field_type);
    const rawValue = validation.normalizedValues[definitionId];

    if (isBlankValue(rawValue)) {
      const { error } = await supabase
        .from("custom_field_values")
        .delete()
        .eq("account_id", accountId)
        .eq("entity_id", entityId)
        .eq("definition_id", definitionId);

      if (error) throw friendly(error, "Failed to clear custom field value");
      continue;
    }

    const payload = {
      definition_id: definitionId,
      account_id: accountId,
      entity_id: entityId,
      text_value: null,
      number_value: null,
      date_value: null,
    };

    if (fieldType === "number") {
      payload.number_value = Number(rawValue);
    } else if (fieldType === "date") {
      payload.date_value = normalizeTextValue(rawValue);
    } else {
      payload.text_value = normalizeTextValue(rawValue);
    }

    const { error } = await supabase
      .from("custom_field_values")
      .upsert(payload, {
        onConflict: "definition_id,entity_id",
      });

    if (error) throw friendly(error, "Failed to save custom field value");
  }

  return listEntityCustomFieldValues({
    accountId,
    entityType: definitions[0]?.entityType,
    entityId,
  });
}
