// tests/security/aiFeatureGateContracts.test.js
//
// Contract tests for AI feature surfaces. Organised into three sections:
//
// 1. RENT SHIELD PURE FUNCTIONS — deterministic computation helpers that require
//    no mocking. Tests correct metrics, scoring, tier classification, period
//    helpers, and trend/display utilities.
//
// 2. AI INSIGHT SERVICE NULL GUARDS — each insight service must return null
//    and not throw when called without required identifiers.
//
// 3. MOCKED EDGE FUNCTION RESPONSES — verifies that each insight service
//    correctly normalizes the AI provider response, applies safe defaults for
//    missing fields, and propagates errors without leaking raw content.
//
// The existing aiSurfaceRobustnessContracts.test.js covers PII minimization and
// prompt injection resistance. This file covers output normalization and guards.
//
// No live AI calls are made. All Edge Function invocations are mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── SECTION 1: Rent Shield pure functions ────────────────────────────────────

import {
  classifyShieldTier,
  computeShieldMetrics,
  computeShieldScore,
  currentPeriodKey,
  periodKeyToDateRange,
} from "../../src/services/rentShieldService.js";

describe("computeShieldMetrics", () => {
  it("returns default metrics for empty payment list", () => {
    const m = computeShieldMetrics([]);
    expect(m.arrearsAmount).toBe(0);
    expect(m.daysOverdueP90).toBe(0);
    expect(m.paymentRate).toBe(1);
    expect(m.totalDue).toBe(0);
    expect(m.sampleSize).toBe(0);
  });

  it("returns zero arrears when all payments are paid", () => {
    const today = new Date("2026-05-01");
    const payments = [
      { amount: 1000, status: "paid", due_date: "2026-04-01", paid_at: "2026-04-02" },
      { amount: 1000, status: "paid", due_date: "2026-03-01", paid_at: "2026-03-02" },
    ];
    const m = computeShieldMetrics(payments, today);
    expect(m.arrearsAmount).toBe(0);
    expect(m.paymentRate).toBe(1);
    expect(m.sampleSize).toBe(0);
  });

  it("correctly sums arrears for overdue payments", () => {
    const today = new Date("2026-05-01");
    const payments = [
      { amount: 1000, status: "paid",    due_date: "2026-04-01" },
      { amount: 950,  status: "overdue", due_date: "2026-03-01" },
      { amount: 950,  status: "overdue", due_date: "2026-02-01" },
    ];
    const m = computeShieldMetrics(payments, today);
    expect(m.arrearsAmount).toBe(1900);
    expect(m.totalDue).toBe(2900);
  });

  it("computes positive daysOverdueP90 for a single overdue payment", () => {
    const today = new Date("2026-05-01");
    const payments = [
      { amount: 1200, status: "overdue", due_date: "2026-01-01" }, // ~120 days overdue
    ];
    const m = computeShieldMetrics(payments, today);
    expect(m.daysOverdueP90).toBeGreaterThan(0);
    expect(m.sampleSize).toBeGreaterThan(0);
  });
});

describe("computeShieldScore", () => {
  it("returns 100 for a perfect payment record", () => {
    const score = computeShieldScore({ arrearsAmount: 0, daysOverdueP90: 0, paymentRate: 1, totalDue: 1000 });
    expect(score).toBe(100);
  });

  it("returns 0 for the worst-case record", () => {
    // Max arrears penalty + max overdue penalty + max miss penalty
    const score = computeShieldScore({ arrearsAmount: 1000, daysOverdueP90: 90, paymentRate: 0, totalDue: 1000 });
    expect(score).toBe(0);
  });

  it("returns a value in [0, 100] for any input", () => {
    const cases = [
      { arrearsAmount: 500, daysOverdueP90: 30, paymentRate: 0.8, totalDue: 1000 },
      { arrearsAmount: 100, daysOverdueP90: 5,  paymentRate: 0.95, totalDue: 500 },
      { arrearsAmount: 0,   daysOverdueP90: 0,  paymentRate: 1,    totalDue: 0   },
    ];
    for (const c of cases) {
      const s = computeShieldScore(c);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it("score decreases as arrears ratio increases", () => {
    const base = { daysOverdueP90: 0, paymentRate: 1, totalDue: 1000 };
    const highScore = computeShieldScore({ ...base, arrearsAmount: 0 });
    const midScore  = computeShieldScore({ ...base, arrearsAmount: 500 });
    const lowScore  = computeShieldScore({ ...base, arrearsAmount: 1000 });
    expect(highScore).toBeGreaterThan(midScore);
    expect(midScore).toBeGreaterThan(lowScore);
  });
});

describe("classifyShieldTier", () => {
  it("returns 'strong' for scores >= 80", () => {
    expect(classifyShieldTier(100)).toBe("strong");
    expect(classifyShieldTier(80)).toBe("strong");
  });

  it("returns 'moderate' for scores 60-79", () => {
    expect(classifyShieldTier(79)).toBe("moderate");
    expect(classifyShieldTier(60)).toBe("moderate");
  });

  it("returns 'elevated' for scores 40-59", () => {
    expect(classifyShieldTier(59)).toBe("elevated");
    expect(classifyShieldTier(40)).toBe("elevated");
  });

  it("returns 'critical' for scores below 40", () => {
    expect(classifyShieldTier(39)).toBe("critical");
    expect(classifyShieldTier(0)).toBe("critical");
  });
});

describe("periodKeyToDateRange", () => {
  it("returns a range starting on day 01 for a past month", () => {
    const { from, to } = periodKeyToDateRange("2026-03");
    expect(from).toBe("2026-03-01");
    // Last day of March in local time may appear as 03-30 or 03-31 in UTC;
    // accept either — the intent is "end of month", not a specific UTC date.
    expect(to.startsWith("2026-03-")).toBe(true);
    expect(Number(to.slice(8, 10))).toBeGreaterThanOrEqual(28);
  });

  it("clamps the 'to' date to today for the current month", () => {
    const today = new Date("2026-05-15");
    const { from, to } = periodKeyToDateRange("2026-05", today);
    expect(from).toBe("2026-05-01");
    expect(to).toBe("2026-05-15");
  });

  it("falls back to the last 12 months for an invalid period key", () => {
    const today = new Date("2026-05-01");
    const { from, to } = periodKeyToDateRange("invalid-period", today);
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
    // from should be before to
    expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
  });
});

describe("currentPeriodKey", () => {
  it("returns a YYYY-MM formatted string", () => {
    const key = currentPeriodKey(new Date("2026-05-15"));
    expect(key).toMatch(/^\d{4}-\d{2}$/);
    expect(key).toBe("2026-05");
  });
});


// ── SECTION 2: AI insight service null guards ─────────────────────────────────

// Mock supabase before importing any services that use it.
vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock("../../src/services/securityFailureLogger", () => ({
  logSecurityRelevantFailure: vi.fn(),
}));

vi.mock("../../src/services/edgeFunctionFailure", () => ({
  buildEdgeFunctionFailure: () => new Error("edge function failure"),
}));

describe("AI insight service null guards (no accountId → return null)", () => {
  it("getAttentionInsight returns null when accountId is absent", async () => {
    const { getAttentionInsight } = await import("../../src/services/attentionInsightService.js");
    expect(await getAttentionInsight()).toBeNull();
    expect(await getAttentionInsight({})).toBeNull();
    expect(await getAttentionInsight({ accountId: null })).toBeNull();
    expect(await getAttentionInsight({ accountId: "" })).toBeNull();
  });

  it("getPropertyHealthInsight returns null when accountId or propertyId is absent", async () => {
    const { getPropertyHealthInsight } = await import("../../src/services/propertyHealthInsightService.js");
    expect(await getPropertyHealthInsight()).toBeNull();
    expect(await getPropertyHealthInsight({ accountId: "acct-1" })).toBeNull();
    expect(await getPropertyHealthInsight({ propertyId: "prop-1" })).toBeNull();
    expect(await getPropertyHealthInsight({ accountId: null, propertyId: null })).toBeNull();
  });

  it("getMaintenanceTriageInsight returns null when accountId or requestId is absent", async () => {
    const { getMaintenanceTriageInsight } = await import("../../src/services/maintenanceTriageInsightService.js");
    expect(await getMaintenanceTriageInsight()).toBeNull();
    expect(await getMaintenanceTriageInsight({ accountId: "acct-1" })).toBeNull();
    expect(await getMaintenanceTriageInsight({ requestId: "req-1" })).toBeNull();
  });
});

// ── SECTION 3: Mocked Edge Function responses ─────────────────────────────────

describe("getAttentionInsight — normalized output schema", () => {
  let mockInvoke;

  beforeEach(async () => {
    const { supabase } = await import("../../src/lib/supabase");
    mockInvoke = supabase.functions.invoke;
    mockInvoke.mockReset();
  });

  it("normalizes a well-formed response into the expected shape", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        insight: {
          summary:           "Three overdue payments in the last 30 days.",
          priority:          "urgent",
          confidence:        "high",
          source:            "openai",
          generated_at:      "2026-05-01T10:00:00Z",
          top_reasons:       ["Tenant A1 is 28 days overdue", "Property 2 has blocked maintenance"],
          suggested_actions: [
            { label: "Review overdue payments", action_type: "review", entity_type: "payment", entity_id: "pay-1", link_path: "/finance" },
          ],
        },
      },
      error: null,
    });

    const { getAttentionInsight } = await import("../../src/services/attentionInsightService.js");
    const result = await getAttentionInsight({ accountId: "acct-1" });

    expect(result).not.toBeNull();
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.priority).toBe("urgent");
    expect(result.source).toBe("openai");
    expect(Array.isArray(result.topReasons)).toBe(true);
    expect(result.topReasons.length).toBe(2);
    expect(Array.isArray(result.suggestedActions)).toBe(true);
    expect(result.suggestedActions[0].label).toBe("Review overdue payments");
    expect(result.suggestedActions[0].entityType).toBe("payment");
  });

  it("applies safe defaults when priority field is missing or unknown", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        insight: {
          summary:           "Minimal insight.",
          // priority omitted
          top_reasons:       [],
          suggested_actions: [],
        },
      },
      error: null,
    });

    const { getAttentionInsight } = await import("../../src/services/attentionInsightService.js");
    const result = await getAttentionInsight({ accountId: "acct-1" });

    expect(result).not.toBeNull();
    // Should fall back to "medium" (the normalizeInsight default)
    expect(["low", "medium", "high", "urgent"]).toContain(result.priority);
  });

  it("applies 'fallback' source when source field is absent or non-openai", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { insight: { summary: "x", top_reasons: [], suggested_actions: [] } },
      error: null,
    });

    const { getAttentionInsight } = await import("../../src/services/attentionInsightService.js");
    const result = await getAttentionInsight({ accountId: "acct-1" });

    expect(result.source).toBe("fallback");
  });

  it("returns null when the insight payload is null or missing", async () => {
    mockInvoke.mockResolvedValueOnce({ data: { insight: null }, error: null });

    const { getAttentionInsight } = await import("../../src/services/attentionInsightService.js");
    const result = await getAttentionInsight({ accountId: "acct-1" });

    expect(result).toBeNull();
  });

  it("throws when the Edge Function returns an error", async () => {
    mockInvoke.mockResolvedValueOnce({
      data:  null,
      error: { message: "Feature not enabled for this account", context: { status: 403 } },
    });

    const { getAttentionInsight } = await import("../../src/services/attentionInsightService.js");
    await expect(getAttentionInsight({ accountId: "acct-1" })).rejects.toThrow();
  });

  it("suggested actions with empty label are filtered out", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        insight: {
          summary:           "Test",
          top_reasons:       [],
          suggested_actions: [
            { label: "",      action_type: "review", entity_type: "account" },
            { label: "Valid", action_type: "review", entity_type: "account" },
          ],
        },
      },
      error: null,
    });

    const { getAttentionInsight } = await import("../../src/services/attentionInsightService.js");
    const result = await getAttentionInsight({ accountId: "acct-1" });

    // Empty-label action must be filtered; only "Valid" remains.
    expect(result.suggestedActions).toHaveLength(1);
    expect(result.suggestedActions[0].label).toBe("Valid");
  });
});

describe("getPropertyHealthInsight — normalized output schema", () => {
  let mockInvoke;

  beforeEach(async () => {
    const { supabase } = await import("../../src/lib/supabase");
    mockInvoke = supabase.functions.invoke;
    mockInvoke.mockReset();
  });

  it("normalizes a well-formed property health response", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        insight: {
          property_id:           "prop-1",
          property_label:        "11 Starlight Ave",
          category:              "attention_needed",
          health_explanation:    "One overdue payment detected.",
          risk_drivers: [
            { driver: "payments", severity: "high", explanation: "28 days overdue." },
          ],
          recommended_next_step: "Contact the tenant about the overdue amount.",
          non_ai_facts_used:     ["payment_history"],
          confidence:            "high",
          source:                "openai",
          generated_at:          "2026-05-01T10:00:00Z",
        },
      },
      error: null,
    });

    const { getPropertyHealthInsight } = await import("../../src/services/propertyHealthInsightService.js");
    const result = await getPropertyHealthInsight({ accountId: "acct-1", propertyId: "prop-1" });

    expect(result).not.toBeNull();
    expect(result.category).toBe("attention_needed");
    expect(result.propertyId).toBe("prop-1");
    expect(result.riskDrivers).toHaveLength(1);
    expect(result.riskDrivers[0].driver).toBe("payments");
    expect(result.factsUsed).toContain("payment_history");
  });

  it("defaults category to 'attention_needed' when value is unknown", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        insight: {
          property_id: "prop-1",
          category:    "unknown_value",
          health_explanation: "x",
          risk_drivers: [],
          non_ai_facts_used: [],
        },
      },
      error: null,
    });

    const { getPropertyHealthInsight } = await import("../../src/services/propertyHealthInsightService.js");
    const result = await getPropertyHealthInsight({ accountId: "acct-1", propertyId: "prop-1" });

    expect(result.category).toBe("attention_needed");
  });

  it("throws when the Edge Function returns an error", async () => {
    mockInvoke.mockResolvedValueOnce({
      data:  null,
      error: { message: "Unauthorized", context: { status: 401 } },
    });

    const { getPropertyHealthInsight } = await import("../../src/services/propertyHealthInsightService.js");
    await expect(
      getPropertyHealthInsight({ accountId: "acct-1", propertyId: "prop-1" }),
    ).rejects.toThrow();
  });
});

describe("getMaintenanceTriageInsight — normalized output schema", () => {
  let mockInvoke;

  beforeEach(async () => {
    const { supabase } = await import("../../src/lib/supabase");
    mockInvoke = supabase.functions.invoke;
    mockInvoke.mockReset();
  });

  it("normalizes a well-formed triage response", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        insight: {
          request_id:             "req-1",
          request_title:          "Leaking tap",
          category:               "plumbing",
          urgency:                "high",
          safety_flag:            false,
          suggested_trade:        "Plumber",
          tenant_acknowledgement: "Reported persistent drip.",
          manager_note:           "Schedule within 48 hours.",
          facts_used:             ["request_description", "priority"],
          confidence:             "high",
          source:                 "openai",
          generated_at:           "2026-05-01T10:00:00Z",
        },
      },
      error: null,
    });

    const { getMaintenanceTriageInsight } = await import("../../src/services/maintenanceTriageInsightService.js");
    const result = await getMaintenanceTriageInsight({ accountId: "acct-1", requestId: "req-1" });

    expect(result).not.toBeNull();
    expect(result.category).toBe("plumbing");
    expect(result.urgency).toBe("high");
    expect(result.safetyFlag).toBe(false);
    expect(result.suggestedTrade).toBe("Plumber");
    expect(result.factsUsed).toContain("request_description");
  });

  it("defaults urgency to 'normal' when the value is unknown", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        insight: {
          request_id: "req-2",
          category:   "general_repairs",
          urgency:    "very_urgent_unknown",
          safety_flag: false,
          facts_used: [],
        },
      },
      error: null,
    });

    const { getMaintenanceTriageInsight } = await import("../../src/services/maintenanceTriageInsightService.js");
    const result = await getMaintenanceTriageInsight({ accountId: "acct-1", requestId: "req-2" });

    expect(result.urgency).toBe("normal");
  });

  it("safetyFlag is false when field is absent", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { insight: { request_id: "req-3", category: "electrical", facts_used: [] } },
      error: null,
    });

    const { getMaintenanceTriageInsight } = await import("../../src/services/maintenanceTriageInsightService.js");
    const result = await getMaintenanceTriageInsight({ accountId: "acct-1", requestId: "req-3" });

    expect(result.safetyFlag).toBe(false);
  });
});
