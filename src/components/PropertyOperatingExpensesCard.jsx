import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { formatCurrencyAmount } from "../utils/currency";
import {
  createPropertyOperatingExpense,
  getPropertyFinancialProfile,
  listPropertyOperatingExpenses,
  upsertPropertyFinancialProfile,
} from "../services/propertyOperationsService";

const CATEGORY_OPTIONS = [
  "mortgage",
  "tax",
  "insurance",
  "utilities",
  "vacancy_loss",
  "other",
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

export default function PropertyOperatingExpensesCard({ accountId, propertyId }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [savingExpense, setSavingExpense] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [profile, setProfile] = useState(null);
  const [expenseForm, setExpenseForm] = useState({
    category: "mortgage",
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: "",
    notes: "",
  });
  const [profileForm, setProfileForm] = useState({
    estimatedMarketValue: "",
    targetCapRate: "",
  });

  async function load() {
    if (!accountId || !propertyId) {
      setRows([]);
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [expenseRows, profileRow] = await Promise.all([
        listPropertyOperatingExpenses({ accountId, propertyId, limit: 30 }),
        getPropertyFinancialProfile({ accountId, propertyId }),
      ]);
      setRows(expenseRows);
      setProfile(profileRow);
      setProfileForm({
        estimatedMarketValue: profileRow?.estimated_market_value != null ? String(profileRow.estimated_market_value) : "",
        targetCapRate: profileRow?.target_cap_rate != null ? String(profileRow.target_cap_rate) : "",
      });
    } catch (e) {
      setRows([]);
      setProfile(null);
      setError(e?.message || t("propertyExpenses.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, propertyId]);

  useRealtimeTables({
    enabled: !!accountId && !!propertyId,
    subscriptions: [
      { channel: `property-opex:${propertyId}`, table: "property_operating_expenses", filter: `account_id=eq.${accountId}` },
      { channel: `property-fin-profile:${propertyId}`, table: "property_financial_profiles", filter: `account_id=eq.${accountId}` },
    ],
    onChange: load,
  });

  const summary = useMemo(() => {
    const byCategory = new Map();
    let total = 0;
    for (const row of rows) {
      const category = String(row?.category || "other").toLowerCase();
      const amount = Number(row?.amount || 0);
      total += amount;
      byCategory.set(category, (byCategory.get(category) || 0) + amount);
    }
    return {
      total,
      byCategory,
    };
  }, [rows]);

  async function handleAddExpense(e) {
    e.preventDefault();
    if (!accountId || !propertyId) return;
    setSavingExpense(true);
    setError("");
    try {
      await createPropertyOperatingExpense({
        accountId,
        propertyId,
        category: expenseForm.category,
        expenseDate: expenseForm.expenseDate,
        amount: expenseForm.amount,
        notes: expenseForm.notes,
      });
      setExpenseForm({
        category: expenseForm.category,
        expenseDate: new Date().toISOString().slice(0, 10),
        amount: "",
        notes: "",
      });
      await load();
    } catch (e2) {
      setError(e2?.message || t("propertyExpenses.saveError"));
    } finally {
      setSavingExpense(false);
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    if (!accountId || !propertyId) return;
    setSavingProfile(true);
    setError("");
    try {
      const saved = await upsertPropertyFinancialProfile({
        accountId,
        propertyId,
        estimatedMarketValue: profileForm.estimatedMarketValue,
        targetCapRate: profileForm.targetCapRate,
        notes: profile?.notes || "",
      });
      setProfile(saved);
    } catch (e2) {
      setError(e2?.message || t("propertyExpenses.profileSaveError"));
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4 bg-slate-50">
        <Skeleton className="h-5 w-48" />
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={idx} className="h-16" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-slate-50">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{t("propertyExpenses.title")}</h3>
        <p className="mt-1 text-sm text-slate-500">{t("propertyExpenses.subtitle")}</p>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("propertyExpenses.totalRecorded")}</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{formatCurrencyAmount(summary.total)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("propertyExpenses.marketValue")}</p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {profile?.estimated_market_value != null
              ? formatCurrencyAmount(profile.estimated_market_value)
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("propertyExpenses.targetCapRate")}</p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {profile?.target_cap_rate != null ? `${Number(profile.target_cap_rate).toFixed(2)}%` : "—"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {CATEGORY_OPTIONS.map((category) => (
              <div key={category} className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">{t(`propertyExpenses.category.${category}`)}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {formatCurrencyAmount(summary.byCategory.get(category) || 0)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            {rows.length === 0 ? (
              <p className="text-sm text-slate-500">{t("propertyExpenses.empty")}</p>
            ) : (
              <div className="space-y-2">
                {rows.slice(0, 8).map((row) => (
                  <div key={row.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {t(`propertyExpenses.category.${String(row.category || "other").toLowerCase()}`)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{formatDate(row.expense_date)}</p>
                        {row.notes ? <p className="mt-1 text-xs text-slate-600">{row.notes}</p> : null}
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatCurrencyAmount(row.amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={handleAddExpense} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-900">{t("propertyExpenses.addTitle")}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="text-xs text-slate-500">{t("propertyExpenses.categoryLabel")}</span>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {t(`propertyExpenses.category.${option}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-xs text-slate-500">{t("propertyExpenses.dateLabel")}</span>
                <input
                  type="date"
                  value={expenseForm.expenseDate}
                  onChange={(e) => setExpenseForm((prev) => ({ ...prev, expenseDate: e.target.value }))}
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="text-sm block">
              <span className="text-xs text-slate-500">{t("propertyExpenses.amountLabel")}</span>
              <input
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="0.00"
              />
            </label>
            <label className="text-sm block">
              <span className="text-xs text-slate-500">{t("propertyExpenses.notesLabel")}</span>
              <textarea
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[96px]"
                placeholder={t("propertyExpenses.notesPlaceholder")}
              />
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingExpense}
                className={`rounded-lg px-3 py-2 text-sm text-white ${savingExpense ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"}`}
              >
                {savingExpense ? t("common.saving") : t("propertyExpenses.addAction")}
              </button>
            </div>
          </form>

          <form onSubmit={handleSaveProfile} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-900">{t("propertyExpenses.profileTitle")}</h4>
            <label className="text-sm block">
              <span className="text-xs text-slate-500">{t("propertyExpenses.marketValueLabel")}</span>
              <input
                value={profileForm.estimatedMarketValue}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, estimatedMarketValue: e.target.value }))}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="250000"
              />
            </label>
            <label className="text-sm block">
              <span className="text-xs text-slate-500">{t("propertyExpenses.targetCapRateLabel")}</span>
              <input
                value={profileForm.targetCapRate}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, targetCapRate: e.target.value }))}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="6.5"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className={`rounded-lg px-3 py-2 text-sm text-white ${savingProfile ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700"}`}
              >
                {savingProfile ? t("common.saving") : t("propertyExpenses.profileSave")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Card>
  );
}
