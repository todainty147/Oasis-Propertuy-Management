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

  // After the get_account_ai_usage_summary SQL fix, the RPC always returns at
  // least one row (with null feature_key) even for zero-usage months, so this
  // branch should only be hit if the migration hasn't been applied yet.
  // Fall back to a real plan lookup rather than assuming "starter", which would
  // incorrectly hide the usage card for paid accounts with no calls this month.
  if (!Array.isArray(data) || data.length === 0) {
    let plan = "starter";
    let monthlyLimit = null;
    try {
      const planRes = await supabase.rpc("account_subscription_plan", { p_account_id: accountId });
      plan = String(planRes.data || "starter");
      const limitRes = await supabase.rpc("ai_monthly_call_limit_for_plan", { p_plan: plan });
      monthlyLimit = limitRes.data === null ? null : Number(limitRes.data ?? 0);
    } catch {
      // keep defaults — better to show a potentially wrong card than crash
    }
    return {
      period: resolvedPeriod,
      plan,
      monthlyLimit,
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
    // filter out the sentinel null-feature row emitted for zero-usage months
    features: data
      .filter((row) => row.feature_key != null)
      .map((row) => ({
        featureKey: String(row.feature_key),
        promptRuns: Number(row.feature_prompt_runs || 0),
        inputTokens: Number(row.feature_input_tokens || 0),
        outputTokens: Number(row.feature_output_tokens || 0),
        estimatedCost: Number(row.feature_cost || 0),
      })),
  };
}
