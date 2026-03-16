import { supabase } from "../lib/supabase";

function normalizeCategory(category) {
  const value = String(category || "").trim().toLowerCase();
  if (value) return value;
  return "other";
}

function normalizeStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (["active", "completed", "paused", "cancelled"].includes(value)) return value;
  return "active";
}

function isMissingBackendObject(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "PGRST404" ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

export async function listComplianceItems({
  accountId,
  propertyId = null,
  tenantId = null,
  includeClosed = false,
  limit = 100,
} = {}) {
  if (!accountId) return [];

  let query = supabase
    .from("compliance_items")
    .select("id, account_id, property_id, tenant_id, title, category, due_date, status, reminder_window_days, notes, completed_at, created_at, updated_at")
    .eq("account_id", accountId)
    .order("due_date", { ascending: true })
    .limit(limit);

  if (propertyId) query = query.eq("property_id", propertyId);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }
  const rows = Array.isArray(data) ? data : [];
  if (includeClosed) return rows;
  return rows.filter((row) => !["completed", "cancelled"].includes(normalizeStatus(row?.status)));
}

export async function createComplianceItem({
  accountId,
  propertyId = null,
  tenantId = null,
  title,
  category,
  dueDate,
  reminderWindowDays = 30,
  notes = "",
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!title) throw new Error("Missing compliance title");
  if (!dueDate) throw new Error("Missing due date");

  const { data, error } = await supabase
    .from("compliance_items")
    .insert({
      account_id: accountId,
      property_id: propertyId || null,
      tenant_id: tenantId || null,
      title: String(title).trim(),
      category: normalizeCategory(category),
      due_date: String(dueDate).slice(0, 10),
      reminder_window_days: Math.max(0, Math.min(365, Number(reminderWindowDays) || 30)),
      notes: String(notes || "").trim() || null,
    })
    .select("id, account_id, property_id, tenant_id, title, category, due_date, status, reminder_window_days, notes, completed_at, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function updateComplianceItem(id, patch = {}) {
  if (!id) throw new Error("Missing compliance item id");

  const nextPatch = { ...patch };
  if ("category" in nextPatch) nextPatch.category = normalizeCategory(nextPatch.category);
  if ("status" in nextPatch) nextPatch.status = normalizeStatus(nextPatch.status);
  if ("due_date" in nextPatch) nextPatch.due_date = nextPatch.due_date ? String(nextPatch.due_date).slice(0, 10) : null;
  if ("notes" in nextPatch) nextPatch.notes = String(nextPatch.notes || "").trim() || null;
  if ("reminder_window_days" in nextPatch) {
    nextPatch.reminder_window_days = Math.max(0, Math.min(365, Number(nextPatch.reminder_window_days) || 0));
  }
  if (nextPatch.status === "completed" && !nextPatch.completed_at) {
    nextPatch.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("compliance_items")
    .update(nextPatch)
    .eq("id", id)
    .select("id, account_id, property_id, tenant_id, title, category, due_date, status, reminder_window_days, notes, completed_at, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function getComplianceAttention(accountId, { dueSoonDays = 30, limit = 20 } = {}) {
  if (!accountId) return [];

  const rows = await listComplianceItems({
    accountId,
    includeClosed: false,
    limit: Math.max(limit, 100),
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const propertyIds = Array.from(new Set(rows.map((row) => row?.property_id).filter(Boolean)));
  const tenantIds = Array.from(new Set(rows.map((row) => row?.tenant_id).filter(Boolean)));

  const [propertyRes, tenantRes] = await Promise.all([
    propertyIds.length
      ? supabase.from("properties").select("id, address").in("id", propertyIds)
      : Promise.resolve({ data: [] }),
    tenantIds.length
      ? supabase.from("tenants").select("id, name").in("id", tenantIds)
      : Promise.resolve({ data: [] }),
  ]);

  const propertyMap = new Map((propertyRes.data || []).map((row) => [row.id, row.address || ""]));
  const tenantMap = new Map((tenantRes.data || []).map((row) => [row.id, row.name || ""]));

  return rows
    .map((row) => {
      const due = row?.due_date ? new Date(`${row.due_date}T00:00:00`) : null;
      if (!due || Number.isNaN(due.getTime())) return null;
      const dueDays = Math.round((due.getTime() - today.getTime()) / 86400000);
      if (dueDays > dueSoonDays) return null;
      return {
        item_key: `compliance-${dueDays < 0 ? "overdue" : "due"}-${row.id}`,
        item_type: dueDays < 0 ? "compliance_overdue" : "compliance_due_soon",
        title: row.title,
        property_id: row.property_id || null,
        tenant_id: row.tenant_id || null,
        property_label: propertyMap.get(row.property_id) || "",
        tenant_label: tenantMap.get(row.tenant_id) || "",
        due_days: dueDays,
        category: row.category || "",
        link_path: row.property_id ? `/properties/${row.property_id}` : "/dashboard",
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.due_days || 0) - (b.due_days || 0))
    .slice(0, limit);
}
