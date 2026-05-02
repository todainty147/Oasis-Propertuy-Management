import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();
const getDashboardSnapshotMock = vi.fn();
const listPropertyOperationalHealthScoresMock = vi.fn();
const summarizePropertyOperationalHealthMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

vi.mock("../../src/services/dashboardService.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
  getDashboardSnapshot: (...args) => getDashboardSnapshotMock(...args),
  };
});

vi.mock("../../src/services/propertyHealthScoreService.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listPropertyOperationalHealthScores: (...args) => listPropertyOperationalHealthScoresMock(...args),
    summarizePropertyOperationalHealth: (...args) => summarizePropertyOperationalHealthMock(...args),
  };
});

function createThenableQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };

  return query;
}

describe("aggregate RPC service contracts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
    getDashboardSnapshotMock.mockReset();
    listPropertyOperationalHealthScoresMock.mockReset();
    summarizePropertyOperationalHealthMock.mockReset();
    getDashboardSnapshotMock.mockResolvedValue({ overdue_amount: 1234.56 });
    listPropertyOperationalHealthScoresMock.mockResolvedValue([]);
    summarizePropertyOperationalHealthMock.mockReturnValue({ averageScore: 75, highRiskCount: 1 });
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

  it("returns parsed weekly portfolio summary rows", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          occupancy_rate: "95",
          open_requests: "3",
          waiting_over_48h: "1",
          overdue_balance: "1234.56",
        },
      ],
      error: null,
    });
    listPropertyOperationalHealthScoresMock.mockResolvedValueOnce([
      { score: 92, category: "healthy" },
      { score: 58, category: "high_risk" },
    ]);

    const { getWeeklyPortfolioSummary } = await import("../../src/services/reportingService.js");
    const result = await getWeeklyPortfolioSummary("account-1");

    expect(result).toMatchObject({
      occupancy_rate: 95,
      open_requests: 3,
      waiting_over_48h: 1,
      overdue_balance: 1234.56,
      average_property_health_score: 75,
      high_risk_property_count: 1,
    });
  });

  it("returns parsed maintenance dashboard rpc shapes", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [
          {
            item_type: "triage_over_24h",
            maintenance_request_id: "req-1",
            work_order_id: null,
            request_status: "open",
            work_order_status: "",
            priority: "high",
            title: "Leaking tap",
            property_label: "11 Starlight Avenue",
            created_at: "2026-03-24T10:00:00Z",
            age_hours: "48",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            open_requests: "4",
            active_work_orders: "2",
            awaiting_action: "1",
            resolved_pending_closure: "0",
            open_high_priority: "1",
            triage_over_24h: "1",
            contractor_ack_overdue: "0",
            stalled_repairs: "0",
            long_running_repairs: "0",
            repeat_repair_properties: "0",
            req_by_status: { open: 3 },
            wo_by_status: { assigned: 2 },
            aging: { b24_48: 1 },
          },
        ],
        error: null,
      });
    fromMock.mockImplementation((table) => {
      if (table === "maintenance_requests") {
        return createThenableQuery({ data: [], error: null });
      }
      if (table === "work_orders_with_flags") {
        return createThenableQuery({ data: [], error: null });
      }
      if (table === "work_orders") {
        return createThenableQuery({ data: [], error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const {
      getMaintenanceAttention,
      getMaintenanceKpiSnapshot,
    } = await import("../../src/services/maintenanceDashboardService.js");

    const attention = await getMaintenanceAttention("account-1");
    const snapshot = await getMaintenanceKpiSnapshot("account-1");

    expect(attention[0]).toMatchObject({
      item_type: "triage_over_24h",
      maintenance_request_id: "req-1",
      age_hours: 48,
    });
    expect(snapshot).toMatchObject({
      open_requests: 4,
      active_work_orders: 2,
      req_by_status: expect.objectContaining({ open: 3 }),
      aging: expect.objectContaining({ b24_48: 1 }),
    });
  });

  it("returns parsed lease and portfolio attention items", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [
          {
            item_key: "lease-1",
            item_type: "lease_expiring_soon",
            property_label: "11 Starlight Avenue",
            tenant_label: "Tenant A1",
            lease_end_date: "2026-05-01",
            days_until_end: "30",
            link_path: "/tenants/tenant-1",
            sort_order: "20",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            item_key: "portfolio-1",
            item_type: "overdue_payment",
            property_label: "11 Starlight Avenue",
            city: "London",
            amount: "1234.56",
            days_vacant: null,
            request_title: "",
            link_path: "/finance?status=overdue",
            sort_order: "10",
          },
        ],
        error: null,
      });

    const { getLeaseAttentionItems } = await import("../../src/services/leaseService.js");
    const { getPortfolioAttentionItems } = await import("../../src/services/portfolioHealthService.js");

    const leaseItems = await getLeaseAttentionItems("account-1", 10, 60);
    const portfolioItems = await getPortfolioAttentionItems("account-1", null, 10);

    expect(leaseItems[0]).toMatchObject({
      item_type: "lease_expiring_soon",
      days_until_end: 30,
    });
    expect(portfolioItems[0]).toMatchObject({
      item_type: "overdue_payment",
      amount: 1234.56,
      city: "London",
    });
  });

  it("returns parsed playbook overview data from the snapshot rpc", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          settings: [{ rule_id: "rent_overdue_watch", enabled: true, config: { grace_days: 3 } }],
          open_run_counts: { rent_overdue_watch: 2 },
          recent_runs: [
            {
              id: "run-1",
              rule_id: "rent_overdue_watch",
              source_key: "payment-1",
              state: "open",
              severity: "warning",
              title: "Overdue rent",
              body: "",
              link_path: "/finance?status=overdue",
              entity_type: "payment",
              entity_id: "payment-1",
              details: {},
              first_triggered_at: "2026-03-24T10:00:00Z",
              last_triggered_at: "2026-03-24T10:00:00Z",
              resolved_at: null,
            },
          ],
          recent_resolved_runs: [],
          recent_executions: [
            {
              id: "exec-1",
              rule_id: "rent_overdue_watch",
              status: "recorded",
              details: {},
            },
          ],
          open_runs: "2",
          last_run_at: "2026-03-24T10:00:00Z",
          last_run_status: "recorded",
        },
      ],
      error: null,
    });

    const { getPlaybookAutomationOverview } = await import(
      "../../src/services/playbookAutomationService.js"
    );
    const result = await getPlaybookAutomationOverview("account-1");

    expect(result.summary).toMatchObject({
      openRuns: 2,
      lastRunStatus: "recorded",
    });
    expect(result.recentRuns[0]).toMatchObject({
      id: "run-1",
      ruleId: "rent_overdue_watch",
      entityId: "payment-1",
    });
    expect(result.recentExecutions[0]).toMatchObject({
      id: "exec-1",
      details: {},
    });
  });

  it("returns parsed property operational health rows from the snapshot rpc", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          property_id: "property-1",
          property_label: "11 Starlight Avenue",
          score: "88",
          category: "healthy",
          reasons: [{ key: "maintenance_pressure", penalty: "6" }],
          overdue_rent_amount: "0",
          open_request_count: "1",
          active_work_order_count: "2",
          stalled_repair_count: "0",
          ack_overdue_count: "0",
          long_running_repair_count: "0",
          requests_90_count: "1",
          overdue_preventive_count: "0",
          due_soon_preventive_count: "1",
          overdue_compliance_count: "0",
          due_soon_compliance_count: "1",
          missing_compliance_count: "0",
          expired_lease_count: "0",
          expiring_lease_count: "1",
          renewal_in_progress_count: "0",
          recent_operating_expenses: "120",
          recent_maintenance_cost: "0",
          tenant_count: "1",
        },
      ],
      error: null,
    });

    const actualPropertyHealthService = await vi.importActual(
      "../../src/services/propertyHealthScoreService.js"
    );
    const result = await actualPropertyHealthService.listPropertyOperationalHealthScores("account-1");

    expect(result[0]).toMatchObject({
      propertyId: "property-1",
      propertyLabel: "11 Starlight Avenue",
      score: 88,
      category: "healthy",
      reasons: [{ key: "maintenance_pressure", penalty: 6 }],
    });
    expect(result[0].signals).toMatchObject({
      activeWorkOrderCount: 2,
      dueSoonPreventiveCount: 1,
      hasExpiringLease: true,
    });
  });
});
