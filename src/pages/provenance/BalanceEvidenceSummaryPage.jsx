import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ShieldCheck, ShieldAlert, AlertTriangle, Clock, Printer } from "lucide-react";
import Skeleton from "../../components/ui/Skeleton";
import { explainPropertyBalance } from "../../services/provenanceExplainService";
import { formatCurrencyAmount } from "../../utils/currency";
import { useI18n } from "../../context/I18nContext";

const ASSURANCE_CONFIG = {
  passed: { label: "Passed", icon: ShieldCheck, className: "text-emerald-700" },
  failed: { label: "Failed", icon: ShieldAlert, className: "text-rose-700" },
  usable: { label: "Usable", icon: ShieldCheck, className: "text-emerald-700" },
  caution_required: { label: "Caution required", icon: AlertTriangle, className: "text-amber-700" },
  unusable: { label: "Not usable", icon: ShieldAlert, className: "text-rose-700" },
  not_applicable: { label: "Not applicable", icon: Clock, className: "text-slate-600" },
};

function fmt(minor, currency) {
  return formatCurrencyAmount((minor || 0) / 100, { currency });
}

function AssuranceStatus({ label, status }) {
  const config = ASSURANCE_CONFIG[status] || ASSURANCE_CONFIG.not_applicable;
  const Icon = config.icon;
  return (
    <div className="rounded-lg border border-slate-200 p-3 print:border-slate-400">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 flex items-center gap-1.5 text-sm font-semibold ${config.className}`}>
        <Icon size={15} />
        {config.label}
      </p>
    </div>
  );
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

  useEffect(() => {
    document.body.classList.add("balance-evidence-print-mode");
    return () => document.body.classList.remove("balance-evidence-print-mode");
  }, []);

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
  const isLegacyMigrated = data.provenance_mode === "legacy_migrated";
  const assurance = data.assurance || {};
  const hasAnchor = data.anchor_consistency?.has_anchor;
  const headSequence = data.chain_verification?.head_sequence;
  const headHash = data.chain_verification?.head_hash;
  const generatedAt = data.generated_at ? new Date(data.generated_at).toLocaleString() : "—";

  return (
    <div className="balance-evidence-summary mx-auto max-w-4xl bg-white text-slate-950 dark:bg-white dark:text-slate-950 min-h-screen print:max-w-none">
      <style>{`
        .balance-evidence-summary,
        .balance-evidence-summary * {
          color-scheme: light;
        }
        .dark .balance-evidence-summary {
          background-color: #ffffff !important;
          color: #020617 !important;
        }
        .dark .balance-evidence-summary .bg-white,
        .dark .balance-evidence-summary .bg-slate-50,
        .dark .balance-evidence-summary .bg-slate-100 {
          background-color: inherit;
        }
        .dark .balance-evidence-summary .border-slate-200,
        .dark .balance-evidence-summary .border-slate-100,
        .dark .balance-evidence-summary .border-slate-300 {
          border-color: #e2e8f0;
        }
        .dark .balance-evidence-summary .text-slate-900 { color: #0f172a; }
        .dark .balance-evidence-summary .text-slate-800 { color: #1e293b; }
        .dark .balance-evidence-summary .text-slate-700 { color: #334155; }
        .dark .balance-evidence-summary .text-slate-600 { color: #475569; }
        .dark .balance-evidence-summary .text-slate-500 { color: #64748b; }
        .dark .balance-evidence-summary .text-slate-400 { color: #94a3b8; }
        .dark .balance-evidence-summary .bg-amber-50 { background-color: #fffbeb; }
        .dark .balance-evidence-summary .bg-blue-50 { background-color: #eff6ff; }
        .dark .balance-evidence-summary .text-amber-900 { color: #78350f; }
        .dark .balance-evidence-summary .text-amber-800 { color: #92400e; }
        .dark .balance-evidence-summary .text-amber-700 { color: #b45309; }
        .dark .balance-evidence-summary .text-blue-800 { color: #1e40af; }
        .dark .balance-evidence-summary .bg-amber-100 { background-color: #fef3c7; }
        .dark .balance-evidence-summary .bg-slate-100 { background-color: #f1f5f9; }
        .dark .balance-evidence-summary .bg-slate-50 { background-color: #f8fafc; }
        @media print {
          html, body {
            background: white !important;
            overflow: visible !important;
          }
          body.balance-evidence-print-mode > div,
          body.balance-evidence-print-mode .tenaqo-app-surface,
          body.balance-evidence-print-mode main {
            display: block !important;
            overflow: visible !important;
            background: white !important;
          }
          body.balance-evidence-print-mode aside,
          body.balance-evidence-print-mode header,
          body.balance-evidence-print-mode nav,
          body.balance-evidence-print-mode .tenaqo-app-surface > header,
          body.balance-evidence-print-mode [class*="MobileBottomNav"],
          body.balance-evidence-print-mode [class*="Topbar"],
          body.balance-evidence-print-mode [class*="Sidebar"] {
            display: none !important;
          }
          .balance-evidence-summary {
            max-width: none !important;
            margin: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>
      {/* Screen-only toolbar — hidden in print */}
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
              {isLegacyMigrated ? "Balance Evidence Summary" : "Balance Summary"}
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
          {isLegacyMigrated && data.accrued_past_lease_end && (
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
          {isLegacyMigrated && data.has_reconstructed && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 print:border-blue-300" data-testid="reconstructed-notice">
              <p className="text-sm text-blue-800">
                Some opening balance history was reconstructed from the legacy finance calculation. Payment events are shown from recorded payment history.
              </p>
            </div>
          )}

          {/* ── Assurance status ─────────────────────────────────────────── */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="assurance-status">
            <AssuranceStatus label="Ledger integrity" status={assurance.ledger_integrity} />
            <AssuranceStatus
              label="Internal reconciliation"
              status={assurance.internal_reconciliation}
            />
            <AssuranceStatus label="Balance reliability" status={assurance.balance_reliability} />
          </div>

          {/* ── Balance summary ───────────────────────────────────────────── */}
          <div className="mt-4 rounded-lg border border-slate-200 p-4 print:border-slate-400">
            <div className={`grid gap-4 text-center ${isLegacyMigrated ? "grid-cols-3" : "grid-cols-1"}`}>
              <div>
                <p className="text-xs text-slate-500">
                  {isLegacyMigrated ? "Display balance" : "Balance"}
                </p>
                <p className="text-xl font-bold text-slate-900 mt-1" data-testid="display-balance">
                  {fmt(displayBalance, currency)}
                </p>
                {isLegacyMigrated && <p className="text-[10px] text-slate-400">
                  {displayBasis === "legacy_compatible"
                    ? "Showing legacy-compatible figure"
                    : "Showing provenance-derived figure"}
                </p>}
              </div>
              {isLegacyMigrated && <div>
                <p className="text-xs text-slate-500">Provenance balance</p>
                <p className="text-lg font-semibold text-slate-700 mt-1">{fmt(provenanceBalance, currency)}</p>
              </div>}
              {isLegacyMigrated && <div>
                <p className="text-xs text-slate-500">Legacy formula result</p>
                <p className="text-lg font-semibold text-slate-700 mt-1">{fmt(legacyBalance, currency)}</p>
              </div>}
            </div>
          </div>

          {/* ── Reconciliation status ────────────────────────────────────── */}
          {isLegacyMigrated && data.legacy_reconciliation && (
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
          )}
        </div>

        {/* ── Arithmetic reconciliation ──────────────────────────────────── */}
        {isLegacyMigrated && bridgeLines.length > 0 && (
        <div className="rounded-lg border border-slate-200 p-4 print:border-slate-400 break-inside-avoid" data-testid="arithmetic-reconciliation">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-3">Reconciliation bridge</p>
          <p className="mb-3 text-xs text-slate-500">
            Presentation-only difference; this is not a charge, payment, or ledger event.
          </p>
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
        )}

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
                      {isLegacyMigrated && (ev.reconstructed || ev.metadata?.reconstructed) && (
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
          The ledger integrity result confirms that Tenaqo's stored event chain passed its internal hash and sequence checks at {data.chain_verification?.verified_at ? new Date(data.chain_verification.verified_at).toLocaleString() : "the recorded verification time"}. It does not establish that each entry is factually or legally correct. Internal anchoring is not external legal certification or independent timestamping.
        </div>

        {/* ── Export limitations note ────────────────────────────────────── */}
        <div className="text-xs text-slate-400 print:text-slate-500 break-inside-avoid" data-testid="export-limitations">
          This summary is generated from Tenaqo's internal provenance ledger. It is provided for informational purposes and does not constitute independently audited financial evidence. Figures are denominated in {currency}.
          {isLegacyMigrated && " Migration-specific figures may include reconstructed history and legacy formula assumptions where identified above."}
        </div>

        {/* ── Page footer ────────────────────────────────────────────────── */}
        <footer className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-400 print:border-slate-400 print:text-slate-500" data-testid="summary-footer">
          <div className="flex justify-between">
            <span>{isLegacyMigrated ? "Balance Evidence Summary" : "Balance Summary"} — {data.property_label || propertyId}</span>
            <span data-testid="footer-generated-at">Generated: {generatedAt}</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
