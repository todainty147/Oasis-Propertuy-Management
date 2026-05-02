import { describe, expect, it } from "vitest";

import {
  buildFallbackWeeklyPortfolioInsight,
  buildWeeklyPortfolioSourceHash,
  parseWeeklyPortfolioInsightPayload,
} from "../../supabase/functions/_shared/weeklyPortfolioInsight.ts";

describe("weekly portfolio insight helper contracts", () => {
  it("builds a stable fallback weekly portfolio briefing", () => {
    const result = buildFallbackWeeklyPortfolioInsight({
      accountId: "account-1",
      generatedAt: "2026-04-25T18:00:00.000Z",
      summary: {
        occupancyRate: 92,
        openRequests: 4,
        waitingOver48h: 1,
        overdueBalance: 2800,
        highRiskPropertyCount: 2,
        averageHealthScore: 63,
        securityAlertCount: 1,
      },
      lowHealthProperties: [
        {
          propertyId: "property-1",
          label: "147 Goldstein Avenue",
          score: 41,
          category: "high_risk",
        },
      ],
    });

    expect(result.source).toBe("fallback");
    expect(result.headline.length).toBeGreaterThan(0);
    expect(result.risks[0]).toContain("Overdue rent");
    expect(result.properties_to_watch[0]).toContain("147 Goldstein Avenue");
  });

  it("parses and normalizes structured weekly summary payloads", () => {
    const result = parseWeeklyPortfolioInsightPayload({
      headline: "Overdue rent is the main portfolio pressure this week.",
      wins: ["Occupancy is holding above 90%."],
      risks: ["Overdue rent remains the main pressure."],
      recommended_focus: ["Review arrears follow-up."],
      properties_to_watch: ["147 Goldstein Avenue (high risk, score 41)"],
      cashflow_notes: ["Overdue balance: 2800."],
      confidence: "high",
      source: "openai",
      generated_at: "2026-04-25T18:00:00.000Z",
    });

    expect(result).toMatchObject({
      headline: "Overdue rent is the main portfolio pressure this week.",
      confidence: "high",
      source: "openai",
    });
    expect(result.properties_to_watch[0]).toContain("147 Goldstein Avenue");
  });

  it("changes the source hash when the weekly summary facts change", () => {
    const left = buildWeeklyPortfolioSourceHash({
      accountId: "account-1",
      summary: {
        occupancyRate: 92,
        openRequests: 4,
        overdueBalance: 1000,
      },
      topAttentionItems: [{ title: "Overdue rent", subtitle: "Flat 1", linkPath: "/finance" }],
      lowHealthProperties: [{ propertyId: "property-1", label: "147 Goldstein Avenue", score: 41, category: "high_risk" }],
    });

    const right = buildWeeklyPortfolioSourceHash({
      accountId: "account-1",
      summary: {
        occupancyRate: 92,
        openRequests: 4,
        overdueBalance: 2800,
      },
      topAttentionItems: [{ title: "Overdue rent", subtitle: "Flat 1", linkPath: "/finance" }],
      lowHealthProperties: [{ propertyId: "property-1", label: "147 Goldstein Avenue", score: 41, category: "high_risk" }],
    });

    expect(left).not.toBe(right);
  });
});
