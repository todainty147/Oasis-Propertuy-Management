import { supabase } from "../lib/supabase";

/**
 * Epic E1 — fetches the AI usage summary for an account in a given month.
 * @param {string} accountId
 * @param {string} [period]  YYYY-MM, defaults to current month
 */
export async function getAccountAiUsageSummary(accountId, period) {
  if (!accountId) throw new Error("Missing accountId");

  const resolvedPeriod =
    period || new Date().toISOString().slice(0, 7); // YYYY-MM

  const { data, error } = await supabase.rpc("get_account_ai_usage_summary", {
    p_account_id: accountId,
    p_period: resolvedPeriod,
  });

  if (error) throw new Error(error.message || "Failed to load AI usage summary");

  if (!Array.isArray(data) || data.length === 0) {
    return {
      period: resolvedPeriod,
      plan: "starter",
      monthlyLimit: null,
      totalPromptRuns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalEstimatedCost: 0,
      features: [],
    };
  }

  const first = data[0];
  return {
    period: String(first.period_key || resolvedPeriod),
    plan: String(first.plan || "starter"),
    monthlyLimit: first.monthly_limit != null ? Number(first.monthly_limit) : null,
    totalPromptRuns: Number(first.total_prompt_runs || 0),
    totalInputTokens: Number(first.total_input_tokens || 0),
    totalOutputTokens: Number(first.total_output_tokens || 0),
    totalEstimatedCost: Number(first.total_estimated_cost || 0),
    features: data.map((row) => ({
      featureKey: String(row.feature_key || ""),
      promptRuns: Number(row.feature_prompt_runs || 0),
      inputTokens: Number(row.feature_input_tokens || 0),
      outputTokens: Number(row.feature_output_tokens || 0),
      estimatedCost: Number(row.feature_cost || 0),
    })),
  };
}
