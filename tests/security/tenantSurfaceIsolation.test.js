import { readFileSync } from "node:fs";

import { can } from "../../src/utils/permissions.js";

function readSource(relativePath) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("tenant surface isolation contracts", () => {
  it("keeps tenant users on the dedicated tenant payments experience instead of landlord finance", () => {
    const financePageSource = readSource("src/pages/FinancePage.jsx");
    const sidebarSource = readSource("src/layout/Sidebar.jsx");
    const topbarSource = readSource("src/layout/Topbar.jsx");

    expect(can("tenant", "finance", "read")).toBe(false);
    expect(financePageSource).toContain('Navigate to="/tenant/payments"');
    expect(sidebarSource).toContain('to={isTenant ? "/tenant/payments" : "/finance"}');
    expect(topbarSource).toContain("!isTenant && !tenantsLoading && tenants.length > 0");
  });

  it("gates the property performance card behind manage-role access", () => {
    const propertyDetailsSource = readSource("src/pages/PropertyDetails.jsx");

    expect(propertyDetailsSource).toContain("{canManageLease ? (");
    expect(propertyDetailsSource).toContain("<PropertyPerformanceCard");
  });

  it("keeps tenant details and tenant documents scoped to manager-only routes and tenant-linked docs", () => {
    const tenantDetailsSource = readSource("src/pages/TenantDetails.jsx");
    const tenantDocumentsSource = readSource("src/components/TenantDocumentsSection.jsx");
    const topbarSource = readSource("src/layout/Topbar.jsx");

    expect(tenantDetailsSource).toContain('if (!canManageLease)');
    expect(tenantDetailsSource).toContain('<Navigate to="/dashboard" replace />');
    expect(tenantDocumentsSource).toContain('String(doc?.tenant_id || "") === String(tenantId)');
    expect(topbarSource).toContain('navigate("/login", { replace: true })');
  });
});
