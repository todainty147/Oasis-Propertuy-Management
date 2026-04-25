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

describe("maintenance triage insight service", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("returns a normalized maintenance triage payload from the Edge Function", async () => {
    invokeMock.mockResolvedValue({
      data: {
        insight: {
          request_id: "request-1",
          request_title: "Boiler leaking",
          category: "plumbing_heating",
          urgency: "urgent",
          safety_flag: true,
          suggested_trade: "Plumber / heating engineer",
          tenant_acknowledgement: "Thanks, we have flagged this as a safety-sensitive issue.",
          manager_note: "Suggested category: plumbing heating Suggested urgency: urgent",
          facts_used: ["Property: 147 Goldstein Avenue", "Open linked work orders: 1"],
          confidence: "high",
          source: "openai",
          generated_at: "2026-04-25T18:00:00.000Z",
        },
      },
      error: null,
    });

    const { getMaintenanceTriageInsight } = await import("../../src/services/maintenanceTriageInsightService.js");
    const result = await getMaintenanceTriageInsight({ accountId: "account-1", requestId: "request-1" });

    expect(invokeMock).toHaveBeenCalledWith("generate-maintenance-triage", {
      body: {
        accountId: "account-1",
        requestId: "request-1",
        forceRefresh: false,
      },
    });
    expect(result).toEqual({
      requestId: "request-1",
      requestTitle: "Boiler leaking",
      category: "plumbing_heating",
      urgency: "urgent",
      safetyFlag: true,
      suggestedTrade: "Plumber / heating engineer",
      tenantAcknowledgement: "Thanks, we have flagged this as a safety-sensitive issue.",
      managerNote: "Suggested category: plumbing heating Suggested urgency: urgent",
      factsUsed: ["Property: 147 Goldstein Avenue", "Open linked work orders: 1"],
      confidence: "high",
      source: "openai",
      generatedAt: "2026-04-25T18:00:00.000Z",
    });
  });

  it("wraps function failures in a client-safe error", async () => {
    invokeMock.mockResolvedValue({
      data: { error: "Not permitted" },
      error: { message: "Edge Function returned a non-2xx status code", context: { status: 403 } },
    });

    const { getMaintenanceTriageInsight } = await import("../../src/services/maintenanceTriageInsightService.js");

    await expect(getMaintenanceTriageInsight({ accountId: "account-1", requestId: "request-1", forceRefresh: true })).rejects.toThrow(
      "Not permitted",
    );
  });
});
