import { supabase } from "../lib/supabase";
import { buildEdgeFunctionFailure } from "./edgeFunctionFailure";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

function normalizeAction(row) {
  return {
    label: String(row?.label || "").trim(),
    actionType: String(row?.action_type || "review").trim().toLowerCase(),
    entityType: String(row?.entity_type || "portfolio").trim().toLowerCase(),
    entityId: row?.entity_id ? String(row.entity_id) : null,
    linkPath: row?.link_path ? String(row.link_path) : null,
  };
}

function normalizeInsight(row) {
  if (!row || typeof row !== "object") return null;

  const priority = String(row.priority || "medium").trim().toLowerCase();
  const confidence = String(row.confidence || "medium").trim().toLowerCase();
  const source = String(row.source || "fallback").trim().toLowerCase();

  return {
    summary: String(row.summary || "").trim(),
    priority: ["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium",
    topReasons: Array.isArray(row.top_reasons)
      ? row.top_reasons.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [],
    suggestedActions: Array.isArray(row.suggested_actions)
      ? row.suggested_actions.map(normalizeAction).filter((entry) => entry.label)
      : [],
    confidence: ["low", "medium", "high"].includes(confidence) ? confidence : "medium",
    source: source === "openai" ? "openai" : "fallback",
    generatedAt: row.generated_at ? String(row.generated_at) : null,
  };
}

export async function getAttentionInsight({ accountId, forceRefresh = false } = {}) {
  if (!accountId) return null;

  const { data, error } = await supabase.functions.invoke("generate-attention-insight", {
    body: {
      accountId,
      forceRefresh,
    },
  });

  if (error) {
    const wrapped = buildEdgeFunctionFailure({
      payload: data,
      status: error?.context?.status || null,
      surface: "generate_attention_insight",
      fallback: error.message || "Could not generate attention insight",
      entityType: "account",
      entityId: accountId,
      accountId,
    });
    logSecurityRelevantFailure("generate_attention_insight", {
      error: wrapped,
      context: {
        accountId,
        forceRefresh,
        surface: "command_center",
      },
    });
    throw wrapped;
  }

  return normalizeInsight(data?.insight);
}

// Epic C2: delegate to relative time utility — shows "4 minutes ago" for
// recent insights, absolute date+time for anything older than 24 hours.
export { formatRelativeTimestamp as formatAttentionInsightTimestamp } from "../utils/relativeTime";

