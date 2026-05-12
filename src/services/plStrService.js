import { supabase } from "../lib/supabase";

export async function listStrProperties({ accountId }) {
  const { data, error } = await supabase.rpc("list_str_properties", {
    p_account_id: accountId,
  });
  if (error) throw error;
  return data || [];
}

export async function getStrProperty({ accountId, propertyId }) {
  const { data, error } = await supabase
    .from("pl_str_properties")
    .select("*")
    .eq("account_id", accountId)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function upsertStrProperty({
  accountId,
  propertyId,
  registrationNumber        = null,
  registrationStatus        = "not_started",
  registrationExpiryDate    = null,
  registrationNotes         = null,
  safetyChecklist           = null,
  platformRefs              = null,
  reportingReadinessStatus  = "not_ready",
  reportingReadinessNotes   = null,
}) {
  const { data, error } = await supabase.rpc("upsert_str_property", {
    p_account_id:                 accountId,
    p_property_id:                propertyId,
    p_registration_number:        registrationNumber,
    p_registration_status:        registrationStatus,
    p_registration_expiry_date:   registrationExpiryDate,
    p_registration_notes:         registrationNotes,
    p_safety_checklist:           safetyChecklist,
    p_platform_refs:              platformRefs,
    p_reporting_readiness_status: reportingReadinessStatus,
    p_reporting_readiness_notes:  reportingReadinessNotes,
  });
  if (error) throw error;
  return data;
}
