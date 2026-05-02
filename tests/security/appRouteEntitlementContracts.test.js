import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Portfolio shell data and route entitlement logic moved from App.jsx to:
//   src/hooks/usePortfolioShellData.js  — manager data hook
//   src/routes/ManagerRoutes.jsx        — manager route tree + entitlement guards
const appSource          = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");
const managerRouteSource = fs.readFileSync(path.resolve("src/routes/ManagerRoutes.jsx"), "utf8");
const portfolioHookSource = fs.readFileSync(path.resolve("src/hooks/usePortfolioShellData.js"), "utf8");

describe("App route entitlement contracts", () => {
  it("does not render entitlement-protected children when the active role cannot evaluate the feature", () => {
    // EntitledRoute guard lives in ManagerRoutes
    expect(managerRouteSource).toContain("if (!canEvaluate) {");
    expect(managerRouteSource).toContain('return <Navigate to="/dashboard" replace />;');
    expect(managerRouteSource).toContain("if (hasEntitlement(feature)) {");
    expect(managerRouteSource).not.toContain("if (!canEvaluate || hasEntitlement(feature))");
  });

  it("does not load landlord portfolio hooks for contractor sessions", () => {
    // Portfolio hook is enabled only when !tenantRole && !contractorRole
    expect(managerRouteSource).toContain("managerDataEnabled");
    expect(managerRouteSource).toContain("!contractorRole");
    expect(portfolioHookSource).toContain("useProperties({ enabled");
    expect(portfolioHookSource).toContain("usePayments({ enabled");
  });

  it("keeps derived owner portfolio data memoized in the portfolio shell hook", () => {
    // Derivations moved from App.jsx to usePortfolioShellData
    expect(portfolioHookSource).toContain("const ownerProperties = useMemo(");
    expect(portfolioHookSource).toContain("const ownerPayments = useMemo(");
    expect(portfolioHookSource).toContain("const longVacantProperties = useMemo(");
    // App.jsx still memos owners for Topbar
    expect(appSource).toContain("const owners = useMemo(");
  });

  it("uses ended leases before property creation date for vacancy aging", () => {
    // Lease-based vacancy aging lives in usePortfolioShellData
    expect(portfolioHookSource).toContain("latestEndedLease?.lease_end_date || property.createdAt");
    expect(portfolioHookSource).toContain("leaseEnd <= now");
    expect(portfolioHookSource).toContain("listLeases");
  });

  it("explicitly refreshes properties after deleting a property", () => {
    // Delete + refresh lives in ManagerRoutes
    expect(managerRouteSource).toContain("await deleteProperty(propertyId);");
    expect(managerRouteSource).toContain("await refetchProperties();");
    expect(portfolioHookSource).toContain("refetch: refetchProperties");
  });
});
