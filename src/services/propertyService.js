// src/services/propertyService.js
import { supabase } from "../lib/supabase";
import {
  assertAmount,
  assertMaxLength,
  assertRequiredText,
  normalizeText,
} from "../utils/validation";

function logPropertyServiceError(event, error) {
  console.error(`[property-service] ${event}`, {
    code: error?.code || "unknown",
  });
}

async function syncTenantAssignment({ accountId, propertyId, previousTenantId = null, nextTenantId = null }) {
  if (!accountId || !propertyId) return;
  const previousId = previousTenantId || null;
  const nextId = nextTenantId || null;

  if (previousId && previousId !== nextId) {
    const { error } = await supabase
      .from("tenants")
      .update({ property_id: null })
      .eq("id", previousId)
      .eq("account_id", accountId)
      .eq("property_id", propertyId);

    if (error) throw error;
  }

  if (nextId) {
    const { error } = await supabase
      .from("tenants")
      .update({ property_id: propertyId })
      .eq("id", nextId)
      .eq("account_id", accountId);

    if (error) throw error;
  }
}

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
    logPropertyServiceError("create_failed", error);
    throw error;
  }

  await syncTenantAssignment({
    accountId,
    propertyId: data.id,
    nextTenantId: tenantId,
  });

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

  const { data: current, error: currentError } = await supabase
    .from("properties")
    .select("account_id, tenant_id")
    .eq("id", id)
    .single();

  if (currentError) {
    logPropertyServiceError("load_before_update_failed", currentError);
    throw currentError;
  }

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
    logPropertyServiceError("update_failed", error);
    throw error;
  }

  await syncTenantAssignment({
    accountId: current.account_id,
    propertyId: id,
    previousTenantId: current.tenant_id,
    nextTenantId: tenantId,
  });

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
    logPropertyServiceError("delete_failed", error);
    throw error;
  }
}
