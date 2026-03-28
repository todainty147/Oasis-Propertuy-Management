import { supabase } from "../lib/supabase";
import { parsePreventiveMaintenanceTaskRow } from "./rpcContracts";
import { createWorkOrder } from "./workOrderService";
import {
  assertMaxLength,
  assertRequiredText,
  normalizeText,
} from "../utils/validation";

let preventiveAttentionUnavailable = false;

const TASK_SELECT = `
  id,
  account_id,
  property_id,
  title,
  category,
  frequency,
  frequency_interval_days,
  next_due_date,
  last_completed_at,
  assigned_to_contractor_id,
  notes,
  status,
  created_at,
  updated_at,
  property:properties!preventive_maintenance_tasks_property_id_fkey(address),
  assigned_contractor:contractors!preventive_maintenance_tasks_assigned_to_contractor_id_fkey(id, name, phone)
`;

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("could not find the function") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function friendly(error, fallback) {
  return new Error(error?.message || fallback);
}

function clampPositiveInt(value, fallback) {
  const next = Number(value || 0);
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return Math.max(1, Math.floor(next));
}

function normalizeFrequency(value) {
  const next = String(value || "").trim().toLowerCase();
  if (["monthly", "quarterly", "yearly", "custom"].includes(next)) return next;
  return "quarterly";
}

function normalizeStatus(value) {
  const next = String(value || "").trim().toLowerCase();
  if (["active", "paused", "completed"].includes(next)) return next;
  return "active";
}

function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(baseDate, days) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(baseDate, months) {
  const next = new Date(baseDate);
  next.setMonth(next.getMonth() + months);
  return next;
}

function computeNextDueDate({ frequency, frequencyIntervalDays, completedAt }) {
  const basis = new Date(toDateOnly(completedAt) || new Date().toISOString().slice(0, 10));
  if (Number.isNaN(basis.getTime())) return null;

  switch (normalizeFrequency(frequency)) {
    case "monthly":
      return toDateOnly(addMonths(basis, 1));
    case "quarterly":
      return toDateOnly(addMonths(basis, 3));
    case "yearly":
      return toDateOnly(addMonths(basis, 12));
    case "custom":
      return toDateOnly(addDays(basis, clampPositiveInt(frequencyIntervalDays, 30)));
    default:
      return toDateOnly(addMonths(basis, 3));
  }
}

function mapTaskRow(row) {
  return {
    ...row,
    frequency: normalizeFrequency(row?.frequency),
    status: normalizeStatus(row?.status),
    propertyLabel: row?.property?.address || row?.property_label || "",
    assignedToLabel: row?.assigned_contractor?.name || row?.assigned_to_label || "",
  };
}

export async function listPreventiveMaintenanceTasks({
  accountId,
  propertyId = null,
  limit = 100,
  includePaused = true,
} = {}) {
  if (!accountId) return [];

  let query = supabase
    .from("preventive_maintenance_tasks")
    .select(TASK_SELECT)
    .eq("account_id", accountId)
    .order("next_due_date", { ascending: true })
    .limit(clampPositiveInt(limit, 100));

  if (propertyId) query = query.eq("property_id", propertyId);
  if (!includePaused) query = query.eq("status", "active");

  const { data, error } = await query;
  if (error && isMissingBackendObject(error)) return [];
  if (error) throw friendly(error, "Failed to load preventive maintenance tasks");
  return (data || []).map(mapTaskRow);
}

export async function upsertPreventiveMaintenanceTask(input = {}) {
  const accountId = String(input.accountId || "").trim();
  const propertyId = String(input.propertyId || "").trim();
  const title = normalizeText(input.title);
  const category = normalizeText(input.category) || "general_upkeep";
  const frequency = normalizeFrequency(input.frequency);
  const frequencyIntervalDays =
    frequency === "custom" ? clampPositiveInt(input.frequencyIntervalDays, 30) : null;
  const nextDueDate = toDateOnly(input.nextDueDate);
  const status = normalizeStatus(input.status);
  const notes = normalizeText(input.notes) || null;
  const assignedToContractorId = input.assignedToContractorId || null;

  assertRequiredText(accountId, "Missing accountId");
  assertRequiredText(propertyId, "Missing propertyId");
  assertRequiredText(title, "Title is required");
  assertRequiredText(nextDueDate, "Next due date is required");
  assertMaxLength(title, 200, "Task title is too long");
  assertMaxLength(category, 100, "Task category is too long");
  assertMaxLength(notes, 5000, "Notes are too long");

  const payload = {
    account_id: accountId,
    property_id: propertyId,
    title,
    category,
    frequency,
    frequency_interval_days: frequencyIntervalDays,
    next_due_date: nextDueDate,
    assigned_to_contractor_id: assignedToContractorId,
    notes,
    status,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("preventive_maintenance_tasks")
      .update(payload)
      .eq("id", input.id)
      .select(TASK_SELECT)
      .single();

    if (error) throw friendly(error, "Failed to update preventive maintenance task");
    return mapTaskRow(data);
  }

  const { data, error } = await supabase
    .from("preventive_maintenance_tasks")
    .insert(payload)
    .select(TASK_SELECT)
    .single();

  if (error) throw friendly(error, "Failed to create preventive maintenance task");
  return mapTaskRow(parsePreventiveMaintenanceTaskRow(data));
}

export async function completePreventiveMaintenanceTask(taskId, { completedAt = new Date().toISOString() } = {}) {
  if (!taskId) throw new Error("Missing preventive task ID");

  const { data, error } = await supabase.rpc("complete_preventive_maintenance_task", {
    p_task_id: taskId,
    p_completed_at: completedAt,
  });

  if (error && isMissingBackendObject(error)) {
    const { data: existing, error: existingError } = await supabase
      .from("preventive_maintenance_tasks")
      .select("id, frequency, frequency_interval_days, status")
      .eq("id", taskId)
      .single();

    if (existingError) throw friendly(existingError, "Failed to complete preventive maintenance task");

    const nextDueDate = computeNextDueDate({
      frequency: existing?.frequency,
      frequencyIntervalDays: existing?.frequency_interval_days,
      completedAt,
    });

    const { data: updated, error: updateError } = await supabase
      .from("preventive_maintenance_tasks")
      .update({
        last_completed_at: completedAt,
        next_due_date: nextDueDate,
        status: normalizeStatus(existing?.status) === "paused" ? "paused" : "active",
      })
      .eq("id", taskId)
      .select(TASK_SELECT)
      .single();

    if (updateError) throw friendly(updateError, "Failed to complete preventive maintenance task");
    return mapTaskRow(updated);
  }

  if (error) throw friendly(error, "Failed to complete preventive maintenance task");
  return mapTaskRow(data);
}

export async function updatePreventiveMaintenanceTaskStatus(taskId, status) {
  if (!taskId) throw new Error("Missing preventive task ID");

  const { data, error } = await supabase
    .from("preventive_maintenance_tasks")
    .update({ status: normalizeStatus(status) })
    .eq("id", taskId)
    .select(TASK_SELECT)
    .single();

  if (error) throw friendly(error, "Failed to update preventive maintenance task status");
  return mapTaskRow(data);
}

export async function getPreventiveMaintenanceAttention(accountId, { dueSoonDays = 14, limit = 25 } = {}) {
  if (!accountId) return [];

  if (!preventiveAttentionUnavailable) {
    const { data, error } = await supabase.rpc("preventive_maintenance_attention", {
      p_account_id: accountId,
      p_due_soon_days: clampPositiveInt(dueSoonDays, 14),
      p_limit: clampPositiveInt(limit, 25),
    });

    if (error && isMissingBackendObject(error)) {
      preventiveAttentionUnavailable = true;
    } else if (error) {
      throw friendly(error, "Failed to load preventive maintenance attention");
    } else {
      return Array.isArray(data) ? data : [];
    }
  }

  const rows = await listPreventiveMaintenanceTasks({
    accountId,
    limit: Math.max(clampPositiveInt(limit, 25), 50),
    includePaused: false,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueSoonCutoff = new Date(today);
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + clampPositiveInt(dueSoonDays, 14));

  return rows
    .map((row) => {
      const due = row?.next_due_date ? new Date(`${row.next_due_date}T00:00:00`) : null;
      if (!due || Number.isNaN(due.getTime())) return null;
      const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86400000);
      const overdue = due < today;
      if (!overdue && due > dueSoonCutoff) return null;
      return {
        item_key: `preventive-${overdue ? "overdue" : "soon"}-${row.id}`,
        item_type: overdue ? "preventive_task_overdue" : "preventive_task_due_soon",
        property_id: row.property_id,
        property_label: row.propertyLabel || "",
        title: row.title,
        category: row.category,
        next_due_date: row.next_due_date,
        days_until_due: daysUntilDue,
        assigned_to_label: row.assignedToLabel || "",
        link_path: row.property_id ? `/properties/${row.property_id}` : "/maintenance-kpi",
        sort_order: overdue ? 20 : 40,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.sort_order || 99) - Number(b.sort_order || 99))
    .slice(0, clampPositiveInt(limit, 25));
}

export async function getPreventiveMaintenanceOverview(accountId, { dueSoonDays = 14 } = {}) {
  const rows = await listPreventiveMaintenanceTasks({
    accountId,
    limit: 500,
    includePaused: true,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueSoonCutoff = new Date(today);
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + clampPositiveInt(dueSoonDays, 14));

  let activeCount = 0;
  let overdueCount = 0;
  let dueSoonCount = 0;
  const propertyCounts = new Map();

  for (const row of rows) {
    const status = normalizeStatus(row?.status);
    if (status === "active") activeCount += 1;
    if (status !== "active") continue;

    const due = row?.next_due_date ? new Date(`${row.next_due_date}T00:00:00`) : null;
    if (!due || Number.isNaN(due.getTime())) continue;

    if (due < today) overdueCount += 1;
    else if (due <= dueSoonCutoff) dueSoonCount += 1;

    const issueCount = due <= dueSoonCutoff ? 1 : 0;
    if (issueCount > 0) {
      const label = row.propertyLabel || "—";
      propertyCounts.set(label, (propertyCounts.get(label) || 0) + issueCount);
    }
  }

  const items = await getPreventiveMaintenanceAttention(accountId, { dueSoonDays, limit: 8 });

  return {
    activeCount,
    overdueCount,
    dueSoonCount,
    items,
    propertiesWithDueTasks: Array.from(propertyCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

export async function createWorkOrderFromPreventiveTask(task, { accountId } = {}) {
  if (!task?.property_id) throw new Error("Missing property on preventive task");
  if (!accountId) throw new Error("Missing accountId");

  const notesParts = [
    `Preventive maintenance: ${task.title}`,
    task.category ? `Category: ${task.category}` : "",
    task.next_due_date ? `Due: ${task.next_due_date}` : "",
    task.notes ? `Notes: ${task.notes}` : "",
  ].filter(Boolean);

  return createWorkOrder({
    accountId,
    propertyId: task.property_id,
    contractorId: task.assigned_to_contractor_id || null,
    notes: notesParts.join("\n"),
  });
}
