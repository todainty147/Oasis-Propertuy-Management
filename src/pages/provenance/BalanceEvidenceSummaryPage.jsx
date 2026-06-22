import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ShieldCheck, ShieldAlert, AlertTriangle, Clock, Printer } from "lucide-react";
import Skeleton from "../../components/ui/Skeleton";
import { explainPropertyBalance } from "../../services/provenanceExplainService";
import { formatCurrencyAmount } from "../../utils/currency";
import { useI18n } from "../../context/I18nContext";

const BADGE_LABEL = {
  verified: "Balance verified",
  verified_unanchored: "Balance verified, not yet anchored",
  reconciliation_warning: "Reconciliation needed",
  issue: "Verification issue detected",
  pending: "Verification in progress",
};

const BADGE_ICON = {
  verified: ShieldCheck,
  verified_unanchored: ShieldCheck,
  reconciliation_warning: AlertTriangle,
  issue: ShieldAlert,
  pending: Clock,
};

function fmt(minor, currency) {
  return formatCurrencyAmount((minor || 0) / 100, { currency });
}

export default function BalanceEvidenceSummaryPage() {
  const { propertyId } = useParams();
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await explainPropertyBalance(propertyId);
      setData(result);
    } catch (err) {
      setError(err.message || "Failed to load balance data");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
          <p className="font-medium text-rose-800">Could not load balance data</p>
          <p className="mt-1 text-sm text-rose-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!data.export_allowed) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 print:border-amber-300">
          <p className="font-medium text-amber-800" data-testid="export-blocked-notice">
            Evidence summary is unavailable while balance checks are completed.
          </p>
          <p className="mt-2 text-sm text-amber-700">
            {data.safe_user_message}
          </p>
          <Link
            to={`/properties/${propertyId}?tab=financials`}
            className="mt-4 inline-block text-sm text-amber-700 underline print:hidden"
          >
            Return to property
          </Link>
        </div>
      </div>
    );
  }

  const currency = data.balance?.currency || "GBP";
  const events = data.events || [];
  const bridgeLines = data.reconciliation_bridge_lines || [];
  const eventTotal = data.event_contribution_total_minor ?? 0;
  const displayBalance = data.balance?.display_balance_minor ?? 0;
  const provenanceBalance = data.balance?.provenance_balance_minor ?? 0;
  const legacyBalance = data.balance?.legacy_balance_minor ?? 0;
  const displayBasis = data.balance?.display_basis || "provenance";
  const BadgeIcon = BADGE_ICON[data.badge_state] || Clock;
  const badgeLabel = BADGE_LABEL[data.badge_state] || "Verification in progress";
  const hasAnchor = data.anchor_consistency?.has_anchor;
  const headSequence = data.chain_verification?.head_sequence;
  const headHash = data.chain_verification?.head_hash;
  const generatedAt = data.generated_at ? new Date(data.generated_at).toLocaleString() : "—";

  return (
    <div className="balance-evidence-summary mx-auto max-w-4xl print:max-w-none">
      {/* Print-only header with back link hidden in print */}
      <div className="flex items-center justify-between px-8 pt-6 pb-2 print:hidden">
        <Link
          to={`/properties/${propertyId}?tab=financials`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to property
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Printer size={16} />
          {t("common.print")}
        </button>
      </div>

      <div className="px-8 py-6 space-y-6 print:px-0 print:py-0 print:space-y-4">
        {/* ── Page 1: Summary header ──────────────────────────────────────── */}
        <div className="evidence-page-one break-after-avoid">
          <header>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="summary-title">
              Balance Evidence Summary
            </h1>
            <p className="mt-1 text-sm text-slate-500" data-testid="generated-at">
              Generated: {generatedAt}
            </p>
          </header>

          {/* Labels */}
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {data.account_label && (
              <div>
                <span className="text-slate-500">Account:</span>{" "}
                <span className="font-medium text-slate-900">{data.account_label}</span>
              </div>
            )}
            {data.property_label && (
              <div>
                <span className="text-slate-500">Property:</span>{" "}
                <span className="font-medium text-slate-900">{data.property_label}</span>
              </div>
            )}
            {data.tenant_label && (
              <div>
                <span className="text-slate-500">Tenant:</span>{" "}
                <span className="font-medium text-slate-900">{data.tenant_label}</span>
              </div>
            )}
            {data.lease_label && (
              <div>
                <span className="text-slate-500">Lease:</span>{" "}
                <span className="font-medium text-slate-900">{data.lease_label}</span>
              </div>
            )}
          </div>

          {/* ── Lease-end accrual notice ─────────────────────────────────── */}
          {data.accrued_past_lease_end && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 print:border-amber-400" data-testid="lease-end-notice">
              <p className="text-sm font-medium text-amber-900">
                Lease-end accrual notice
              </p>
              <p className="mt-1 text-sm text-amber-800">
                This balance may include accrual after the recorded lease end date because the legacy finance calculation continues to accrue rent in this scenario. Review the tenancy dates before using this summary in a dispute or formal process.
              </p>
            </div>
          )}

          {/* ── Reconstructed history notice ─────────────────────────────── */}
          {data.has_reconstructed && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 print:border-blue-300" data-testid="reconstructed-notice">
              <p className="text-sm text-blue-800">
                Some opening balance history was reconstructed from the legacy finance calculation. Payment events are shown from recorded payment history.
              </p>
            </div>
          )}

          {/* ── Verification badge ───────────────────────────────────────── */}
          <div className="mt-5 flex items-center gap-2" data-testid="verification-badge">
            <BadgeIcon size={18} className="text-slate-600 print:text-black" />
            <span className="text-sm font-semibold text-slate-800">{badgeLabel}</span>
          </div>

          {/* ── Balance summary ───────────────────────────────────────────── */}
          <div className="mt-4 rounded-lg border border-slate-200 p-4 print:border-slate-400">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-500">Display balance</p>
                <p className="text-xl font-bold text-slate-900 mt-1" data-testid="display-balance">
                  {fmt(displayBalance, currency)}
                </p>
                <p className="text-[10px] text-slate-400">
                  {displayBasis === "legacy_compatible"
                    ? "Showing legacy-compatible figure"
                    : "Showing provenance-derived figure"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Provenance balance</p>
                <p className="text-lg font-semibold text-slate-700 mt-1">{fmt(provenanceBalance, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Legacy balance</p>
                <p className="text-lg font-semibold text-slate-700 mt-1">{fmt(legacyBalance, currency)}</p>
              </div>
            </div>
          </div>

          {/* ── Reconciliation status ────────────────────────────────────── */}
          <div className="mt-4 rounded-lg border border-slate-200 p-4 print:border-slate-400">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Reconciliation</p>
            <p className="text-sm font-medium text-slate-800">
              {data.legacy_reconciliation?.status?.replace(/_/g, " ")}
            </p>
            {data.legacy_reconciliation?.divergence_reason && (
              <p className="mt-1 text-sm text-slate-600">
                {data.legacy_reconciliation.divergence_reason.replace(/_/g, " ")}
              </p>
            )}
            {data.legacy_reconciliation?.recommended_action && (
              <p className="mt-1 text-xs text-slate-500 italic">
                {data.legacy_reconciliation.recommended_action}
              </p>
            )}
          </div>
        </div>

        {/* ── Arithmetic reconciliation ──────────────────────────────────── */}
        <div className="rounded-lg border border-slate-200 p-4 print:border-slate-400 break-inside-avoid" data-testid="arithmetic-reconciliation">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">Arithmetic reconciliation</p>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-1.5 text-slate-700">Event contribution total</td>
                <td className="py-1.5 text-right font-medium text-slate-900" data-testid="event-total">
                  {fmt(eventTotal, currency)}
                </td>
              </tr>
              {bridgeLines.map((line, i) => (
                <tr key={i} className="border-b border-slate-100" data-testid="bridge-line">
                  <td className="py-1.5 text-slate-600">{line.label}</td>
                  <td className="py-1.5 text-right font-medium text-slate-700">
                    {fmt(line.amount_minor, currency)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300">
                <td className="py-2 font-semibold text-slate-900">Display balance</td>
                <td className="py-2 text-right font-bold text-slate-900" data-testid="reconciled-display-balance">
                  {fmt(displayBalance, currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Event timeline ─────────────────────────────────────────────── */}
        <div data-testid="event-timeline">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">
            Event timeline ({events.length} event{events.length !== 1 ? "s" : ""})
          </p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Event</th>
                <th className="py-2 pr-2 text-right">Amount</th>
                <th className="py-2 pr-2 text-right">Contribution</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => {
                const isInactive = ev.treatment === "reversed" || ev.treatment === "superseded";
                return (
                  <tr
                    key={ev.event_id || i}
                    className={`border-b border-slate-100 ${isInactive ? "opacity-60" : ""}`}
                    data-testid="event-row"
                  >
                    <td className="py-1.5 pr-2 whitespace-nowrap text-slate-600">
                      {ev.occurred_at ? new Date(ev.occurred_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-slate-900">
                      {ev.summary || ev.event_type}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-700">
                      {ev.amount_minor != null ? fmt(ev.amount_minor, currency) : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-medium text-slate-900" data-testid="event-contribution">
                      {ev.contribution_minor != null ? fmt(ev.contribution_minor, currency) : "—"}
                    </td>
                    <td className="py-1.5 whitespace-nowrap">
                      {ev.treatment !== "active" && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 print:bg-slate-200">
                          {ev.treatment}
                        </span>
                      )}
                      {(ev.reconstructed || ev.metadata?.reconstructed) && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 print:bg-amber-200">
                          reconstructed
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Chain verification + anchor reference ──────────────────────── */}
        <div className="grid grid-cols-2 gap-4 break-inside-avoid">
          <div className="rounded-lg border border-slate-200 p-4 print:border-slate-400" data-testid="chain-verification-block">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Chain verification</p>
            <p className="text-sm font-medium text-slate-800" data-testid="verification-status">
              {data.chain_verification?.is_valid ? "Valid" : "Issue detected"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {data.chain_verification?.checked_count || 0} events checked
            </p>
            {headSequence != null && (
              <p className="text-xs text-slate-500 mt-1" data-testid="head-sequence">
                Head sequence: {headSequence}
              </p>
            )}
            {headHash && (
              <p className="text-xs text-slate-400 mt-0.5 font-mono break-all" data-testid="head-hash">
                {headHash}
              </p>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 p-4 print:border-slate-400" data-testid="anchor-block">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Anchor reference</p>
            {hasAnchor ? (
              <>
                <p className="text-sm font-medium text-slate-800">
                  {data.anchor_consistency?.anchor_consistent ? "Consistent" : "Inconsistent"}
                </p>
                <p className="text-xs text-slate-500 mt-1" data-testid="anchor-sequence">
                  Anchor sequence: {data.anchor_consistency.anchor_sequence}
                </p>
                {data.anchor_consistency.anchored_at && (
                  <p className="text-xs text-slate-500 mt-0.5" data-testid="anchor-date">
                    Anchored: {new Date(data.anchor_consistency.anchored_at).toLocaleString()}
                  </p>
                )}
                {data.anchor_consistency.anchor_hash && (
                  <p className="text-xs text-slate-400 mt-0.5 font-mono break-all" data-testid="anchor-hash">
                    {data.anchor_consistency.anchor_hash}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-600" data-testid="no-anchor">Verified, not yet anchored.</p>
            )}
          </div>
        </div>

        {/* ── Internal anchoring limitation notice ───────────────────────── */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 print:border-slate-400 print:bg-white break-inside-avoid" data-testid="anchoring-limitation-notice">
          Internal verification confirms this record matched Tenaqo's stored provenance chain at generation time. Internal anchoring is a checkpoint inside Tenaqo and is not external legal certification or independent timestamping.
        </div>

        {/* ── Export limitations note ────────────────────────────────────── */}
        <div className="text-xs text-slate-400 print:text-slate-500 break-inside-avoid" data-testid="export-limitations">
          This summary is generated from Tenaqo's internal provenance ledger. It is provided for informational purposes and does not constitute independently audited financial evidence. Figures are denominated in {currency}.
        </div>

        {/* ── Page footer ────────────────────────────────────────────────── */}
        <footer className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-400 print:border-slate-400 print:text-slate-500" data-testid="summary-footer">
          <div className="flex justify-between">
            <span>Balance Evidence Summary — {data.property_label || propertyId}</span>
            <span data-testid="footer-generated-at">Generated: {generatedAt}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
