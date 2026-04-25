import { supabase } from "../lib/supabase";
import { buildEdgeFunctionFailure } from "./edgeFunctionFailure";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

function normalizeDriver(row) {
  return {
    driver: String(row?.driver || "maintenance").trim().toLowerCase(),
    severity: String(row?.severity || "medium").trim().toLowerCase(),
    explanation: String(row?.explanation || "").trim(),
  };
}

function normalizeInsight(row) {
  if (!row || typeof row !== "object") return null;
  const category = String(row.category || "attention_needed").trim().toLowerCase();
  const confidence = String(row.confidence || "medium").trim().toLowerCase();
  const source = String(row.source || "fallback").trim().toLowerCase();

  return {
    propertyId: row.property_id ? String(row.property_id) : null,
    propertyLabel: String(row.property_label || "").trim(),
    category: ["healthy", "attention_needed", "high_risk"].includes(category) ? category : "attention_needed",
    healthExplanation: String(row.health_explanation || "").trim(),
    riskDrivers: Array.isArray(row.risk_drivers)
      ? row.risk_drivers.map(normalizeDriver).filter((entry) => entry.explanation)
      : [],
    recommendedNextStep: String(row.recommended_next_step || "").trim(),
    factsUsed: Array.isArray(row.non_ai_facts_used)
      ? row.non_ai_facts_used.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [],
    confidence: ["low", "medium", "high"].includes(confidence) ? confidence : "medium",
    source: source === "openai" ? "openai" : "fallback",
    generatedAt: row.generated_at ? String(row.generated_at) : null,
  };
}

export async function getPropertyHealthInsight({ accountId, propertyId, forceRefresh = false } = {}) {
  if (!accountId || !propertyId) return null;

  const { data, error } = await supabase.functions.invoke("generate-property-health-explainer", {
    body: {
      accountId,
      propertyId,
      forceRefresh,
    },
  });

  if (error) {
    const wrapped = buildEdgeFunctionFailure({
      payload: data,
      status: error?.context?.status || null,
      surface: "generate_property_health_explainer",
      fallback: error.message || "Could not generate property health explainer",
      entityType: "property",
      entityId: propertyId,
      accountId,
    });
    logSecurityRelevantFailure("generate_property_health_explainer", {
      error: wrapped,
      context: {
        accountId,
        propertyId,
        forceRefresh,
        surface: "portfolio_health",
      },
    });
    throw wrapped;
  }

  return normalizeInsight(data?.insight);
}
