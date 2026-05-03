import { supabase } from "../lib/supabase";
import { buildEdgeFunctionFailure } from "./edgeFunctionFailure";
import { logSecurityRelevantFailure } from "./securityFailureLogger";

function normalizeInsight(row) {
  if (!row || typeof row !== "object") return null;
  const confidence = String(row.confidence || "medium").trim().toLowerCase();
  const source = String(row.source || "fallback").trim().toLowerCase();

  return {
    headline: String(row.headline || "").trim(),
    wins: Array.isArray(row.wins) ? row.wins.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
    risks: Array.isArray(row.risks) ? row.risks.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
    recommendedFocus: Array.isArray(row.recommended_focus)
      ? row.recommended_focus.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [],
    propertiesToWatch: Array.isArray(row.properties_to_watch)
      ? row.properties_to_watch.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [],
    cashflowNotes: Array.isArray(row.cashflow_notes)
      ? row.cashflow_notes.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [],
    confidence: ["low", "medium", "high"].includes(confidence) ? confidence : "medium",
    source: source === "openai" ? "openai" : "fallback",
    generatedAt: row.generated_at ? String(row.generated_at) : null,
  };
}

export async function getWeeklyPortfolioInsight({ accountId, forceRefresh = false } = {}) {
  if (!accountId) return null;

  const { data, error } = await supabase.functions.invoke("generate-weekly-portfolio-summary", {
    body: {
      accountId,
      forceRefresh,
    },
  });

  if (error) {
    const wrapped = buildEdgeFunctionFailure({
      payload: data,
      status: error?.context?.status || null,
      surface: "generate_weekly_portfolio_summary",
      fallback: error.message || "Could not generate weekly portfolio summary",
      entityType: "account",
      entityId: accountId,
      accountId,
    });
    logSecurityRelevantFailure("generate_weekly_portfolio_summary", {
      error: wrapped,
      context: {
        accountId,
        forceRefresh,
        surface: "portfolio_health",
      },
    });
    throw wrapped;
  }

  return normalizeInsight(data?.insight);
}
