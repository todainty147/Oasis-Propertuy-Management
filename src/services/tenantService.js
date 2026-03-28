import { supabase } from "../lib/supabase";
import { parseTenantRow } from "./rpcContracts";
import {
  assertEmail,
  assertMaxLength,
  assertPhone,
  assertRequiredText,
  normalizeText,
} from "../utils/validation";
import { OCCUPANCY_STATUS } from "../utils/statuses";

export async function listAccountTenants(accountId) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, email, phone, property_id, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((tenant) => {
    const parsed = parseTenantRow(tenant);
    return {
      id: parsed.id,
      name: parsed.name,
      email: parsed.email,
      phone: parsed.phone,
      propertyId: parsed.property_id,
      createdAt: parsed.created_at,
    };
  });
}

/* ======================
   CREATE TENANT
   ====================== */

export async function createTenant({
  accountId, // ✅ REQUIRED
  name,
  email,
  phone,
  propertyId = null,
}) {
  assertRequiredText(accountId, "Missing accountId");
  assertRequiredText(name, "Tenant name required");
  const cleanEmail = assertEmail(email, "Valid tenant email required");
  const cleanPhone = assertPhone(phone, { required: false, message: "Invalid tenant phone number" });
  assertMaxLength(name, 200, "Tenant name is too long");

  const { data: tenant, error } = await supabase
    .from("tenants")
    .insert({
      account_id: accountId,   // ✅ MULTI-TENANT ROOT
      name: normalizeText(name),
      email: cleanEmail,
      phone: cleanPhone || null,
      property_id: propertyId,
    })
    .select()
    .single();

  if (error) throw error;

  // 🔄 property status sync (RLS enforces account ownership)
  if (propertyId) {
      await supabase
      .from("properties")
      .update({ status: OCCUPANCY_STATUS.OCCUPIED })
      .eq("id", propertyId);
  }

  return parseTenantRow(tenant);
}

/* ======================
   UPDATE TENANT
   ====================== */

export async function updateTenant(id, data) {
  if (!id) throw new Error("Missing tenantId");
  assertRequiredText(data?.name, "Tenant name required");
  const cleanEmail = assertEmail(data?.email, "Valid tenant email required");
  const cleanPhone = assertPhone(data?.phone, { required: false, message: "Invalid tenant phone number" });
  assertMaxLength(data?.name, 200, "Tenant name is too long");

  const { data: current, error: currentError } = await supabase
    .from("tenants")
    .select("property_id")
    .eq("id", id)
    .single();

  if (currentError) throw currentError;

  const { data: tenant, error } = await supabase
    .from("tenants")
    .update({
      name: normalizeText(data.name),
      email: cleanEmail,
      phone: cleanPhone || null,
      property_id: data.propertyId ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  // 🔄 property changed
  if (current.property_id !== data.propertyId) {
    if (current.property_id) {
      await supabase
        .from("properties")
        .update({ status: OCCUPANCY_STATUS.VACANT })
        .eq("id", current.property_id);
    }

    if (data.propertyId) {
      await supabase
        .from("properties")
        .update({ status: OCCUPANCY_STATUS.OCCUPIED })
        .eq("id", data.propertyId);
    }
  }

  return tenant ? parseTenantRow(tenant) : null;
}

/* ======================
   DELETE TENANT
   ====================== */

export async function deleteTenant(id) {
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("property_id")
    .eq("id", id)
    .single();

  if (tenantError) throw tenantError;

  const { error } = await supabase
    .from("tenants")
    .delete()
    .eq("id", id);

  if (error) throw error;

  if (tenant?.property_id) {
    await supabase
      .from("properties")
      .update({ status: OCCUPANCY_STATUS.VACANT })
      .eq("id", tenant.property_id);
  }

  return tenant ? { property_id: tenant.property_id ?? null } : null;
}
