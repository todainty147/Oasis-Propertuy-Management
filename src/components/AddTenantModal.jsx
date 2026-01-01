import { useState } from "react";
import Card from "./Card";
import { useAccount } from "../context/AccountContext"; // ✅ MULTI-TENANT

export default function AddTenantModal({
  isOpen,
  onClose,
  properties,
  onSave,
  tenant,
}) {
  const { accountLoading } = useAccount(); // ✅ MULTI-TENANT

  const [name, setName] = useState(tenant?.name ?? "");
  const [phone, setPhone] = useState(tenant?.phone ?? "");
  const [email, setEmail] = useState(tenant?.email ?? "");
  const [propertyId, setPropertyId] = useState(
    tenant?.propertyId ?? ""
  );

  // ✅ MULTI-TENANT SAFETY
  if (!isOpen || accountLoading) return null;

  const submit = async (e) => {
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
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">
            {tenant ? "Edytuj najemcę" : "Dodaj najemcę"}
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
              Imię i nazwisko
            </label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="Telefon"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="border rounded-lg px-3 py-2"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <select
            className="border rounded-lg px-3 py-2 w-full"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            <option value="">Brak przypisania</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address} ({p.city})
              </option>
            ))}
          </select>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg"
            >
              Anuluj
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              {tenant ? "Zapisz" : "Dodaj"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
