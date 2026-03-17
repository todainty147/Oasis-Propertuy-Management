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
    .select("id, account_id, property_id, tenant_id, title, category, due_date, status, reminder_window_days, recurrence_interval_months, notes, completed_at, last_completed_at, created_at, updated_at")
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
  return rows.filter((row) => normalizeStatus(row?.status) === "active");
}

export async function createComplianceItem({
  accountId,
  propertyId = null,
  tenantId = null,
  title,
  category,
  dueDate,
  reminderWindowDays = 30,
  recurrenceIntervalMonths = 0,
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
      recurrence_interval_months: Math.max(0, Math.min(60, Number(recurrenceIntervalMonths) || 0)),
      notes: String(notes || "").trim() || null,
    })
    .select("id, account_id, property_id, tenant_id, title, category, due_date, status, reminder_window_days, recurrence_interval_months, notes, completed_at, last_completed_at, created_at, updated_at")
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
  if ("recurrence_interval_months" in nextPatch) {
    nextPatch.recurrence_interval_months = Math.max(0, Math.min(60, Number(nextPatch.recurrence_interval_months) || 0));
  }
  if (nextPatch.status === "completed" && !nextPatch.completed_at) {
    nextPatch.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("compliance_items")
    .update(nextPatch)
    .eq("id", id)
    .select("id, account_id, property_id, tenant_id, title, category, due_date, status, reminder_window_days, recurrence_interval_months, notes, completed_at, last_completed_at, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

function addMonths(dateValue, months) {
  const base = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  const next = new Date(base);
  next.setMonth(next.getMonth() + Math.max(0, Number(months || 0)));
  return next.toISOString().slice(0, 10);
}

export async function completeComplianceItem(id) {
  if (!id) throw new Error("Missing compliance item id");

  const { data: current, error: currentError } = await supabase
    .from("compliance_items")
    .select("id, due_date, recurrence_interval_months")
    .eq("id", id)
    .single();

  if (currentError) throw currentError;

  const recurrenceMonths = Math.max(0, Number(current?.recurrence_interval_months || 0));
  const completedAt = new Date().toISOString();

  if (recurrenceMonths > 0) {
    const nextDueDate = addMonths(current?.due_date, recurrenceMonths);
    return updateComplianceItem(id, {
      due_date: nextDueDate,
      last_completed_at: completedAt,
      completed_at: null,
      status: "active",
    });
  }

  return updateComplianceItem(id, {
    status: "completed",
    completed_at: completedAt,
    last_completed_at: completedAt,
  });
}

const RECOMMENDED_CATEGORIES = [
  "gas_safety",
  "epc_expiry",
  "insurance_renewal",
  "electrical_inspection",
  "fire_alarm_inspection",
  "smoke_alarm_check",
  "landlord_licensing",
];

export async function listMissingComplianceSetup(accountId, { propertyId = null, limit = 20 } = {}) {
  if (!accountId) return [];

  let propertiesQuery = supabase
    .from("properties")
    .select("id, address")
    .eq("account_id", accountId)
    .order("address", { ascending: true })
    .limit(Math.max(limit, 100));

  if (propertyId) propertiesQuery = propertiesQuery.eq("id", propertyId);

  const [propertiesRes, items] = await Promise.all([
    propertiesQuery,
    listComplianceItems({ accountId, propertyId, includeClosed: true, limit: 1000 }),
  ]);

  if (propertiesRes.error) throw propertiesRes.error;
  const properties = Array.isArray(propertiesRes.data) ? propertiesRes.data : [];
  const rows = Array.isArray(items) ? items : [];

  const byProperty = new Map();
  for (const row of rows) {
    const key = row?.property_id;
    if (!key) continue;
    const list = byProperty.get(key) || [];
    list.push(row);
    byProperty.set(key, list);
  }

  return properties.flatMap((property) => {
    const propertyRows = byProperty.get(property.id) || [];
    const activeCategories = new Set(
      propertyRows
        .filter((row) => !["completed", "cancelled"].includes(normalizeStatus(row?.status)))
        .map((row) => normalizeCategory(row?.category)),
    );

    if (activeCategories.size === 0) {
      return [{
        item_key: `compliance-missing-calendar-${property.id}`,
        item_type: "compliance_missing_setup",
        property_id: property.id,
        property_label: property.address || "",
        tenant_id: null,
        tenant_label: "",
        title: "Compliance calendar not set up",
        due_days: null,
        category: "setup",
        link_path: `/properties/${property.id}`,
      }];
    }

    return RECOMMENDED_CATEGORIES
      .filter((category) => !activeCategories.has(category))
      .slice(0, 2)
      .map((category) => ({
        item_key: `compliance-missing-${property.id}-${category}`,
        item_type: "compliance_missing_setup",
        property_id: property.id,
        property_label: property.address || "",
        tenant_id: null,
        tenant_label: "",
        title: category,
        due_days: null,
        category,
        link_path: `/properties/${property.id}`,
      }));
  }).slice(0, limit);
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

  const timedItems = rows
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
    .sort((a, b) => (a.due_days || 0) - (b.due_days || 0));

  const missingItems = await listMissingComplianceSetup(accountId, { limit });
  return [...timedItems, ...missingItems].slice(0, limit);
}

export async function listComplianceDocumentLinks({
  accountId,
  propertyId = null,
  complianceItemIds = [],
} = {}) {
  if (!accountId) return [];

  let query = supabase
    .from("compliance_document_links")
    .select(`
      id,
      account_id,
      compliance_item_id,
      document_id,
      created_at,
      documents:document_id (
        id,
        account_id,
        property_id,
        tenant_id,
        name,
        storage_path,
        mime_type,
        tags,
        created_at,
        upload_status
      )
    `)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (Array.isArray(complianceItemIds) && complianceItemIds.length > 0) {
    query = query.in("compliance_item_id", complianceItemIds);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingBackendObject(error)) return [];
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  if (!propertyId) return rows;

  return rows.filter((row) => {
    const doc = row?.documents;
    return !propertyId || String(doc?.property_id || "") === String(propertyId);
  });
}

export async function linkComplianceDocument({
  accountId,
  complianceItemId,
  documentId,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!complianceItemId) throw new Error("Missing compliance item id");
  if (!documentId) throw new Error("Missing document id");

  const { data, error } = await supabase
    .from("compliance_document_links")
    .insert({
      account_id: accountId,
      compliance_item_id: complianceItemId,
      document_id: documentId,
    })
    .select("id, account_id, compliance_item_id, document_id, created_at")
    .single();

  if (error) throw error;
  return data;
}

export async function unlinkComplianceDocument(linkId) {
  if (!linkId) throw new Error("Missing compliance document link id");

  const { error } = await supabase
    .from("compliance_document_links")
    .delete()
    .eq("id", linkId);

  if (error) throw error;
  return true;
}
