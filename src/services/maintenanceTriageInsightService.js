import { supabase } from "../lib/supabase";
import { buildEdgeFunctionFailure } from "./edgeFunctionFailure";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

function normalizeInsight(row) {
  if (!row || typeof row !== "object") return null;

  const urgency = String(row.urgency || "normal").trim().toLowerCase();
  const confidence = String(row.confidence || "medium").trim().toLowerCase();
  const source = String(row.source || "fallback").trim().toLowerCase();

  return {
    requestId: String(row.request_id || "").trim(),
    requestTitle: String(row.request_title || "").trim(),
    category: String(row.category || "general_repairs").trim(),
    urgency: ["low", "normal", "high", "urgent"].includes(urgency) ? urgency : "normal",
    safetyFlag: row.safety_flag === true,
    suggestedTrade: String(row.suggested_trade || "").trim(),
    tenantAcknowledgement: String(row.tenant_acknowledgement || "").trim(),
    managerNote: String(row.manager_note || "").trim(),
    factsUsed: Array.isArray(row.facts_used)
      ? row.facts_used.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [],
    confidence: ["low", "medium", "high"].includes(confidence) ? confidence : "medium",
    source: source === "openai" ? "openai" : "fallback",
    generatedAt: row.generated_at ? String(row.generated_at) : null,
  };
}

export async function getMaintenanceTriageInsight({ accountId, requestId, forceRefresh = false } = {}) {
  if (!accountId || !requestId) return null;

  const { data, error } = await supabase.functions.invoke("generate-maintenance-triage", {
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
      surface: "generate_maintenance_triage",
      fallback: error.message || "Could not generate maintenance triage suggestion",
      entityType: "maintenance_request",
      entityId: requestId,
      accountId,
    });
    logSecurityRelevantFailure("generate_maintenance_triage", {
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
