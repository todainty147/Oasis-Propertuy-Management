import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink } from "lucide-react";

import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import {
  canWriteForBilling,
  getBillingSubscription,
  openCustomerPortal,
  startCheckout,
} from "../services/billingService";

const PLANS = [
  { key: "starter", nameKey: "billing.plan.starter", limitKey: "billing.plan.starterLimit" },
  { key: "growth", nameKey: "billing.plan.growth", limitKey: "billing.plan.growthLimit" },
  { key: "pro", nameKey: "billing.plan.pro", limitKey: "billing.plan.proLimit" },
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

export default function BillingPage() {
  const { activeAccountId, activeRole } = useAccount();
  const { t } = useI18n();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const canManageBilling = useMemo(
    () => ["owner", "admin", "staff"].includes(String(activeRole || "").toLowerCase()),
    [activeRole],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeAccountId) return;

      try {
        setLoading(true);
        setError("");
        const data = await getBillingSubscription(activeAccountId);
        if (!cancelled) {
          setSubscription(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("billing.loadError"));
          setSubscription(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [activeAccountId, t]);

  async function handleCheckout(planKey) {
    try {
      setBusy(planKey);
      const { url } = await startCheckout({ accountId: activeAccountId, planKey });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("billing.checkoutError"));
    } finally {
      setBusy("");
    }
  }

  async function handlePortal() {
    try {
      setBusy("portal");
      const { url } = await openCustomerPortal({ accountId: activeAccountId });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("billing.portalError"));
    } finally {
      setBusy("");
    }
  }

  if (!canManageBilling) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {t("billing.title")}
        </h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {t("billing.accessDenied")}
        </p>
      </div>
    );
  }

  const currentStatus = subscription?.status || "inactive";
  const currentPlan = subscription?.metadata?.plan_key || subscription?.stripe_price_id || "—";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {t("billing.title")}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t("billing.subtitle")}
            </p>
          </div>
          <div className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <CreditCard size={16} />
            <span>{t("billing.accountScoped")}</span>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            {t("billing.loading")}
          </p>
        ) : subscription ? (
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("billing.currentStatus")}
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {canWriteForBilling(currentStatus) ? (
                  <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
                )}
                <span>{currentStatus}</span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("billing.currentPlan")}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {currentPlan}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("billing.currentPeriodEnd")}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatDate(subscription.current_period_end)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            {t("billing.noSubscription")}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handlePortal}
            disabled={busy === "portal" || !subscription}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            <ExternalLink size={16} />
            {busy === "portal" ? t("billing.portalOpening") : t("billing.manageBilling")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.key}
            className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t(plan.nameKey)}
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t(plan.limitKey)}
            </p>
            <button
              type="button"
              onClick={() => handleCheckout(plan.key)}
              disabled={busy === plan.key}
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === plan.key ? t("billing.redirecting") : t("billing.choosePlan")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
