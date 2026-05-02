import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  Plus,
  X,
  CheckCircle2,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { useI18n } from "../../context/I18nContext";
import { useTaxReadiness } from "../../hooks/useTaxReadiness";
import {
  createTaxItem,
  markTaxItemFiled,
  deleteTaxItem,
  deriveTaxStatus,
  exportTaxItemsAsCsv,
} from "../../services/taxReadinessService";
import TaxStatusBadge from "../../components/compliance/TaxStatusBadge";
import TaxRecordsTab from "../../components/compliance/TaxRecordsTab";
import TaxExportsTab from "../../components/compliance/TaxExportsTab";

// ── Constants ──────────────────────────────────────────────────────────────────

const JURISDICTIONS = ["GB", "PL", "DE"];
const RECURRENCE_OPTIONS = [
  { value: 0,  labelKey: "compliance.tax.form.recurrence.none" },
  { value: 3,  labelKey: "compliance.tax.form.recurrence.quarterly" },
  { value: 12, labelKey: "compliance.tax.form.recurrence.annual" },
];
const TABS = ["deadlines", "records", "exports"];
const EMPTY_FORM = {
  title: "",
  jurisdiction: "GB",
  taxFilingType: "",
  deadlineDate: "",
  recurrenceIntervalMonths: 0,
  notes: "",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function StatCard({ label, value, accent }) {
  return (
    <div className={`rounded-xl border p-4 ${accent}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

// ── Deadlines tab (inline — minimal extraction) ────────────────────────────────

function DeadlinesTab({ accountId }) {
  const { t } = useI18n();

  const [jurisdiction, setJurisdiction] = useState(null);
  const { items, loading, error, refetch } = useTaxReadiness(accountId, { jurisdiction });

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const [filedModal, setFiledModal] = useState(null);
  const [filedRef, setFiledRef] = useState("");
  const [filedBusy, setFiledBusy] = useState(false);
  const [filedError, setFiledError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(null);

  const itemsWithStatus = useMemo(
    () => items.map((item) => ({ ...item, _status: deriveTaxStatus(item) })),
    [items],
  );

  const stats = useMemo(() => ({
    total: itemsWithStatus.length,
    overdue: itemsWithStatus.filter((i) => i._status === "overdue").length,
    upcoming: itemsWithStatus.filter((i) => i._status === "upcoming").length,
    compliant: itemsWithStatus.filter((i) => i._status === "compliant").length,
  }), [itemsWithStatus]);

  function resetForm() { setForm(EMPTY_FORM); setFormError(""); setShowAddForm(false); }

  async function handleAddSubmit(e) {
    e.preventDefault();
    try {
      setFormBusy(true);
      setFormError("");
      await createTaxItem(accountId, {
        title: form.title,
        jurisdiction: form.jurisdiction,
        taxFilingType: form.taxFilingType,
        deadlineDate: form.deadlineDate,
        recurrenceIntervalMonths: Number(form.recurrenceIntervalMonths),
        notes: form.notes,
      });
      resetForm();
      refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("compliance.tax.errors.saveFailed"));
    } finally {
      setFormBusy(false);
    }
  }

  async function handleMarkFiled() {
    if (!filedModal) return;
    try {
      setFiledBusy(true);
      setFiledError("");
      await markTaxItemFiled(filedModal.id, accountId, { filingReference: filedRef });
      setFiledModal(null);
      setFiledRef("");
      refetch();
    } catch (err) {
      setFiledError(err instanceof Error ? err.message : t("compliance.tax.errors.markFiledFailed"));
    } finally {
      setFiledBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleteBusy(true);
      await deleteTaxItem(deleteTarget.id, accountId);
      setDeleteTarget(null);
      refetch();
    } finally {
      setDeleteBusy(false);
    }
  }

  const hasItems = itemsWithStatus.length > 0;

  return (
    <div className="space-y-5" data-testid="tax-deadlines-tab">
      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => exportTaxItemsAsCsv(itemsWithStatus)} disabled={!hasItems}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
          <Download size={15} />{t("compliance.tax.exportCsv")}
        </button>
        <button type="button" onClick={() => { setShowAddForm(true); setFormError(""); }}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
          <Plus size={15} />{t("compliance.tax.addDeadline")}
        </button>
      </div>

      {/* Jurisdiction tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        <button type="button" onClick={() => setJurisdiction(null)}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${jurisdiction === null ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
          {t("compliance.tax.jurisdiction.all")}
        </button>
        {JURISDICTIONS.map((j) => (
          <button key={j} type="button" onClick={() => setJurisdiction(j)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${jurisdiction === j ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
            {t(`compliance.tax.jurisdiction.${j.toLowerCase()}`)}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("compliance.tax.stats.total")} value={stats.total} accent="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        <StatCard label={t("compliance.tax.stats.overdue")} value={stats.overdue} accent="border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30" />
        <StatCard label={t("compliance.tax.stats.upcoming")} value={stats.upcoming} accent="border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30" />
        <StatCard label={t("compliance.tax.stats.compliant")} value={stats.compliant} accent="border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30" />
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">{error}</div> : null}

      {/* Add form */}
      {showAddForm && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/60 dark:bg-blue-950/30">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("compliance.tax.form.heading")}</h2>
            <button type="button" onClick={resetForm} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={18} /></button>
          </div>
          {formError && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">{formError}</div>}
          <form onSubmit={handleAddSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{t("compliance.tax.form.title")} *</label>
                <input type="text" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t("compliance.tax.form.titlePlaceholder")} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{t("compliance.tax.form.jurisdiction")} *</label>
                <select required value={form.jurisdiction} onChange={(e) => setForm((f) => ({ ...f, jurisdiction: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {JURISDICTIONS.map((j) => <option key={j} value={j}>{t(`compliance.tax.jurisdiction.${j.toLowerCase()}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{t("compliance.tax.form.filingType")}</label>
                <input type="text" value={form.taxFilingType} onChange={(e) => setForm((f) => ({ ...f, taxFilingType: e.target.value }))} placeholder={t("compliance.tax.form.filingTypePlaceholder")} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{t("compliance.tax.form.deadlineDate")} *</label>
                <input type="date" required value={form.deadlineDate} onChange={(e) => setForm((f) => ({ ...f, deadlineDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{t("compliance.tax.form.recurrence")}</label>
                <select value={form.recurrenceIntervalMonths} onChange={(e) => setForm((f) => ({ ...f, recurrenceIntervalMonths: Number(e.target.value) }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {RECURRENCE_OPTIONS.map(({ value, labelKey }) => <option key={value} value={value}>{t(labelKey)}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{t("compliance.tax.form.notes")}</label>
                <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={formBusy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
                {formBusy ? t("common.saving") : t("compliance.tax.form.save")}
              </button>
              <button type="button" onClick={resetForm} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300">
                {t("common.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
      ) : !hasItems ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t("compliance.tax.emptyState")}</p>
          <button type="button" onClick={() => setShowAddForm(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">
            <Plus size={14} />{t("compliance.tax.addDeadline")}
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block" data-testid="tax-items-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  {["compliance.tax.table.title","compliance.tax.table.jurisdiction","compliance.tax.table.filingType","compliance.tax.table.deadline","compliance.tax.table.status","compliance.tax.table.filedDate","compliance.tax.table.reference","compliance.tax.table.actions"].map((key) => (
                    <th key={key} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t(key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {itemsWithStatus.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{item.title}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.jurisdiction || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.tax_filing_type || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(item.deadline_date || item.due_date)}</td>
                    <td className="px-4 py-3"><TaxStatusBadge status={item._status} /></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.filed_at ? formatDate(item.filed_at) : "—"}</td>
                    <td className="max-w-[140px] truncate px-4 py-3 text-slate-600 dark:text-slate-300">{item.filing_reference || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {item._status !== "compliant" && (
                          <button type="button" onClick={() => { setFiledModal(item); setFiledRef(""); setFiledError(""); }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                            data-testid={`mark-filed-${item.id}`}>
                            <CheckCircle2 size={12} />{t("compliance.tax.markFiled")}
                          </button>
                        )}
                        <button type="button" onClick={() => setDeleteTarget(item)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          data-testid={`delete-tax-item-${item.id}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden" data-testid="tax-items-cards">
            {itemsWithStatus.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.jurisdiction || "—"} · {item.tax_filing_type || t("compliance.tax.table.noType")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <TaxStatusBadge status={item._status} />
                    <div className="relative">
                      <button type="button" onClick={() => setActionMenuOpen(actionMenuOpen === item.id ? null : item.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <MoreHorizontal size={16} />
                      </button>
                      {actionMenuOpen === item.id && (
                        <div className="absolute right-0 top-8 z-10 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                          {item._status !== "compliant" && (
                            <button type="button" onClick={() => { setFiledModal(item); setFiledRef(""); setFiledError(""); setActionMenuOpen(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                              <CheckCircle2 size={14} />{t("compliance.tax.markFiled")}
                            </button>
                          )}
                          <button type="button" onClick={() => { setDeleteTarget(item); setActionMenuOpen(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                            <Trash2 size={14} />{t("common.delete")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>{t("compliance.tax.table.deadline")}: {formatDate(item.deadline_date || item.due_date)}</span>
                  {item.filed_at && <span>{t("compliance.tax.table.filedDate")}: {formatDate(item.filed_at)}</span>}
                  {item.filing_reference && <span className="col-span-2 truncate">{t("compliance.tax.table.reference")}: {item.filing_reference}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Mark as Filed modal */}
      {filedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("compliance.tax.filedModal.title")}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{filedModal.title}</p>
            {filedError && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">{filedError}</div>}
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{t("compliance.tax.filedModal.reference")}</label>
              <input type="text" value={filedRef} onChange={(e) => setFiledRef(e.target.value)} placeholder={t("compliance.tax.filedModal.referencePlaceholder")} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" data-testid="filed-reference-input" />
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={handleMarkFiled} disabled={filedBusy} className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60" data-testid="confirm-mark-filed">
                {filedBusy ? t("common.saving") : t("compliance.tax.filedModal.confirm")}
              </button>
              <button type="button" onClick={() => setFiledModal(null)} disabled={filedBusy} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300">{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("compliance.tax.deleteModal.title")}</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t("compliance.tax.deleteModal.body", { title: deleteTarget.title })}</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={handleDelete} disabled={deleteBusy} className="flex-1 rounded-xl bg-rose-600 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60" data-testid="confirm-delete-tax-item">
                {deleteBusy ? t("common.processing") : t("common.delete")}
              </button>
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleteBusy} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300">{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page shell ─────────────────────────────────────────────────────────────────

export default function TaxReadinessPage() {
  const { activeAccountId } = useAccount();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("deadlines");

  return (
    <div className="space-y-6" data-testid="tax-readiness-page">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {t("compliance.tax.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t("compliance.tax.subtitle")}
        </p>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
          <p className="text-xs text-amber-900 dark:text-amber-200">{t("compliance.tax.disclaimer")}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
            data-testid={`tab-${tab}`}
          >
            {t(`compliance.tax.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "deadlines" && <DeadlinesTab accountId={activeAccountId} />}
      {activeTab === "records"   && <TaxRecordsTab accountId={activeAccountId} />}
      {activeTab === "exports"   && <TaxExportsTab accountId={activeAccountId} />}
    </div>
  );
}
