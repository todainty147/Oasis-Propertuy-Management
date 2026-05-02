import { describe, expect, it } from "vitest";

import { buildFallbackMaintenanceTriageInsight } from "../../supabase/functions/_shared/maintenanceTriageInsight.ts";

describe("maintenance triage insight helper", () => {
  it("flags risky boiler/electrical wording as urgent safety-sensitive fallback advice", () => {
    const result = buildFallbackMaintenanceTriageInsight({
      accountId: "account-1",
      requestId: "request-1",
      request: {
        id: "request-1",
        title: "Boiler leaking near plug socket",
        description: "There is water near electrics in the kitchen.",
        priority: "normal",
        status: "open",
        waitingReason: null,
        propertyLabel: "147 Goldstein Avenue",
      },
      workOrders: [],
      recentPropertyRequestCount: 2,
    });

    expect(result.category).toBe("plumbing_heating");
    expect(result.urgency).toBe("urgent");
    expect(result.safety_flag).toBe(true);
    expect(result.suggested_trade).toMatch(/Plumber/i);
    expect(result.facts_used).toContain("Property: 147 Goldstein Avenue");
  });
});
