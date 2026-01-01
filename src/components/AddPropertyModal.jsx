import { useEffect, useState } from "react";
import { useAccount } from "../context/AccountContext"; // ✅ MULTI-TENANT

export default function AddPropertyModal({
  isOpen,
  onClose,
  onSave,
  property = null,
  tenants = [],
  owners = [],
}) {
  const { accountLoading } = useAccount(); // ✅ MULTI-TENANT

  const [form, setForm] = useState({
    address: "",
    city: "",
    size: "",
    rent: "",
    tenantId: "",
    ownerId: "",
  });

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

  // ✅ MULTI-TENANT SAFETY
  if (!isOpen || accountLoading) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    onSave({
      ...(property ?? {}),
      address: form.address.trim(),
      city: form.city.trim(),
      size: form.size.trim(),
      rent: Number(form.rent),
      tenantId: form.tenantId === "" ? null : Number(form.tenantId),
      ownerId: form.ownerId,
      // ⚠️ status is derived elsewhere (Option A), but keep for safety
      status: form.tenantId ? "Wynajęte" : "Wolne",
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">
          {property ? "Edytuj nieruchomość" : "Dodaj nieruchomość"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* OWNER */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Właściciel
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
            placeholder="Adres"
            className="w-full border rounded-lg px-3 py-2"
            value={form.address}
            onChange={(e) =>
              setForm({ ...form, address: e.target.value })
            }
          />

          <input
            required
            placeholder="Miasto"
            className="w-full border rounded-lg px-3 py-2"
            value={form.city}
            onChange={(e) =>
              setForm({ ...form, city: e.target.value })
            }
          />

          <input
            required
            placeholder="Metraż (np. 45 m²)"
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
            placeholder="Czynsz (PLN)"
            className="w-full border rounded-lg px-3 py-2"
            value={form.rent}
            onChange={(e) =>
              setForm({ ...form, rent: e.target.value })
            }
          />

          {/* TENANT — only when editing */}
          {property && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Przypisz najemcę
              </label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={form.tenantId}
                onChange={(e) =>
                  setForm({ ...form, tenantId: e.target.value })
                }
              >
                <option value="">— Brak najemcy —</option>
                {tenants.map((t) => {
                  const disabled =
                    t.ownerId !== form.ownerId ||
                    (t.propertyId && t.propertyId !== property.id);

                  return (
                    <option
                      key={t.id}
                      value={t.id}
                      disabled={disabled}
                    >
                      {t.name}
                      {disabled
                        ? t.ownerId !== form.ownerId
                          ? " (inny właściciel)"
                          : " (wynajmuje inną nieruchomość)"
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
              Anuluj
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Zapisz
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
