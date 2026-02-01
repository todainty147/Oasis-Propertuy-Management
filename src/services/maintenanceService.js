// src/services/maintenanceService.js
import { supabase } from "../lib/supabase";

function friendlyError(err, fallback) {
  return new Error(err?.message ?? fallback);
}

/* ======================
   VALIDATION (AUTHORITATIVE)
   ====================== */

const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

// ✅ Must match DB constraint maintenance_status_check
const STATUSES = new Set(["open", "in_progress", "waiting", "resolved", "closed"]);

function assertPriority(priority) {
  if (priority === undefined) return;
  if (!PRIORITIES.has(priority)) {
    throw new Error(`Nieprawidłowy priorytet: ${priority}`);
  }
}

function assertStatus(status) {
  if (status === undefined) return;
  if (!STATUSES.has(status)) {
    throw new Error(`Nieprawidłowy status: ${status}`);
  }
}

/* ======================
   CREATE
   ====================== */

export async function createMaintenanceRequest({
  accountId,
  propertyId,
  reportedByTenantId, // 👈 remove default = null (important)
  title,
  description = null,
  priority = "normal",
}) {
  if (!accountId) throw new Error("Brak accountId");
  if (!propertyId) throw new Error("Brak propertyId");
  if (!title?.trim()) throw new Error("Brak tytułu zgłoszenia");

  assertPriority(priority);

  const payload = {
    account_id: accountId,
    property_id: propertyId,
    title: title.trim(),
    description: description?.trim() || null,
    priority,
    status: "open",
  };

  // ✅ only set it if we actually have a value
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
   UPDATE (validated + safe patch)
   ====================== */

export async function updateMaintenanceRequest(id, patch = {}) {
  if (!id) throw new Error("Brak ID zgłoszenia");
  if (!patch || typeof patch !== "object") throw new Error("Nieprawidłowy patch");

  // ✅ Validate before send
  assertPriority(patch.priority);
  assertStatus(patch.status);

  // ✅ Only include fields that were actually provided (prevents accidental nulling)
  const allowed = {};

  if (patch.title !== undefined) allowed.title = patch.title?.trim() || null;
  if (patch.description !== undefined)
    allowed.description = patch.description?.trim() || null;
  if (patch.priority !== undefined) allowed.priority = patch.priority;
  if (patch.status !== undefined) allowed.status = patch.status;

  // If nothing to update
  if (Object.keys(allowed).length === 0) {
    throw new Error("Brak zmian do zapisania");
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
