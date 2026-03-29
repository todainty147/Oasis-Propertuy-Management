import { Link } from "react-router-dom";
import { ArrowRight, Lock } from "lucide-react";

import Card from "./Card";
import { getFeatureMinimumPlan, normalizePlan } from "../lib/entitlements";
import { useI18n } from "../context/I18nContext";

export default function FeatureAccessCard({ feature, currentPlan }) {
  const { t } = useI18n();
  const safeCurrentPlan = normalizePlan(currentPlan);
  const requiredPlan = getFeatureMinimumPlan(feature);
  const featureLabel = t(`entitlements.feature.${feature}`);

  return (
    <Card className="p-6 border-blue-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:border-blue-900/60 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/30">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-700 dark:border-blue-900/60 dark:bg-slate-900 dark:text-blue-200">
            <Lock size={14} />
            <span>{t("entitlements.locked.badge")}</span>
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t("entitlements.locked.title", { feature: featureLabel })}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t("entitlements.locked.body", {
              feature: featureLabel,
              requiredPlan: t(`billing.plan.${requiredPlan}`),
              currentPlan: t(`billing.plan.${safeCurrentPlan}`),
            })}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("billing.currentPlan")}
            </p>
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {t(`billing.plan.${safeCurrentPlan}`)}
            </p>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("entitlements.locked.requiredPlan")}
            </p>
            <p className="font-semibold text-slate-900 dark:text-slate-100">
              {t(`billing.plan.${requiredPlan}`)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          to="/settings/billing"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          <span>{t("entitlements.locked.cta")}</span>
          <ArrowRight size={16} />
        </Link>
        <p className="self-center text-xs text-slate-500 dark:text-slate-400">
          {t("entitlements.locked.hint")}
        </p>
      </div>
    </Card>
  );
}
