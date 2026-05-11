import { Star } from "lucide-react";
import { useI18n } from "../../context/I18nContext";

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

export default function FounderEntitlementCard({
  effectivePlan,
  billedPlan,
  endsAt,
  aiMonthlyLimit,
  position,
}) {
  const { t } = useI18n();
  const expiryDate = formatDate(endsAt);

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800/40 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <Star size={20} className="mt-0.5 shrink-0 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-amber-900 dark:text-amber-200">
              {t("founderOffer.entitlementTitle")}
            </h2>
            {position ? (
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-800/50 dark:text-amber-200">
                {t("founderOffer.position", { position: String(position) })}
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            {t("founderOffer.planDescription", {
              effectivePlan: effectivePlan ? effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1) : "Pro",
              billedPlan:    billedPlan    ? billedPlan.charAt(0).toUpperCase()    + billedPlan.slice(1)    : "Starter",
            })}
          </p>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-700 dark:text-amber-400">
            {aiMonthlyLimit != null ? (
              <span>{t("founderOffer.aiAllowance", { limit: String(aiMonthlyLimit) })}</span>
            ) : null}
            {expiryDate ? (
              <span>{t("founderOffer.endsAt", { date: expiryDate })}</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
