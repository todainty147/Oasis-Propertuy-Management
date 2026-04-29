import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";

const PLAN_LABELS = {
  growth: "Growth",
  pro: "Pro",
  operator_agency: "Operator / Agency",
};

/**
 * Epic D4 — inline upsell callout shown in place of AI insight cards
 * when the account's plan does not include the requested AI feature.
 *
 * @param {object}  props
 * @param {string}  props.featureLabel   Human-readable feature name, e.g. "Maintenance Triage"
 * @param {string}  props.requiredPlan   Plan key from entitlements, e.g. "growth"
 * @param {string}  [props.className]
 */
export default function AiUpsellBanner({ featureLabel, requiredPlan, className = "" }) {
  const { t } = useI18n();
  const planLabel = PLAN_LABELS[requiredPlan] || requiredPlan;

  return (
    <div
      className={`rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white px-4 py-4 ${className}`}
      data-testid="ai-upsell-banner"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-sm">
          ✦
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {featureLabel}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {t("ai.upsell.availableOn", { plan: planLabel })}
          </p>
          <Link
            to="/settings/billing"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            {t("ai.upsell.upgradeButton")}
          </Link>
        </div>
      </div>
    </div>
  );
}
