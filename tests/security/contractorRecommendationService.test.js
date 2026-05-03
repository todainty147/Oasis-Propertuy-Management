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

describe("contractor recommendation service", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("returns a normalized contractor recommendation payload from the Edge Function", async () => {
    invokeMock.mockResolvedValue({
      data: {
        insight: {
          request_id: "request-1",
          request_title: "Boiler leak",
          recommended_contractor_id: "contractor-1",
          recommended_contractor_name: "ABC Plumbing",
          reason: "Suggested ABC Plumbing because they have similar completed jobs.",
          alternatives: [
            {
              contractor_id: "contractor-2",
              contractor_name: "Quick Fix",
              reason: "Backup option with lighter history.",
            },
          ],
          missing_data_warning: null,
          facts_used: ["Property: 147 Goldstein Avenue"],
          confidence: "high",
          source: "openai",
          generated_at: "2026-04-25T18:00:00.000Z",
        },
      },
      error: null,
    });

    const { getContractorRecommendation } = await import("../../src/services/contractorRecommendationService.js");
    const result = await getContractorRecommendation({ accountId: "account-1", requestId: "request-1" });

    expect(invokeMock).toHaveBeenCalledWith("generate-contractor-recommendation", {
      body: {
        accountId: "account-1",
        requestId: "request-1",
        forceRefresh: false,
      },
    });
    expect(result).toEqual({
      requestId: "request-1",
      requestTitle: "Boiler leak",
      recommendedContractorId: "contractor-1",
      recommendedContractorName: "ABC Plumbing",
      reason: "Suggested ABC Plumbing because they have similar completed jobs.",
      alternatives: [
        {
          contractorId: "contractor-2",
          contractorName: "Quick Fix",
          reason: "Backup option with lighter history.",
        },
      ],
      missingDataWarning: null,
      factsUsed: ["Property: 147 Goldstein Avenue"],
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

    const { getContractorRecommendation } = await import("../../src/services/contractorRecommendationService.js");

    await expect(
      getContractorRecommendation({ accountId: "account-1", requestId: "request-1", forceRefresh: true }),
    ).rejects.toThrow("Feature not available for this account");
  });
});
