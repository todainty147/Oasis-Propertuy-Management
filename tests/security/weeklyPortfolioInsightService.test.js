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

describe("weekly portfolio insight service", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("returns a normalized weekly portfolio insight payload from the Edge Function", async () => {
    invokeMock.mockResolvedValue({
      data: {
        insight: {
          headline: "Overdue rent is the main portfolio pressure this week.",
          wins: ["Occupancy is holding above 90%."],
          risks: ["Overdue rent remains the main pressure."],
          recommended_focus: ["Review arrears follow-up."],
          properties_to_watch: ["147 Goldstein Avenue (high risk, score 41)"],
          cashflow_notes: ["Overdue balance: 2800."],
          confidence: "high",
          source: "openai",
          generated_at: "2026-04-25T18:00:00.000Z",
        },
      },
      error: null,
    });

    const { getWeeklyPortfolioInsight } = await import("../../src/services/weeklyPortfolioInsightService.js");
    const result = await getWeeklyPortfolioInsight({ accountId: "account-1" });

    expect(invokeMock).toHaveBeenCalledWith("generate-weekly-portfolio-summary", {
      body: {
        accountId: "account-1",
        forceRefresh: false,
      },
    });
    expect(result).toEqual({
      headline: "Overdue rent is the main portfolio pressure this week.",
      wins: ["Occupancy is holding above 90%."],
      risks: ["Overdue rent remains the main pressure."],
      recommendedFocus: ["Review arrears follow-up."],
      propertiesToWatch: ["147 Goldstein Avenue (high risk, score 41)"],
      cashflowNotes: ["Overdue balance: 2800."],
      confidence: "high",
      source: "openai",
      generatedAt: "2026-04-25T18:00:00.000Z",
    });
  });

  it("wraps function failures in a client-safe error", async () => {
    invokeMock.mockResolvedValue({
      data: { error: "Feature not available for this account" },
      error: { message: "Edge Function returned a non-2xx status code", context: { status: 403 } },
    });

    const { getWeeklyPortfolioInsight } = await import("../../src/services/weeklyPortfolioInsightService.js");

    await expect(getWeeklyPortfolioInsight({ accountId: "account-1", forceRefresh: true })).rejects.toThrow(
      "Feature not available for this account",
    );
  });
});
