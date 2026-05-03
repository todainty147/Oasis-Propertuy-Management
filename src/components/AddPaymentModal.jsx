import { useState, useEffect } from "react";
import Card from "./Card";
import { useAccount } from "../context/AccountContext"; // ✅ MULTI-TENANT
import { useI18n } from "../context/I18nContext";
import { normalizePaymentStatus, PAYMENT_STATUS } from "../utils/statuses";

export default function AddPaymentModal({
  isOpen,
  onClose,
  payment,
  properties,
  tenants,
  onSave,
}) {
  const { accountLoading } = useAccount(); // ✅ MULTI-TENANT
  const { t } = useI18n();

  const [form, setForm] = useState({
    propertyId: "",
    tenantId: "",
    amount: "",
    status: PAYMENT_STATUS.PENDING,
    dueDate: "",
  });

  /* ======================
     EDIT MODE
     ====================== */
  useEffect(() => {
    if (payment) {
      const derivedStatus = payment.paidAt
        ? PAYMENT_STATUS.PAID
        : normalizePaymentStatus(payment.status);
      setForm({
        propertyId: payment.propertyId ?? "",
        tenantId: payment.tenantId ?? "",
        amount: payment.amount ?? "",
        status: derivedStatus === PAYMENT_STATUS.OTHER ? PAYMENT_STATUS.PENDING : derivedStatus,
        dueDate: payment.dueDate ?? "",
      });
    } else {
      setForm({
        propertyId: "",
        tenantId: "",
        amount: "",
        status: PAYMENT_STATUS.PENDING,
        dueDate: "",
      });
    }
  }, [payment]);

  // ✅ MULTI-TENANT SAFETY
  if (!isOpen || accountLoading) return null;

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
      alert(t("payments.fillRequired"));
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
      <Card className="p-6 w-full max-w-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">
          {payment ? t("payments.edit") : t("payments.add")}
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
            className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          >
            <option value="">{t("payments.selectProperty")}</option>
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
            className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-400"
            disabled={!form.propertyId}
          >
            <option value="">{t("payments.selectTenant")}</option>
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
            placeholder={t("payments.amountPln")}
            value={form.amount}
            onChange={(e) =>
              setForm({ ...form, amount: e.target.value })
            }
            className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />

          {/* STATUS */}
          <select
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value })
            }
            className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          >
            <option value={PAYMENT_STATUS.PENDING}>{t("payments.status.pending")}</option>
            <option value={PAYMENT_STATUS.PAID}>{t("payments.status.paid")}</option>
            <option value={PAYMENT_STATUS.OVERDUE}>{t("payments.status.overdue")}</option>
          </select>

          {/* DUE DATE (REQUIRED) */}
          <input
            required
            type="date"
            value={form.dueDate}
            onChange={(e) =>
              setForm({ ...form, dueDate: e.target.value })
            }
            className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              {t("common.save")}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
