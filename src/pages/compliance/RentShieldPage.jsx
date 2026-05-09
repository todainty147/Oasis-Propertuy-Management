import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronDown, RefreshCw } from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { useI18n } from "../../context/I18nContext";
import { useRentShield, useRentShieldPortfolio } from "../../hooks/useRentShield";
import {
  computeAndSaveAssessment,
  currentPeriodKey,
} from "../../services/rentShieldService";
import { supabase } from "../../lib/supabase";
import ShieldScoreGauge from "../../components/compliance/ShieldScoreGauge";
import RentShieldTierBadge from "../../components/compliance/RentShieldTierBadge";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function formatCurrency(amount, currency = "GBP") {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

function MetricChip({ label, value, accent = "" }) {
  return (
    <div className={`rounded-xl border p-3 ${accent}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

// ── Property selector ─────────────────────────────────────────────────────────

function useAccountProperties(accountId) {
  const [properties, setProperties] = useState([]);
  useEffect(() => {
    if (!accountId) return;
    supabase
      .from("properties")
      .select("id, address, city")
      .eq("account_id", accountId)
      .order("address", { ascending: true })
      .then(({ data }) => setProperties(data ?? []));
  }, [accountId]);
  return properties;
}

// ── Assessment card ───────────────────────────────────────────────────────────

function AssessmentCard({ assessment, t }) {
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      data-testid="rent-shield-assessment-card"
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center">
          <ShieldScoreGauge
            score={assessment.shield_score}
            tier={assessment.shield_tier}
            size={160}
          />
          <div className="mt-2">
            <RentShieldTierBadge tier={assessment.shield_tier} size="lg" />
          </div>
        </div>

        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricChip
              label={t("compliance.rentShield.metric.arrears")}
              value={formatCurrency(assessment.arrears_amount)}
              accent={
                (assessment.arrears_amount ?? 0) > 0
                  ? "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30"
                  : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50"
              }
            />
            <MetricChip
              label={t("compliance.rentShield.metric.daysOverdue")}
              value={assessment.days_overdue_p90 != null ? `${Math.round(assessment.days_overdue_p90)}d` : "—"}
              accent={
                (assessment.days_overdue_p90 ?? 0) > 30
                  ? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"
                  : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50"
              }
            />
            <MetricChip
              label={t("compliance.rentShield.metric.period")}
              value={assessment.period || "—"}
              accent="border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50"
            />
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            {t("compliance.rentShield.lastAssessed")}: {formatDate(assessment.generated_at)}
          </div>

          {/* AI narrative placeholder */}
          {assessment.ai_narrative ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
              {assessment.ai_narrative}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
              {t("compliance.rentShield.aiNarrativeDeferred")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RentShieldPage() {
  const { activeAccountId } = useAccount();
  const { t } = useI18n();

  const properties = useAccountProperties(activeAccountId);
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcError, setRecalcError] = useState("");
  const [lastSampleSize, setLastSampleSize] = useState(null);
  const [lastTotalPayments, setLastTotalPayments] = useState(null);
  const [recalcAllBusy, setRecalcAllBusy] = useState(false);
  const [recalcAllProgress, setRecalcAllProgress] = useState(null);

  const { assessments, loading, error, refetch } = useRentShield(activeAccountId, {
    propertyId: selectedPropertyId,
  });
  const { latestByProperty, loading: portfolioLoading, refetch: refetchPortfolio } = useRentShieldPortfolio(activeAccountId);

  const currentPeriod = useMemo(() => currentPeriodKey(), []);

  // The most recent assessment for the selected property (current period preferred)
  const currentAssessment = useMemo(() => {
    if (!assessments.length) return null;
    return assessments.find((a) => a.period === currentPeriod) ?? assessments[0];
  }, [assessments, currentPeriod]);

  // Map property_id → property label for the portfolio table
  const propertyMap = useMemo(
    () => new Map(properties.map((p) => [p.id, p.address || p.city || p.id])),
    [properties],
  );

  async function handleRecalculate() {
    if (!activeAccountId || !selectedPropertyId) return;
    try {
      setRecalcBusy(true);
      setRecalcError("");
      setLastSampleSize(null);
      setLastTotalPayments(null);
      const result = await computeAndSaveAssessment(activeAccountId, selectedPropertyId, currentPeriod);
      if (result?.sampleSize != null) setLastSampleSize(result.sampleSize);
      if (result?.totalPayments != null) setLastTotalPayments(result.totalPayments);
      refetch();
      refetchPortfolio();
    } catch (err) {
      setRecalcError(err instanceof Error ? err.message : t("compliance.rentShield.errors.recalcFailed"));
    } finally {
      setRecalcBusy(false);
    }
  }

  async function handleRecalculateAll() {
    if (!activeAccountId || recalcAllBusy) return;
    try {
      setRecalcAllBusy(true);
      setRecalcAllProgress({ done: 0, total: properties.length });
      for (let i = 0; i < properties.length; i++) {
        await computeAndSaveAssessment(activeAccountId, properties[i].id, currentPeriod);
        setRecalcAllProgress({ done: i + 1, total: properties.length });
      }
      refetchPortfolio();
    } catch {
      // best-effort; errors on individual properties don't stop the batch
    } finally {
      setRecalcAllBusy(false);
      setRecalcAllProgress(null);
    }
  }

  return (
    <div className="space-y-6" data-testid="rent-shield-page">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {t("compliance.rentShield.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t("compliance.rentShield.subtitle")}
        </p>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
          <p className="text-xs text-amber-900 dark:text-amber-200">
            {t("compliance.rentShield.disclaimer")}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <select
            value={selectedPropertyId ?? ""}
            onChange={(e) => setSelectedPropertyId(e.target.value || null)}
            className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            data-testid="property-selector"
          >
            <option value="">{t("compliance.rentShield.allProperties")}</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address || p.city || p.id}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>

        {selectedPropertyId && (
          <button
            type="button"
            onClick={handleRecalculate}
            disabled={recalcBusy}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            data-testid="recalculate-button"
          >
            <RefreshCw size={14} className={recalcBusy ? "animate-spin" : ""} />
            {recalcBusy ? t("common.processing") : t("compliance.rentShield.recalculate")}
          </button>
        )}

        <span className="text-xs text-slate-500 dark:text-slate-400">
          {t("compliance.rentShield.currentPeriod")}: <strong>{currentPeriod}</strong>
        </span>
      </div>

      {(error || recalcError) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {error || recalcError}
        </div>
      )}

      {lastTotalPayments === 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-xs text-orange-800 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-200" data-testid="no-payment-records-warning">
          {t("compliance.rentShield.noPaymentRecords")}
        </div>
      )}
      {lastTotalPayments !== 0 && lastSampleSize != null && lastSampleSize < 5 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200" data-testid="low-confidence-warning">
          {t("compliance.rentShield.lowConfidence", { count: lastSampleSize })}
        </div>
      )}

      {/* Property view: current assessment + history */}
      {selectedPropertyId ? (
        <>
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm" aria-label="breadcrumb">
            <button
              type="button"
              onClick={() => setSelectedPropertyId(null)}
              className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
            >
              <ChevronLeft size={14} />
              {t("compliance.rentShield.title")}
            </button>
            <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">/</span>
            <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
              {propertyMap.get(selectedPropertyId) || selectedPropertyId}
            </span>
          </nav>
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
          ) : !currentAssessment ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("compliance.rentShield.noAssessment")}
              </p>
              <button
                type="button"
                onClick={handleRecalculate}
                disabled={recalcBusy}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
              >
                <RefreshCw size={14} />
                {t("compliance.rentShield.generateFirst")}
              </button>
            </div>
          ) : (
            <AssessmentCard assessment={currentAssessment} t={t} />
          )}

          {/* Assessment history */}
          {assessments.length > 1 && (
            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t("compliance.rentShield.history.title")}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="assessment-history-table">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      {[
                        "compliance.rentShield.history.period",
                        "compliance.rentShield.history.score",
                        "compliance.rentShield.history.tier",
                        "compliance.rentShield.history.arrears",
                        "compliance.rentShield.history.generated",
                      ].map((key) => (
                        <th key={key} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {assessments.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{a.period}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{a.shield_score}</td>
                        <td className="px-4 py-3"><RentShieldTierBadge tier={a.shield_tier} /></td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatCurrency(a.arrears_amount)}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(a.generated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Portfolio overview — all properties, latest assessment each */
        <>
          {properties.length > 0 && (
            <div className="flex items-center justify-end gap-3">
              {recalcAllProgress && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {recalcAllProgress.done} / {recalcAllProgress.total}
                </span>
              )}
              <button
                type="button"
                onClick={handleRecalculateAll}
                disabled={recalcAllBusy}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                data-testid="recalculate-all-button"
              >
                <RefreshCw size={14} className={recalcAllBusy ? "animate-spin" : ""} />
                {recalcAllBusy ? t("compliance.rentShield.recalculatingAll") : t("compliance.rentShield.recalculateAll")}
              </button>
            </div>
          )}

          {portfolioLoading ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
          ) : latestByProperty.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("compliance.rentShield.portfolioEmpty")}
              </p>
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                {t("compliance.rentShield.portfolioEmptyHint")}
              </p>
            </div>
          ) : (
            <>
              {/* Summary chips */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["strong", "moderate", "elevated", "critical"]).map((tier) => {
                  const count = latestByProperty.filter((a) => a.shield_tier === tier).length;
                  return (
                    <div
                      key={tier}
                      className={`rounded-xl border p-4 ${
                        tier === "strong"   ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30" :
                        tier === "moderate" ? "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30" :
                        tier === "elevated" ? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30" :
                                              "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30"
                      }`}
                    >
                      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t(`compliance.rentShield.tier.${tier}`)}
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{count}</p>
                    </div>
                  );
                })}
              </div>

              {/* Portfolio table */}
              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block" data-testid="portfolio-table">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      {[
                        "compliance.rentShield.portfolio.property",
                        "compliance.rentShield.portfolio.period",
                        "compliance.rentShield.portfolio.score",
                        "compliance.rentShield.portfolio.tier",
                        "compliance.rentShield.portfolio.arrears",
                        "compliance.rentShield.portfolio.assessed",
                      ].map((key) => (
                        <th key={key} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {latestByProperty.map((a) => (
                      <tr
                        key={a.id}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        onClick={() => setSelectedPropertyId(a.property_id)}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {propertyMap.get(a.property_id) || a.property_id}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{a.period}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{a.shield_score}</td>
                        <td className="px-4 py-3"><RentShieldTierBadge tier={a.shield_tier} /></td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {formatCurrency(a.arrears_amount)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                          {formatDate(a.generated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden" data-testid="portfolio-cards">
                {latestByProperty.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedPropertyId(a.property_id)}
                    className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {propertyMap.get(a.property_id) || a.property_id}
                      </p>
                      <RentShieldTierBadge tier={a.shield_tier} />
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>{t("compliance.rentShield.portfolio.score")}: {a.shield_score}</span>
                      <span>{a.period}</span>
                      {(a.arrears_amount ?? 0) > 0 && (
                        <span className="text-rose-600 dark:text-rose-400">
                          {formatCurrency(a.arrears_amount)} arrears
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
