import { supabase } from "../lib/supabase";
import { buildEdgeFunctionFailure } from "./edgeFunctionFailure";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

function normalizeAlternative(row) {
  return {
    contractorId: String(row?.contractor_id || "").trim(),
    contractorName: String(row?.contractor_name || "").trim(),
    reason: String(row?.reason || "").trim(),
  };
}

function normalizeInsight(row) {
  if (!row || typeof row !== "object") return null;
  const confidence = String(row.confidence || "medium").trim().toLowerCase();
  const source = String(row.source || "fallback").trim().toLowerCase();

  return {
    requestId: String(row.request_id || "").trim(),
    requestTitle: String(row.request_title || "").trim(),
    recommendedContractorId: row.recommended_contractor_id ? String(row.recommended_contractor_id) : null,
    recommendedContractorName: String(row.recommended_contractor_name || "").trim(),
    reason: String(row.reason || "").trim(),
    alternatives: Array.isArray(row.alternatives)
      ? row.alternatives.map(normalizeAlternative).filter((entry) => entry.contractorId && entry.contractorName)
      : [],
    missingDataWarning: row.missing_data_warning == null ? null : String(row.missing_data_warning).trim(),
    factsUsed: Array.isArray(row.facts_used)
      ? row.facts_used.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [],
    confidence: ["low", "medium", "high"].includes(confidence) ? confidence : "medium",
    source: source === "openai" ? "openai" : "fallback",
    generatedAt: row.generated_at ? String(row.generated_at) : null,
  };
}

export async function getContractorRecommendation({ accountId, requestId, forceRefresh = false } = {}) {
  if (!accountId || !requestId) return null;

  const { data, error } = await supabase.functions.invoke("generate-contractor-recommendation", {
    body: {
      accountId,
      requestId,
      forceRefresh,
    },
  });

  if (error) {
    const wrapped = buildEdgeFunctionFailure({
      payload: data,
      status: error?.context?.status || null,
      surface: "generate_contractor_recommendation",
      fallback: error.message || "Could not generate contractor recommendation",
      entityType: "maintenance_request",
      entityId: requestId,
      accountId,
    });
    logSecurityRelevantFailure("generate_contractor_recommendation", {
      error: wrapped,
      context: {
        accountId,
        requestId,
        forceRefresh,
        surface: "maintenance_inbox",
      },
    });
    throw wrapped;
  }

  return normalizeInsight(data?.insight);
}
