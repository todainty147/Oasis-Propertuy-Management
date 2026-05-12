import { useState } from "react";
import { AlertTriangle, CheckCircle, Calculator, CalendarDays } from "lucide-react";
import { runRentCalculation, generateBillingPeriods, generateUpcomingPeriods } from "../../utils/rentCalculationEngine";
import { saveCalculationRun, listCalculationRuns } from "../../services/rentPlanService";
import { generateExpectedCharge } from "../../services/expectedChargeService";

function LineItem({ item, currency }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${item.includedInRent && item.chargeType !== "rent" ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}`}>
      <span>{item.label}{item.note ? <span className="ml-1 text-xs text-slate-400">({item.note})</span> : null}</span>
      <span className="font-medium">{item.amountPence > 0 ? `${currency} ${item.amount.toFixed(2)}` : "—"}</span>
    </div>
  );
}

export default function RentCalculationPreview({ plan, accountId, onClose, t }) {
  const today    = new Date();
  const thisYear = today.getFullYear();
  const thisMon  = String(today.getMonth() + 1).padStart(2, "0");

  const [periodStart, setPeriodStart] = useState(`${thisYear}-${thisMon}-01`);
  const [periodEnd,   setPeriodEnd]   = useState(`${thisYear}-${thisMon}-${new Date(thisYear, today.getMonth() + 1, 0).getDate()}`);
  const [partMonth,   setPartMonth]   = useState(false);
  const [result,      setResult]      = useState(null);
  const [savedRunId,  setSavedRunId]  = useState(null);
  const [chargeGenerated, setChargeGenerated] = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState(null);

  function calculate() {
    try {
      setError(null);
      const r = runRentCalculation({
        plan,
        chargeRules: plan.rent_charge_rules ?? [],
        periodStart,
        periodEnd,
        isPartMonth: partMonth,
      });
      setResult(r);
      setSavedRunId(null);
      setChargeGenerated(false);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleApprove() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const run = await saveCalculationRun({
        accountId,
        rentPlanId:         plan.id,
        tenantId:           plan.tenant_id,
        propertyId:         plan.property_id,
        periodStart,
        periodEnd,
        calculationInput:   { plan: { id: plan.id, billing_frequency: plan.billing_frequency, base_rent_amount: plan.base_rent_amount }, periodStart, periodEnd, partMonth },
        calculationResult:  result,
        warnings:           result.warnings,
      });
      setSavedRunId(run.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateCharge() {
    if (!savedRunId || !result) return;
    setBusy(true);
    setError(null);
    try {
      await generateExpectedCharge({
        accountId,
        rentPlanId:        plan.id,
        tenantId:          plan.tenant_id,
        propertyId:        plan.property_id,
        chargeType:        "rent",
        periodStart,
        periodEnd,
        dueDate:           periodStart,
        amount:            result.total,
        currency:          result.currency,
        calculationRunId:  savedRunId,
      });
      setChargeGenerated(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const cls = "text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calculator size={16} className="text-blue-500" />
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          {t("rentPlans.preview")} — {plan.currency} {Number(plan.base_rent_amount).toLocaleString()}/{plan.billing_frequency}
        </h2>
      </div>

      {/* Period inputs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("rentPlans.periodStart")}</label>
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("rentPlans.periodEnd")}</label>
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={cls} />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input type="checkbox" checked={partMonth} onChange={(e) => setPartMonth(e.target.checked)} />
            {t("rentPlans.partMonth")}
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={calculate}
        className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
      >
        {t("rentPlans.runPreview")}
      </button>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      {result && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="space-y-2">
              {result.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
                  <AlertTriangle size={13} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">{w.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Line items */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.lineItems.map((item, i) => (
              <LineItem key={i} item={item} currency={result.currency} />
            ))}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{t("rentPlans.total")}</span>
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {result.currency} {result.total.toFixed(2)}
            </span>
          </div>

          {/* Explanation */}
          <details className="text-xs text-slate-400 dark:text-slate-500">
            <summary className="cursor-pointer hover:text-slate-600">{t("rentPlans.explanation")}</summary>
            <pre className="mt-2 whitespace-pre-wrap leading-relaxed">{result.explanation}</pre>
          </details>

          {/* Disclaimer */}
          <p className="text-[11px] text-slate-400 italic">
            {t("rentPlans.previewDisclaimer")}
          </p>

          {/* Approve → Generate Charge flow */}
          {!savedRunId && !chargeGenerated && (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={handleApprove}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 disabled:opacity-50"
              >
                {busy ? t("common.saving") : t("rentPlans.approveRun")}
              </button>
            </div>
          )}

          {savedRunId && !chargeGenerated && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle size={12} /> {t("rentPlans.runApproved")}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={handleGenerateCharge}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? t("common.saving") : t("rentPlans.generateExpectedCharge")}
              </button>
            </div>
          )}

          {chargeGenerated && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle size={12} /> {t("rentPlans.chargeGenerated")}
            </p>
          )}
        </div>
      )}

      {/* Upcoming billing periods projection */}
      <UpcomingPeriodsPanel plan={plan} result={result} t={t} />
    </div>
  );
}

function UpcomingPeriodsPanel({ plan, result, t }) {
  const [open, setOpen] = useState(false);

  const periods = generateUpcomingPeriods(plan, 3);
  if (periods.length === 0) return null;

  const monthlyAmount = result
    ? result.total
    : Number(plan.base_rent_amount ?? 0);
  const currency = plan.currency ?? "GBP";

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <CalendarDays size={14} className="text-blue-500 shrink-0" />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex-1">
          {t("rentPlans.upcomingPeriods")}
        </span>
        <span className="text-xs text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {periods.map((p) => (
            <div key={p.periodStart} className="flex items-center justify-between py-2 text-sm">
              <div className="text-slate-600 dark:text-slate-400 text-xs">
                <span className="font-medium text-slate-800 dark:text-slate-200">{p.periodStart}</span>
                {" → "}{p.periodEnd}
              </div>
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
                {currency} {monthlyAmount.toFixed(2)}
              </span>
            </div>
          ))}
          <p className="text-[10px] text-slate-400 italic pt-2">
            {t("rentPlans.upcomingPeriodsNote")}
          </p>
        </div>
      )}
    </div>
  );
}
