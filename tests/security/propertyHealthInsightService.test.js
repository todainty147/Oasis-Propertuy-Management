import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    functions: {
      invoke: (...args) => invokeMock(...args),
    },
  },
}));

vi.mock("../../src/services/securityFailureLogger.js", () => ({
  logSecurityRelevantFailure: vi.fn(),
}));

describe("property health insight service", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("returns a normalized property health explainer payload from the Edge Function", async () => {
    invokeMock.mockResolvedValue({
      data: {
        insight: {
          property_id: "property-1",
          property_label: "147 Goldstein Avenue",
          category: "high_risk",
          health_explanation: "This property is under pressure because arrears and stalled repairs are both active.",
          risk_drivers: [
            {
              driver: "arrears",
              severity: "high",
              explanation: "Overdue rent is still outstanding.",
            },
          ],
          recommended_next_step: "Review arrears follow-up and the oldest repair.",
          non_ai_facts_used: ["Overdue rent: £2,500"],
          confidence: "high",
          source: "openai",
          generated_at: "2026-04-25T16:00:00.000Z",
        },
      },
      error: null,
    });

    const { getPropertyHealthInsight } = await import("../../src/services/propertyHealthInsightService.js");
    const result = await getPropertyHealthInsight({ accountId: "account-1", propertyId: "property-1" });

    expect(invokeMock).toHaveBeenCalledWith("generate-property-health-explainer", {
      body: {
        accountId: "account-1",
        propertyId: "property-1",
        forceRefresh: false,
      },
    });
    expect(result).toEqual({
      propertyId: "property-1",
      propertyLabel: "147 Goldstein Avenue",
      category: "high_risk",
      healthExplanation: "This property is under pressure because arrears and stalled repairs are both active.",
      riskDrivers: [
        {
          driver: "arrears",
          severity: "high",
          explanation: "Overdue rent is still outstanding.",
        },
      ],
      recommendedNextStep: "Review arrears follow-up and the oldest repair.",
      factsUsed: ["Overdue rent: £2,500"],
      confidence: "high",
      source: "openai",
      generatedAt: "2026-04-25T16:00:00.000Z",
    });
  });

  it("wraps function failures in a client-safe error", async () => {
    invokeMock.mockResolvedValue({
      data: { error: "Feature not available for this account" },
      error: { message: "Edge Function returned a non-2xx status code", context: { status: 403 } },
    });

    const { getPropertyHealthInsight } = await import("../../src/services/propertyHealthInsightService.js");

    await expect(getPropertyHealthInsight({ accountId: "account-1", propertyId: "property-1", forceRefresh: true })).rejects.toThrow(
      "Feature not available for this account",
    );
  });
});
