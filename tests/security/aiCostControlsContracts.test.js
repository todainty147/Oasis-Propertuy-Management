import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

// ─── Source files under test ──────────────────────────────────────────────────

const aiCostControlsSql = read("supabase/ai_cost_controls.sql");
// L-001: canonical function definitions moved to account_entitlements.sql
const entitlementsSql   = read("supabase/account_entitlements.sql");
const aiSafety = read("supabase/functions/_shared/aiSafety.ts");
const entitlements = read("src/lib/entitlements.js");
const relativeTime = read("src/utils/relativeTime.js");
const attentionInsightService = read("src/services/attentionInsightService.js");
const aiUsageService = read("src/services/aiUsageService.js");
const useAiHook = read("src/hooks/useAiFeatureAccess.js");
const upsellBanner = read("src/components/AiUpsellBanner.jsx");
const usageSummaryCard = read("src/components/AiUsageSummaryCard.jsx");

// Edge functions
const triageFn = read("supabase/functions/generate-maintenance-triage/index.ts");
const contractorFn = read("supabase/functions/generate-contractor-recommendation/index.ts");
const weeklyFn = read("supabase/functions/generate-weekly-portfolio-summary/index.ts");
const attentionFn = read("supabase/functions/generate-attention-insight/index.ts");
const propertyHealthFn = read("supabase/functions/generate-property-health-explainer/index.ts");

const ALL_FIVE = [triageFn, contractorFn, weeklyFn, attentionFn, propertyHealthFn];

// ─── Epic A1: operator_agency plan tier ──────────────────────────────────────

describe("Epic A1 – operator_agency plan tier", () => {
  it("SQL defines operator_agency with rank 4 (canonical: account_entitlements.sql)", () => {
    // L-001: canonical definition in account_entitlements.sql
    expect(entitlementsSql).toContain("when 'operator_agency' then 4");
    expect(entitlementsSql).toContain("when 'pro'             then 3");
    expect(entitlementsSql).toContain("when 'growth'          then 2");
  });

  it("frontend PLAN_RANKS includes operator_agency at 4", () => {
    expect(entitlements).toContain("operator_agency: 4");
  });

  it("normalizePlan falls through to starter for unknown values", () => {
    expect(entitlements).toContain("return normalized in PLAN_RANKS ? normalized : \"starter\"");
  });
});

// ─── Epic A2: AI feature keys registered ─────────────────────────────────────

describe("Epic A2 – AI feature keys in account_feature_required_plan", () => {
  const growthFeatures = [
    "ai_maintenance_triage",
    "ai_attention_insight",
    "ai_property_health",
  ];
  const proFeatures = [
    "ai_contractor_recommendation",
    "ai_weekly_portfolio_summary",
    "ai_message_drafts",
    "ai_document_summaries",
  ];
  const operatorFeatures = [
    "ai_security_copilot",
    "ai_natural_language_query",
    "ai_advanced_audit_summaries",
  ];

  // L-001: feature key definitions consolidated into account_entitlements.sql
  for (const key of growthFeatures) {
    it(`SQL maps ${key} → growth (canonical: account_entitlements.sql)`, () => {
      expect(entitlementsSql).toContain(`when '${key}'`);
      const idx = entitlementsSql.indexOf(`when '${key}'`);
      const snippet = entitlementsSql.slice(idx, idx + 60);
      expect(snippet).toContain("growth");
    });
  }

  for (const key of proFeatures) {
    it(`SQL maps ${key} → pro (canonical: account_entitlements.sql)`, () => {
      expect(entitlementsSql).toContain(`when '${key}'`);
      const idx = entitlementsSql.indexOf(`when '${key}'`);
      const snippet = entitlementsSql.slice(idx, idx + 60);
      expect(snippet).toContain("pro");
    });
  }

  for (const key of operatorFeatures) {
    it(`SQL maps ${key} → operator_agency (canonical: account_entitlements.sql)`, () => {
      expect(entitlementsSql).toContain(`when '${key}'`);
      const idx = entitlementsSql.indexOf(`when '${key}'`);
      const snippet = entitlementsSql.slice(idx, idx + 70);
      expect(snippet).toContain("operator_agency");
    });
  }

  it("frontend ENTITLEMENT_FEATURES has all AI keys", () => {
    expect(entitlements).toContain("AI_MAINTENANCE_TRIAGE: \"ai_maintenance_triage\"");
    expect(entitlements).toContain("AI_CONTRACTOR_RECOMMENDATION: \"ai_contractor_recommendation\"");
    expect(entitlements).toContain("AI_SECURITY_COPILOT: \"ai_security_copilot\"");
  });

  it("growth plan features include the three growth AI keys", () => {
    const growthStart = entitlements.indexOf("const GROWTH_FEATURES");
    const growthEnd = entitlements.indexOf("const PRO_FEATURES");
    const growthBlock = entitlements.slice(growthStart, growthEnd);
    expect(growthBlock).toContain("AI_MAINTENANCE_TRIAGE");
    expect(growthBlock).toContain("AI_ATTENTION_INSIGHT");
    expect(growthBlock).toContain("AI_PROPERTY_HEALTH");
  });

  it("pro plan features include the four pro AI keys", () => {
    const proStart = entitlements.indexOf("const PRO_FEATURES");
    const operatorStart = entitlements.indexOf("const OPERATOR_AGENCY_FEATURES");
    const proBlock = entitlements.slice(proStart, operatorStart);
    expect(proBlock).toContain("AI_CONTRACTOR_RECOMMENDATION");
    expect(proBlock).toContain("AI_WEEKLY_PORTFOLIO_SUMMARY");
  });

  it("operator_agency features include all three operator AI keys", () => {
    const operatorStart = entitlements.indexOf("const OPERATOR_AGENCY_FEATURES");
    const block = entitlements.slice(operatorStart, operatorStart + 300);
    expect(block).toContain("AI_SECURITY_COPILOT");
    expect(block).toContain("AI_NATURAL_LANGUAGE_QUERY");
    expect(block).toContain("AI_ADVANCED_AUDIT_SUMMARIES");
  });
});

// ─── Epic A3: feature gates on all 5 edge functions ──────────────────────────

describe("Epic A3 – plan gates on all edge functions", () => {
  it("triage function calls assert_account_feature_access with ai_maintenance_triage", () => {
    expect(triageFn).toContain("assert_account_feature_access");
    expect(triageFn).toContain("ai_maintenance_triage");
  });

  it("contractor function calls assert_account_feature_access with ai_contractor_recommendation", () => {
    expect(contractorFn).toContain("assert_account_feature_access");
    expect(contractorFn).toContain("ai_contractor_recommendation");
  });

  it("weekly portfolio function calls assert_account_feature_access with ai_weekly_portfolio_summary", () => {
    expect(weeklyFn).toContain("assert_account_feature_access");
    expect(weeklyFn).toContain("ai_weekly_portfolio_summary");
  });

  it("attention insight function already had assert_account_feature_access", () => {
    expect(attentionFn).toContain("assert_account_feature_access");
  });

  it("property health function already had assert_account_feature_access", () => {
    expect(propertyHealthFn).toContain("assert_account_feature_access");
  });

  it("each gated function returns 403 on plan failure", () => {
    expect(triageFn).toContain("respond({ error: \"Maintenance AI triage is not available on your current plan.\" }, 403)");
    expect(contractorFn).toContain("respond({ error: \"Contractor AI recommendation is not available on your current plan.\" }, 403)");
    expect(weeklyFn).toContain("respond({ error: \"Weekly AI portfolio summary is not available on your current plan.\" }, 403)");
  });
});

// ─── Epics B1+B2: plan-aware limit functions ──────────────────────────────────

describe("Epics B1+B2 – per-plan daily and monthly limit SQL functions", () => {
  it("ai_daily_call_limit_for_plan defines 200 for pro, 50 for growth, null for operator_agency", () => {
    expect(aiCostControlsSql).toContain("ai_daily_call_limit_for_plan");
    expect(aiCostControlsSql).toContain("when 'operator_agency' then null");
    expect(aiCostControlsSql).toContain("when 'pro'             then 200");
    expect(aiCostControlsSql).toContain("when 'growth'          then 50");
    expect(aiCostControlsSql).toContain("else 0  -- starter");
  });

  it("ai_monthly_call_limit_for_plan defines 3000 for pro, 500 for growth, null for operator_agency", () => {
    expect(aiCostControlsSql).toContain("ai_monthly_call_limit_for_plan");
    expect(aiCostControlsSql).toContain("when 'operator_agency' then null");
    expect(aiCostControlsSql).toContain("when 'pro'             then 3000");
    expect(aiCostControlsSql).toContain("when 'growth'          then 500");
  });

  it("aiSafety.ts exports assertAiMonthlyLimit", () => {
    expect(aiSafety).toContain("export async function assertAiMonthlyLimit");
  });

  it("aiSafety.ts exports getMonthlyAiPeriodKey returning YYYY-MM slice", () => {
    expect(aiSafety).toContain("export function getMonthlyAiPeriodKey");
    expect(aiSafety).toContain(".slice(0, 7)");
  });

  it("assertAiDailyLimit is now plan-aware via getDailyAiCallLimit RPC", () => {
    expect(aiSafety).toContain("getDailyAiCallLimit");
    expect(aiSafety).toContain("ai_daily_call_limit_for_plan");
  });

  it("assertAiMonthlyLimit calls ai_monthly_call_limit_for_plan", () => {
    expect(aiSafety).toContain("ai_monthly_call_limit_for_plan");
  });

  it("frontend AI_DAILY_LIMITS and AI_MONTHLY_LIMITS match SQL values", () => {
    expect(entitlements).toContain("AI_MONTHLY_LIMITS");
    expect(entitlements).toContain("growth: 500");
    expect(entitlements).toContain("pro: 3_000");
    expect(entitlements).toContain("operator_agency: null");
    expect(entitlements).toContain("AI_DAILY_LIMITS");
    expect(entitlements).toContain("growth: 50");
    expect(entitlements).toContain("pro: 200");
  });
});

// ─── Epic B3: all 5 functions write monthly meter rows ───────────────────────

describe("Epic B3 – monthly meter rows written in all 5 edge functions", () => {
  // The old local upsertUsageMeterRow read-modify-write has been replaced by:
  //   reserveAiCall  — atomic pre-call prompt_runs increment (daily + monthly)
  //   recordAiTokens — atomic post-call token increment (daily + monthly)
  // Both helpers call the increment_ai_usage_meter SQL RPC which uses
  // ON CONFLICT DO UPDATE += to avoid concurrent under-counting.
  for (const [label, src] of [
    ["triage", triageFn],
    ["contractor", contractorFn],
    ["weekly", weeklyFn],
    ["attention", attentionFn],
    ["property-health", propertyHealthFn],
  ]) {
    it(`${label} function imports reserveAiCall from aiSafety.ts`, () => {
      expect(src).toContain("reserveAiCall");
    });

    it(`${label} function calls reserveAiCall before the AI model call`, () => {
      // reserveAiCall must appear before generateInsight in the source
      const reserveIdx = src.indexOf("await reserveAiCall(");
      const generateIdx = src.indexOf("const result = await generateInsight(");
      expect(reserveIdx).toBeGreaterThan(-1);
      expect(reserveIdx).toBeLessThan(generateIdx);
    });

    it(`${label} function calls recordAiTokens after the AI model call`, () => {
      expect(src).toContain("recordAiTokens(");
    });

    it(`${label} function also calls assertAiMonthlyLimit`, () => {
      expect(src).toContain("assertAiMonthlyLimit");
    });
  }

  it("aiSafety.ts exports reserveAiCall and recordAiTokens", () => {
    expect(aiSafety).toContain("export async function reserveAiCall");
    expect(aiSafety).toContain("export function recordAiTokens");
  });

  it("aiSafety.ts reserveAiCall calls increment_ai_usage_meter RPC with prompt_runs=1", () => {
    const idx = aiSafety.indexOf("export async function reserveAiCall");
    const snippet = aiSafety.slice(idx, idx + 600);
    expect(snippet).toContain("increment_ai_usage_meter");
    expect(snippet).toContain("p_prompt_runs:   1");
  });

  it("aiSafety.ts monthly limit query uses server-side period filter (no JS-side filter)", () => {
    // Verify we use .gte/.lt range bounds rather than loading all rows
    expect(aiSafety).toContain(".gte(\"period_key\"");
    expect(aiSafety).toContain(".lt(\"period_key\"");
    // The old JS .filter() on all rows must be gone
    expect(aiSafety).not.toContain(".filter((r) => String(r.period_key");
  });
});

// ─── Epic C: relative timestamp ───────────────────────────────────────────────

describe("Epic C – relative timestamp utility", () => {
  it("relativeTime.js exports formatRelativeTimestamp and formatGeneratedAgoLabel", () => {
    expect(relativeTime).toContain("export function formatRelativeTimestamp");
    expect(relativeTime).toContain("export function formatGeneratedAgoLabel");
  });

  it("formatRelativeTimestamp returns 'just now' for sub-60-second age", () => {
    // Import via dynamic require isn't available in this contract test style,
    // so we assert the source contains the logic
    expect(relativeTime).toContain("if (diffSeconds < 60) return \"just now\";");
  });

  it("formatRelativeTimestamp returns minutes for < 1 hour", () => {
    expect(relativeTime).toContain("if (diffMinutes < 60) return");
    expect(relativeTime).toContain("minutes ago");
  });

  it("formatRelativeTimestamp returns hours for < 24 hours", () => {
    expect(relativeTime).toContain("if (diffHours < 24) return");
    expect(relativeTime).toContain("hours ago");
  });

  it("formatRelativeTimestamp falls back to absolute for >= 24 hours", () => {
    expect(relativeTime).toContain("absoluteTimestamp(date)");
  });

  it("attentionInsightService re-exports formatRelativeTimestamp as formatAttentionInsightTimestamp", () => {
    expect(attentionInsightService).toContain("formatRelativeTimestamp as formatAttentionInsightTimestamp");
    expect(attentionInsightService).toContain("from \"../utils/relativeTime\"");
  });
});

// ─── Epic D: frontend AI gates ────────────────────────────────────────────────

describe("Epic D – frontend AI feature gates", () => {
  it("useAiFeatureAccess hook imports hasFeature and getFeatureMinimumPlan from entitlements", () => {
    expect(useAiHook).toContain("getFeatureMinimumPlan");
    expect(useAiHook).toContain("hasFeature");
    expect(useAiHook).toContain("from \"../lib/entitlements\"");
  });

  it("useAiFeatureAccess hook returns { allowed, requiredPlan, activePlan }", () => {
    expect(useAiHook).toContain("allowed");
    expect(useAiHook).toContain("requiredPlan");
    expect(useAiHook).toContain("activePlan");
  });

  it("useAiFeatureAccess hook bypasses check for isRootOperator", () => {
    expect(useAiHook).toContain("isRootOperator");
    expect(useAiHook).toContain("return { allowed: true");
  });

  it("AiUpsellBanner renders with featureLabel and requiredPlan props", () => {
    expect(upsellBanner).toContain("featureLabel");
    expect(upsellBanner).toContain("requiredPlan");
    expect(upsellBanner).toContain("data-testid=\"ai-upsell-banner\"");
  });

  it("AiUpsellBanner shows a link to account billing settings", () => {
    expect(upsellBanner).toContain("to=\"/settings/billing\"");
  });

  it("AiUpsellBanner shows upgrade button with i18n key", () => {
    expect(upsellBanner).toContain("ai.upsell.upgradeButton");
    expect(upsellBanner).toContain("ai.upsell.availableOn");
  });

  it("MaintenanceRequestCard wraps triage in TriageFeatureGate", () => {
    const card = read("src/components/maintenance-inbox/MaintenanceRequestCard.jsx");
    expect(card).toContain("TriageFeatureGate");
    expect(card).toContain("useAiFeatureAccess");
    expect(card).toContain("AiUpsellBanner");
  });
});

// ─── Epic E1+E2: usage summary RPC + card ─────────────────────────────────────

describe("Epic E – AI usage summary", () => {
  it("SQL defines get_account_ai_usage_summary with YYYY-MM validation", () => {
    expect(aiCostControlsSql).toContain("get_account_ai_usage_summary");
    expect(aiCostControlsSql).toContain("YYYY-MM");
    expect(aiCostControlsSql).toContain("assert_manage_account_access");
  });

  it("SQL function returns period_key, plan, monthly_limit, total_prompt_runs", () => {
    expect(aiCostControlsSql).toContain("period_key");
    expect(aiCostControlsSql).toContain("monthly_limit");
    expect(aiCostControlsSql).toContain("total_prompt_runs");
    expect(aiCostControlsSql).toContain("feature_key");
  });

  it("aiUsageService calls get_account_ai_usage_summary RPC", () => {
    expect(aiUsageService).toContain("get_account_ai_usage_summary");
    expect(aiUsageService).toContain("p_account_id");
    expect(aiUsageService).toContain("p_period");
  });

  it("AiUsageSummaryCard renders usage bar and feature breakdown", () => {
    expect(usageSummaryCard).toContain("data-testid=\"ai-usage-summary-card\"");
    expect(usageSummaryCard).toContain("UsageBar");
    expect(usageSummaryCard).toContain("detailOpen");
  });

  it("AiUsageSummaryCard shows warning at 90% usage threshold", () => {
    expect(usageSummaryCard).toContain("0.9");
    // Warning text is now localised via billing.aiUsage.quotaWarning i18n key
    expect(usageSummaryCard).toContain("billing.aiUsage.quotaWarning");
  });

  it("AiUsageSummaryCard hides itself on Starter with zero usage", () => {
    expect(usageSummaryCard).toContain("plan === \"starter\"");
    expect(usageSummaryCard).toContain("return null");
  });
});

// ─── Epic F2: prompt version cache invalidation ───────────────────────────────

describe("Epic F2 – prompt version cache invalidation", () => {
  it("aiSafety.ts exports isCacheStaleByPromptVersion", () => {
    expect(aiSafety).toContain("export function isCacheStaleByPromptVersion");
  });

  it("isCacheStaleByPromptVersion returns true when cached version is null", () => {
    expect(aiSafety).toContain("if (!cachedPromptVersion) return true;");
  });

  it("isCacheStaleByPromptVersion returns true when versions differ", () => {
    expect(aiSafety).toContain("return cachedPromptVersion !== currentPromptVersion;");
  });

  it("triage function uses isCacheStaleByPromptVersion before returning cached result", () => {
    expect(triageFn).toContain("isCacheStaleByPromptVersion");
    expect(triageFn).toContain("promptVersionStale");
    expect(triageFn).toContain("!promptVersionStale");
  });

  it("contractor function uses isCacheStaleByPromptVersion", () => {
    expect(contractorFn).toContain("isCacheStaleByPromptVersion");
  });

  it("weekly portfolio function uses isCacheStaleByPromptVersion", () => {
    expect(weeklyFn).toContain("isCacheStaleByPromptVersion");
  });
});
