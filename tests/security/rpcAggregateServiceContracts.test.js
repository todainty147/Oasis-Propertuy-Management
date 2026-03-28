import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const getDashboardSnapshotMock = vi.fn();
const listPropertyOperationalHealthScoresMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
  },
}));

vi.mock("../../src/services/dashboardService.js", () => ({
  getDashboardSnapshot: (...args) => getDashboardSnapshotMock(...args),
}));

vi.mock("../../src/services/propertyHealthScoreService.js", () => ({
  listPropertyOperationalHealthScores: (...args) => listPropertyOperationalHealthScoresMock(...args),
}));

describe("aggregate RPC service contracts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getDashboardSnapshotMock.mockReset();
    listPropertyOperationalHealthScoresMock.mockReset();
    getDashboardSnapshotMock.mockResolvedValue({ overdue_amount: 1234.56 });
    listPropertyOperationalHealthScoresMock.mockResolvedValue([]);
  });

  it("returns parsed and enriched attention-center items", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          item_key: "alert-1",
          item_type: "notification_alert",
          bucket: "urgent",
          title: "Alert",
          body: "Body",
          property_label: "11 Starlight Avenue",
          property_id: "property-1",
          link_path: "/properties/property-1",
          source_table: "notifications",
          created_at: "2026-03-24T12:00:00Z",
        },
      ],
      error: null,
    });

    const { getAttentionCenterData } = await import("../../src/services/attentionCenterService.js");
    const result = await getAttentionCenterData("account-1");

    expect(result.summary.overdueAmount).toBe(1234.56);
    expect(result.items).toEqual([
      expect.objectContaining({
        id: "alert-1",
        kind: "notification_alert",
        title: "Alert",
        propertyId: "property-1",
        category: "general",
        severity: "urgent",
        entityType: "property",
        entityId: "property-1",
      }),
    ]);
  });

  it("returns parsed security observability event rows", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          id: "evt-1",
          account_id: "account-1",
          actor_role: "owner",
          category: "authorization",
          kind: "guard_failure",
          surface: "documents",
          reason: "account_role_required",
          outcome: "denied",
          code: "42501",
          guard_denied: "true",
          entity_type: "document",
          entity_id: "doc-1",
          correlation_id: "corr-1",
          source: "security_denied_events",
          metadata: { request_id: "req-1" },
          created_at: "2026-03-24T12:30:00Z",
        },
      ],
      error: null,
    });

    const { listSecurityObservabilityEvents } = await import(
      "../../src/services/securityObservabilityService.js"
    );
    const result = await listSecurityObservabilityEvents("account-1");

    expect(result).toEqual([
      {
        id: "evt-1",
        account_id: "account-1",
        actor_user_id: null,
        actor_role: "owner",
        category: "authorization",
        kind: "guard_failure",
        surface: "documents",
        reason: "account_role_required",
        outcome: "denied",
        code: "42501",
        guard_denied: true,
        entity_type: "document",
        entity_id: "doc-1",
        correlation_id: "corr-1",
        source: "security_denied_events",
        metadata: { request_id: "req-1" },
        created_at: "2026-03-24T12:30:00Z",
      },
    ]);
  });
});
