import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  buildSnapshotCacheKey,
  clearSnapshotCache,
  getSnapshotCacheValue,
  setSnapshotCacheValue,
  SNAPSHOT_CACHE_TTL_MS,
} from "../../src/services/snapshotCache.js";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("snapshot cache contracts", () => {
  it("keeps account and tenant scoped cache keys stable and bounded by ttl", () => {
    clearSnapshotCache();
    const key = buildSnapshotCacheKey("finance_snapshot", {
      tenantId: "tenant-1",
      accountId: "account-1",
    });

    expect(key).toBe("finance_snapshot|accountId:account-1|tenantId:tenant-1");
    expect(getSnapshotCacheValue(key, { now: 1000 })).toBeNull();

    setSnapshotCacheValue(key, { total_income: 1200 }, { now: 1000 });
    expect(getSnapshotCacheValue(key, { now: 1000 + SNAPSHOT_CACHE_TTL_MS - 1 })).toEqual({
      total_income: 1200,
    });
    expect(getSnapshotCacheValue(key, { now: 1000 + SNAPSHOT_CACHE_TTL_MS + 1 })).toBeNull();
  });

  it("limits caching to high-value snapshot reads and leaves realtime refresh paths able to bypass it", () => {
    const dashboardSource = readSource("src/services/dashboardService.js");
    const financeSource = readSource("src/services/financeService.js");
    const portfolioSource = readSource("src/services/portfolioHealthService.js");
    const financeHook = readSource("src/hooks/useFinance.js");
    const dashboardPage = readSource("src/pages/Dashboard.jsx");
    const portfolioPage = readSource("src/pages/PortfolioHealthDashboardPage.jsx");

    expect(dashboardSource).toContain('buildSnapshotCacheKey("dashboard_snapshot"');
    expect(financeSource).toContain('buildSnapshotCacheKey("finance_snapshot"');
    expect(portfolioSource).toContain('buildSnapshotCacheKey("portfolio_health_snapshot"');
    expect(financeHook).toContain("loadFinance({ forceRefresh: true })");
    expect(dashboardPage).toContain("forceRefresh: true");
    expect(portfolioPage).toContain("forceRefresh: true");
  });
});
