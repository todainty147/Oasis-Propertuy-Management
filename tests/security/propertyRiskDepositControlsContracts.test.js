import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Property Risk & Deposit Financial Controls contracts", () => {
  it("adds account-level feature flags without enabling live HMRC or money-holding behavior", () => {
    const entitlements = read("src/lib/entitlements.js");
    const sql = read("supabase/property_risk_deposit_controls.sql");

    [
      "deposit_deductions_log",
      "deposit_settlement_statement",
      "eco_upgrade_planner",
      "portfolio_health_eco_compliance",
    ].forEach((flag) => {
      expect(entitlements).toContain(flag);
      expect(sql).toContain(`('${flag}')`);
    });

    expect(sql).toContain("enabled, created_by)");
    expect(sql).toContain("false, null");
    expect(`${entitlements}\n${sql}`).not.toMatch(/escrow|court-proof|guaranteed EPC uplift|guaranteed compliance/i);
  });

  it("creates additive account-scoped tables with RLS and child account guards", () => {
    const sql = read("supabase/property_risk_deposit_controls.sql");
    [
      "deposit_settlements",
      "deposit_deductions",
      "deposit_deduction_evidence_links",
      "deposit_settlement_exports",
      "deposit_settlement_audit_events",
      "property_epc_profiles",
      "eco_upgrade_options",
      "property_eco_upgrade_plans",
      "property_eco_upgrade_plan_items",
      "property_eco_upgrade_audit_events",
    ].forEach((table) => {
      expect(sql).toContain(`public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    });

    expect(sql).toContain("public.user_can_manage_account(account_id)");
    expect(sql).toContain("Tenants read shared deposit settlements");
    expect(sql).toContain("Contractors only see linked work orders");
    expect(sql).toContain("Deposit settlement account mismatch");
    expect(sql).toContain("Eco-upgrade plan account mismatch");
  });

  it("registers SQL overlays and gates app routes/sidebar entries", () => {
    const apply = read("scripts/dbApplyRepoSql.js");
    const bootstrap = read("scripts/dbBootstrap.js");
    const routes = read("src/routes/ManagerRoutes.jsx");
    const sidebar = read("src/layout/Sidebar.jsx");

    expect(apply).toContain('"property_risk_deposit_controls.sql"');
    expect(bootstrap).toContain('"property_risk_deposit_controls.sql"');
    expect(routes).toContain("ENTITLEMENT_FEATURES.DEPOSIT_DEDUCTIONS_LOG");
    expect(routes).toContain("ENTITLEMENT_FEATURES.ECO_UPGRADE_PLANNER");
    expect(sidebar).toContain('to="/finance/deposit-vault"');
    expect(sidebar).toContain('to="/portfolio-health/eco-upgrade-planner"');
    expect(sidebar).toContain("indent />");
  });

  it("keeps Eco-Upgrade Planner actions and estimate copy partner-safe", () => {
    const page = read("src/pages/EcoUpgradePlannerPage.jsx");

    expect(page).toContain("static planning estimates from Tenaqo's seeded upgrade catalogue");
    expect(page).toContain("not live quotes or web-searched prices");
    expect(page).toContain("Indicative cost (editable)");
    expect(page).not.toContain("Open Eco-Upgrade Planner</span>");
    expect(page).not.toContain("Mark upgrade completed");
    expect(page).not.toContain("Attach EPC certificate");
  });

  it("uses current database columns for Deposit Vault joins", () => {
    const service = read("src/services/depositSettlementService.js");

    expect(service).toContain("properties:property_id(id,address)");
    expect(service).not.toContain("properties:property_id(id,address,name)");
  });

  it("saves EPC profiles without depending on deployed upsert conflict metadata", () => {
    const service = read("src/services/ecoUpgradePlannerService.js");

    expect(service).toContain("getPropertyEpcProfile({ accountId: row.account_id, propertyId: row.property_id })");
    expect(service).toContain('supabase.from("property_epc_profiles").update(row)');
    expect(service).toContain('supabase.from("property_epc_profiles").insert(row)');
    expect(service).not.toContain('onConflict: "account_id,property_id"');
  });
});
