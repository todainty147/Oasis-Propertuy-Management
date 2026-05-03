import { beforeEach, describe, expect, it, vi } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";

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

describe("command center isolation contracts", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getDashboardSnapshotMock.mockReset();
    listPropertyOperationalHealthScoresMock.mockReset();

    getDashboardSnapshotMock.mockResolvedValue({ overdue_amount: 0 });
    listPropertyOperationalHealthScoresMock.mockResolvedValue([]);
    // rpcMock handles all supabase.rpc calls including list_rr_attention_items
    rpcMock.mockResolvedValue({ data: [], error: null });
  });

  it("requests command_center_items for the target account only", async () => {
    const { accountA, accountB } = isolationFixtures.accounts;
    const { crossAccountDashboard } = isolationFixtures.negativeCases;

    expect(crossAccountDashboard.actorAccountId).toBe(accountA.id);
    expect(crossAccountDashboard.targetAccountId).toBe(accountB.id);

    rpcMock.mockResolvedValueOnce({ data: [], error: null });

    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");

    await getCommandCenterData(accountA.id);

    expect(getDashboardSnapshotMock).toHaveBeenCalledWith(accountA.id, { horizonDays: 7 });
    expect(rpcMock).toHaveBeenCalledWith("command_center_items", {
      p_account_id: accountA.id,
      p_limit: 80,
    });
    expect(rpcMock).not.toHaveBeenCalledWith("command_center_items", {
      p_account_id: accountB.id,
      p_limit: 80,
    });
  });

  it("returns a safe empty command center payload when account scope is absent", async () => {
    const { getCommandCenterData } = await import("../../src/services/commandCenterService.js");

    const result = await getCommandCenterData(null);

    expect(result.summary.urgentCount).toBe(0);
    expect(result.items).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(getDashboardSnapshotMock).not.toHaveBeenCalled();
  });
});
