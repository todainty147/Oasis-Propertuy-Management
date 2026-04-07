import { useEffect, useState } from "react";
import { useAccount } from "../context/AccountContext";
import Card from "./Card";
import { useI18n } from "../context/I18nContext";
import CustomFieldsFormSection from "./CustomFieldsFormSection";
import {
  listEntityCustomFieldEditorState,
  validateCustomFieldEntries,
  validateCustomFieldInput,
} from "../services/customFieldService";

export default function AddPropertyModal({
  isOpen,
  onClose,
  onSave,
  property = null,
  tenants = [],
  owners = [],
}) {
  const { accountLoading } = useAccount();
  const { t } = useI18n();
  const { activeAccountId } = useAccount();

  const [form, setForm] = useState({
    address: "",
    city: "",
    size: "",
    rent: "",
    tenantId: "",
    ownerId: "",
  });
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
  const [customFieldValues, setCustomFieldValues] = useState({});
  const [customFieldErrors, setCustomFieldErrors] = useState({});
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false);

  /* ======================
     INIT FORM
     ====================== */
  useEffect(() => {
    if (property) {
      setForm({
        address: property.address ?? "",
        city: property.city ?? "",
        size: property.size ?? "",
        rent: property.rent ?? "",
        tenantId: property.tenantId ?? "",
        ownerId: property.ownerId ?? owners[0]?.id ?? "",
      });
    } else {
      setForm({
        address: "",
        city: "",
        size: "",
        rent: "",
        tenantId: "",
        ownerId: owners[0]?.id ?? "",
      });
    }
  }, [property, owners]);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomFields() {
      if (!isOpen || !activeAccountId) {
        if (!cancelled) {
          setCustomFieldDefinitions([]);
          setCustomFieldValues({});
        }
        return;
      }

      setCustomFieldsLoading(true);
      try {
        const state = await listEntityCustomFieldEditorState({
          accountId: activeAccountId,
          entityType: "property",
          entityId: property?.id ?? null,
        });
        if (!cancelled) {
          setCustomFieldDefinitions(state.definitions);
          setCustomFieldValues(state.values);
          setCustomFieldErrors({});
        }
      } catch {
        if (!cancelled) {
          setCustomFieldDefinitions([]);
          setCustomFieldValues({});
          setCustomFieldErrors({});
        }
      } finally {
        if (!cancelled) setCustomFieldsLoading(false);
      }
    }

    loadCustomFields();
    return () => {
      cancelled = true;
    };
  }, [activeAccountId, isOpen, property?.id]);

  /* ======================
     SAFETY
     ====================== */
  if (!isOpen || accountLoading) return null;

  /* ======================
     SUBMIT
     ====================== */
  function handleSubmit(e) {
    e.preventDefault();

    const validation = validateCustomFieldEntries(customFieldDefinitions, customFieldValues);
    if (!validation.isValid) {
      setCustomFieldErrors(validation.errors);
      return;
    }

    onSave({
      ...(property ?? {}),
      address: form.address.trim(),
      city: form.city.trim(),
      size: form.size.trim(),
      rent: Number(form.rent),
      tenantId: form.tenantId || null,
      ownerId: form.ownerId,
      status: form.tenantId ? "Wynajęte" : "Wolne",
      customFieldValues: validation.normalizedValues,
      customFieldDefinitions,
    });

    onClose();
  }

  function handleCustomFieldChange(definition, value) {
    const definitionId = String(definition?.id || "");
    const validation = validateCustomFieldInput(definition, value);
    setCustomFieldValues((current) => ({
      ...current,
      [definitionId]: value,
    }));
    setCustomFieldErrors((current) => ({
      ...current,
      [definitionId]: validation.error || "",
    }));
  }

  /* ======================
     TENANT SELECT RULES
     ====================== */
  function isTenantDisabled(tenant) {
    // Tenant is already assigned to another property
    if (!tenant.propertyId) return false;

    // Allow if editing AND tenant is already assigned to THIS property
    if (property && tenant.propertyId === property.id) return false;

    return true;
  }

  /* ======================
     RENDER
     ====================== */
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="text-xl font-bold mb-4">
          {property ? t("properties.edit") : t("properties.add")}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* OWNER (legacy but preserved) */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t("properties.owner")}
            </label>
            <select
              required
              className="w-full border rounded-lg px-3 py-2"
              value={form.ownerId}
              onChange={(e) =>
                setForm({ ...form, ownerId: e.target.value })
              }
            >
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <input
            required
            placeholder={t("finance.table.address")}
            className="w-full border rounded-lg px-3 py-2"
            value={form.address}
            onChange={(e) =>
              setForm({ ...form, address: e.target.value })
            }
          />

          <input
            required
            placeholder={t("properties.city")}
            className="w-full border rounded-lg px-3 py-2"
            value={form.city}
            onChange={(e) =>
              setForm({ ...form, city: e.target.value })
            }
          />

          <input
            required
            placeholder={t("properties.sizePlaceholder")}
            className="w-full border rounded-lg px-3 py-2"
            value={form.size}
            onChange={(e) =>
              setForm({ ...form, size: e.target.value })
            }
          />

          <input
            required
            type="number"
            min="0"
            placeholder={t("payments.amountPln")}
            className="w-full border rounded-lg px-3 py-2"
            value={form.rent}
            onChange={(e) =>
              setForm({ ...form, rent: e.target.value })
            }
          />

          {/* TENANT (EDIT MODE ONLY) */}
          {property && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("properties.assignTenant")}
              </label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={form.tenantId ?? ""}
                onChange={(e) =>
                  setForm({ ...form, tenantId: e.target.value })
                }
              >
                <option value="">{t("properties.noTenant")}</option>

                {tenants.map((tenant) => {
                  const disabled = isTenantDisabled(tenant);

                  return (
                    <option
                      key={tenant.id}
                      value={tenant.id}
                      disabled={disabled}
                    >
                      {tenant.name}
                      {disabled
                        ? ` (${t("properties.rentsOther")})`
                        : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <CustomFieldsFormSection
            title="Custom property fields"
            definitions={customFieldDefinitions}
            values={customFieldValues}
            errors={customFieldErrors}
            onChange={handleCustomFieldChange}
            disabled={customFieldsLoading}
            emptyMessage="No custom property fields configured yet."
          />

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              {t("common.save")}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
