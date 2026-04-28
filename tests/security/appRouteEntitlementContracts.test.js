import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const appSource = fs.readFileSync(path.resolve("src/App.jsx"), "utf8");

describe("App route entitlement contracts", () => {
  it("does not render entitlement-protected children when the active role cannot evaluate the feature", () => {
    expect(appSource).toContain("if (!canEvaluate) {");
    expect(appSource).toContain('return <Navigate to="/dashboard" replace />;');
    expect(appSource).toContain("if (hasEntitlement(feature)) {");
    expect(appSource).not.toContain("if (!canEvaluate || hasEntitlement(feature))");
  });

  it("does not load landlord portfolio hooks for contractor sessions", () => {
    expect(appSource).toContain("const portfolioDataEnabled = !!session && !contractorRole;");
    expect(appSource).toContain("useProperties({ enabled: portfolioDataEnabled");
    expect(appSource).toContain("usePayments({ enabled: portfolioDataEnabled");
    expect(appSource).toContain("enabled: portfolioDataEnabled");
  });

  it("keeps derived owner portfolio data memoized in the route shell", () => {
    expect(appSource).toContain("const owners = useMemo(");
    expect(appSource).toContain("const ownerProperties = useMemo(");
    expect(appSource).toContain("const ownerPayments = useMemo(");
    expect(appSource).toContain("const longVacantProperties = useMemo(");
  });

  it("uses ended leases before property creation date for vacancy aging", () => {
    expect(appSource).toContain('import { listLeases } from "./services/leaseService";');
    expect(appSource).toContain("const leaseDataEnabled = portfolioDataEnabled && !tenantRole;");
    expect(appSource).toContain("latestEndedLease?.lease_end_date || property.createdAt");
    expect(appSource).toContain("leaseEnd <= now");
  });

  it("explicitly refreshes properties after deleting a property", () => {
    expect(appSource).toContain("refetch: refetchProperties");
    expect(appSource).toContain("await deleteProperty(propertyId);");
    expect(appSource).toContain("await refetchProperties();");
  });
});
