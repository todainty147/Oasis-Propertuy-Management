// src/services/maintenanceService.js
import { supabase } from "../lib/supabase";

function friendlyError(err, fallback) {
  return new Error(err?.message ?? fallback);
}

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

  const { data, error } = await supabase
    .from("maintenance_requests")
    .insert({
      account_id: accountId,
      property_id: propertyId,
      reported_by_tenant_id: reportedByTenantId,
      title: title.trim(),
      description: description?.trim() || null,
      priority,
      status: "open",
    })
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

  const allowed = {
    title: patch.title?.trim(),
    description: patch.description?.trim() ?? null,
    priority: patch.priority,
    status: patch.status,
  };

  // Remove undefined keys (so we don't overwrite accidentally)
  Object.keys(allowed).forEach((k) => {
    if (allowed[k] === undefined) delete allowed[k];
  });

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
