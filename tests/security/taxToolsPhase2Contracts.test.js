import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Phase 2 tax tools security contracts", () => {
  it("adds the required feature flags without enabling live HMRC submission in plan entitlements", () => {
    const source = read("src/lib/entitlements.js");

    [
      "tax_tools_in_app",
      "mtd_expense_tracker",
      "mtd_property_finance_sync",
      "section24_finance_cost_tracker",
      "carried_forward_finance_cost_tracker",
      "hmrc_mtd_sandbox",
      "hmrc_mtd_live_submission",
    ].forEach((flag) => expect(source).toContain(flag));

    const planSection = source.slice(source.indexOf("const STARTER_FEATURES"), source.indexOf("export const PLAN_ENTITLEMENTS"));
    expect(planSection).not.toContain("ENTITLEMENT_FEATURES.HMRC_MTD_LIVE_SUBMISSION");
    expect(planSection).not.toContain("ENTITLEMENT_FEATURES.HMRC_MTD_SANDBOX");
    expect(planSection).not.toContain("ENTITLEMENT_FEATURES.MTD_PROPERTY_FINANCE_SYNC");
  });

  it("gates the in-app route and sidebar item behind tax_tools_in_app", () => {
    const routes = read("src/routes/ManagerRoutes.jsx");
    const sidebar = read("src/layout/Sidebar.jsx");

    expect(routes).toContain('path="compliance/tax-tools"');
    expect(routes).toContain("ENTITLEMENT_FEATURES.TAX_TOOLS_IN_APP");
    expect(sidebar).toContain('to="/compliance/tax-tools"');
    expect(sidebar).toContain("ENTITLEMENT_FEATURES.TAX_TOOLS_IN_APP");
  });

  it("keeps tax-tool tables isolated, account-scoped, and protected by existing account-role RLS", () => {
    const sql = read("supabase/tax_tools_phase2.sql");

    [
      "tax_expense_classifications",
      "tax_finance_cost_summaries",
      "tax_carried_forward_finance_costs",
      "tax_year_summaries",
      "tax_tool_audit_log",
    ].forEach((table) => expect(sql).toContain(`public.${table}`));

    expect(sql).toMatch(/account_id uuid not null references public\.accounts\(id\)/);
    expect(sql).toContain("alter table public.tax_expense_classifications enable row level security");
    expect(sql).toContain("alter table public.tax_finance_cost_summaries enable row level security");
    expect(sql).toContain("alter table public.tax_carried_forward_finance_costs enable row level security");
    expect(sql).toContain("alter table public.tax_year_summaries enable row level security");
    expect(sql).toContain("alter table public.tax_tool_audit_log enable row level security");
    expect(sql).toContain("public.user_can_manage_account(account_id)");
    expect(sql).toContain("tax_expense_classifications_source_unique");
    expect(sql).toContain("enforce_tax_expense_classification_source_account");
    expect(sql).toContain("Property operating expense source account mismatch");
    expect(sql).not.toMatch(/create table if not exists public\.expenses\b/);
    expect(sql).not.toMatch(/create table if not exists public\.tenancies\b/);
  });

  it("keeps the page copy non-submission and accountant-review oriented", () => {
    const page = read("src/pages/compliance/TaxToolsPage.jsx");
    const util = read("src/utils/taxTools.js");

    expect(page).toContain("No HMRC submission");
    expect(page).toContain("Review with accountant");
    expect(util).toContain("Tenaqo does not replace tax advice or HMRC submission software");
    expect(util).toContain("Live HMRC submission remains disabled");
    expect(page).not.toMatch(/HMRC approved|Guaranteed allowable|Official HMRC calculator/i);
  });

  it("surfaces Property Finance sync as candidates without feeding raw property expenses into drafts", () => {
    const page = read("src/pages/compliance/TaxToolsPage.jsx");
    const syncService = read("src/services/mtdPropertyFinanceSyncService.js");
    const sourceService = read("src/services/mtdQuarterlyDraftSourceService.js");

    expect(page).toContain("Sync Property Finance");
    expect(page).toContain("Candidates sync as Needs review");
    expect(page).toContain("preview: syncPreview");
    expect(page).toContain("reviewBusy");
    expect(page).toContain("UNRESOLVED_CANDIDATES_READINESS_CAP");
    expect(syncService).toContain('PROPERTY_FINANCE_SOURCE_TYPE = "property_operating_expense"');
    expect(syncService).toContain("fetchMtdClassificationsForDuplicateComparison");
    expect(syncService).toContain("existingRows: comparisonRows");
    expect(syncService).toContain("preview = null");
    expect(syncService).toContain("include_in_mtd: false");
    expect(syncService).toContain("review_status: \"needs_review\"");
    expect(syncService).toContain("possible_duplicate");
    expect(sourceService).not.toContain("property_operating_expenses");
    expect(sourceService).toContain("row.include_in_mtd === true && reviewStatus === \"reviewed\"");
  });
});
