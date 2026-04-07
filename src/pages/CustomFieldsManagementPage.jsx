import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import Card from "../components/Card";
import { useAccount } from "../context/AccountContext";
import { usePageTitle } from "../layout/PageTitleContext";
import {
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
  listCustomFieldDefinitions,
} from "../services/customFieldManagementService";
import { isManageRole } from "../utils/permissions";

const ENTITY_OPTIONS = [
  { value: "property", label: "Property" },
  { value: "tenant", label: "Tenant" },
];

const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];

function formatFieldTypeLabel(fieldType) {
  return FIELD_TYPE_OPTIONS.find((option) => option.value === fieldType)?.label || "Unknown";
}

export default function CustomFieldsManagementPage() {
  const { setTitle } = usePageTitle();
  const { activeAccountId, activeRole, isRootOperator } = useAccount();
  const canManageCustomFields = isRootOperator || isManageRole(activeRole);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingDefinitionId, setDeletingDefinitionId] = useState("");
  const [definitions, setDefinitions] = useState([]);
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState("property");
  const [fieldType, setFieldType] = useState("text");

  useEffect(() => {
    setTitle("Custom Fields");
  }, [setTitle]);

  async function loadDefinitions() {
    if (!activeAccountId || !canManageCustomFields) return;
    setLoading(true);
    try {
      const rows = await listCustomFieldDefinitions(activeAccountId);
      setDefinitions(rows);
    } catch (error) {
      window.alert(error?.message || "Failed to load custom fields");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDefinitions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, canManageCustomFields]);

  const groupedDefinitions = useMemo(
    () =>
      ENTITY_OPTIONS.map((option) => ({
        ...option,
        fields: definitions.filter((definition) => definition.entityType === option.value),
      })),
    [definitions],
  );

  async function handleCreateDefinition(event) {
    event.preventDefault();
    if (!activeAccountId) return;
    setSaving(true);
    try {
      await createCustomFieldDefinition({
        accountId: activeAccountId,
        entityType,
        fieldType,
        name,
      });
      setName("");
      setEntityType("property");
      setFieldType("text");
      await loadDefinitions();
    } catch (error) {
      window.alert(error?.message || "Failed to create custom field");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDefinition(definitionId) {
    if (!activeAccountId || !definitionId) return;
    setDeletingDefinitionId(definitionId);
    try {
      await deleteCustomFieldDefinition({
        accountId: activeAccountId,
        definitionId,
      });
      await loadDefinitions();
    } catch (error) {
      window.alert(error?.message || "Failed to delete custom field");
    } finally {
      setDeletingDefinitionId("");
    }
  }

  if (!canManageCustomFields) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Custom Fields</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Configure simple property and tenant fields for this account. These definitions drive
          the read-only sections on the detail pages and can be wired into edit flows later.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create field</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={handleCreateDefinition}>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="custom-field-name">
              Field name
            </label>
            <input
              id="custom-field-name"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Access notes"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="custom-field-entity-type">
              Entity type
            </label>
            <select
              id="custom-field-entity-type"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
            >
              {ENTITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="custom-field-field-type">
              Field type
            </label>
            <select
              id="custom-field-field-type"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={fieldType}
              onChange={(event) => setFieldType(event.target.value)}
            >
              {FIELD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
            >
              {saving ? "Creating..." : "Create field"}
            </button>
          </div>
        </form>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {groupedDefinitions.map((group) => (
          <Card key={group.value} className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {group.label} fields
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Simple definitions for {group.label.toLowerCase()} records.
                </p>
              </div>
              {loading ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">Loading...</span>
              ) : null}
            </div>

            {group.fields.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                No {group.label.toLowerCase()} custom fields configured yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {group.fields.map((definition) => (
                  <div
                    key={definition.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-800"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {definition.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {group.label} / {formatFieldTypeLabel(definition.fieldType)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={deletingDefinitionId === definition.id}
                      onClick={() => handleDeleteDefinition(definition.id)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 disabled:opacity-60 dark:border-red-900/60 dark:text-red-300"
                    >
                      {deletingDefinitionId === definition.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
