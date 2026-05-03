import { describe, expect, it } from "vitest";

import {
  buildContractorRecommendationSourceHash,
  buildFallbackContractorRecommendation,
  parseContractorRecommendationPayload,
} from "../../supabase/functions/_shared/contractorRecommendationInsight.ts";

describe("contractor recommendation helper contracts", () => {
  it("builds a stable fallback recommendation from contractor history", () => {
    const result = buildFallbackContractorRecommendation({
      accountId: "account-1",
      requestId: "request-1",
      generatedAt: "2026-04-25T18:00:00.000Z",
      request: {
        id: "request-1",
        title: "Boiler leak",
        description: "Water leaking under the boiler",
        priority: "high",
        propertyId: "property-1",
        propertyLabel: "147 Goldstein Avenue",
      },
      suggestedTrade: "Plumber / heating engineer",
      contractors: [
        { id: "contractor-1", name: "ABC Plumbing", userId: "user-1" },
        { id: "contractor-2", name: "Quick Fix", userId: "user-2" },
      ],
      history: [
        {
          contractorUserId: "user-1",
          contractorName: "ABC Plumbing",
          propertyId: "property-1",
          status: "completed",
          invoiceAmount: 220,
          assignedAt: "2026-04-20T08:00:00.000Z",
          acknowledgedAt: "2026-04-20T10:00:00.000Z",
          rating: 5,
        },
      ],
    });

    expect(result.source).toBe("fallback");
    expect(result.recommended_contractor_id).toBe("contractor-1");
    expect(result.recommended_contractor_name).toContain("ABC Plumbing");
    expect(result.facts_used).toContain("Property: 147 Goldstein Avenue");
  });

  it("parses and normalizes structured recommendation payloads", () => {
    const result = parseContractorRecommendationPayload({
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
    });

    expect(result).toMatchObject({
      request_id: "request-1",
      recommended_contractor_id: "contractor-1",
      confidence: "high",
      source: "openai",
    });
    expect(result.alternatives[0].contractor_id).toBe("contractor-2");
  });

  it("changes the source hash when contractor history changes", () => {
    const left = buildContractorRecommendationSourceHash({
      accountId: "account-1",
      requestId: "request-1",
      request: {
        id: "request-1",
        title: "Boiler leak",
        description: "Water leaking under the boiler",
        priority: "high",
        propertyId: "property-1",
      },
      suggestedTrade: "Plumber / heating engineer",
      contractors: [{ id: "contractor-1", name: "ABC Plumbing", userId: "user-1" }],
      history: [{ contractorUserId: "user-1", status: "completed", invoiceAmount: 200 }],
    });

    const right = buildContractorRecommendationSourceHash({
      accountId: "account-1",
      requestId: "request-1",
      request: {
        id: "request-1",
        title: "Boiler leak",
        description: "Water leaking under the boiler",
        priority: "high",
        propertyId: "property-1",
      },
      suggestedTrade: "Plumber / heating engineer",
      contractors: [{ id: "contractor-1", name: "ABC Plumbing", userId: "user-1" }],
      history: [{ contractorUserId: "user-1", status: "completed", invoiceAmount: 400 }],
    });

    expect(left).not.toBe(right);
  });
});
