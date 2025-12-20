import { useState, useEffect } from "react";
import Card from "./Card";

export default function AddPaymentModal({
  isOpen,
  onClose,
  payment,
  properties,
  tenants,
  onSave,
}) {
  const [form, setForm] = useState({
    propertyId: "",
    tenantId: "",
    amount: "",
    status: "Oczekujące",
    dueDate: "",
  });

  /* ======================
     EDIT MODE
     ====================== */
  useEffect(() => {
    if (payment) {
      setForm({
        propertyId: payment.propertyId ?? "",
        tenantId: payment.tenantId ?? "",
        amount: payment.amount ?? "",
        status: payment.status ?? "Oczekujące",
        dueDate: payment.dueDate ?? "",
      });
    } else {
      setForm({
        propertyId: "",
        tenantId: "",
        amount: "",
        status: "Oczekujące",
        dueDate: "",
      });
    }
  }, [payment]);

  if (!isOpen) return null;

  /* ======================
     SUBMIT
     ====================== */
  const submit = async (e) => {
    e.preventDefault();

    if (
      !form.propertyId ||
      !form.tenantId ||
      !form.amount ||
      !form.dueDate
    ) {
      alert("Uzupełnij nieruchomość, najemcę, kwotę i termin");
      return;
    }

    await onSave({
      ...form,
      amount: Number(form.amount),
    });

    onClose();
  };

  /* ======================
     FILTER TENANTS BY PROPERTY
     ====================== */
  const filteredTenants = tenants.filter(
  (t) => String(t.propertyId) === String(form.propertyId)
);


  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <Card className="p-6 w-full max-w-lg">
        <h3 className="text-lg font-semibold mb-4">
          {payment ? "Edytuj płatność" : "Dodaj płatność"}
        </h3>

        <form onSubmit={submit} className="space-y-4">
          {/* PROPERTY (REQUIRED) */}
          <select
            required
            value={form.propertyId}
            onChange={(e) =>
              setForm({
                ...form,
                propertyId: e.target.value,
                tenantId: "", // reset tenant when property changes
              })
            }
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Wybierz nieruchomość</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address}
              </option>
            ))}
          </select>

          {/* TENANT (REQUIRED) */}
          <select
            required
            value={form.tenantId}
            onChange={(e) =>
              setForm({ ...form, tenantId: e.target.value })
            }
            className="w-full border rounded px-3 py-2"
            disabled={!form.propertyId}
          >
            <option value="">Wybierz najemcę</option>
            {filteredTenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* AMOUNT (REQUIRED) */}
          <input
            required
            type="number"
            placeholder="Kwota (PLN)"
            value={form.amount}
            onChange={(e) =>
              setForm({ ...form, amount: e.target.value })
            }
            className="w-full border rounded px-3 py-2"
          />

          {/* STATUS */}
          <select
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value })
            }
            className="w-full border rounded px-3 py-2"
          >
            <option value="Oczekujące">Oczekujące</option>
            <option value="Opłacone">Opłacone</option>
            <option value="Zaległe">Zaległe</option>
          </select>

          {/* DUE DATE (REQUIRED) */}
          <input
            required
            type="date"
            value={form.dueDate}
            onChange={(e) =>
              setForm({ ...form, dueDate: e.target.value })
            }
            className="w-full border rounded px-3 py-2"
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded"
            >
              Anuluj
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              Zapisz
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
