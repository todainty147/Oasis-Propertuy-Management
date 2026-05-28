import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
  Receipt,
  ShieldCheck,
} from "lucide-react";

import { useAccount } from "../../context/AccountContext";
import { ENTITLEMENT_FEATURES } from "../../lib/entitlements";
import {
  TAX_CATEGORIES,
  TAX_CATEGORY_LABELS,
  TAX_TOOL_ADVICE_NOTICE,
  TAX_TOOL_NO_HMRC_NOTICE,
  TAX_YEAR_OPTIONS,
  DEFAULT_TAX_YEAR,
  calculateCarriedForwardFinanceCost,
  calculateMtdReadiness,
  calculateSection24Comparison,
  formatCurrency,
} from "../../utils/taxTools";
import {
  createTaxExpenseClassification,
  downloadTaxToolsCsv,
  generateTaxCarriedForwardCsv,
  generateTaxExpenseClassificationsCsv,
  generateTaxFinanceCostSummariesCsv,
  listTaxCarriedForwardFinanceCosts,
  listTaxExpenseClassifications,
  listTaxFinanceCostSummaries,
  upsertTaxCarriedForwardFinanceCost,
  upsertTaxFinanceCostSummary,
} from "../../services/taxToolsService";

const TABS = [
  { id: "expenses", label: "MTD Expense Tracker", feature: ENTITLEMENT_FEATURES.MTD_EXPENSE_TRACKER, icon: Receipt },
  { id: "section24", label: "Section 24 Finance Cost Tracker", feature: ENTITLEMENT_FEATURES.SECTION24_FINANCE_COST_TRACKER, icon: Calculator },
  { id: "carried", label: "Carried-Forward Finance Costs", feature: ENTITLEMENT_FEATURES.CARRIED_FORWARD_FINANCE_COST_TRACKER, icon: FileSpreadsheet },
  { id: "readiness", label: "Digital Record Readiness", feature: ENTITLEMENT_FEATURES.TAX_TOOLS_IN_APP, icon: ShieldCheck },
  { id: "export", label: "Export / Accountant Pack", feature: ENTITLEMENT_FEATURES.TAX_TOOLS_IN_APP, icon: Download },
];

const EMPTY_EXPENSE = {
  taxYear: DEFAULT_TAX_YEAR,
  expenseDate: new Date().toISOString().slice(0, 10),
  amount: "",
  description: "",
  category: "needs_review",
  propertyId: "",
  mtdReady: false,
  notes: "",
};

const EMPTY_FINANCE = {
  taxYear: DEFAULT_TAX_YEAR,
  propertyId: "",
  employmentIncome: "",
  rentalIncome: "",
  nonFinanceExpenses: "",
  financeCosts: "",
};

const EMPTY_CARRIED = {
  taxYear: DEFAULT_TAX_YEAR,
  propertyId: "",
  broughtForwardAmount: "",
  financeCostsThisYear: "",
  usedAmount: "",
  notes: "",
};

const EMPTY_READINESS = {
  propertyIncome: "",
  selfEmploymentIncome: "",
  usesSpreadsheets: true,
  keepsReceiptsDigitally: false,
  tracksExpensesByProperty: false,
  usesAccountant: false,
  ownsMoreThanOneProperty: false,
};

function Panel({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
}

function PropertySelect({ properties, value, onChange }) {
  return (
    <select value={value || ""} onChange={(event) => onChange(event.target.value)} className={inputClass()}>
      <option value="">Account-level / no property</option>
      {properties.map((property) => (
        <option key={property.id} value={property.id}>
          {property.address || property.name || property.id}
        </option>
      ))}
    </select>
  );
}

function LockedTabNotice() {
  return (
    <Panel>
      <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
        <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={18} />
        <p>This subsection is behind a feature flag for staging validation.</p>
      </div>
    </Panel>
  );
}

function ExpenseTracker({ accountId, properties, expenses, onSaved }) {
  const [form, setForm] = useState(EMPTY_EXPENSE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const totalsByCategory = useMemo(() => {
    return expenses.reduce((acc, row) => {
      acc[row.category] = (acc[row.category] || 0) + Number(row.amount || 0);
      return acc;
    }, {});
  }, [expenses]);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      await createTaxExpenseClassification(accountId, form);
      setForm(EMPTY_EXPENSE);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save expense classification.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Panel>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Manual expense logging</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{TAX_TOOL_ADVICE_NOTICE}</p>
          </div>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-200">No HMRC submission</span>
        </div>
        {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3">
          <Field label="Expense date">
            <input type="date" required value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} className={inputClass()} />
          </Field>
          <Field label="Tax year">
            <select value={form.taxYear} onChange={(e) => setForm((f) => ({ ...f, taxYear: e.target.value }))} className={inputClass()}>
              {TAX_YEAR_OPTIONS.map((year) => <option key={year}>{year}</option>)}
            </select>
          </Field>
          <Field label="Property">
            <PropertySelect properties={properties} value={form.propertyId} onChange={(propertyId) => setForm((f) => ({ ...f, propertyId }))} />
          </Field>
          <Field label="Amount">
            <input type="number" min="0" step="0.01" required value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={inputClass()} />
          </Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={inputClass()}>
              {TAX_CATEGORIES.map((category) => <option key={category} value={category}>{TAX_CATEGORY_LABELS[category]}</option>)}
            </select>
          </Field>
          <Field label="MTD-ready">
            <select value={form.mtdReady ? "yes" : "no"} onChange={(e) => setForm((f) => ({ ...f, mtdReady: e.target.value === "yes" }))} className={inputClass()}>
              <option value="no">Needs review</option>
              <option value="yes">Ready for accountant pack</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Description">
              <input required value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputClass()} />
            </Field>
          </div>
          <Field label="Notes">
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputClass()} />
          </Field>
          <div className="md:col-span-3">
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
              <Plus size={16} />{busy ? "Saving..." : "Save expense record"}
            </button>
          </div>
        </form>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Panel>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Totals by category</h3>
          <div className="mt-3 space-y-2">
            {Object.keys(totalsByCategory).length === 0 ? (
              <p className="text-sm text-slate-500">No expense records yet.</p>
            ) : Object.entries(totalsByCategory).map(([category, total]) => (
              <div key={category} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                <span>{TAX_CATEGORY_LABELS[category] || category}</span>
                <strong>{formatCurrency(total)}</strong>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent records</h3>
            <button type="button" disabled={!expenses.length} onClick={() => downloadTaxToolsCsv(generateTaxExpenseClassificationsCsv(expenses), "tax-expense-classifications.csv")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700">
              <Download size={14} /> CSV
            </button>
          </div>
          <div className="max-h-80 overflow-auto">
            {expenses.length === 0 ? (
              <p className="text-sm text-slate-500">Saved classifications will appear here.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr><th className="py-2">Date</th><th>Category</th><th>Amount</th><th>MTD</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {expenses.slice(0, 8).map((row) => (
                    <tr key={row.id}>
                      <td className="py-2">{row.expense_date}</td>
                      <td>{TAX_CATEGORY_LABELS[row.category] || row.category}</td>
                      <td>{formatCurrency(row.amount)}</td>
                      <td>{row.mtd_ready ? "Ready" : "Review"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Section24Tracker({ accountId, properties, financeRows, onSaved }) {
  const [form, setForm] = useState(EMPTY_FINANCE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const result = useMemo(() => calculateSection24Comparison(form), [form]);

  async function handleSave() {
    try {
      setBusy(true);
      setError("");
      await upsertTaxFinanceCostSummary(accountId, {
        ...form,
        taxablePropertyProfitBeforeFinance: result.currentRules.taxableRentalProfitBeforeFinanceCosts,
        estimatedBasicRateCredit: result.currentRules.basicRateFinanceCostCredit,
        estimatedUnusedFinanceCosts: 0,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save finance cost summary.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <Panel>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Section 24 finance cost tracker</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Section 24 is the common name landlords use for the residential finance cost restriction rules.</p>
        {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Tax year"><select value={form.taxYear} onChange={(e) => setForm((f) => ({ ...f, taxYear: e.target.value }))} className={inputClass()}>{TAX_YEAR_OPTIONS.map((year) => <option key={year}>{year}</option>)}</select></Field>
          <Field label="Property"><PropertySelect properties={properties} value={form.propertyId} onChange={(propertyId) => setForm((f) => ({ ...f, propertyId }))} /></Field>
          <Field label="Employment / other taxable income"><input type="number" min="0" value={form.employmentIncome} onChange={(e) => setForm((f) => ({ ...f, employmentIncome: e.target.value }))} className={inputClass()} /></Field>
          <Field label="Annual gross rental income"><input type="number" min="0" value={form.rentalIncome} onChange={(e) => setForm((f) => ({ ...f, rentalIncome: e.target.value }))} className={inputClass()} /></Field>
          <Field label="Non-finance property expenses"><input type="number" min="0" value={form.nonFinanceExpenses} onChange={(e) => setForm((f) => ({ ...f, nonFinanceExpenses: e.target.value }))} className={inputClass()} /></Field>
          <Field label="Finance costs / mortgage interest"><input type="number" min="0" value={form.financeCosts} onChange={(e) => setForm((f) => ({ ...f, financeCosts: e.target.value }))} className={inputClass()} /></Field>
        </div>
        <button type="button" onClick={handleSave} disabled={busy} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">
          {busy ? "Saving..." : "Save finance cost summary"}
        </button>
      </Panel>
      <Panel>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Simplified estimated position</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
            <p className="text-xs uppercase text-slate-500">Old-style view</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(result.oldRules.taxableRentalProfit)}</p>
            <p className="text-xs text-slate-500">Taxable rental profit after finance costs</p>
          </div>
          <div className="rounded-xl bg-teal-50 p-4 dark:bg-teal-950/30">
            <p className="text-xs uppercase text-slate-500">Current restriction view</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(result.currentRules.taxableRentalProfitBeforeFinanceCosts)}</p>
            <p className="text-xs text-slate-500">Finance costs not deducted from profit</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
          <strong>{result.difference.effectiveImpactMessage}</strong>
          <p className="mt-1">Basic-rate finance cost credit estimate: {formatCurrency(result.currentRules.basicRateFinanceCostCredit)}</p>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          {result.warnings.map((warning) => <li key={warning} className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />{warning}</li>)}
        </ul>
        <button type="button" disabled={!financeRows.length} onClick={() => downloadTaxToolsCsv(generateTaxFinanceCostSummariesCsv(financeRows), "section-24-finance-costs.csv")} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700">
          <Download size={14} /> Export saved summaries
        </button>
      </Panel>
    </div>
  );
}

function CarriedForwardTracker({ accountId, properties, carriedRows, onSaved }) {
  const [form, setForm] = useState(EMPTY_CARRIED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const result = useMemo(() => calculateCarriedForwardFinanceCost(form), [form]);

  async function handleSave(event) {
    event.preventDefault();
    try {
      setBusy(true);
      setError("");
      await upsertTaxCarriedForwardFinanceCost(accountId, { ...form, carriedForwardAmount: result.carriedForwardAmount });
      setForm(EMPTY_CARRIED);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save carried-forward record.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Panel>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Carried-forward finance costs</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{TAX_TOOL_ADVICE_NOTICE}</p>
        {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        <form onSubmit={handleSave} className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label="Tax year"><select value={form.taxYear} onChange={(e) => setForm((f) => ({ ...f, taxYear: e.target.value }))} className={inputClass()}>{TAX_YEAR_OPTIONS.map((year) => <option key={year}>{year}</option>)}</select></Field>
          <Field label="Property"><PropertySelect properties={properties} value={form.propertyId} onChange={(propertyId) => setForm((f) => ({ ...f, propertyId }))} /></Field>
          <Field label="Brought forward"><input type="number" min="0" value={form.broughtForwardAmount} onChange={(e) => setForm((f) => ({ ...f, broughtForwardAmount: e.target.value }))} className={inputClass()} /></Field>
          <Field label="Finance costs this year"><input type="number" min="0" value={form.financeCostsThisYear} onChange={(e) => setForm((f) => ({ ...f, financeCostsThisYear: e.target.value }))} className={inputClass()} /></Field>
          <Field label="Used this year"><input type="number" min="0" value={form.usedAmount} onChange={(e) => setForm((f) => ({ ...f, usedAmount: e.target.value }))} className={inputClass()} /></Field>
          <Field label="Calculated carried forward"><input readOnly value={formatCurrency(result.carriedForwardAmount)} className={`${inputClass()} bg-slate-50 dark:bg-slate-800`} /></Field>
          <div className="md:col-span-3"><Field label="Notes"><input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputClass()} /></Field></div>
          <div className="md:col-span-3">
            <button type="submit" disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900">{busy ? "Saving..." : "Save carried-forward row"}</button>
          </div>
        </form>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {carriedRows.length === 0 ? <Panel><p className="text-sm text-slate-500">No carried-forward records yet.</p></Panel> : carriedRows.map((row) => (
          <Panel key={row.id}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{row.tax_year}</h3>
              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Review with accountant</span>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt>Brought forward</dt><dd>{formatCurrency(row.brought_forward_amount)}</dd></div>
              <div className="flex justify-between"><dt>Used</dt><dd>{formatCurrency(row.used_amount)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Carried forward</dt><dd>{formatCurrency(row.carried_forward_amount)}</dd></div>
            </dl>
          </Panel>
        ))}
      </div>
      <button type="button" disabled={!carriedRows.length} onClick={() => downloadTaxToolsCsv(generateTaxCarriedForwardCsv(carriedRows), "carried-forward-finance-costs.csv")} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-slate-700">
        <Download size={14} /> Export carried-forward CSV
      </button>
    </div>
  );
}

function ReadinessCheck() {
  const [form, setForm] = useState(EMPTY_READINESS);
  const result = useMemo(() => calculateMtdReadiness(form), [form]);
  const toggle = (key) => setForm((f) => ({ ...f, [key]: !f[key] }));

  return (
    <Panel>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Digital record readiness</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Annual property income"><input type="number" min="0" value={form.propertyIncome} onChange={(e) => setForm((f) => ({ ...f, propertyIncome: e.target.value }))} className={inputClass()} /></Field>
        <Field label="Annual self-employment income"><input type="number" min="0" value={form.selfEmploymentIncome} onChange={(e) => setForm((f) => ({ ...f, selfEmploymentIncome: e.target.value }))} className={inputClass()} /></Field>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {[
          ["usesSpreadsheets", "Currently use spreadsheets"],
          ["keepsReceiptsDigitally", "Keep receipts digitally"],
          ["tracksExpensesByProperty", "Track expenses by property"],
          ["usesAccountant", "Use an accountant"],
          ["ownsMoreThanOneProperty", "Own more than one rental property"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
            <input type="checkbox" checked={Boolean(form[key])} onChange={() => toggle(key)} />
            {label}
          </label>
        ))}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="rounded-2xl bg-teal-50 p-5 text-center dark:bg-teal-950/30">
          <p className="text-4xl font-semibold text-teal-700 dark:text-teal-200">{result.score}%</p>
          <p className="text-sm text-teal-800 dark:text-teal-200">Readiness score</p>
        </div>
        <div>
          <p className="font-medium text-slate-900 dark:text-slate-100">{result.threshold.message}</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            {result.nextSteps.map((step) => <li key={step} className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-teal-500" />{step}</li>)}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function ExportPack({ expenses, financeRows, carriedRows }) {
  return (
    <Panel>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Export / Accountant Pack</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Export organisational records for accountant review. This is not HMRC submission software.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" disabled={!expenses.length} onClick={() => downloadTaxToolsCsv(generateTaxExpenseClassificationsCsv(expenses), "tenaqo-tax-expenses.csv")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-700"><Download size={16} /> Expense records</button>
        <button type="button" disabled={!financeRows.length} onClick={() => downloadTaxToolsCsv(generateTaxFinanceCostSummariesCsv(financeRows), "tenaqo-section-24.csv")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-700"><Download size={16} /> Section 24 summaries</button>
        <button type="button" disabled={!carriedRows.length} onClick={() => downloadTaxToolsCsv(generateTaxCarriedForwardCsv(carriedRows), "tenaqo-carried-forward.csv")} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-slate-700"><Download size={16} /> Carried-forward rows</button>
      </div>
    </Panel>
  );
}

export default function TaxToolsPage({ properties = [] }) {
  const { activeAccountId, hasEntitlement } = useAccount();
  const [activeTab, setActiveTab] = useState("expenses");
  const [expenses, setExpenses] = useState([]);
  const [financeRows, setFinanceRows] = useState([]);
  const [carriedRows, setCarriedRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadRecords = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      setLoading(true);
      setError("");
      const [expenseRows, financeCostRows, carriedForwardRows] = await Promise.all([
        listTaxExpenseClassifications(activeAccountId),
        listTaxFinanceCostSummaries(activeAccountId),
        listTaxCarriedForwardFinanceCosts(activeAccountId),
      ]);
      setExpenses(expenseRows);
      setFinanceRows(financeCostRows);
      setCarriedRows(carriedForwardRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tax tool records.");
    } finally {
      setLoading(false);
    }
  }, [activeAccountId]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const activeMeta = TABS.find((tab) => tab.id === activeTab) || TABS[0];
  const activeEnabled = hasEntitlement(activeMeta.feature);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-teal-50 p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Compliance</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">Tax Tools</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
          Organise landlord tax records, Section 24 finance-cost figures, carried-forward finance costs, and MTD readiness in one account-scoped workspace.
        </p>
        <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-2">
          <p>{TAX_TOOL_ADVICE_NOTICE}</p>
          <p>{TAX_TOOL_NO_HMRC_NOTICE}</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.id === activeTab;
          return (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${selected ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
              <Icon size={15} />{tab.label}
            </button>
          );
        })}
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
      {loading ? <Panel><p className="text-sm text-slate-500">Loading tax tool records...</p></Panel> : !activeEnabled ? <LockedTabNotice /> : null}
      {!loading && activeEnabled && activeTab === "expenses" ? <ExpenseTracker accountId={activeAccountId} properties={properties} expenses={expenses} onSaved={loadRecords} /> : null}
      {!loading && activeEnabled && activeTab === "section24" ? <Section24Tracker accountId={activeAccountId} properties={properties} financeRows={financeRows} onSaved={loadRecords} /> : null}
      {!loading && activeEnabled && activeTab === "carried" ? <CarriedForwardTracker accountId={activeAccountId} properties={properties} carriedRows={carriedRows} onSaved={loadRecords} /> : null}
      {!loading && activeEnabled && activeTab === "readiness" ? <ReadinessCheck /> : null}
      {!loading && activeEnabled && activeTab === "export" ? <ExportPack expenses={expenses} financeRows={financeRows} carriedRows={carriedRows} /> : null}
    </div>
  );
}
