import { useState, useEffect } from "react";
import Card from "./Card";
import { useAccount } from "../context/AccountContext";
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
  const { accountLoading } = useAccount();
  const { t } = useI18n();

  const [form, setForm] = useState({
    propertyId: "",
    tenantId:   "",
    amount:     "",
    dueDate:    "",
    notes:      "",
    markAsPaid: false,
  });

  const [saving,      setSaving]      = useState(false);
  const [fieldError,  setFieldError]  = useState("");
  const [submitError, setSubmitError] = useState("");

  const isEditing  = Boolean(payment?.id);
  const isPaid     = isEditing && (payment.paidAt || normalizePaymentStatus(payment.status) === PAYMENT_STATUS.PAID);

  useEffect(() => {
    if (payment) {
      setForm({
        id:         payment.id,
        propertyId: payment.propertyId ?? "",
        tenantId:   payment.tenantId   ?? "",
        amount:     payment.amount     ?? "",
        dueDate:    payment.dueDate    ?? "",
        notes:      payment.notes      ?? "",
        markAsPaid: false,
      });
    } else {
      setForm({ propertyId: "", tenantId: "", amount: "", dueDate: "", notes: "", markAsPaid: false });
    }
    setFieldError("");
    setSubmitError("");
  }, [payment, isOpen]);

  if (!isOpen || accountLoading) return null;

  /* ── Filtered tenant list ──────────────────────────────────────────────────── */
  const filteredTenants = tenants.filter(
    (t) => String(t.propertyId) === String(form.propertyId)
  );

  /* ── Inline validation (I-3: no alert()) ──────────────────────────────────── */
  function validate() {
    if (!form.propertyId) return t("payments.selectProperty");
    if (!form.tenantId)   return t("payments.selectTenant");
    if (!form.amount || Number(form.amount) <= 0) return t("payments.invalidAmount");
    if (!form.dueDate)    return t("payments.fillRequired");
    return "";
  }

  /* ── Submit (B-2: try-catch, error displayed inline) ──────────────────────── */
  const submit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setFieldError(err); return; }
    setFieldError("");
    setSubmitError("");
    setSaving(true);
    try {
      await onSave({ ...form, amount: Number(form.amount) });
      onClose();
    } catch (ex) {
      setSubmitError(ex?.message || t("payments.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <Card className="p-6 w-full max-w-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-slate-100">
          {isEditing ? t("payments.edit") : t("payments.add")}
        </h3>

        <form onSubmit={submit} className="space-y-4" noValidate>
          {/* PROPERTY */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("payments.selectProperty")}
            </label>
            <select
              required
              disabled={isEditing}
              value={form.propertyId}
              onChange={(e) => setForm({ ...form, propertyId: e.target.value, tenantId: "" })}
              className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-800"
            >
              <option value="">— {t("payments.selectProperty")} —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.address}</option>
              ))}
            </select>
          </div>

          {/* TENANT */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("payments.selectTenant")}
            </label>
            <select
              required
              disabled={isEditing || !form.propertyId}
              value={form.tenantId}
              onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
              className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500"
            >
              <option value="">— {t("payments.selectTenant")} —</option>
              {filteredTenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* AMOUNT */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("payments.amount")}
            </label>
            {isPaid ? (
              // A-3: amount is immutable once paid — show read-only
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  readOnly
                  value={form.amount}
                  className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-500 cursor-not-allowed"
                />
                <span className="text-xs text-slate-500 whitespace-nowrap">{t("payments.amountLockedPaid")}</span>
              </div>
            ) : (
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                placeholder={t("payments.amountPlaceholder")}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
            )}
          </div>

          {/* DUE DATE */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("payments.dueDate")}
            </label>
            <input
              required
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* NOTES (A-7) */}
          <div className="space-y-1">
            <label htmlFor="payment-notes" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("payments.notes")} <span className="text-slate-400 font-normal">({t("common.optional")})</span>
            </label>
            <textarea
              id="payment-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder={t("payments.notesPlaceholder")}
              className="w-full border border-slate-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 resize-none"
            />
          </div>

          {/* MARK AS PAID (I-4/A-6: replaces deceptive status dropdown) */}
          {!isEditing && (
            <label htmlFor="payment-mark-paid" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-800 px-3 py-2 cursor-pointer">
              <input
                id="payment-mark-paid"
                type="checkbox"
                checked={form.markAsPaid}
                onChange={(e) => setForm({ ...form, markAsPaid: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {t("payments.markAsPaidOnCreate")}
              </span>
            </label>
          )}

          {isPaid && (
            <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 rounded px-3 py-2">
              {t("payments.paidEditNote")}
            </p>
          )}

          {/* Inline validation / submit errors */}
          {fieldError  && <p className="text-sm text-rose-600">{fieldError}</p>}
          {submitError && <p className="text-sm text-rose-600">{submitError}</p>}

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
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
