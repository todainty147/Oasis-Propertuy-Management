import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import {
  createComplianceItem,
  listComplianceItems,
  updateComplianceItem,
} from "../services/complianceService";

const CATEGORY_OPTIONS = [
  "gas_safety",
  "electrical_inspection",
  "insurance_renewal",
  "document_expiry",
  "other",
];

function dueDays(value) {
  if (!value) return null;
  const due = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function dueTone(days) {
  if (!Number.isFinite(days)) return "border-slate-200 bg-slate-50 text-slate-700";
  if (days < 0) return "border-rose-200 bg-rose-50 text-rose-700";
  if (days <= 30) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function PropertyComplianceCard({ accountId, propertyId }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    title: "",
    category: "gas_safety",
    dueDate: "",
    reminderWindowDays: "30",
    notes: "",
  });

  function categoryLabel(category) {
    const key = String(category || "other").toLowerCase();
    const translated = t(`compliance.category.${key}`);
    return translated === `compliance.category.${key}` ? category || t("compliance.category.other") : translated;
  }

  async function load() {
    if (!accountId || !propertyId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const next = await listComplianceItems({
        accountId,
        propertyId,
        includeClosed: true,
        limit: 50,
      });
      setRows(next);
    } catch (e) {
      setRows([]);
      setError(e?.message || t("compliance.loadError"));
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
      { channel: `property-compliance:${propertyId}`, table: "compliance_items", filter: `account_id=eq.${accountId}` },
    ],
    onChange: load,
  });

  const summary = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let active = 0;
    for (const row of rows) {
      if (String(row?.status || "").toLowerCase() !== "active") continue;
      active += 1;
      const days = dueDays(row?.due_date);
      if (days < 0) overdue += 1;
      else if (days <= Number(row?.reminder_window_days || 30)) dueSoon += 1;
    }
    return { overdue, dueSoon, active };
  }, [rows]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!accountId || !propertyId) return;
    setSaving(true);
    setError("");
    try {
      await createComplianceItem({
        accountId,
        propertyId,
        title: form.title,
        category: form.category,
        dueDate: form.dueDate,
        reminderWindowDays: form.reminderWindowDays,
        notes: form.notes,
      });
      setForm({
        title: "",
        category: form.category,
        dueDate: "",
        reminderWindowDays: form.reminderWindowDays,
        notes: "",
      });
      await load();
    } catch (e2) {
      setError(e2?.message || t("compliance.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function markComplete(id) {
    setError("");
    try {
      await updateComplianceItem(id, { status: "completed" });
      await load();
    } catch (e) {
      setError(e?.message || t("compliance.completeError"));
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
        <h3 className="text-base font-semibold text-slate-900">{t("compliance.title")}</h3>
        <p className="mt-1 text-sm text-slate-500">{t("compliance.subtitle")}</p>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("compliance.summary.active")}</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{summary.active}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("compliance.summary.dueSoon")}</p>
          <p className="mt-1 text-lg font-bold text-amber-700">{summary.dueSoon}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("compliance.summary.overdue")}</p>
          <p className="mt-1 text-lg font-bold text-rose-700">{summary.overdue}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">{t("compliance.empty")}</p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const days = dueDays(row?.due_date);
                const isActive = String(row?.status || "").toLowerCase() === "active";
                return (
                  <div key={row.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-slate-900">{row.title}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-xs ${dueTone(days)}`}>
                            {t(`compliance.status.${String(row.status || "active").toLowerCase()}`)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {categoryLabel(String(row.category || "other").toLowerCase())}
                          {" • "}
                          {row.due_date}
                        </p>
                        {row.notes ? <p className="mt-1 text-xs text-slate-600">{row.notes}</p> : null}
                      </div>
                      {isActive ? (
                        <button
                          type="button"
                          onClick={() => markComplete(row.id)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {t("compliance.markComplete")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <form onSubmit={handleCreate} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-900">{t("compliance.addTitle")}</h4>
          <label className="text-sm block">
            <span className="text-xs text-slate-500">{t("compliance.titleLabel")}</span>
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder={t("compliance.titlePlaceholder")}
            />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-xs text-slate-500">{t("compliance.categoryLabel")}</span>
              <select
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t(`compliance.category.${option}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-500">{t("compliance.dueDateLabel")}</span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="text-sm block">
            <span className="text-xs text-slate-500">{t("compliance.reminderWindowLabel")}</span>
            <input
              value={form.reminderWindowDays}
              onChange={(e) => setForm((prev) => ({ ...prev, reminderWindowDays: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm block">
            <span className="text-xs text-slate-500">{t("compliance.notesLabel")}</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[96px]"
              placeholder={t("compliance.notesPlaceholder")}
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className={`rounded-lg px-3 py-2 text-sm text-white ${saving ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"}`}
            >
              {saving ? t("common.saving") : t("compliance.addAction")}
            </button>
          </div>
        </form>
      </div>
    </Card>
  );
}
