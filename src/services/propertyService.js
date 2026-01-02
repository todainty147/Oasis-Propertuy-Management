// src/services/propertyService.js
import { supabase } from "../lib/supabase";

/* ======================
   CREATE
   ====================== */

export async function createProperty({
  accountId,            // ✅ REQUIRED (multi-tenant)
  address,
  city,
  size,
  rent,
  tenantId = null,
}) {
  if (!accountId) {
    throw new Error("Brak accountId przy tworzeniu nieruchomości");
  }

  const { error } = await supabase
    .from("properties")
    .insert({
      account_id: accountId,          // 🔐 tenant boundary
      address,
      city,
      size,
      rent: Number(rent),
      tenant_id: tenantId,
    });

  if (error) {
    console.error("createProperty failed:", error);
    throw error;
  }
}

/* ======================
   UPDATE
   ====================== */

export async function updateProperty(id, {
  address,
  city,
  size,
  rent,
  tenantId = null,
}) {
  if (!id) {
    throw new Error("Brak ID nieruchomości");
  }

  const { error } = await supabase
    .from("properties")
    .update({
      address,
      city,
      size,
      rent: Number(rent),
      tenant_id: tenantId,
    })
    .eq("id", id);

  if (error) {
    console.error("updateProperty failed:", error);
    throw error;
  }
}

/* ======================
   DELETE
   ====================== */

export async function deleteProperty(id) {
  if (!id) {
    throw new Error("Brak ID nieruchomości");
  }

  const { error } = await supabase
    .from("properties")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteProperty failed:", error);
    throw error;
  }
}
