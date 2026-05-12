import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, MinusCircle, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../../context/I18nContext";
import { listRentMatchCandidates, createRentMatchCandidate, updateRentMatchStatus, listRentMatchAudit } from "../../services/plRentMatchService";
import { calcRentMatchConfidence, confidenceLabel, allowedMatchTransitions } from "../../utils/plAdvancedUtils";

// ── Confidence badge ──────────────────────────────────────────────────────────

const CONF_STYLES = {
  high:   "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  low:    "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

function ConfidenceBadge({ score, t }) {
  const level = confidenceLabel(score);
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CONF_STYLES[level]}`}>
      <Sparkles size={9} className="inline mr-0.5" />
      {t(`plAdvanced.rentMatch.confidence.${level}`)} ({Math.round(score * 100)}%)
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  suggested: "bg-blue-100  text-blue-700  dark:bg-blue-950/30  dark:text-blue-300",
  confirmed: "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300",
  rejected:  "bg-red-100   text-red-700   dark:bg-red-950/30   dark:text-red-300",
  unmatched: "bg-slate-100 text-slate-500 dark:bg-slate-800    dark:text-slate-400",
};

function StatusBadge({ status, t }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status] || STATUS_STYLES.unmatched}`}>
      {t(`plAdvanced.rentMatch.status.${status}`)}
    </span>
  );
}

// ── Confirmed Finance CTA — shown after a match is confirmed ──────────────────

function ConfirmedCta({ candidate, t, onDone }) {
  const diff = candidate.candidate_amount != null
    ? (Number(candidate.candidate_amount) - Number(candidate.expected_amount)).toFixed(2)
    : null;

  // Build Finance link with prefill params in URL state (Finance reads useSearchParams).
  // We pass via search params since Finance already uses useSearchParams.
  const financeParams = new URLSearchParams();
  if (candidate.expected_amount)    financeParams.set("amount",       String(candidate.expected_amount));
  if (candidate.expected_currency)  financeParams.set("currency",     candidate.expected_currency);
  if (candidate.expected_period_start) financeParams.set("from",      candidate.expected_period_start);
  if (candidate.expected_period_end)   financeParams.set("to",        candidate.expected_period_end);
  if (candidate.candidate_reference)   financeParams.set("reference", candidate.candidate_reference);
  const financeLink = `/finance?${financeParams.toString()}`;

  return (
    <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <CheckCircle2 size={15} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
        <p className="text-sm font-medium text-green-700 dark:text-green-300">
          {t("plAdvanced.rentMatch.confirmedNotice")}
        </p>
      </div>

      {/* Match summary */}
      <div className="rounded-lg bg-white dark:bg-slate-900 border border-green-100 dark:border-green-900/30 px-3 py-2 space-y-1">
        <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 gap-2">
          <span>{t("plAdvanced.rentMatch.expected")}:</span>
          <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
            {candidate.expected_currency} {Number(candidate.expected_amount).toFixed(2)}
          </span>
        </div>
        {candidate.candidate_amount && (
          <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 gap-2">
            <span>{t("plAdvanced.rentMatch.received")}:</span>
            <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
              {candidate.expected_currency} {Number(candidate.candidate_amount).toFixed(2)}
            </span>
          </div>
        )}
        {diff !== null && Number(diff) !== 0 && (
          <div className="flex justify-between text-xs gap-2">
            <span className="text-slate-500">{t("plAdvanced.rentMatch.difference")}:</span>
            <span className={`font-mono font-medium ${Number(diff) < 0 ? "text-red-600" : "text-green-600"}`}>
              {Number(diff) > 0 ? "+" : ""}{diff}
            </span>
          </div>
        )}
        {candidate.expected_period_start && (
          <div className="flex justify-between text-xs text-slate-500 gap-2">
            <span>{t("plAdvanced.rentMatch.period")}:</span>
            <span>{candidate.expected_period_start} → {candidate.expected_period_end}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Link
          to={financeLink}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          {t("plAdvanced.rentMatch.goToFinance")} <ArrowRight size={11} />
        </Link>
        <button
          type="button"
          onClick={onDone}
          className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"
        >
          {t("plAdvanced.rentMatch.done")}
        </button>
      </div>
    </div>
  );
}

// ── Candidate card ────────────────────────────────────────────────────────────

function CandidateCard({ candidate, accountId, onRefresh, t }) {
  const [actioning, setActioning]   = useState(false);
  const [showCta, setShowCta]       = useState(false);
  const [auditOpen, setAuditOpen]   = useState(false);
  const [audit, setAudit]           = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError]           = useState(null);

  const allowed    = allowedMatchTransitions(candidate.match_status);
  const isConfirmed = candidate.match_status === "confirmed";

  const amountMatch = candidate.candidate_amount
    ? Math.abs(candidate.expected_amount - candidate.candidate_amount) / candidate.expected_amount <= 0.01
    : null;

  async function performAction(newStatus) {
    setActioning(true);
    setError(null);
    try {
      await updateRentMatchStatus({ accountId, matchId: candidate.id, newStatus });
      if (newStatus === "confirmed") setShowCta(true);
      onRefresh();
    } catch {
      setError(t("plAdvanced.rentMatch.actionError"));
    } finally {
      setActioning(false);
    }
  }

  async function loadAudit() {
    setAuditLoading(true);
    try {
      const rows = await listRentMatchAudit({ accountId, matchId: candidate.id });
      setAudit(rows);
    } catch {
      // silently fail
    } finally {
      setAuditLoading(false);
    }
  }

  function toggleAudit() {
    if (!auditOpen && audit.length === 0) loadAudit();
    setAuditOpen((v) => !v);
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t("plAdvanced.rentMatch.expected")}: {candidate.expected_currency} {Number(candidate.expected_amount).toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {candidate.expected_period_start} → {candidate.expected_period_end}
          </p>
        </div>
        <StatusBadge status={candidate.match_status} t={t} />
      </div>

      {/* Candidate amounts */}
      {candidate.candidate_amount && (
        <div className="rounded-lg bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 p-3 space-y-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("plAdvanced.rentMatch.received")}: {candidate.expected_currency} {Number(candidate.candidate_amount).toFixed(2)}
              {amountMatch !== null && (
                amountMatch
                  ? <CheckCircle2 size={13} className="inline ml-1.5 text-green-500" />
                  : <AlertTriangle size={13} className="inline ml-1.5 text-amber-500" />
              )}
            </p>
            {candidate.confidence_score != null && (
              <ConfidenceBadge score={Number(candidate.confidence_score)} t={t} />
            )}
          </div>
          {candidate.candidate_reference && (
            <p className="text-xs text-slate-500">{t("plAdvanced.rentMatch.reference")}: {candidate.candidate_reference}</p>
          )}
          {candidate.confidence_reason && (
            <p className="text-xs text-slate-500 italic">{candidate.confidence_reason}</p>
          )}
        </div>
      )}

      {/* Confirmed Finance CTA */}
      {isConfirmed && showCta && (
        <ConfirmedCta candidate={candidate} t={t} onDone={() => setShowCta(false)} />
      )}
      {isConfirmed && !showCta && (
        <button
          type="button"
          onClick={() => setShowCta(true)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          {t("plAdvanced.rentMatch.goToFinance")} <ArrowRight size={11} />
        </button>
      )}

      {/* Legal disclaimer — per-card only */}
      <div className="flex items-start gap-1.5">
        <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          {t("plAdvanced.rentMatch.disclaimer")}
        </p>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {/* Action buttons */}
      {allowed.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {allowed.includes("confirmed") && (
            <button
              type="button"
              disabled={actioning}
              onClick={() => performAction("confirmed")}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckCircle2 size={11} />
              {t("plAdvanced.rentMatch.confirmMatch")}
            </button>
          )}
          {allowed.includes("rejected") && (
            <button
              type="button"
              disabled={actioning}
              onClick={() => performAction("rejected")}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 disabled:opacity-50 flex items-center gap-1.5"
            >
              <X size={11} />
              {t("plAdvanced.rentMatch.rejectMatch")}
            </button>
          )}
          {allowed.includes("unmatched") && (
            <button
              type="button"
              disabled={actioning}
              onClick={() => performAction("unmatched")}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 disabled:opacity-50 flex items-center gap-1.5"
            >
              <MinusCircle size={11} />
              {t("plAdvanced.rentMatch.unmatch")}
            </button>
          )}
          {allowed.includes("suggested") && (
            <button
              type="button"
              disabled={actioning}
              onClick={() => performAction("suggested")}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 disabled:opacity-50"
            >
              {t("plAdvanced.rentMatch.reopen")}
            </button>
          )}
        </div>
      )}

      {/* Audit history toggle */}
      <button
        type="button"
        onClick={toggleAudit}
        className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        {auditOpen ? "▲" : "▼"} {t("plAdvanced.rentMatch.auditHistory")}
      </button>
      {auditOpen && (
        <div className="rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2 space-y-1">
          {auditLoading && <p className="text-xs text-slate-400">{t("common.loading")}</p>}
          {!auditLoading && audit.length === 0 && (
            <p className="text-xs text-slate-400">{t("plAdvanced.rentMatch.noAudit")}</p>
          )}
          {audit.map((a) => (
            <div key={a.id} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <span className="text-slate-400">{new Date(a.created_at).toLocaleDateString()}</span>
              <span className="font-medium">{a.action}</span>
              {a.previous_status && <span className="text-slate-400">{a.previous_status} → {a.new_status}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add match form ────────────────────────────────────────────────────────────

function AddMatchForm({ accountId, propertyId, tenantId, leaseId, onSaved, onCancel, t }) {
  const [expectedAmount,  setExpectedAmount]  = useState("");
  const [periodStart,     setPeriodStart]     = useState("");
  const [periodEnd,       setPeriodEnd]       = useState("");
  const [candidateAmount, setCandidateAmount] = useState("");
  const [reference,       setReference]       = useState("");
  const [receivedAt,      setReceivedAt]      = useState("");
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState(null);

  const liveScore = calcRentMatchConfidence({
    expectedAmount:      Number(expectedAmount) || 0,
    candidateAmount:     Number(candidateAmount) || 0,
    expectedPeriodStart: periodStart,
    expectedPeriodEnd:   periodEnd,
    candidateReceivedAt: receivedAt || null,
  });

  async function handleSave() {
    if (!expectedAmount || !periodStart || !periodEnd) {
      setError(t("plAdvanced.rentMatch.errorRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createRentMatchCandidate({
        accountId,
        propertyId,
        tenantId,
        leaseId,
        expectedAmount:      Number(expectedAmount),
        expectedPeriodStart: periodStart,
        expectedPeriodEnd:   periodEnd,
        candidateAmount:     candidateAmount ? Number(candidateAmount) : null,
        candidateReference:  reference || null,
        candidateReceivedAt: receivedAt ? new Date(receivedAt).toISOString() : null,
        confidenceScore:     candidateAmount ? liveScore : null,
        confidenceReason:    candidateAmount
          ? `${t("plAdvanced.rentMatch.autoScore")} ${Math.round(liveScore * 100)}%`
          : null,
      });
      onSaved();
    } catch {
      setError(t("plAdvanced.rentMatch.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-3">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {t("plAdvanced.rentMatch.addCandidate")}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            {t("plAdvanced.rentMatch.expectedAmount")} *
          </label>
          <input type="text" inputMode="decimal" value={expectedAmount} onChange={(e) => setExpectedAmount(e.target.value)}
            placeholder="2500.00"
            className="w-full text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            {t("plAdvanced.rentMatch.candidateAmount")}
          </label>
          <input type="text" inputMode="decimal" value={candidateAmount} onChange={(e) => setCandidateAmount(e.target.value)}
            placeholder="2500.00"
            className="w-full text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("plAdvanced.rentMatch.periodStart")} *</label>
          <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("plAdvanced.rentMatch.periodEnd")} *</label>
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("plAdvanced.rentMatch.reference")}</label>
          <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
            placeholder={t("plAdvanced.rentMatch.referencePlaceholder")}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("plAdvanced.rentMatch.receivedAt")}</label>
          <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {candidateAmount && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t("plAdvanced.rentMatch.liveScore")}: <ConfidenceBadge score={liveScore} t={t} />
        </p>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
          {t("common.cancel")}
        </button>
        <button type="button" disabled={saving} onClick={handleSave}
          className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? t("common.loading") : t("common.save")}
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function PlRentMatchPanel({ accountId, propertyId, tenantId, leaseId }) {
  const { t }                       = useI18n();
  const [candidates, setCandidates] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [error,      setError]      = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listRentMatchCandidates({ accountId, propertyId, tenantId });
      setCandidates(data);
    } catch {
      setError(t("plAdvanced.rentMatch.loadError"));
    } finally {
      setLoading(false);
    }
  }, [accountId, propertyId, tenantId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Feature preview badge */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
        <Sparkles size={13} className="text-blue-500 shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          {t("plAdvanced.rentMatch.featurePreview")}
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t("plAdvanced.rentMatch.title")}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t("plAdvanced.rentMatch.subtitle")}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
            aria-label={t("common.refresh")}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5"
            >
              <Plus size={12} /> {t("plAdvanced.rentMatch.addCandidate")}
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <AddMatchForm
          accountId={accountId}
          propertyId={propertyId}
          tenantId={tenantId}
          leaseId={leaseId}
          onSaved={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
          t={t}
        />
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

      {!loading && !error && candidates.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <Sparkles size={20} className="text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("plAdvanced.rentMatch.empty")}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t("plAdvanced.rentMatch.emptyBody")}
          </p>
        </div>
      )}

      {candidates.map((c) => (
        <CandidateCard key={c.id} candidate={c} accountId={accountId} onRefresh={load} t={t} />
      ))}
    </div>
  );
}
