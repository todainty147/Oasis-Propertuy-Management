import { useEffect, useState } from "react";
import { useI18n } from "../context/I18nContext";
import { getAccountAiUsageSummary } from "../services/aiUsageService";

const FEATURE_LABELS = {
  attention_briefing: "Attention Insights",
  maintenance_triage_suggestion: "Maintenance Triage",
  property_health_explainer: "Property Health",
  contractor_recommendation: "Contractor Recommendation",
  weekly_portfolio_summary_ai: "Weekly Portfolio Summary",
};

function featureLabel(key) {
  return FEATURE_LABELS[key] || key.replace(/_/g, " ");
}

function UsageBar({ used, limit, className = "" }) {
  if (limit == null) {
    // Unlimited plan — show a full green bar with "Unlimited" label
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="h-1.5 flex-1 rounded-full bg-emerald-200">
          <div className="h-1.5 w-full rounded-full bg-emerald-400" />
        </div>
        <span className="text-[11px] text-slate-500 shrink-0">Unlimited</span>
      </div>
    );
  }
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  const color =
    pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-400";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-1.5 flex-1 rounded-full bg-slate-100">
        <div
          className={`h-1.5 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">
        {used.toLocaleString()} / {limit.toLocaleString()}
      </span>
    </div>
  );
}

/**
 * Epic E2 — AI usage summary card for account settings / billing page.
 *
 * Shows monthly AI call quota, per-feature breakdown, and estimated cost.
 * Hidden on Starter (no AI features).
 *
 * @param {object} props
 * @param {string} props.accountId
 * @param {string} [props.period]  YYYY-MM, defaults to current month
 */
export default function AiUsageSummaryCard({ accountId, period }) {
  const { t } = useI18n();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);

  const currentPeriod = period || new Date().toISOString().slice(0, 7);
  const nextMonth = new Date(
    new Date(`${currentPeriod}-01`).getTime() + 32 * 86400000,
  )
    .toISOString()
    .slice(0, 10)
    .slice(0, 7);

  const resetDate = `${nextMonth}-01`;

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await getAccountAiUsageSummary(accountId, currentPeriod);
        if (!cancelled) setSummary(result);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load AI usage");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [accountId, currentPeriod]);

  // Hide card entirely on Starter — they have no AI
  if (!loading && summary?.plan === "starter" && summary.totalPromptRuns === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white" data-testid="ai-usage-summary-card">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">AI Usage — {currentPeriod}</h3>
            {summary && (
              <p className="mt-0.5 text-xs text-slate-500 capitalize">
                {summary.plan} plan
                {summary.monthlyLimit != null
                  ? ` · Resets ${resetDate}`
                  : " · Unlimited"}
              </p>
            )}
          </div>
          {loading && (
            <span className="text-xs text-slate-400">Loading…</span>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 space-y-4">
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : null}

        {summary ? (
          <>
            {/* Total quota bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-slate-700">AI calls this month</p>
                <p className="text-xs text-slate-500 tabular-nums">
                  ${summary.totalEstimatedCost.toFixed(4)} est.
                </p>
              </div>
              <UsageBar
                used={summary.totalPromptRuns}
                limit={summary.monthlyLimit}
              />
            </div>

            {/* Per-feature breakdown (collapsible) */}
            {summary.features.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setDetailOpen((v) => !v)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {detailOpen ? "Hide feature breakdown" : "Show feature breakdown"}
                </button>

                {detailOpen && (
                  <div className="mt-3 space-y-3">
                    {summary.features.map((f) => (
                      <div key={f.featureKey}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-slate-600">{featureLabel(f.featureKey)}</p>
                          <p className="text-[11px] text-slate-400 tabular-nums">
                            {f.promptRuns} call{f.promptRuns !== 1 ? "s" : ""}
                            {f.estimatedCost > 0 ? ` · $${f.estimatedCost.toFixed(4)}` : ""}
                          </p>
                        </div>
                        <div className="h-1 rounded-full bg-slate-100">
                          <div
                            className="h-1 rounded-full bg-blue-400"
                            style={{
                              width: summary.totalPromptRuns > 0
                                ? `${(f.promptRuns / summary.totalPromptRuns) * 100}%`
                                : "0%",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {summary.monthlyLimit != null && summary.totalPromptRuns >= summary.monthlyLimit * 0.9 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                You have used{" "}
                <strong>{Math.round((summary.totalPromptRuns / summary.monthlyLimit) * 100)}%</strong>{" "}
                of your monthly AI quota. Resets on {resetDate}.
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
