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

  it("removes raw contractor and property IDs from user-facing recommendation copy", async () => {
    invokeMock.mockResolvedValue({
      data: {
        insight: {
          request_id: "request-1",
          request_title: "Upload issue",
          recommended_contractor_id: "8d01a721-fd88-49c1-b426-b4e2bacffa41",
          recommended_contractor_name: "8d01a721-fd88-49c1-b426-b4e2bacffa41",
          reason:
            "Although there is one suggested contractor (ID: 8d01a721-fd88-49c1-b426-b4e2bacffa41), this contractor has no prior history or ratings for the property and therefore cannot be confidently recommended.",
          alternatives: [],
          missing_data_warning:
            "No ratings or history is available for contractor 8d01a721-fd88-49c1-b426-b4e2bacffa41 at property 0ba5f752.",
          facts_used: [
            "Suggested contractor list includes contractor 8d01a721-fd88-49c1-b426-b4e2bacffa41 with no history at property 'property:0ba5f752'.",
            "Contractor history shows numerous completed and in-progress jobs with contractor dd2b7939-bbf3-4d64-aa94-89b7273063dc at property 0ba5f752 with ratings of 5.",
          ],
          confidence: "high",
          source: "openai",
          generated_at: "2026-04-25T18:00:00.000Z",
        },
      },
      error: null,
    });

    const { getContractorRecommendation } = await import("../../src/services/contractorRecommendationService.js");
    const result = await getContractorRecommendation({ accountId: "account-1", requestId: "request-1" });
    const visibleCopy = [
      result.recommendedContractorName,
      result.reason,
      result.missingDataWarning,
      ...result.factsUsed,
    ].join(" ");

    expect(result.recommendedContractorName).toBe("");
    expect(result.reason).toContain("this contractor has no prior history or ratings");
    expect(result.factsUsed).toEqual([
      "The suggested contractor has no recorded history at this property yet.",
      "Past completed or in-progress jobs at this property with 5/5 ratings were considered.",
    ]);
    expect(visibleCopy).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(visibleCopy).not.toContain("property:0ba5f752");
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
