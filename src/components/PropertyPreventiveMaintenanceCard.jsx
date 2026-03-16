import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import {
  completePreventiveMaintenanceTask,
  createWorkOrderFromPreventiveTask,
  listPreventiveMaintenanceTasks,
  updatePreventiveMaintenanceTaskStatus,
  upsertPreventiveMaintenanceTask,
} from "../services/preventiveMaintenanceService";

function normalizeCategory(value) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function daysUntil(value) {
  if (!value) return null;
  const target = new Date(`${value}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = startOfToday();
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function dueTone(days) {
  if (!Number.isFinite(days)) return "border-slate-200 bg-white";
  if (days < 0) return "border-rose-200 bg-rose-50";
  if (days <= 14) return "border-amber-200 bg-amber-50";
  return "border-slate-200 bg-white";
}

function dueLabel(days, t) {
  if (!Number.isFinite(days)) return "—";
  if (days < 0) return t("preventiveMaintenance.due.overdueBy", { count: Math.abs(days) });
  if (days === 0) return t("preventiveMaintenance.due.today");
  return t("preventiveMaintenance.due.inDays", { count: days });
}

const CATEGORY_OPTIONS = [
  "general_upkeep",
  "inspection",
  "safety_check",
  "seasonal",
  "hvac",
  "plumbing",
  "electrical",
  "exterior",
];

export default function PropertyPreventiveMaintenanceCard({ accountId, propertyId }) {
  const navigate = useNavigate();
  const { activeRole } = useAccount();
  const { t } = useI18n();
  const role = String(activeRole || "").toLowerCase();
  const canManage = ["owner", "admin", "staff"].includes(role);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionBusyId, setActionBusyId] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [form, setForm] = useState({
    title: "",
    category: "inspection",
    frequency: "quarterly",
    frequencyIntervalDays: "30",
    nextDueDate: "",
    assignedToContractorId: "",
    notes: "",
  });

  async function load() {
    if (!accountId || !propertyId) {
      setTasks([]);
      setContractors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [taskRows, contractorRes] = await Promise.all([
        listPreventiveMaintenanceTasks({
          accountId,
          propertyId,
          limit: 100,
          includePaused: true,
        }),
        supabase
          .from("contractors")
          .select("id, name, phone, active")
          .eq("account_id", accountId)
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      if (contractorRes.error) throw contractorRes.error;

      const contractorMap = new Map((contractorRes.data || []).map((row) => [row.id, row]));
      setContractors(contractorRes.data || []);
      setTasks(
        (taskRows || []).map((row) => ({
          ...row,
          assignedToLabel:
            row.assignedToLabel ||
            contractorMap.get(row.assigned_to_contractor_id)?.name ||
            "",
        })),
      );
    } catch (e) {
      setTasks([]);
      setContractors([]);
      setError(e?.message || t("preventiveMaintenance.loadError"));
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
      { channel: `preventive-property-tasks:${propertyId}`, table: "preventive_maintenance_tasks", filter: `account_id=eq.${accountId}` },
      { channel: `preventive-property-contractors:${propertyId}`, table: "contractors", filter: `account_id=eq.${accountId}` },
      { channel: `preventive-property-work-orders:${propertyId}`, table: "work_orders", filter: `account_id=eq.${accountId}` },
    ],
    onChange: load,
  });

  const sections = useMemo(() => {
    const today = startOfToday();
    const dueSoonCutoff = new Date(today);
    dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 14);

    const overdue = [];
    const dueSoon = [];
    const planned = [];
    const paused = [];

    for (const task of tasks) {
      if (String(task?.status || "").toLowerCase() === "paused") {
        paused.push(task);
        continue;
      }
      const due = task?.next_due_date ? new Date(`${task.next_due_date}T00:00:00`) : null;
      if (!due || Number.isNaN(due.getTime())) {
        planned.push(task);
        continue;
      }
      if (due < today) overdue.push(task);
      else if (due <= dueSoonCutoff) dueSoon.push(task);
      else planned.push(task);
    }

    const byDue = (a, b) => String(a?.next_due_date || "").localeCompare(String(b?.next_due_date || ""));
    overdue.sort(byDue);
    dueSoon.sort(byDue);
    planned.sort(byDue);
    paused.sort((a, b) => String(a?.title || "").localeCompare(String(b?.title || "")));

    return { overdue, dueSoon, planned, paused };
  }, [tasks]);

  async function handleSave(event) {
    event.preventDefault();
    if (!canManage) return;

    setSaving(true);
    setActionMessage("");
    setError("");
    try {
      await upsertPreventiveMaintenanceTask({
        accountId,
        propertyId,
        title: form.title,
        category: form.category,
        frequency: form.frequency,
        frequencyIntervalDays: form.frequency === "custom" ? form.frequencyIntervalDays : null,
        nextDueDate: form.nextDueDate,
        assignedToContractorId: form.assignedToContractorId || null,
        notes: form.notes,
        status: "active",
      });
      setForm({
        title: "",
        category: "inspection",
        frequency: "quarterly",
        frequencyIntervalDays: "30",
        nextDueDate: "",
        assignedToContractorId: "",
        notes: "",
      });
      setShowForm(false);
      setActionMessage(t("preventiveMaintenance.saved"));
      await load();
    } catch (e) {
      setError(e?.message || t("preventiveMaintenance.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(task) {
    setActionBusyId(`complete-${task.id}`);
    setActionMessage("");
    setError("");
    try {
      await completePreventiveMaintenanceTask(task.id);
      setActionMessage(t("preventiveMaintenance.completed"));
      await load();
    } catch (e) {
      setError(e?.message || t("preventiveMaintenance.completeError"));
    } finally {
      setActionBusyId("");
    }
  }

  async function handleTogglePause(task) {
    const nextStatus = String(task?.status || "").toLowerCase() === "paused" ? "active" : "paused";
    setActionBusyId(`status-${task.id}`);
    setActionMessage("");
    setError("");
    try {
      await updatePreventiveMaintenanceTaskStatus(task.id, nextStatus);
      setActionMessage(
        nextStatus === "paused"
          ? t("preventiveMaintenance.paused")
          : t("preventiveMaintenance.resumed"),
      );
      await load();
    } catch (e) {
      setError(e?.message || t("preventiveMaintenance.statusError"));
    } finally {
      setActionBusyId("");
    }
  }

  async function handleCreateWorkOrder(task) {
    setActionBusyId(`wo-${task.id}`);
    setActionMessage("");
    setError("");
    try {
      const workOrder = await createWorkOrderFromPreventiveTask(task, { accountId });
      setActionMessage(t("preventiveMaintenance.workOrderCreated"));
      if (workOrder?.id) navigate(`/work-orders/${workOrder.id}`);
      else await load();
    } catch (e) {
      setError(e?.message || t("preventiveMaintenance.workOrderError"));
    } finally {
      setActionBusyId("");
    }
  }

  function renderTask(task) {
    const days = daysUntil(task?.next_due_date);
    return (
      <div
        key={task.id}
        className={`rounded-lg border p-3 ${dueTone(days)}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{task.title}</p>
            <p className="text-xs text-slate-600 mt-1">
              {normalizeCategory(task.category)} • {t(`preventiveMaintenance.frequency.${task.frequency}`)}
              {task.frequency === "custom" && task.frequency_interval_days
                ? ` (${task.frequency_interval_days}d)`
                : ""}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {t("preventiveMaintenance.nextDue")} {task.next_due_date || "—"} • {dueLabel(days, t)}
            </p>
            {task.assignedToLabel ? (
              <p className="text-xs text-slate-500 mt-1">
                {t("preventiveMaintenance.assignedTo")} {task.assignedToLabel}
              </p>
            ) : null}
            {task.notes ? <p className="text-xs text-slate-600 mt-2">{task.notes}</p> : null}
          </div>

          {canManage ? (
            <div className="flex flex-wrap justify-end gap-2">
              {String(task?.status || "").toLowerCase() !== "paused" ? (
                <button
                  type="button"
                  onClick={() => handleComplete(task)}
                  disabled={actionBusyId === `complete-${task.id}`}
                  className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {t("preventiveMaintenance.complete")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => handleCreateWorkOrder(task)}
                disabled={actionBusyId === `wo-${task.id}`}
                className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                {t("preventiveMaintenance.createWorkOrder")}
              </button>
              <button
                type="button"
                onClick={() => handleTogglePause(task)}
                disabled={actionBusyId === `status-${task.id}`}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {String(task?.status || "").toLowerCase() === "paused"
                  ? t("preventiveMaintenance.resume")
                  : t("preventiveMaintenance.pause")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <Card className="p-4 bg-slate-50">
        <Skeleton className="h-5 w-52" />
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="mt-4 h-28" />
      </Card>
    );
  }

  const activeCount = sections.overdue.length + sections.dueSoon.length + sections.planned.length;

  return (
    <Card className="p-4 bg-slate-50">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {t("preventiveMaintenance.title")}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {t("preventiveMaintenance.subtitle")}
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setShowForm((open) => !open)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            {showForm ? t("common.cancel") : t("preventiveMaintenance.addTask")}
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("preventiveMaintenance.activePlans")}</p>
          <p className="text-lg font-bold text-slate-900 mt-1">{activeCount}</p>
        </div>
        <div className="rounded-lg border border-rose-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("preventiveMaintenance.overdueCount")}</p>
          <p className="text-lg font-bold text-rose-700 mt-1">{sections.overdue.length}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("preventiveMaintenance.dueSoonCount")}</p>
          <p className="text-lg font-bold text-amber-700 mt-1">{sections.dueSoon.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("preventiveMaintenance.pausedCount")}</p>
          <p className="text-lg font-bold text-slate-900 mt-1">{sections.paused.length}</p>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      {actionMessage ? <p className="mt-3 text-sm text-emerald-700">{actionMessage}</p> : null}

      {showForm ? (
        <form onSubmit={handleSave} className="mt-4 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t("common.title")}</label>
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                placeholder={t("preventiveMaintenance.titlePlaceholder")}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t("preventiveMaintenance.category")}</label>
              <select
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t(`preventiveMaintenance.categoryOption.${option}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t("preventiveMaintenance.frequencyLabel")}</label>
              <select
                value={form.frequency}
                onChange={(e) => setForm((prev) => ({ ...prev, frequency: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
              >
                <option value="monthly">{t("preventiveMaintenance.frequency.monthly")}</option>
                <option value="quarterly">{t("preventiveMaintenance.frequency.quarterly")}</option>
                <option value="yearly">{t("preventiveMaintenance.frequency.yearly")}</option>
                <option value="custom">{t("preventiveMaintenance.frequency.custom")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                {form.frequency === "custom"
                  ? t("preventiveMaintenance.customDays")
                  : t("preventiveMaintenance.nextDueField")}
              </label>
              {form.frequency === "custom" ? (
                <input
                  type="number"
                  min="1"
                  value={form.frequencyIntervalDays}
                  onChange={(e) => setForm((prev) => ({ ...prev, frequencyIntervalDays: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                  required
                />
              ) : (
                <input
                  type="date"
                  value={form.nextDueDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, nextDueDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                  required
                />
              )}
            </div>
            {form.frequency === "custom" ? (
              <div>
                <label className="block text-xs text-slate-500 mb-1">{t("preventiveMaintenance.nextDueField")}</label>
                <input
                  type="date"
                  value={form.nextDueDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, nextDueDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
                  required
                />
              </div>
            ) : null}
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t("preventiveMaintenance.assignedToLabel")}</label>
              <select
                value={form.assignedToContractorId}
                onChange={(e) => setForm((prev) => ({ ...prev, assignedToContractorId: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
              >
                <option value="">{t("preventiveMaintenance.unassigned")}</option>
                {contractors.map((contractor) => (
                  <option key={contractor.id} value={contractor.id}>
                    {contractor.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">{t("maintenance.drawer.notes")}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white min-h-[96px]"
              placeholder={t("preventiveMaintenance.notesPlaceholder")}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{t("preventiveMaintenance.section.overdue")}</h4>
          {sections.overdue.length === 0 ? (
            <p className="text-sm text-slate-500 mt-2">{t("preventiveMaintenance.empty.overdue")}</p>
          ) : (
            <div className="mt-2 space-y-2">{sections.overdue.map(renderTask)}</div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-900">{t("preventiveMaintenance.section.dueSoon")}</h4>
          {sections.dueSoon.length === 0 ? (
            <p className="text-sm text-slate-500 mt-2">{t("preventiveMaintenance.empty.dueSoon")}</p>
          ) : (
            <div className="mt-2 space-y-2">{sections.dueSoon.map(renderTask)}</div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-900">{t("preventiveMaintenance.section.planned")}</h4>
          {sections.planned.length === 0 ? (
            <p className="text-sm text-slate-500 mt-2">{t("preventiveMaintenance.empty.planned")}</p>
          ) : (
            <div className="mt-2 space-y-2">{sections.planned.map(renderTask)}</div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-900">{t("preventiveMaintenance.section.paused")}</h4>
          {sections.paused.length === 0 ? (
            <p className="text-sm text-slate-500 mt-2">{t("preventiveMaintenance.empty.paused")}</p>
          ) : (
            <div className="mt-2 space-y-2">{sections.paused.map(renderTask)}</div>
          )}
        </div>
      </div>
    </Card>
  );
}
