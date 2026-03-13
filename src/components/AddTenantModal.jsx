// src/components/AddTenantModal.jsx
import { useState, useEffect } from "react";
import Card from "./Card";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";

export default function AddTenantModal({
  open,
  onClose,
  properties = [],
  onSave,
  tenant,
}) {
  const { accountLoading } = useAccount();
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [propertyId, setPropertyId] = useState("");

  /* ======================
     SYNC EDIT MODE
     ====================== */
  useEffect(() => {
    if (tenant) {
      setName(tenant.name ?? "");
      setPhone(tenant.phone ?? "");
      setEmail(tenant.email ?? "");
      setPropertyId(tenant.propertyId ?? "");
    } else {
      setName("");
      setPhone("");
      setEmail("");
      setPropertyId("");
    }
  }, [tenant, open]);

  /* ======================
     GUARD
     ====================== */
  if (!open || accountLoading) return null;

  /* ======================
     PROPERTY RULES
     ====================== */
  function isPropertyDisabled(property) {
    // Free property
    if (!property.tenant_id) return false;

    // Editing: allow if already assigned to THIS tenant
    if (tenant && property.tenant_id === tenant.id) return false;

    // Otherwise: occupied
    return true;
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;

    await onSave({
      id: tenant?.id,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      propertyId: propertyId || null,
    });

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">
            {tenant ? t("tenant.edit") : t("tenant.add")}
          </h3>

          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="text-sm text-slate-600">
              {t("tenant.fullName")}
            </label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              className="border rounded-lg px-3 py-2"
              placeholder={t("tenant.phone")}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <input
              className="border rounded-lg px-3 py-2"
              placeholder={t("tenant.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* PROPERTY SELECT */}
          <div>
            <label className="text-sm text-slate-600">
              {t("tenant.assignedProperty")}
            </label>

            <select
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
            >
              <option value="">{t("tenant.noAssignment")}</option>

              {properties.map((p) => {
                const disabled = isPropertyDisabled(p);

                return (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={disabled}
                  >
                    {p.address} ({p.city})
                    {disabled ? ` (${t("tenant.occupied")})` : ""}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg"
            >
              {t("common.cancel")}
            </button>

            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              {tenant ? t("common.save") : t("common.add")}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
