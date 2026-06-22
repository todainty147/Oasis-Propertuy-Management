import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { X, ShieldCheck, ShieldAlert, AlertTriangle, Clock, Printer, FileText } from "lucide-react";
import Skeleton from "../ui/Skeleton";
import { explainPropertyBalance, activateProvenanceCutover } from "../../services/provenanceExplainService";
import { useAccount } from "../../context/AccountContext";
import { formatCurrencyAmount } from "../../utils/currency";
import { useI18n } from "../../context/I18nContext";

const BADGE_CONFIG = {
  verified: {
    icon: ShieldCheck,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
    labelKey: "provenance.badge.verified",
  },
  verified_unanchored: {
    icon: ShieldCheck,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    labelKey: "provenance.badge.verifiedUnanchored",
  },
  reconciliation_warning: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    labelKey: "provenance.badge.warning",
  },
  issue: {
    icon: ShieldAlert,
    color: "text-rose-600",
    bg: "bg-rose-50 border-rose-200",
    labelKey: "provenance.badge.issue",
  },
  pending: {
    icon: Clock,
    color: "text-slate-500",
    bg: "bg-slate-50 border-slate-200",
    labelKey: "provenance.badge.pending",
  },
};

function BadgeIndicator({ state, t }) {
  const config = BADGE_CONFIG[state] || BADGE_CONFIG.pending;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${config.bg} ${config.color}`}>
      <Icon size={14} />
      {t(config.labelKey)}
    </span>
  );
}

function EventRow({ event, currency, t }) {
  const isDebit = (event.contribution_minor || 0) > 0;
  const isCredit = (event.contribution_minor || 0) < 0;
  const isZero = (event.contribution_minor || 0) === 0;

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
      event.treatment === "reversed" || event.treatment === "superseded"
        ? "border-slate-100 bg-slate-50 opacity-60"
        : "border-slate-200 bg-white"
    }`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 truncate">
          {event.summary || event.event_type}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {event.occurred_at ? new Date(event.occurred_at).toLocaleDateString() : "—"}
          {event.treatment !== "active" && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
              {event.treatment}
            </span>
          )}
          {event.reconstructed && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700">
              {t("provenance.reconstructed")}
            </span>
          )}
        </p>
      </div>
      <div className="text-right shrink-0">
        {isZero ? (
          <p className="text-slate-400">—</p>
        ) : (
          <p className={isDebit ? "font-medium text-rose-600" : "font-medium text-emerald-600"}>
            {isDebit ? "+" : ""}
            {formatCurrencyAmount((event.contribution_minor || 0) / 100, { currency })}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ExplainBalanceDrawer({ propertyId, onClose }) {
  const { t } = useI18n();
  const { activeAccountId } = useAccount();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activating, setActivating] = useState(false);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await explainPropertyBalance(propertyId);
      setData(result);
    } catch (err) {
      setError(err.message || "Failed to load balance explanation");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  const handleActivateCutover = useCallback(async () => {
    if (!activeAccountId) return;
    setActivating(true);
    try {
      await activateProvenanceCutover(activeAccountId);
      await load();
    } catch (err) {
      setError(err.message || "Failed to activate provenance tracking");
    } finally {
      setActivating(false);
    }
  }, [activeAccountId, load]);

  useEffect(() => { load(); }, [load]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const currency = data?.balance?.currency || "GBP";
  const events = data?.events || [];
  const activeEvents = events.filter((e) => e.treatment === "active" || e.treatment === "reconstructed");
  const inactiveEvents = events.filter((e) => e.treatment !== "active" && e.treatment !== "reconstructed");

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl print:static print:max-w-none print:border-0 print:shadow-none"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4 backdrop-blur print:static print:backdrop-blur-none">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {t("provenance.explainBalance.title")}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {t("provenance.explainBalance.subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-2 print:hidden">
              {data?.export_allowed && (
                <>
                  <Link
                    to={`/properties/${propertyId}/balance-evidence`}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                    aria-label="Balance evidence summary"
                    title="Balance evidence summary"
                  >
                    <FileText size={16} />
                  </Link>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                    aria-label={t("common.print")}
                  >
                    <Printer size={16} />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                aria-label={t("common.close")}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-16" />
              <Skeleton className="h-40" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-medium text-rose-800">{t("provenance.explainBalance.error")}</p>
              <p className="mt-1 text-sm text-rose-600">{error}</p>
            </div>
          ) : data ? (
            <>
              {/* Badge + Balance */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <BadgeIndicator state={data.badge_state} t={t} />
                  {data.safe_user_message && (
                    <p className="text-xs text-slate-500">{data.safe_user_message}</p>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">{t("provenance.explainBalance.displayBalance")}</p>
                    <p className="text-xl font-bold text-slate-900 mt-1">
                      {formatCurrencyAmount((data.balance?.display_balance_minor || 0) / 100, { currency })}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {data.balance?.display_basis === "legacy_compatible"
                        ? t("provenance.explainBalance.basisLegacy")
                        : t("provenance.explainBalance.basisProvenance")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{t("provenance.explainBalance.provenanceBalance")}</p>
                    <p className="text-lg font-semibold text-slate-700 mt-1">
                      {formatCurrencyAmount((data.balance?.provenance_balance_minor || 0) / 100, { currency })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{t("provenance.explainBalance.legacyBalance")}</p>
                    <p className="text-lg font-semibold text-slate-700 mt-1">
                      {formatCurrencyAmount((data.balance?.legacy_balance_minor || 0) / 100, { currency })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reconciliation */}
              {data.legacy_reconciliation && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                    {t("provenance.explainBalance.reconciliation")}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${
                      data.legacy_reconciliation.status === "matched" ? "bg-emerald-500" :
                      data.legacy_reconciliation.status === "explained_divergence" ? "bg-blue-500" :
                      data.legacy_reconciliation.status === "unexplained_divergence" ? "bg-amber-500" :
                      "bg-slate-400"
                    }`} />
                    <span className="text-sm font-medium text-slate-700">
                      {data.legacy_reconciliation.status?.replace(/_/g, " ")}
                    </span>
                    {data.legacy_reconciliation.difference_minor !== 0 && (
                      <span className="text-sm text-slate-500 ml-auto">
                        {t("provenance.explainBalance.difference")}:{" "}
                        {formatCurrencyAmount((data.legacy_reconciliation.difference_minor || 0) / 100, { currency })}
                      </span>
                    )}
                  </div>
                  {data.legacy_reconciliation.divergence_reason && (
                    <p className="mt-2 text-xs text-slate-500">
                      {data.legacy_reconciliation.divergence_reason.replace(/_/g, " ")}
                    </p>
                  )}
                  {data.legacy_reconciliation.recommended_action && (
                    <p className="mt-1 text-xs text-slate-400 italic">
                      {data.legacy_reconciliation.recommended_action}
                    </p>
                  )}
                </div>
              )}

              {/* Cutover activation prompt */}
              {data.legacy_reconciliation?.divergence_reason === "not_yet_cut_over" && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                  <p className="text-sm font-medium text-indigo-900">
                    {t("provenance.cutover.title")}
                  </p>
                  <p className="mt-1 text-xs text-indigo-700">
                    {t("provenance.cutover.description")}
                  </p>
                  <button
                    type="button"
                    onClick={handleActivateCutover}
                    disabled={activating}
                    className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {activating ? t("common.loading") : t("provenance.cutover.activate")}
                  </button>
                </div>
              )}

              {/* Chain + Anchor status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                    {t("provenance.explainBalance.chainVerification")}
                  </p>
                  <p className={`text-sm font-medium ${data.chain_verification?.is_valid ? "text-emerald-600" : "text-rose-600"}`}>
                    {data.chain_verification?.is_valid ? t("provenance.valid") : t("provenance.invalid")}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t("provenance.explainBalance.eventsChecked", { count: data.chain_verification?.checked_count || 0 })}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                    {t("provenance.explainBalance.anchorStatus")}
                  </p>
                  {data.anchor_consistency?.has_anchor ? (
                    <>
                      <p className={`text-sm font-medium ${data.anchor_consistency?.anchor_consistent ? "text-emerald-600" : "text-rose-600"}`}>
                        {data.anchor_consistency?.anchor_consistent ? t("provenance.consistent") : t("provenance.inconsistent")}
                      </p>
                      {data.anchor_consistency?.events_after_anchor > 0 && (
                        <p className="text-xs text-slate-500 mt-1">
                          {t("provenance.explainBalance.eventsAfterAnchor", { count: data.anchor_consistency.events_after_anchor })}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">{t("provenance.explainBalance.noAnchor")}</p>
                  )}
                </div>
              </div>

              {/* Events */}
              {activeEvents.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                    {t("provenance.explainBalance.activeEvents")} ({activeEvents.length})
                  </p>
                  <div className="space-y-2">
                    {activeEvents.map((event) => (
                      <EventRow key={event.event_id} event={event} currency={currency} t={t} />
                    ))}
                  </div>
                </div>
              )}

              {inactiveEvents.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer text-xs uppercase tracking-wide text-slate-400 hover:text-slate-600 mb-2">
                    {t("provenance.explainBalance.inactiveEvents")} ({inactiveEvents.length})
                  </summary>
                  <div className="space-y-2 mt-2">
                    {inactiveEvents.map((event) => (
                      <EventRow key={event.event_id} event={event} currency={currency} t={t} />
                    ))}
                  </div>
                </details>
              )}

              {/* Generated at */}
              <p className="text-[10px] text-slate-400 text-right">
                {t("provenance.explainBalance.generatedAt")}: {data.generated_at ? new Date(data.generated_at).toLocaleString() : "—"}
              </p>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
