// src/services/maintenanceService.js
import { supabase } from "../lib/supabase";

function friendlyError(err, fallback) {
  return new Error(err?.message ?? fallback);
}

const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const STATUSES = new Set(["open", "in_progress", "done"]);

/* ======================
   CREATE
   ====================== */

export async function createMaintenanceRequest({
  accountId, // ✅ REQUIRED
  propertyId, // ✅ REQUIRED
  reportedByTenantId = null, // optional (tenant portal later)
  title,
  description = null,
  priority = "normal",
}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!propertyId) throw new Error("Brak propertyId");
  if (!title?.trim()) throw new Error("Brak tytułu zgłoszenia");

  const safePriority = PRIORITIES.has(priority) ? priority : "normal";

  const payload = {
    account_id: accountId,
    property_id: propertyId,
    title: title.trim(),
    description: description?.trim() || null,
    priority: safePriority,
    status: "open",
  };

  // Only set this if explicitly provided
  if (reportedByTenantId) {
    payload.reported_by_tenant_id = reportedByTenantId;
  }

  const { data, error } = await supabase
    .from("maintenance_requests")
    .insert(payload)
    .select()
    .single();

  if (error) throw friendlyError(error, "Nie udało się utworzyć zgłoszenia");
  return data;
}

/* ======================
   UPDATE
   ====================== */

export async function updateMaintenanceRequest(id, patch = {}) {
  if (!id) throw new Error("Brak ID zgłoszenia");

  const allowed = {};

  if (typeof patch.title === "string") allowed.title = patch.title.trim();
  if (patch.description !== undefined) {
    allowed.description = patch.description?.trim() || null;
  }
  if (patch.priority !== undefined) {
    allowed.priority = PRIORITIES.has(patch.priority) ? patch.priority : "normal";
  }
  if (patch.status !== undefined) {
    allowed.status = STATUSES.has(patch.status) ? patch.status : "open";
  }

  const { data, error } = await supabase
    .from("maintenance_requests")
    .update(allowed)
    .eq("id", id)
    .select()
    .single();

  if (error) throw friendlyError(error, "Nie udało się zaktualizować zgłoszenia");
  return data;
}

/* ======================
   DELETE
   ====================== */

export async function deleteMaintenanceRequest(id) {
  if (!id) throw new Error("Brak ID zgłoszenia");

  const { error } = await supabase
    .from("maintenance_requests")
    .delete()
    .eq("id", id);

  if (error) throw friendlyError(error, "Nie udało się usunąć zgłoszenia");
}
