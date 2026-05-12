import { supabase } from "../lib/supabase";

export async function listRentMatchCandidates({
  accountId,
  propertyId = null,
  tenantId   = null,
  status     = null,
}) {
  const { data, error } = await supabase.rpc("list_rent_match_candidates", {
    p_account_id:  accountId,
    p_property_id: propertyId,
    p_tenant_id:   tenantId,
    p_status:      status,
  });
  if (error) throw error;
  return data || [];
}

export async function createRentMatchCandidate({
  accountId,
  propertyId,
  tenantId,
  leaseId,
  expectedAmount,
  expectedCurrency     = "PLN",
  expectedPeriodStart,
  expectedPeriodEnd,
  candidateAmount      = null,
  candidateReference   = null,
  candidateReceivedAt  = null,
  confidenceScore      = null,
  confidenceReason     = null,
}) {
  const { data, error } = await supabase.rpc("create_rent_match_candidate", {
    p_account_id:             accountId,
    p_property_id:            propertyId,
    p_tenant_id:              tenantId,
    p_lease_id:               leaseId,
    p_expected_amount:        expectedAmount,
    p_expected_currency:      expectedCurrency,
    p_expected_period_start:  expectedPeriodStart,
    p_expected_period_end:    expectedPeriodEnd,
    p_candidate_amount:       candidateAmount,
    p_candidate_reference:    candidateReference,
    p_candidate_received_at:  candidateReceivedAt,
    p_confidence_score:       confidenceScore,
    p_confidence_reason:      confidenceReason,
  });
  if (error) throw error;
  return data;
}

export async function updateRentMatchStatus({
  accountId,
  matchId,
  newStatus,
  notes = null,
}) {
  const { data, error } = await supabase.rpc("update_rent_match_status", {
    p_account_id: accountId,
    p_match_id:   matchId,
    p_new_status: newStatus,
    p_notes:      notes,
  });
  if (error) throw error;
  return data;
}

export async function listRentMatchAudit({ accountId, matchId }) {
  const { data, error } = await supabase
    .from("pl_rent_match_audit")
    .select("*")
    .eq("account_id", accountId)
    .eq("match_id", matchId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
