import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const listSecurityObservabilityEventsMock = vi.fn();
const listSecurityAnomalyAlertsMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
  },
}));

vi.mock("../../src/services/securityObservabilityService.js", () => ({
  listSecurityObservabilityEvents: (...args) => listSecurityObservabilityEventsMock(...args),
}));

vi.mock("../../src/services/securityAuditService.js", () => ({
  listSecurityAnomalyAlerts: (...args) => listSecurityAnomalyAlertsMock(...args),
}));

describe("root telemetry service", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    listSecurityObservabilityEventsMock.mockReset();
    listSecurityAnomalyAlertsMock.mockReset();
  });

  it("falls back to the existing anomaly alert path when the root telemetry alert rpc is not deployed yet", async () => {
    listSecurityObservabilityEventsMock.mockResolvedValue([]);
    listSecurityAnomalyAlertsMock.mockResolvedValue({
      rows: [{ id: "alert-1" }],
      total: 3,
    });

    rpcMock.mockImplementation(async (name) => {
      if (name === "security_root_telemetry_active_alerts") {
        return {
          data: null,
          error: {
            code: "PGRST404",
            message: "Could not find the function public.security_root_telemetry_active_alerts",
          },
        };
      }
      return {
        data: null,
        error: {
          code: "PGRST404",
          message: "schema cache miss",
        },
      };
    });

    const { loadRootTelemetryBundle } = await import("../../src/services/rootTelemetryService.js");
    const result = await loadRootTelemetryBundle("account-1", {
      limit: 50,
      windowKey: "1h",
      now: new Date("2026-03-28T12:00:00.000Z"),
    });

    expect(listSecurityAnomalyAlertsMock).toHaveBeenCalledWith("account-1", {
      status: "active",
      page: 1,
      pageSize: 5,
    });
    expect(result.activeAlerts).toEqual([{ id: "alert-1" }]);
    expect(result.activeAlertsTotal).toBe(3);
  });
});
