import { supabase } from "../lib/supabase";

export async function listPartners({
  market      = "pl",
  partnerType = null,
  serviceArea = null,
} = {}) {
  const { data, error } = await supabase.rpc("list_partners", {
    p_market:       market,
    p_partner_type: partnerType,
    p_service_area: serviceArea,
  });
  if (error) throw error;
  return data || [];
}

export async function createPartner({
  accountId,
  market       = "pl",
  partnerType,
  name,
  companyName  = null,
  serviceArea,
  contactMethod,
  contactValue,
  internalNotes = null,
}) {
  const { data, error } = await supabase
    .from("pl_partner_directory")
    .insert({
      account_id:     accountId,
      market,
      partner_type:   partnerType,
      name,
      company_name:   companyName,
      service_area:   serviceArea,
      contact_method: contactMethod,
      contact_value:  contactValue,
      is_active:      true,
      internal_notes: internalNotes,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function togglePartnerActive({ partnerId, accountId, isActive }) {
  const { data, error } = await supabase
    .from("pl_partner_directory")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", partnerId)
    .eq("account_id", accountId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
