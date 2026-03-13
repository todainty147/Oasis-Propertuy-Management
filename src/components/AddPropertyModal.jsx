import { useEffect, useState } from "react";
import { useAccount } from "../context/AccountContext";
import Card from "./Card";
import { useI18n } from "../context/I18nContext";

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

  const [form, setForm] = useState({
    address: "",
    city: "",
    size: "",
    rent: "",
    tenantId: "",
    ownerId: "",
  });

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

  /* ======================
     SAFETY
     ====================== */
  if (!isOpen || accountLoading) return null;

  /* ======================
     SUBMIT
     ====================== */
  function handleSubmit(e) {
    e.preventDefault();

    onSave({
      ...(property ?? {}),
      address: form.address.trim(),
      city: form.city.trim(),
      size: form.size.trim(),
      rent: Number(form.rent),
      tenantId: form.tenantId || null,
      ownerId: form.ownerId,
      status: form.tenantId ? "Wynajęte" : "Wolne",
    });

    onClose();
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

                {tenants.map((t) => {
                  const disabled = isTenantDisabled(t);

                  return (
                    <option
                      key={t.id}
                      value={t.id}
                      disabled={disabled}
                    >
                      {t.name}
                      {disabled
                        ? ` (${t("properties.rentsOther")})`
                        : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

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
