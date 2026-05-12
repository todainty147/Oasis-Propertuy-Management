import { useState } from "react";
import { X } from "lucide-react";
import { createRentPlan } from "../../services/rentPlanService";

const FREQUENCIES = ["monthly", "weekly", "fortnightly", "four_weekly", "annual"];
const PRORATION   = ["actual_days_in_month", "thirty_day_month", "annual_daily_365", "annual_daily_actual_year", "no_proration", "manual_override"];
const UTILITIES   = ["rent_only", "bills_inclusive", "fixed_utility_charge", "variable_utility_charge"];
const MARKETS     = ["generic", "uk", "pl"];
const CURRENCIES  = ["GBP", "PLN", "EUR", "USD"];

export default function RentPlanForm({ accountId, onSaved, onCancel, t }) {
  const [form, setForm] = useState({
    market:            "generic",
    currency:          "GBP",
    billingFrequency:  "monthly",
    baseRentAmount:    "",
    dueDay:            "1",
    startDate:         new Date().toISOString().slice(0, 10),
    endDate:           "",
    prorationPolicy:   "actual_days_in_month",
    depositPolicy:     "market_default",
    depositAmount:     "",
    utilitiesPolicy:   "rent_only",
    roundingPolicy:    "nearest_penny",
    notes:             "",
    chargeRules:       [],
  });

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.baseRentAmount || !form.startDate) {
      setError(t("rentPlans.form.requiredError"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createRentPlan({ accountId, plan: form });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const cls = "w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const lbl = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t("rentPlans.form.title")}</p>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
      </div>

      {/* Market + Currency */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>{t("rentPlans.form.market")}</label>
          <select value={form.market} onChange={(e) => set("market", e.target.value)} className={cls}>
            {MARKETS.map((m) => <option key={m} value={m}>{t(`rentPlans.market.${m}`)}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>{t("rentPlans.form.currency")}</label>
          <select value={form.currency} onChange={(e) => set("currency", e.target.value)} className={cls}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Rent + Frequency */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>{t("rentPlans.form.baseRent")} *</label>
          <input type="number" min="0" step="0.01" value={form.baseRentAmount}
            onChange={(e) => set("baseRentAmount", e.target.value)}
            placeholder="1500.00" className={cls} />
        </div>
        <div>
          <label className={lbl}>{t("rentPlans.form.frequency")}</label>
          <select value={form.billingFrequency} onChange={(e) => set("billingFrequency", e.target.value)} className={cls}>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{t(`rentPlans.frequency.${f}`)}</option>)}
          </select>
        </div>
      </div>

      {/* Due day + Start date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>{t("rentPlans.form.dueDay")}</label>
          <input type="number" min="1" max="28" value={form.dueDay}
            onChange={(e) => set("dueDay", e.target.value)} className={cls} />
        </div>
        <div>
          <label className={lbl}>{t("rentPlans.form.startDate")} *</label>
          <input type="date" value={form.startDate}
            onChange={(e) => set("startDate", e.target.value)} className={cls} />
        </div>
      </div>

      {/* End date */}
      <div>
        <label className={lbl}>{t("rentPlans.form.endDate")} ({t("common.optional")})</label>
        <input type="date" value={form.endDate}
          onChange={(e) => set("endDate", e.target.value)} className={cls} />
      </div>

      {/* Proration */}
      <div>
        <label className={lbl}>{t("rentPlans.form.prorationPolicy")}</label>
        <select value={form.prorationPolicy} onChange={(e) => set("prorationPolicy", e.target.value)} className={cls}>
          {PRORATION.map((p) => <option key={p} value={p}>{t(`rentPlans.proration.${p}`)}</option>)}
        </select>
      </div>

      {/* Deposit */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>{t("rentPlans.form.depositPolicy")}</label>
          <select value={form.depositPolicy} onChange={(e) => set("depositPolicy", e.target.value)} className={cls}>
            {["market_default", "custom", "none"].map((p) => (
              <option key={p} value={p}>{t(`rentPlans.depositPolicy.${p}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={lbl}>{t("rentPlans.form.depositAmount")} ({t("common.optional")})</label>
          <input type="number" min="0" step="0.01" value={form.depositAmount}
            onChange={(e) => set("depositAmount", e.target.value)}
            placeholder="0.00" className={cls} />
        </div>
      </div>

      {/* Utilities */}
      <div>
        <label className={lbl}>{t("rentPlans.form.utilitiesPolicy")}</label>
        <select value={form.utilitiesPolicy} onChange={(e) => set("utilitiesPolicy", e.target.value)} className={cls}>
          {UTILITIES.map((u) => <option key={u} value={u}>{t(`rentPlans.utilities.${u}`)}</option>)}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className={lbl}>{t("rentPlans.form.notes")}</label>
        <input type="text" value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder={t("rentPlans.form.notesPlaceholder")} className={cls} />
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
        {t("rentPlans.form.disclaimer")}
      </p>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
          {t("common.cancel")}
        </button>
        <button type="button" disabled={saving} onClick={handleSave}
          className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? t("common.saving") : t("rentPlans.form.saveDraft")}
        </button>
      </div>
    </div>
  );
}
