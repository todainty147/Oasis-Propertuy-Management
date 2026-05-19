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
    expect(form).toContain("syncedInitialContextRef");
    expect(form).toContain("onPropertyChange");
    expect(form).toContain("onTenantChange");
    expect(form).toContain('t("rentPlans.form.property")');
    expect(form).toContain('t("rentPlans.form.noPropertySelected")');
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
    expect(rentPlansPage).toContain('t("rentPlans.expectedCharges")');
    expect(expectedChargeService).toContain("if (rentPlanId) q = q.eq(\"rent_plan_id\", rentPlanId);");
  });

  it("ends rent plans through a guarded RPC instead of a browser table update", () => {
    const service = readSource("src/services/rentPlanService.js");
    const sql = readSource("supabase/rent_engine_tables.sql");

    expect(service).toContain('supabase.rpc("end_rent_plan"');
    expect(service).not.toContain('.update({ status: "ended"');
    expect(sql).toContain("create or replace function public.end_rent_plan");
    expect(sql).toContain("perform public.assert_manage_account_access(p_account_id);");
    expect(sql).toContain("grant execute on function public.end_rent_plan(uuid, uuid) to authenticated;");
  });

  it("replaces rent charge rules through a guarded transactional RPC", () => {
    const service = readSource("src/services/rentPlanService.js");
    const sql = readSource("supabase/rent_engine_tables.sql");

    expect(service).toContain('rpc("upsert_rent_charge_rules"');
    expect(sql).toContain("create or replace function public.upsert_rent_charge_rules");
    expect(sql).toContain("perform public.assert_manage_account_access(p_account_id);");
    expect(sql).toContain("delete from public.rent_charge_rules");
    expect(sql).toContain("return query");
    expect(sql).toContain("grant execute on function public.upsert_rent_charge_rules(uuid, uuid, jsonb) to authenticated;");
  });

  it("keeps rent plan reference data independent from filter-only reloads", () => {
    const page = readSource("src/pages/RentPlansPage.jsx");
    const loadReferenceDataIndex = page.indexOf("const loadReferenceData = useCallback");
    const loadPlansIndex = page.indexOf("const loadPlans = useCallback");
    const useEffectIndex = page.indexOf("useEffect(() => { loadReferenceData(); }");

    expect(loadReferenceDataIndex).toBeGreaterThan(-1);
    expect(loadPlansIndex).toBeGreaterThan(-1);
    const loadPlansBlock = page.slice(loadPlansIndex, loadReferenceDataIndex);
    const loadReferenceDataBlock = page.slice(loadReferenceDataIndex, useEffectIndex);
    expect(loadReferenceDataBlock).toContain("listRentPlanProperties");
    expect(loadReferenceDataBlock).toContain("listAccountTenants");
    expect(loadPlansBlock).not.toContain("listRentPlanProperties");
    expect(page).toContain('t("rentPlans.contextBanner", { label: contextLabel })');
  });
});
