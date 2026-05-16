import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Check, Minus, CheckCircle2, CreditCard,
  ExternalLink, Clock, Mail, PhoneCall, ShieldAlert,
} from "lucide-react";

import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import {
  canWriteForBilling,
  getBillingSubscription,
  openCustomerPortal,
  startCheckout,
} from "../services/billingService";
import { isManageRole } from "../utils/permissions";
import OnboardingHintCard from "../components/OnboardingHintCard";
import AiUsageSummaryCard from "../components/AiUsageSummaryCard";
import FounderEntitlementCard from "../components/billing/FounderEntitlementCard";

// Self-serve plans — operator_agency is intentionally excluded (sales-only)
const SELF_SERVE_PLANS = [
  { key: "starter",  nameKey: "billing.plan.starter",  limitKey: "billing.plan.starterLimit" },
  { key: "growth",   nameKey: "billing.plan.growth",   limitKey: "billing.plan.growthLimit" },
  { key: "pro",      nameKey: "billing.plan.pro",      limitKey: "billing.plan.proLimit" },
];

// All plans for the feature comparison table
const ALL_PLANS = [
  ...SELF_SERVE_PLANS,
  { key: "operator_agency", nameKey: "billing.plan.operatorAgency", limitKey: "billing.plan.operatorAgencyLimit" },
];

const COMPLIANCE_FEATURES = [
  { labelKey: "billing.feature.taxReadiness",   minRank: 2 },
  { labelKey: "billing.feature.rentShield",     minRank: 2 },
  { labelKey: "billing.feature.aiRentShield",   minRank: 2 },
  { labelKey: "billing.feature.aiLeaseAuditor", minRank: 3 },
];

const PLAN_RANKS = { starter: 1, growth: 2, pro: 3, operator_agency: 4 };

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function daysUntil(value) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

// ── OA Card ───────────────────────────────────────────────────────────────────

function OaCard({ t, isOaPending, oaCheckoutUrl, oaGrantStatus, activePlan }) {
  const isOaActive   = activePlan === "operator_agency";
  const isOaExpired  = activePlan === "oa_contract_expired";
  const checkoutExpired = oaGrantStatus?.checkoutExpired;

  return (
    <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-6 dark:border-fuchsia-900/40 dark:bg-fuchsia-950/20">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t("billing.plan.operatorAgency")}
        </h2>
        {isOaActive && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <CheckCircle2 size={12} />
            {t("billing.oa.activeLabel")}
          </span>
        )}
        {isOaPending && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <Clock size={12} />
            {t("billing.oa.pendingLabel")}
          </span>
        )}
        {isOaExpired && (
          <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            <ShieldAlert size={12} />
            {t("billing.oa.expiredLabel")}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {t("billing.plan.operatorAgencyLimit")}
      </p>

      {/* State: no grant — contact sales */}
      {!isOaPending && !isOaActive && !isOaExpired && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("billing.oa.contactSalesBody")}
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={`mailto:${t("billing.oa.salesEmail")}`}
              className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-fuchsia-700"
            >
              <Mail size={15} />
              {t("billing.oa.contactSalesButton")}
            </a>
            <a
              href={t("billing.oa.bookCallUrl")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-300 bg-white px-4 py-2 text-sm font-medium text-fuchsia-700 transition hover:bg-fuchsia-50 dark:border-fuchsia-700 dark:bg-transparent dark:text-fuchsia-300"
            >
              <PhoneCall size={15} />
              {t("billing.oa.bookCall")}
            </a>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t("billing.oa.salesDisclaimer")}
          </p>
        </div>
      )}

      {/* State: pending payment */}
      {isOaPending && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {t("billing.oa.pendingBody")}
          </p>
          {oaGrantStatus?.subscriptionStart && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("billing.oa.contractStart")}: <strong>{formatDate(oaGrantStatus.subscriptionStart)}</strong>
              {oaGrantStatus.subscriptionEnd
                ? <> &ndash; <strong>{formatDate(oaGrantStatus.subscriptionEnd)}</strong></>
                : null}
            </p>
          )}
          {checkoutExpired ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              {t("billing.oa.checkoutExpired")}
            </p>
          ) : oaCheckoutUrl ? (
            <a
              href={oaCheckoutUrl}
              className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-fuchsia-700"
            >
              <ExternalLink size={15} />
              {t("billing.oa.completePayment")}
            </a>
          ) : null}
          {oaGrantStatus?.stripeCheckoutExpiresAt && !checkoutExpired && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {t("billing.oa.linkExpires")}: {formatDate(oaGrantStatus.stripeCheckoutExpiresAt)}
            </p>
          )}
        </div>
      )}

      {/* State: active */}
      {isOaActive && oaGrantStatus && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("billing.oa.contractActive")}: <strong>{formatDate(oaGrantStatus.subscriptionStart)}</strong>
            {oaGrantStatus.subscriptionEnd
              ? <> &ndash; <strong>{formatDate(oaGrantStatus.subscriptionEnd)}</strong></>
              : null}
          </p>
          {oaGrantStatus.unitCount && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {t("billing.oa.units")}: <strong>{oaGrantStatus.unitCount}</strong>
            </p>
          )}
        </div>
      )}

      {/* State: expired */}
      {isOaExpired && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {t("billing.oa.expiredBody")}
          </p>
          <a
            href={`mailto:${t("billing.oa.salesEmail")}`}
            className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-fuchsia-700"
          >
            <Mail size={15} />
            {t("billing.oa.contactSalesButton")}
          </a>
        </div>
      )}
    </div>
  );
}

// ── Trial Banner ──────────────────────────────────────────────────────────────

function TrialBanner({ t, trialDaysLeft, trialEndsAt }) {
  if (!trialEndsAt || trialDaysLeft > 7) return null;
  const urgent = trialDaysLeft <= 2;
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        urgent
          ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
          : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
      }`}
    >
      <span className="font-medium">
        {t("billing.trialBanner", { days: trialDaysLeft })}
      </span>{" "}
      {t("billing.trialBannerSub")} <strong>{formatDate(trialEndsAt)}</strong>.
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const {
    activeAccountId, activeRole, isRootOperator, activePlan,
    trialEndsAt, isInTrial, trialDaysLeft,
    isOaPending, oaCheckoutUrl, oaGrantStatus,
    isFounder, founderEffectivePlan, founderBilledPlan,
    founderEndsAt, founderAiMonthlyLimit, founderPosition,
  } = useAccount();
  const { t } = useI18n();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [busy, setBusy]                 = useState("");
  const [error, setError]               = useState("");

  const canManageBilling = useMemo(
    () => isRootOperator || isManageRole(activeRole),
    [activeRole, isRootOperator],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!activeAccountId) return;
      try {
        setLoading(true);
        setError("");
        const data = await getBillingSubscription(activeAccountId);
        if (!cancelled) setSubscription(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("billing.loadError"));
          setSubscription(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeAccountId, t]);

  useRealtimeTables({
    enabled: !!activeAccountId && canManageBilling,
    subscriptions: [{
      channel: `billing-subscription:${activeAccountId}`,
      table: "billing_subscriptions",
      filter: `account_id=eq.${activeAccountId}`,
    }],
    onChange: async () => {
      if (!activeAccountId) return;
      try {
        setError("");
        const data = await getBillingSubscription(activeAccountId);
        setSubscription(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("billing.loadError"));
      }
    },
  });

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
  const stripeTrialEnd = subscription?.trial_end || null;

  return (
    <div className="space-y-6">
      {/* Trial banner — shown when trial ends within 7 days */}
      {isInTrial && !isRootOperator && (
        <TrialBanner t={t} trialDaysLeft={trialDaysLeft} trialEndsAt={trialEndsAt} />
      )}

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

        {/* Tenaqo trial info */}
        {trialEndsAt && !isRootOperator && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
            {isInTrial
              ? <>{t("billing.oasisTrialActive")} <strong>{formatDate(trialEndsAt)}</strong>.</>
              : <>{t("billing.oasisTrialExpired")} <strong>{formatDate(trialEndsAt)}</strong>. {t("billing.oasisTrialUpgrade")}</>}
          </div>
        )}

        {/* Stripe-managed trial */}
        {currentStatus === "trialing" && stripeTrialEnd && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
            {t("billing.trialActive")} <strong>{formatDate(stripeTrialEnd)}</strong>.
          </div>
        )}

        {loading ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("billing.loading")}</p>
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
                {subscription?.metadata?.plan_key || subscription?.stripe_price_id || "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("billing.currentPeriodEnd")}
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {formatDate(
                  currentStatus === "trialing" && stripeTrialEnd
                    ? stripeTrialEnd
                    : subscription.current_period_end,
                )}
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

      <OnboardingHintCard
        title={t("pageHints.billing.title")}
        body={t("pageHints.billing.body")}
      />

      <AiUsageSummaryCard accountId={activeAccountId} />

      {isFounder ? (
        <FounderEntitlementCard
          effectivePlan={founderEffectivePlan}
          billedPlan={founderBilledPlan}
          endsAt={founderEndsAt}
          aiMonthlyLimit={founderAiMonthlyLimit}
          position={founderPosition}
        />
      ) : null}

      {/* ── Self-serve plan cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SELF_SERVE_PLANS.map((plan) => (
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
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              {t("billing.trialIncluded")}
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

        {/* Operator/Agency card — separate CTA */}
        <OaCard
          t={t}
          activePlan={activePlan}
          isOaPending={isOaPending}
          oaCheckoutUrl={oaCheckoutUrl}
          oaGrantStatus={oaGrantStatus}
        />
      </div>

      {/* ── Compliance feature comparison table ── */}
      <div
        className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        data-testid="compliance-feature-matrix"
      >
        <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("billing.complianceSuite.title")}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {t("billing.complianceSuite.subtitle")}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="w-1/2 px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("billing.complianceSuite.feature")}
                </th>
                {ALL_PLANS.map((plan) => {
                  const isCurrent = activePlan === plan.key;
                  return (
                    <th
                      key={plan.key}
                      className={`px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide ${
                        isCurrent ? "text-blue-700 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
                      }`}
                      data-testid={isCurrent ? "current-plan-column" : undefined}
                    >
                      {t(plan.nameKey)}
                      {isCurrent && (
                        <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          {t("billing.complianceSuite.currentPlan")}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {COMPLIANCE_FEATURES.map((feat) => (
                <tr key={feat.labelKey} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-6 py-3 text-slate-700 dark:text-slate-200">
                    {t(feat.labelKey)}
                  </td>
                  {ALL_PLANS.map((plan) => {
                    const included = (PLAN_RANKS[plan.key] ?? 1) >= feat.minRank;
                    const isCurrent = activePlan === plan.key;
                    return (
                      <td
                        key={plan.key}
                        className={`px-3 py-3 text-center ${isCurrent ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
                      >
                        {included ? (
                          <Check size={16} className="mx-auto text-emerald-500 dark:text-emerald-400" aria-label="Included" />
                        ) : (
                          <Minus size={16} className="mx-auto text-slate-300 dark:text-slate-600" aria-label="Not included" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-6 py-3 dark:border-slate-800">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t("billing.complianceSuite.disclaimer")}
          </p>
        </div>
      </div>
    </div>
  );
}
