import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Plus, X,
  CheckCircle2, RotateCcw, Trash2, ChevronDown,
} from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { useI18n } from "../../context/I18nContext";
import { useLatestLeaseAudit, useLeaseAuditFindings } from "../../hooks/useLeaseAudit";
import {
  createLeaseAudit,
  updateLeaseAuditStatus,
  createLeaseAuditFinding,
  dismissLeaseAuditFinding,
  restoreLeaseAuditFinding,
  deleteLeaseAuditFinding,
  listLatestAuditsByLease,
} from "../../services/leaseAuditService";
import { listLeases } from "../../services/leaseService";
import LeaseClauseRiskBadge from "../../components/compliance/LeaseClauseRiskBadge";
import LeaseRenewalStatusBadge from "../../components/compliance/LeaseRenewalStatusBadge";
import { useEffect } from "react";

// ── Constants ──────────────────────────────────────────────────────────────────

const RISK_LEVELS = ["low", "medium", "high", "critical"];
const FINDING_CATEGORIES = [
  "break_clause", "rent_review", "repair_obligation",
  "deposit", "assignment", "subletting", "insurance",
  "service_charges", "alterations", "dispute_resolution", "other",
];
const EMPTY_FINDING_FORM = {
  clauseRef: "", clauseText: "", riskLevel: "medium",
  category: "", explanation: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function daysLabel(days, t) {
  if (days == null) return "—";
  if (days < 0) return t("compliance.leases.daysEnded", { count: Math.abs(days) });
  if (days === 0) return t("compliance.leases.daysToday");
  return t("compliance.leases.daysUntil", { count: days });
}

// ── Audit status badge ────────────────────────────────────────────────────────

const AUDIT_STATUS_STYLES = {
  pending:    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  complete:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  failed:     "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  stale:      "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
};

function AuditStatusBadge({ status }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${AUDIT_STATUS_STYLES[status] ?? AUDIT_STATUS_STYLES.pending}`}>
      {t(`compliance.leases.auditStatus.${status}`)}
    </span>
  );
}

// ── Lease detail view ─────────────────────────────────────────────────────────

function LeaseDetailView({ lease, accountId, onBack }) {
  const { t } = useI18n();
  const { audit, loading: auditLoading, refetch: refetchAudit } = useLatestLeaseAudit(accountId, lease.id);
  const { findings, loading: findingsLoading, refetch: refetchFindings } = useLeaseAuditFindings(
    accountId,
    audit?.id ?? null,
  );

  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState("");

  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [findingForm, setFindingForm] = useState(EMPTY_FINDING_FORM);
  const [findingFormBusy, setFindingFormBusy] = useState(false);
  const [findingFormError, setFindingFormError] = useState("");

  const [showDismissed, setShowDismissed] = useState(false);

  const activeFindingCount = useMemo(
    () => findings.filter((f) => !f.dismissed).length,
    [findings],
  );
  const dismissedFindingCount = useMemo(
    () => findings.filter((f) => f.dismissed).length,
    [findings],
  );
  const visibleFindings = useMemo(
    () => showDismissed ? findings : findings.filter((f) => !f.dismissed),
    [findings, showDismissed],
  );

  async function handleStartAudit() {
    try {
      setStartBusy(true);
      setStartError("");
      await createLeaseAudit(accountId, lease.id);
      refetchAudit();
    } catch (err) {
      setStartError(err instanceof Error ? err.message : t("compliance.leases.errors.startFailed"));
    } finally {
      setStartBusy(false);
    }
  }

  async function handleMarkComplete() {
    if (!audit) return;
    try {
      setCompleteBusy(true);
      setCompleteError("");
      await updateLeaseAuditStatus(audit.id, accountId, "complete");
      refetchAudit();
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : t("compliance.leases.errors.completeFailed"));
    } finally {
      setCompleteBusy(false);
    }
  }

  async function handleAddFinding(e) {
    e.preventDefault();
    if (!audit) return;
    try {
      setFindingFormBusy(true);
      setFindingFormError("");
      await createLeaseAuditFinding(accountId, audit.id, {
        clauseRef: findingForm.clauseRef,
        clauseText: findingForm.clauseText,
        riskLevel: findingForm.riskLevel,
        category: findingForm.category || null,
        explanation: findingForm.explanation,
      });
      setFindingForm(EMPTY_FINDING_FORM);
      setShowAddForm(false);
      refetchFindings();
    } catch (err) {
      setFindingFormError(err instanceof Error ? err.message : t("compliance.leases.errors.findingFailed"));
    } finally {
      setFindingFormBusy(false);
    }
  }

  async function handleDismiss(id) {
    await dismissLeaseAuditFinding(id, accountId);
    refetchFindings();
  }

  async function handleRestore(id) {
    await restoreLeaseAuditFinding(id, accountId);
    refetchFindings();
  }

  async function handleDelete(id) {
    await deleteLeaseAuditFinding(id, accountId);
    refetchFindings();
  }

  const highestRisk = useMemo(() => {
    const order = ["critical", "high", "medium", "low"];
    for (const r of order) {
      if (findings.filter((f) => !f.dismissed).some((f) => f.risk_level === r)) return r;
    }
    return null;
  }, [findings]);

  return (
    <div className="space-y-5" data-testid="lease-detail-view">
      {/* Back */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      >
        <ArrowLeft size={15} />
        {t("compliance.leases.backToList")}
      </button>

      {/* Lease summary card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {lease.propertyLabel}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {t("compliance.leases.tenant")}: {lease.tenantLabel}
            </p>
          </div>
          <LeaseRenewalStatusBadge status={lease.derivedStatus ?? lease.renewal_status} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("compliance.leases.leaseStart")}</p>
            <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{formatDate(lease.lease_start_date)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("compliance.leases.leaseEnd")}</p>
            <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{formatDate(lease.lease_end_date)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("compliance.leases.noticePeriod")}</p>
            <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
              {lease.notice_period_days != null ? `${lease.notice_period_days}d` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("compliance.leases.daysRemaining")}</p>
            <p className={`mt-0.5 font-medium ${
              (lease.daysUntilEnd ?? 1) < 0 ? "text-rose-600 dark:text-rose-400" :
              (lease.daysUntilEnd ?? 61) <= 60 ? "text-amber-600 dark:text-amber-400" :
              "text-slate-800 dark:text-slate-200"
            }`}>
              {daysLabel(lease.daysUntilEnd, t)}
            </p>
          </div>
        </div>
        {lease.notes && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{lease.notes}</p>
        )}
      </div>

      {/* AI extraction notice */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/30">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-xs text-blue-900 dark:text-blue-200">
          {t("compliance.leases.aiExtractionDeferred")}
        </p>
      </div>

      {/* Audit section */}
      {auditLoading ? (
        <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
      ) : !audit ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance.leases.noAudit")}</p>
          {startError && <p className="mt-2 text-xs text-rose-600">{startError}</p>}
          <button
            type="button"
            onClick={handleStartAudit}
            disabled={startBusy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            data-testid="start-audit-button"
          >
            <Plus size={14} />
            {startBusy ? t("common.processing") : t("compliance.leases.startAudit")}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Audit header */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <AuditStatusBadge status={audit.status} />
            {highestRisk && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                {t("compliance.leases.highestRisk")}:
                <LeaseClauseRiskBadge risk={highestRisk} />
              </div>
            )}
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {activeFindingCount} {t("compliance.leases.activeFindingsLabel")}
            </span>
            <div className="ml-auto flex gap-2">
              {audit.status !== "complete" && (
                <button
                  type="button"
                  onClick={handleMarkComplete}
                  disabled={completeBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  data-testid="mark-audit-complete-button"
                >
                  <CheckCircle2 size={13} />
                  {completeBusy ? t("common.saving") : t("compliance.leases.markComplete")}
                </button>
              )}
              <button
                type="button"
                onClick={() => { setShowAddForm(true); setFindingFormError(""); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                data-testid="add-finding-button"
              >
                <Plus size={13} />
                {t("compliance.leases.addFinding")}
              </button>
            </div>
          </div>

          {completeError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
              {completeError}
            </div>
          )}

          {audit.summary && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
              {audit.summary}
            </div>
          )}

          {/* Add finding form */}
          {showAddForm && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/60 dark:bg-blue-950/30">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t("compliance.leases.findingForm.heading")}
                </h3>
                <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>
              {findingFormError && (
                <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                  {findingFormError}
                </div>
              )}
              <form onSubmit={handleAddFinding} className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t("compliance.leases.findingForm.clauseRef")}
                    </label>
                    <input
                      type="text"
                      value={findingForm.clauseRef}
                      onChange={(e) => setFindingForm((f) => ({ ...f, clauseRef: e.target.value }))}
                      placeholder={t("compliance.leases.findingForm.clauseRefPlaceholder")}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t("compliance.leases.findingForm.riskLevel")} *
                    </label>
                    <select
                      required
                      value={findingForm.riskLevel}
                      onChange={(e) => setFindingForm((f) => ({ ...f, riskLevel: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {RISK_LEVELS.map((r) => (
                        <option key={r} value={r}>{t(`compliance.leases.risk.${r}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t("compliance.leases.findingForm.category")}
                    </label>
                    <select
                      value={findingForm.category}
                      onChange={(e) => setFindingForm((f) => ({ ...f, category: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">{t("compliance.leases.findingForm.categoryNone")}</option>
                      {FINDING_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{t(`compliance.leases.findingCategory.${c}`)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t("compliance.leases.findingForm.clauseText")}
                  </label>
                  <textarea
                    rows={2}
                    value={findingForm.clauseText}
                    onChange={(e) => setFindingForm((f) => ({ ...f, clauseText: e.target.value }))}
                    placeholder={t("compliance.leases.findingForm.clauseTextPlaceholder")}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t("compliance.leases.findingForm.explanation")}
                  </label>
                  <textarea
                    rows={2}
                    value={findingForm.explanation}
                    onChange={(e) => setFindingForm((f) => ({ ...f, explanation: e.target.value }))}
                    placeholder={t("compliance.leases.findingForm.explanationPlaceholder")}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={findingFormBusy}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
                    data-testid="save-finding-button">
                    {findingFormBusy ? t("common.saving") : t("compliance.leases.findingForm.save")}
                  </button>
                  <button type="button" onClick={() => setShowAddForm(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300">
                    {t("common.cancel")}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Findings list */}
          {findingsLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
          ) : findings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance.leases.noFindings")}</p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="findings-list">
              {visibleFindings.map((f) => (
                <div
                  key={f.id}
                  className={`rounded-xl border p-4 ${
                    f.dismissed
                      ? "border-slate-200 bg-slate-50 opacity-60 dark:border-slate-800 dark:bg-slate-900/50"
                      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                  }`}
                  data-testid={`finding-${f.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <LeaseClauseRiskBadge risk={f.risk_level} />
                        {f.clause_ref && (
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {f.clause_ref}
                          </span>
                        )}
                        {f.category && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {t(`compliance.leases.findingCategory.${f.category}`) || f.category}
                          </span>
                        )}
                        {f.dismissed && (
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {t("compliance.leases.dismissed")}
                          </span>
                        )}
                      </div>
                      {f.explanation && (
                        <p className="text-sm text-slate-700 dark:text-slate-300">{f.explanation}</p>
                      )}
                      {f.clause_text && (
                        <p className="text-xs text-slate-500 line-clamp-2 dark:text-slate-400">
                          "{f.clause_text}"
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {f.dismissed ? (
                        <button type="button" onClick={() => handleRestore(f.id)}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title={t("compliance.leases.restore")}
                          data-testid={`restore-finding-${f.id}`}>
                          <RotateCcw size={14} />
                        </button>
                      ) : (
                        <button type="button" onClick={() => handleDismiss(f.id)}
                          className="rounded p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
                          title={t("compliance.leases.dismiss")}
                          data-testid={`dismiss-finding-${f.id}`}>
                          <X size={14} />
                        </button>
                      )}
                      <button type="button" onClick={() => handleDelete(f.id)}
                        className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                        title={t("common.delete")}
                        data-testid={`delete-finding-${f.id}`}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {dismissedFindingCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDismissed((v) => !v)}
                  className="flex w-full items-center gap-1.5 px-1 py-2 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  data-testid="toggle-dismissed-findings"
                >
                  <ChevronDown size={13} className={showDismissed ? "rotate-180 transition-transform" : "transition-transform"} />
                  {showDismissed
                    ? t("compliance.leases.hideDismissed")
                    : t("compliance.leases.showDismissed", { count: dismissedFindingCount })}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Lease list view ───────────────────────────────────────────────────────────

function LeaseListView({ leases, leasesLoading, auditStatusByLease, onSelectLease, hasMore, onLoadMore, t }) {
  if (leasesLoading) return <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>;

  if (leases.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance.leases.noLeases")}</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block" data-testid="lease-list-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              {["compliance.leases.col.property", "compliance.leases.col.tenant",
                "compliance.leases.col.end", "compliance.leases.col.status",
                "compliance.leases.col.audit", ""].map((key, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {key ? t(key) : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {leases.map((lease) => {
              const auditStatus = auditStatusByLease.get(lease.id);
              return (
                <tr key={lease.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{lease.propertyLabel}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{lease.tenantLabel}</td>
                  <td className={`px-4 py-3 ${
                    (lease.daysUntilEnd ?? 61) < 0 ? "text-rose-600 dark:text-rose-400" :
                    (lease.daysUntilEnd ?? 61) <= 60 ? "text-amber-600 dark:text-amber-400" :
                    "text-slate-600 dark:text-slate-300"
                  }`}>
                    {formatDate(lease.lease_end_date)}
                  </td>
                  <td className="px-4 py-3">
                    <LeaseRenewalStatusBadge status={lease.derivedStatus ?? lease.renewal_status} />
                  </td>
                  <td className="px-4 py-3">
                    {auditStatus ? (
                      <AuditStatusBadge status={auditStatus} />
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">{t("compliance.leases.noAuditShort")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onSelectLease(lease)}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      data-testid={`open-lease-${lease.id}`}
                    >
                      {t("compliance.leases.openAudit")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden" data-testid="lease-list-cards">
        {leases.map((lease) => {
          const auditStatus = auditStatusByLease.get(lease.id);
          return (
            <button
              key={lease.id}
              type="button"
              onClick={() => onSelectLease(lease)}
              className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{lease.propertyLabel}</p>
                <LeaseRenewalStatusBadge status={lease.derivedStatus ?? lease.renewal_status} />
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{lease.tenantLabel}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{t("compliance.leases.leaseEnd")}: {formatDate(lease.lease_end_date)}</span>
                {auditStatus ? <AuditStatusBadge status={auditStatus} /> : null}
              </div>
            </button>
          );
        })}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={leasesLoading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            data-testid="leases-load-more"
          >
            {t("common.loadMore")}
          </button>
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LeaseAuditorPage() {
  const { activeAccountId } = useAccount();
  const { t } = useI18n();

  const LEASE_PAGE = 50;
  const [leases, setLeases] = useState([]);
  const [leasesLoading, setLeasesLoading] = useState(true);
  const [leasesOffset, setLeasesOffset] = useState(0);
  const [leasesHasMore, setLeasesHasMore] = useState(false);
  const [selectedLease, setSelectedLease] = useState(null);

  // Audit status index for list view: leaseId → status
  const [auditStatusByLease, setAuditStatusByLease] = useState(new Map());

  useEffect(() => {
    if (!activeAccountId) { setLeases([]); setLeasesLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        setLeasesLoading(true);
        const data = await listLeases({ accountId: activeAccountId, limit: LEASE_PAGE, offset: 0 });
        if (!cancelled) {
          setLeases(data);
          setLeasesHasMore(data.length === LEASE_PAGE);
          setLeasesOffset(data.length);
        }
      } finally {
        if (!cancelled) setLeasesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeAccountId]);

  async function loadMoreLeases() {
    if (!activeAccountId || leasesLoading) return;
    try {
      setLeasesLoading(true);
      const data = await listLeases({ accountId: activeAccountId, limit: LEASE_PAGE, offset: leasesOffset });
      setLeases((prev) => [...prev, ...data]);
      setLeasesHasMore(data.length === LEASE_PAGE);
      setLeasesOffset((prev) => prev + data.length);
    } finally {
      setLeasesLoading(false);
    }
  }

  // For the list view: load the latest audit per lease via DISTINCT ON RPC (L-030)
  useEffect(() => {
    if (!activeAccountId || selectedLease || leases.length === 0) return;
    (async () => {
      const rows = await listLatestAuditsByLease(activeAccountId);
      const map = new Map(rows.map((r) => [r.lease_id, r.status]));
      setAuditStatusByLease(map);
    })();
  }, [activeAccountId, leases, selectedLease]);

  return (
    <div className="space-y-6" data-testid="lease-auditor-page">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {t("compliance.leases.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t("compliance.leases.subtitle")}
        </p>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
          <p className="text-xs text-amber-900 dark:text-amber-200">
            {t("compliance.leases.disclaimer")}
          </p>
        </div>
      </div>

      {selectedLease ? (
        <LeaseDetailView
          lease={selectedLease}
          accountId={activeAccountId}
          onBack={() => setSelectedLease(null)}
        />
      ) : (
        <LeaseListView
          leases={leases}
          leasesLoading={leasesLoading}
          auditStatusByLease={auditStatusByLease}
          onSelectLease={setSelectedLease}
          hasMore={leasesHasMore}
          onLoadMore={loadMoreLeases}
          t={t}
        />
      )}
    </div>
  );
}
