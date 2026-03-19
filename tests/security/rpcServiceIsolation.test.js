import { beforeEach, describe, expect, it, vi } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";

const rpcMock = vi.fn();
const fromMock = vi.fn();
const getPrimaryLeaseMock = vi.fn();

vi.mock("../../src/lib/supabase.js", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

vi.mock("../../src/services/leaseService.js", () => ({
  getPrimaryLease: (...args) => getPrimaryLeaseMock(...args),
  getDerivedLeaseStatus: vi.fn(() => "active"),
}));

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

describe("RPC service isolation contracts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
    getPrimaryLeaseMock.mockReset();
    getPrimaryLeaseMock.mockResolvedValue(null);
  });

  it("scopes dashboard_snapshot to the caller-selected account and tenant fixtures", async () => {
    const { accountA } = isolationFixtures.accounts;
    const { tenantA1, tenantB1 } = isolationFixtures.users;

    rpcMock.mockResolvedValueOnce({
      data: [{ property_count: 1, overdue_amount: 0 }],
      error: null,
    });

    const { getDashboardSnapshot } = await import("../../src/services/dashboardService.js");

    await getDashboardSnapshot(accountA.id, {
      tenantId: tenantA1.tenantId,
      horizonDays: 7,
    });

    expect(rpcMock).toHaveBeenCalledWith("dashboard_snapshot", {
      p_account_id: accountA.id,
      p_tenant_id: tenantA1.tenantId,
      p_horizon_days: 7,
    });
    expect(rpcMock).not.toHaveBeenCalledWith(
      "dashboard_snapshot",
      expect.objectContaining({ p_tenant_id: tenantB1.tenantId }),
    );
  });

  it("scopes finance_snapshot to the account and tenant fixtures used by tenant views", async () => {
    const { accountA } = isolationFixtures.accounts;
    const { tenantA1, tenantB1 } = isolationFixtures.users;

    rpcMock.mockResolvedValueOnce({
      data: [{ total_income: 1200, overdue_income: 0, expected_income: 0, property_finance: [] }],
      error: null,
    });

    const { getFinanceSnapshot } = await import("../../src/services/financeService.js");

    await getFinanceSnapshot(accountA.id, tenantA1.tenantId);

    expect(rpcMock).toHaveBeenCalledWith("finance_snapshot", {
      p_account_id: accountA.id,
      p_tenant_id: tenantA1.tenantId,
    });
    expect(rpcMock).not.toHaveBeenCalledWith(
      "finance_snapshot",
      expect.objectContaining({ p_tenant_id: tenantB1.tenantId }),
    );
  });

  it("uses tenant_activity_feed with the requesting tenant fixture and never falls through without scope", async () => {
    const { accountA } = isolationFixtures.accounts;
    const { tenantA1, tenantB1 } = isolationFixtures.users;

    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    fromMock.mockImplementation((table) => {
      if (table === "payments") {
        return createThenableQuery({ data: [], error: null, count: 0 });
      }

      if (table === "maintenance_requests") {
        return createThenableQuery({ data: [], error: null });
      }

      if (table === "payment_events") {
        return createThenableQuery({ data: [], error: null });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    const { getTenantTimeline } = await import("../../src/services/tenantTimelineService.js");

    await getTenantTimeline({
      accountId: accountA.id,
      tenant: {
        id: tenantA1.tenantId,
        propertyId: tenantA1.propertyId,
      },
      property: {
        id: tenantA1.propertyId,
      },
      limit: 25,
    });

    expect(rpcMock).toHaveBeenCalledWith("tenant_activity_feed", {
      p_account_id: accountA.id,
      p_tenant_id: tenantA1.tenantId,
      p_limit: 25,
    });
    expect(rpcMock).not.toHaveBeenCalledWith(
      "tenant_activity_feed",
      expect.objectContaining({ p_tenant_id: tenantB1.tenantId }),
    );
  });

  it("returns a safe empty tenant timeline without issuing RPCs when tenant scope is missing", async () => {
    const { accountA } = isolationFixtures.accounts;

    const { getTenantTimeline } = await import("../../src/services/tenantTimelineService.js");

    const result = await getTenantTimeline({
      accountId: accountA.id,
      tenant: null,
    });

    expect(result).toEqual({
      items: [],
      summary: {
        openRequests: 0,
        overduePayments: 0,
        leaseWatch: 0,
      },
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
