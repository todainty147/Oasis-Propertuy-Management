import { supabase } from "../lib/supabase";
import { parseContractorDirectoryRow, parseRpcRows } from "./rpcContracts";

function normalizePerformanceRow(row = {}) {
  return {
    id: row.contractor_id || row.id,
    account_id: row.account_id,
    name: row.name || "",
    phone: row.phone || "",
    email: row.email || "",
    user_id: row.user_id || null,
    active: row.active !== false,
    preferred: Boolean(row.preferred),
    jobsAssigned: Number(row.jobs_assigned || 0),
    jobsCompleted: Number(row.jobs_completed || 0),
    quotesSubmitted: Number(row.quotes_submitted || 0),
    quotesApproved: Number(row.quotes_approved || 0),
    averageRating: row.average_rating == null ? null : Number(row.average_rating),
    wouldUseAgainScore: row.would_use_again_score == null ? null : Number(row.would_use_again_score),
    lastUsedAt: row.last_used_at || null,
    averageQuoteResponseHours: row.average_quote_response_hours == null
      ? null
      : Number(row.average_quote_response_hours),
    averageCompletionHours: row.average_completion_hours == null
      ? null
      : Number(row.average_completion_hours),
    commonJobCategories: Array.isArray(row.common_job_categories) ? row.common_job_categories : [],
    usedAtProperty: Boolean(row.used_at_property),
    recommendationRank: Number(row.recommendation_rank || 0),
    recommendationReasons: Array.isArray(row.recommendation_reasons) ? row.recommendation_reasons : [],
  };
}

export function contractorBadgeLabels(contractor = {}) {
  const labels = [];
  if (contractor.preferred) labels.push("Preferred");
  if (Number(contractor.averageRating || 0) >= 4) labels.push("Highly rated");
  const lastUsedAt = contractor.lastUsedAt ? new Date(contractor.lastUsedAt).getTime() : null;
  const recentCutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
  if (Number.isFinite(lastUsedAt) && lastUsedAt >= recentCutoff) labels.push("Recently used");
  if (contractor.usedAtProperty) labels.push("Used at this property");
  return labels;
}

export async function listActiveContractors(accountId) {
  if (!accountId) return [];

  const { data, error } = await supabase
    .from("contractors")
    .select("id, name, phone, email, user_id, active")
    .eq("account_id", accountId)
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return parseRpcRows(data || [], parseContractorDirectoryRow, "active contractor rows");
}

export async function listContractorPerformanceSummary({ accountId, propertyId = null } = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase.rpc("contractor_performance_summary", {
    p_account_id: accountId,
    p_property_id: propertyId || null,
  });

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizePerformanceRow);
}

export async function listRecommendedContractors({ accountId, propertyId = null, limit = 8 } = {}) {
  if (!accountId) return [];

  const { data, error } = await supabase.rpc("recommended_contractors_for_work_order", {
    p_account_id: accountId,
    p_property_id: propertyId || null,
    p_limit: Math.min(Math.max(Number(limit) || 8, 1), 25),
  });

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizePerformanceRow);
}

export async function setContractorPreferredSupplier({
  accountId,
  contractorId,
  preferred = true,
  reason = null,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!contractorId) throw new Error("Missing contractorId");

  const { data, error } = await supabase.rpc("set_contractor_preferred_supplier", {
    p_account_id: accountId,
    p_contractor_id: contractorId,
    p_preferred: Boolean(preferred),
    p_reason: reason || null,
  });

  if (error) throw error;
  return data;
}

export async function countActiveContractors(accountId) {
  if (!accountId) return 0;

  const { count, error } = await supabase
    .from("contractors")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("active", true);

  if (error) throw error;
  return Number(count || 0);
}
