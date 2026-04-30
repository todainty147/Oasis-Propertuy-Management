import { useMemo, useState } from "react";
import { Plus, X, Trash2, CheckCircle2, XCircle, MoreHorizontal } from "lucide-react";

import { useI18n } from "../../context/I18nContext";
import { useTaxRecords } from "../../hooks/useTaxRecords";
import {
  createTaxRecord,
  updateTaxRecordReviewStatus,
  deleteTaxRecord,
  summariseTaxRecords,
} from "../../services/taxRecordsService";
import TaxRecordTypeBadge from "./TaxRecordTypeBadge";
import TaxTreatmentBadge from "./TaxTreatmentBadge";

const JURISDICTIONS = ["GB", "PL", "DE"];
const RECORD_TYPES = ["income", "expense", "adjustment", "evidence"];
const TREATMENTS = [
  "review_required",
  "likely_allowable",
  "likely_disallowable",
  "capital_candidate",
  "evidence_only",
];

const EMPTY_FORM = {
  recordType: "expense",
  countryCode: "GB",
  amount: "",
  currency: "GBP",
  taxCategoryCode: "",
  taxTreatment: "review_required",
  recordDate: "",
  description: "",
  evidenceStatus: "missing",
};

function formatAmount(amount, currency) {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "GBP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || "GBP"} ${Number(amount).toFixed(2)}`;
  }
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function SummaryCard({ label, value, accent }) {
  return (
    <div className={`rounded-xl border p-4 ${accent}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

export default function TaxRecordsTab({ accountId }) {
  const { t } = useI18n();

  const [countryCode, setCountryCode] = useState(null);
  const [recordTypeFilter, setRecordTypeFilter] = useState(null);
  const [reviewStatusFilter, setReviewStatusFilter] = useState(null);
  const { records, loading, error, hasMore, refetch, loadMore } = useTaxRecords(accountId, {
    countryCode,
    recordType: recordTypeFilter,
    reviewStatus: reviewStatusFilter,
  });

  const summary = useMemo(() => summariseTaxRecords(records), [records]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const [actionMenuOpen, setActionMenuOpen] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function resetForm() {
    setForm(EMPTY_FORM);
    setFormError("");
    setShowAddForm(false);
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    try {
      setFormBusy(true);
      setFormError("");
      await createTaxRecord(accountId, {
        recordType: form.recordType,
        countryCode: form.countryCode,
        amount: form.amount !== "" ? form.amount : null,
        currency: form.currency,
        taxCategoryCode: form.taxCategoryCode,
        taxTreatment: form.taxTreatment,
        recordDate: form.recordDate,
        description: form.description,
        evidenceStatus: form.evidenceStatus,
      });
      resetForm();
      refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("compliance.tax.records.errors.saveFailed"));
    } finally {
      setFormBusy(false);
    }
  }

  async function handleReviewStatus(id, status) {
    try {
      await updateTaxRecordReviewStatus(id, accountId, status);
      refetch();
    } catch {
      // silently refetch — UI state will reconcile
      refetch();
    }
    setActionMenuOpen(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleteBusy(true);
      await deleteTaxRecord(deleteTarget.id, accountId);
      setDeleteTarget(null);
      refetch();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-5" data-testid="tax-records-tab">
      {/* Filters + Add button */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={countryCode ?? ""}
          onChange={(e) => setCountryCode(e.target.value || null)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">{t("compliance.tax.jurisdiction.all")}</option>
          {JURISDICTIONS.map((j) => (
            <option key={j} value={j}>{t(`compliance.tax.jurisdiction.${j.toLowerCase()}`)}</option>
          ))}
        </select>

        <select
          value={recordTypeFilter ?? ""}
          onChange={(e) => setRecordTypeFilter(e.target.value || null)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">{t("compliance.tax.records.filter.allTypes")}</option>
          {RECORD_TYPES.map((rt) => (
            <option key={rt} value={rt}>{t(`compliance.tax.records.type.${rt}`)}</option>
          ))}
        </select>

        <select
          value={reviewStatusFilter ?? ""}
          onChange={(e) => setReviewStatusFilter(e.target.value || null)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          data-testid="review-status-filter"
        >
          <option value="">{t("compliance.tax.records.filter.allStatuses")}</option>
          <option value="unreviewed">{t("compliance.tax.records.status.unreviewed")}</option>
          <option value="reviewed">{t("compliance.tax.records.status.reviewed")}</option>
          <option value="excluded">{t("compliance.tax.records.status.excluded")}</option>
        </select>

        <button
          type="button"
          onClick={() => { setShowAddForm(true); setFormError(""); }}
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          <Plus size={15} />
          {t("compliance.tax.records.addRecord")}
        </button>
      </div>

      {/* Summary cards */}
      {summary.hasMultipleCurrencies ? (
        <div className="space-y-3" data-testid="currency-breakdown">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            {t("compliance.tax.records.stats.multipleCurrencies")}
          </div>
          <div className="grid gap-2">
            {summary.currencies.map((cur) => (
              <div key={cur} className="grid grid-cols-3 gap-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300 self-center">{cur}</span>
                <SummaryCard
                  label={t("compliance.tax.records.stats.income")}
                  value={formatAmount(summary.byCurrency[cur].income, cur)}
                  accent="border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30"
                />
                <SummaryCard
                  label={t("compliance.tax.records.stats.expenses")}
                  value={formatAmount(summary.byCurrency[cur].expenses, cur)}
                  accent="border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30"
                />
              </div>
            ))}
          </div>
          <SummaryCard
            label={t("compliance.tax.records.stats.needsReview")}
            value={summary.needsReview}
            accent={summary.needsReview > 0
              ? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"
              : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <SummaryCard
            label={t("compliance.tax.records.stats.income")}
            value={formatAmount(summary.totalIncome, summary.currencies[0] || "GBP")}
            accent="border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30"
          />
          <SummaryCard
            label={t("compliance.tax.records.stats.expenses")}
            value={formatAmount(summary.totalExpenses, summary.currencies[0] || "GBP")}
            accent="border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30"
          />
          <SummaryCard
            label={t("compliance.tax.records.stats.needsReview")}
            value={summary.needsReview}
            accent={summary.needsReview > 0
              ? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30"
              : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}
          />
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {/* Add record form */}
      {showAddForm && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/60 dark:bg-blue-950/30">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("compliance.tax.records.form.heading")}
            </h3>
            <button type="button" onClick={resetForm} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X size={18} />
            </button>
          </div>

          {formError && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
              {formError}
            </div>
          )}

          <form onSubmit={handleAddSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t("compliance.tax.records.form.type")} *
                </label>
                <select
                  required
                  value={form.recordType}
                  onChange={(e) => setForm((f) => ({ ...f, recordType: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {RECORD_TYPES.map((rt) => (
                    <option key={rt} value={rt}>{t(`compliance.tax.records.type.${rt}`)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t("compliance.tax.records.form.date")} *
                </label>
                <input
                  type="date"
                  required
                  value={form.recordDate}
                  onChange={(e) => setForm((f) => ({ ...f, recordDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t("compliance.tax.records.form.country")} *
                </label>
                <select
                  required
                  value={form.countryCode}
                  onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {JURISDICTIONS.map((j) => (
                    <option key={j} value={j}>{t(`compliance.tax.jurisdiction.${j.toLowerCase()}`)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t("compliance.tax.records.form.amount")}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {["GBP", "PLN", "EUR"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t("compliance.tax.records.form.category")}
                </label>
                <input
                  type="text"
                  value={form.taxCategoryCode}
                  onChange={(e) => setForm((f) => ({ ...f, taxCategoryCode: e.target.value }))}
                  placeholder={t("compliance.tax.records.form.categoryPlaceholder")}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t("compliance.tax.records.form.treatment")}
                </label>
                <select
                  value={form.taxTreatment}
                  onChange={(e) => setForm((f) => ({ ...f, taxTreatment: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {TREATMENTS.map((tr) => (
                    <option key={tr} value={tr}>{t(`compliance.tax.records.treatment.${tr}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {t("compliance.tax.records.form.description")}
              </label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={formBusy}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {formBusy ? t("common.saving") : t("compliance.tax.records.form.save")}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
      ) : records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance.tax.records.emptyState")}</p>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
          >
            <Plus size={14} />
            {t("compliance.tax.records.addRecord")}
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block" data-testid="tax-records-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  {[
                    "compliance.tax.records.table.date",
                    "compliance.tax.records.table.type",
                    "compliance.tax.records.table.amount",
                    "compliance.tax.records.table.country",
                    "compliance.tax.records.table.treatment",
                    "compliance.tax.records.table.review",
                    "compliance.tax.records.table.description",
                    "compliance.tax.records.table.actions",
                  ].map((key) => (
                    <th key={key} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(r.record_date)}</td>
                    <td className="px-4 py-3"><TaxRecordTypeBadge type={r.record_type} /></td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {formatAmount(r.amount, r.currency)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.country_code || "—"}</td>
                    <td className="px-4 py-3"><TaxTreatmentBadge treatment={r.tax_treatment} /></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${
                        r.review_status === "reviewed" ? "text-emerald-600 dark:text-emerald-400" :
                        r.review_status === "excluded" ? "text-slate-400 dark:text-slate-500" :
                        "text-amber-600 dark:text-amber-400"
                      }`}>
                        {t(`compliance.tax.records.review.${r.review_status}`)}
                      </span>
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-slate-500 dark:text-slate-400">
                      {r.description || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {r.review_status === "unreviewed" && (
                          <button
                            type="button"
                            onClick={() => handleReviewStatus(r.id, "reviewed")}
                            className="rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            title={t("compliance.tax.records.markReviewed")}
                            data-testid={`mark-reviewed-${r.id}`}
                          >
                            <CheckCircle2 size={15} />
                          </button>
                        )}
                        {r.review_status !== "excluded" && (
                          <button
                            type="button"
                            onClick={() => handleReviewStatus(r.id, "excluded")}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title={t("compliance.tax.records.exclude")}
                            data-testid={`exclude-record-${r.id}`}
                          >
                            <XCircle size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          data-testid={`delete-tax-record-${r.id}`}
                        >
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
          <div className="space-y-3 md:hidden" data-testid="tax-records-cards">
            {records.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <TaxRecordTypeBadge type={r.record_type} />
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatAmount(r.amount, r.currency)}
                      </span>
                    </div>
                    {r.description && (
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.description}</p>
                    )}
                  </div>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setActionMenuOpen(actionMenuOpen === r.id ? null : r.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {actionMenuOpen === r.id && (
                      <div className="absolute right-0 top-8 z-10 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        {r.review_status === "unreviewed" && (
                          <button type="button" onClick={() => handleReviewStatus(r.id, "reviewed")}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40">
                            <CheckCircle2 size={14} />{t("compliance.tax.records.markReviewed")}
                          </button>
                        )}
                        {r.review_status !== "excluded" && (
                          <button type="button" onClick={() => handleReviewStatus(r.id, "excluded")}
                            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
                            <XCircle size={14} />{t("compliance.tax.records.exclude")}
                          </button>
                        )}
                        <button type="button" onClick={() => { setDeleteTarget(r); setActionMenuOpen(null); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                          <Trash2 size={14} />{t("common.delete")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>{formatDate(r.record_date)}</span>
                  <span>{r.country_code || "—"}</span>
                  <TaxTreatmentBadge treatment={r.tax_treatment} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("compliance.tax.records.deleteModal.title")}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t("compliance.tax.records.deleteModal.body")}
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={handleDelete} disabled={deleteBusy}
                className="flex-1 rounded-xl bg-rose-600 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
                data-testid="confirm-delete-tax-record">
                {deleteBusy ? t("common.processing") : t("common.delete")}
              </button>
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300">
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            data-testid="records-load-more"
          >
            {t("common.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
