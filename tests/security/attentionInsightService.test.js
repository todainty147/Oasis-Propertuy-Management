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

describe("attention insight service", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("returns a normalized attention insight payload from the Edge Function", async () => {
    invokeMock.mockResolvedValue({
      data: {
        insight: {
          summary: "2 urgent items need attention.",
          priority: "urgent",
          top_reasons: ["Blocked repair • 52h open"],
          suggested_actions: [
            {
              label: "Move blocked repair forward",
              action_type: "assign_contractor",
              entity_type: "work_order",
              entity_id: "work-order-1",
              link_path: "/maintenance-inbox?status=waiting",
            },
          ],
          confidence: "high",
          source: "openai",
          generated_at: "2026-04-25T10:20:00.000Z",
        },
      },
      error: null,
    });

    const { getAttentionInsight } = await import("../../src/services/attentionInsightService.js");
    const result = await getAttentionInsight({ accountId: "account-1" });

    expect(invokeMock).toHaveBeenCalledWith("generate-attention-insight", {
      body: {
        accountId: "account-1",
        forceRefresh: false,
      },
    });
    expect(result).toEqual({
      summary: "2 urgent items need attention.",
      priority: "urgent",
      topReasons: ["Blocked repair • 52h open"],
      suggestedActions: [
        {
          label: "Move blocked repair forward",
          actionType: "assign_contractor",
          entityType: "work_order",
          entityId: "work-order-1",
          linkPath: "/maintenance-inbox?status=waiting",
        },
      ],
      confidence: "high",
      source: "openai",
      generatedAt: "2026-04-25T10:20:00.000Z",
    });
  });

  it("wraps function failures in a client-safe error", async () => {
    invokeMock.mockResolvedValue({
      data: { error: "Feature not available for this account" },
      error: { message: "Edge Function returned a non-2xx status code", context: { status: 403 } },
    });

    const { getAttentionInsight } = await import("../../src/services/attentionInsightService.js");

    await expect(getAttentionInsight({ accountId: "account-1", forceRefresh: true })).rejects.toThrow(
      "Feature not available for this account",
    );
  });
});

