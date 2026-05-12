import { AlertTriangle } from "lucide-react";

const STATUS_COLORS = {
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  posted:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
  superseded:"bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
};

export default function ExpectedChargesList({ charges, onPost, onCancel, t }) {
  if (!charges.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-sm text-slate-400">
        {t("rentPlans.noExpectedCharges")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
        {t("rentPlans.chargesDisclaimer")}
      </p>
      {charges.map((charge) => (
        <div
          key={charge.id}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex items-start justify-between gap-4 flex-wrap"
        >
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${STATUS_COLORS[charge.status] ?? STATUS_COLORS.scheduled}`}>
                {charge.status}
              </span>
              <span className="text-xs text-slate-400 capitalize">{charge.charge_type}</span>
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {charge.currency} {Number(charge.amount).toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {charge.period_start} → {charge.period_end} · {t("rentPlans.dueDate")}: {charge.due_date}
            </p>
            {charge.notes && (
              <p className="text-[11px] text-slate-400 italic">{charge.notes}</p>
            )}
          </div>

          {charge.status === "scheduled" && (
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onPost(charge.id)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {t("rentPlans.postToFinance")}
              </button>
              <button
                type="button"
                onClick={() => onCancel(charge.id)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t("common.cancel")}
              </button>
            </div>
          )}
          {charge.status === "posted" && charge.posted_payment_id && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 shrink-0">
              ✓ {t("rentPlans.postedToFinance")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
