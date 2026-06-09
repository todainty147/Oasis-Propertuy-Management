import { supabase } from "../lib/supabase";
import { buildEdgeFunctionFailure } from "./edgeFunctionFailure";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

function normalizeAlternative(row) {
  return {
    contractorId: String(row?.contractor_id || "").trim(),
    contractorName: humanizeContractorName(row?.contractor_name),
    reason: humanizeRecommendationText(row?.reason),
  };
}

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`\\b${UUID_PATTERN}\\b`, "gi");
const ID_LABEL_RE = new RegExp(`\\s*\\((?:id|ID):\\s*${UUID_PATTERN}\\)`, "gi");
const QUOTED_PROPERTY_TOKEN_RE = /['"]property:[^'"]+['"]/gi;
const PROPERTY_TOKEN_RE = /\bproperty:[a-z0-9-]+\b/gi;

function looksLikeTechnicalId(value) {
  return new RegExp(`^${UUID_PATTERN}$`, "i").test(String(value || "").trim());
}

function humanizeContractorName(value) {
  const text = String(value || "").trim();
  return looksLikeTechnicalId(text) ? "" : text;
}

function humanizeRecommendationText(value) {
  const original = String(value || "").trim();
  if (!original) return "";

  const lower = original.toLowerCase();
  const ratingMatch = original.match(/ratings?\s+of\s+(\d+(?:\.\d+)?)/i);
  if (/suggested contractor list/.test(lower) && /no history/.test(lower)) {
    return "The suggested contractor has no recorded history at this property yet.";
  }
  if (/contractor history shows/.test(lower) && /(completed|in-progress|in progress)/.test(lower)) {
    return ratingMatch
      ? `Past completed or in-progress jobs at this property with ${ratingMatch[1]}/5 ratings were considered.`
      : "Past completed or in-progress jobs at this property were considered.";
  }

  let text = original
    .replace(ID_LABEL_RE, "")
    .replace(QUOTED_PROPERTY_TOKEN_RE, "this property")
    .replace(PROPERTY_TOKEN_RE, "this property")
    .replace(new RegExp(`\\bcontractor\\s+${UUID_PATTERN}\\b`, "gi"), "the suggested contractor")
    .replace(new RegExp(`\\bproperty\\s+${UUID_PATTERN}\\b`, "gi"), "this property")
    .replace(/\bproperty\s+[a-z0-9-]{6,}\b/gi, "this property")
    .replace(new RegExp(`\\bwork\\s*order\\s+${UUID_PATTERN}\\b`, "gi"), "the work order")
    .replace(new RegExp(`\\brequest\\s+${UUID_PATTERN}\\b`, "gi"), "the request")
    .replace(UUID_RE, "the relevant record")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();

  text = text.replace(/\bwith contractor the relevant record\b/gi, "with the contractor");
  text = text.replace(/\bat property this property\b/gi, "at this property");
  return text;
}

function humanizeFact(value) {
  const text = humanizeRecommendationText(value);
  if (!text) return "";
  if (/the relevant record/.test(text) && !/(history|rating|property|contractor|trade|job|recommended)/i.test(text)) {
    return "";
  }
  return text;
}

function normalizeInsight(row) {
  if (!row || typeof row !== "object") return null;
  const confidence = String(row.confidence || "medium").trim().toLowerCase();
  const source = String(row.source || "fallback").trim().toLowerCase();

  return {
    requestId: String(row.request_id || "").trim(),
    requestTitle: String(row.request_title || "").trim(),
    recommendedContractorId: row.recommended_contractor_id ? String(row.recommended_contractor_id) : null,
    recommendedContractorName: humanizeContractorName(row.recommended_contractor_name),
    reason: humanizeRecommendationText(row.reason),
    alternatives: Array.isArray(row.alternatives)
      ? row.alternatives.map(normalizeAlternative).filter((entry) => entry.contractorId && entry.contractorName)
      : [],
    missingDataWarning: row.missing_data_warning == null ? null : humanizeRecommendationText(row.missing_data_warning),
    factsUsed: Array.isArray(row.facts_used)
      ? row.facts_used.map(humanizeFact).filter(Boolean)
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
