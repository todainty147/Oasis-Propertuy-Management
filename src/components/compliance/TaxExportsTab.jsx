import { useEffect, useState } from "react";
import { Download, Plus, X } from "lucide-react";

import { useI18n } from "../../context/I18nContext";
import {
  listTaxExports,
  listTaxRecords,
  recordTaxExport,
  generateTaxRecordsCsv,
  downloadCsvBlob,
  periodLabelToDateRange,
} from "../../services/taxRecordsService";

const JURISDICTIONS = ["GB", "PL", "DE"];
const TAX_MODES = ["income_tax", "vat", "corporation_tax", "other"];
const EXPORT_TYPES = ["csv"];

const EMPTY_FORM = {
  countryCode: "GB",
  taxMode: "income_tax",
  periodLabel: String(new Date().getFullYear()),
  exportType: "csv",
};

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

const PAGE_SIZE = 50;

export default function TaxExportsTab({ accountId }) {
  const { t } = useI18n();

  const [exports, setExports] = useState([]);
  const [exportsLoading, setExportsLoading] = useState(true);
  const [exportsError, setExportsError] = useState("");
  const [exportOffset, setExportOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");

  async function loadExports(offset = 0, append = false) {
    if (!accountId) { setExports([]); setExportsLoading(false); return; }
    try {
      setExportsLoading(true);
      setExportsError("");
      const data = await listTaxExports(accountId, { limit: PAGE_SIZE, offset });
      setExports((prev) => append ? [...prev, ...data] : data);
      setHasMore(data.length === PAGE_SIZE);
      setExportOffset(offset + data.length);
    } catch (err) {
      setExportsError(err instanceof Error ? err.message : t("compliance.tax.exports.errors.loadFailed"));
    } finally {
      setExportsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accountId) { setExports([]); setExportsLoading(false); return; }
      try {
        setExportsLoading(true);
        setExportsError("");
        const data = await listTaxExports(accountId, { limit: PAGE_SIZE, offset: 0 });
        if (!cancelled) {
          setExports(data);
          setHasMore(data.length === PAGE_SIZE);
          setExportOffset(data.length);
        }
      } catch (err) {
        if (!cancelled) setExportsError(err instanceof Error ? err.message : t("compliance.tax.exports.errors.loadFailed"));
      } finally {
        if (!cancelled) setExportsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, t]);

  async function handleGenerate(e) {
    e.preventDefault();
    try {
      setFormBusy(true);
      setFormError("");

      const { from: recordDateFrom, to: recordDateTo } = periodLabelToDateRange(form.periodLabel);
      const records = await listTaxRecords(accountId, {
        countryCode: form.countryCode || null,
        recordDateFrom,
        recordDateTo,
      });

      const csv = generateTaxRecordsCsv(records);
      const filename = `tax-${form.taxMode}-${form.countryCode}-${form.periodLabel}-${new Date().toISOString().slice(0, 10)}.csv`;

      // Record audit trail BEFORE download so the row always exists even if the
      // download triggers an error (L-015).
      await recordTaxExport(accountId, {
        countryCode: form.countryCode,
        taxMode: form.taxMode,
        periodLabel: form.periodLabel,
        exportType: form.exportType,
        rowCount: records.length,
      });

      downloadCsvBlob(csv, filename);

      setShowForm(false);
      setForm(EMPTY_FORM);
      loadExports(0, false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("compliance.tax.exports.errors.generateFailed"));
    } finally {
      setFormBusy(false);
    }
  }

  return (
    <div className="space-y-5" data-testid="tax-exports-tab">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t("compliance.tax.exports.subtitle")}
        </p>
        <button
          type="button"
          onClick={() => { setShowForm(true); setFormError(""); }}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          <Plus size={15} />
          {t("compliance.tax.exports.create")}
        </button>
      </div>

      {exportsError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {exportsError}
        </div>
      )}

      {/* Generate export form */}
      {showForm && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/60 dark:bg-blue-950/30">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("compliance.tax.exports.form.heading")}
            </h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          </div>

          {formError && (
            <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
              {formError}
            </div>
          )}

          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t("compliance.tax.exports.form.country")}
                </label>
                <select
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
                  {t("compliance.tax.exports.form.mode")}
                </label>
                <select
                  value={form.taxMode}
                  onChange={(e) => setForm((f) => ({ ...f, taxMode: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {TAX_MODES.map((m) => (
                    <option key={m} value={m}>{t(`compliance.tax.exports.modes.${m}`)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t("compliance.tax.exports.form.period")}
                </label>
                <input
                  type="text"
                  required
                  value={form.periodLabel}
                  onChange={(e) => setForm((f) => ({ ...f, periodLabel: e.target.value }))}
                  placeholder={t("compliance.tax.exports.form.periodPlaceholder")}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("compliance.tax.exports.form.note")}
            </p>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={formBusy}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                data-testid="generate-export-button"
              >
                <Download size={15} />
                {formBusy ? t("common.processing") : t("compliance.tax.exports.form.generate")}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Export history */}
      {exportsLoading ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
      ) : exports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance.tax.exports.emptyState")}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block" data-testid="tax-exports-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  {[
                    "compliance.tax.exports.table.date",
                    "compliance.tax.exports.table.period",
                    "compliance.tax.exports.table.country",
                    "compliance.tax.exports.table.mode",
                    "compliance.tax.exports.table.type",
                    "compliance.tax.exports.table.rows",
                    "compliance.tax.exports.table.status",
                  ].map((key) => (
                    <th key={key} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {exports.map((ex) => (
                  <tr key={ex.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatDate(ex.generated_at || ex.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{ex.period_label || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{ex.country_code || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{ex.tax_mode || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{ex.export_type?.toUpperCase() || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {ex.metadata?.row_count != null ? ex.metadata.row_count : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {ex.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden" data-testid="tax-exports-cards">
            {exports.map((ex) => (
              <div key={ex.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{ex.period_label || "—"}</p>
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {ex.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {ex.country_code || "—"} · {ex.tax_mode || "—"} · {ex.export_type?.toUpperCase() || "—"}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{formatDate(ex.generated_at || ex.created_at)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => loadExports(exportOffset, true)}
            disabled={exportsLoading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            data-testid="exports-load-more"
          >
            {t("common.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
