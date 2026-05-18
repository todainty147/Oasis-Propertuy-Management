import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readSource = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("rent plan workflow contracts", () => {
  it("keeps property and tenant context wired into rent plan creation", () => {
    const page = readSource("src/pages/RentPlansPage.jsx");
    const form = readSource("src/components/rent/RentPlanForm.jsx");
    const service = readSource("src/services/rentPlanService.js");

    expect(page).toContain('const propertyParam = searchParams.get("property") || "";');
    expect(page).toContain('const tenantParam = searchParams.get("tenant") || "";');
    expect(page).toContain("initialPropertyId={propertyParam}");
    expect(page).toContain("initialTenantId={tenantParam}");
    expect(form).toContain("propertyId:");
    expect(form).toContain("tenantId:");
    expect(form).toContain("onPropertyChange");
    expect(form).toContain("onTenantChange");
    expect(service).toContain("property_id:       nullIfBlank(plan.propertyId ?? null)");
    expect(service).toContain("tenant_id:         nullIfBlank(plan.tenantId ?? null)");
  });

  it("routes finance review charges into an expected-charge panel", () => {
    const financePage = readSource("src/pages/Finance.jsx");
    const rentPlansPage = readSource("src/pages/RentPlansPage.jsx");
    const expectedChargeService = readSource("src/services/expectedChargeService.js");

    expect(financePage).toContain('to="/finance/rent-plans?charges=1"');
    expect(rentPlansPage).toContain('const chargesParam = searchParams.get("charges") || searchParams.get("panel") || "";');
    expect(rentPlansPage).toContain("setChargesPlan({ all: true });");
    expect(expectedChargeService).toContain("if (rentPlanId) q = q.eq(\"rent_plan_id\", rentPlanId);");
  });
});
