import { describe, expect, it } from "vitest";

import {
  buildFallbackPropertyHealthInsight,
  buildPropertyHealthSourceHash,
  parsePropertyHealthInsightPayload,
} from "../../supabase/functions/_shared/propertyHealthInsight.ts";

describe("property health insight helper contracts", () => {
  it("builds a stable fallback explainer from property signals", () => {
    const result = buildFallbackPropertyHealthInsight({
      accountId: "account-1",
      generatedAt: "2026-04-25T16:00:00.000Z",
      property: {
        propertyId: "property-1",
        propertyLabel: "147 Goldstein Avenue",
        score: 41,
        category: "high_risk",
        reasons: [{ key: "overdue_rent", penalty: 30, amount: 2500 }],
        signals: {
          overdueRentAmount: 2500,
          openRequestCount: 2,
          activeWorkOrderCount: 1,
          stalledRepairCount: 1,
        },
      },
    });

    expect(result.category).toBe("high_risk");
    expect(result.source).toBe("fallback");
    expect(result.health_explanation).toContain("147 Goldstein Avenue");
    expect(result.risk_drivers[0]).toMatchObject({
      driver: "arrears",
    });
    expect(result.non_ai_facts_used).toContain("Overdue rent: £2,500");
  });

  it("parses and normalizes structured explainer payloads", () => {
    const result = parsePropertyHealthInsightPayload({
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
    });

    expect(result).toMatchObject({
      property_id: "property-1",
      category: "high_risk",
      confidence: "high",
      source: "openai",
    });
    expect(result.risk_drivers[0].driver).toBe("arrears");
  });

  it("changes the source hash when property risk facts change", () => {
    const left = buildPropertyHealthSourceHash({
      accountId: "account-1",
      property: {
        propertyId: "property-1",
        score: 61,
        category: "attention_needed",
        reasons: [],
        signals: { overdueRentAmount: 0, openRequestCount: 1 },
      },
    });
    const right = buildPropertyHealthSourceHash({
      accountId: "account-1",
      property: {
        propertyId: "property-1",
        score: 41,
        category: "high_risk",
        reasons: [],
        signals: { overdueRentAmount: 2500, openRequestCount: 1 },
      },
    });

    expect(left).not.toBe(right);
  });
});
