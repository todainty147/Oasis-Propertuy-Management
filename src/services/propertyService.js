// src/services/propertyService.js
import { supabase } from "../lib/supabase";
import {
  assertAmount,
  assertMaxLength,
  assertRequiredText,
  normalizeText,
} from "../utils/validation";

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
  assertRequiredText(accountId, "Missing accountId");
  assertRequiredText(address, "Property address required");
  assertRequiredText(city, "City required");
  assertMaxLength(address, 250, "Address is too long");
  assertMaxLength(city, 120, "City is too long");
  assertMaxLength(size, 80, "Size is too long");
  const rentAmount = assertAmount(rent, { min: 0, message: "Invalid rent amount" });

  const { data, error } = await supabase
    .from("properties")
    .insert({
      account_id: accountId,          // 🔐 tenant boundary
      address: normalizeText(address),
      city: normalizeText(city),
      size: normalizeText(size),
      rent: rentAmount,
      tenant_id: tenantId,
    })
    .select("id, account_id, address, city, size, rent, tenant_id")
    .single();

  if (error) {
    console.error("createProperty failed:", error);
    throw error;
  }

  return data;
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
  if (!id) throw new Error("Brak ID nieruchomości");
  assertRequiredText(address, "Property address required");
  assertRequiredText(city, "City required");
  assertMaxLength(address, 250, "Address is too long");
  assertMaxLength(city, 120, "City is too long");
  assertMaxLength(size, 80, "Size is too long");
  const rentAmount = assertAmount(rent, { min: 0, message: "Invalid rent amount" });

  const { data, error } = await supabase
    .from("properties")
    .update({
      address: normalizeText(address),
      city: normalizeText(city),
      size: normalizeText(size),
      rent: rentAmount,
      tenant_id: tenantId,
    })
    .eq("id", id)
    .select("id, account_id, address, city, size, rent, tenant_id")
    .single();

  if (error) {
    console.error("updateProperty failed:", error);
    throw error;
  }

  return data;
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
