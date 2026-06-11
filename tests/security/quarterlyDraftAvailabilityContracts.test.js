import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("quarterly draft general availability contracts", () => {
  it("shows Quarterly Drafts without requiring the old draft-builder entitlement", () => {
    const page = read("src/pages/compliance/TaxToolsPage.jsx");

    expect(page).toContain('{ id: "quarterlyDrafts", label: "Quarterly Drafts", icon: FileCheck2 }');
    expect(page).toContain("const quarterlyDraftsEnabled = true;");
    expect(page).toContain("listQuarterlyDrafts({ accountId: activeAccountId })");

    const tabDefinition = page.slice(page.indexOf('{ id: "quarterlyDrafts"'), page.indexOf('{ id: "section24"'));
    expect(tabDefinition).not.toContain("HMRC_MTD_QUARTERLY_DRAFT_BUILDER");
    expect(page).not.toContain("hasEntitlement(ENTITLEMENT_FEATURES.HMRC_MTD_QUARTERLY_DRAFT_BUILDER)");
  });

  it("keeps quarterly draft RLS manager-scoped but not feature-flag scoped", () => {
    const phase3 = read("supabase/hmrc_mtd_phase3_quarterly_drafts.sql");
    const migration = read("supabase/migrations/20260611001000_make_quarterly_drafts_general_available.sql");

    for (const sql of [phase3, migration]) {
      expect(sql).toContain("using (public.user_can_manage_account(account_id))");
      expect(sql).toContain("with check (public.user_can_manage_account(account_id))");
      expect(sql).not.toContain("user_can_manage_account(account_id) and public.account_has_feature(account_id, 'hmrc_mtd_quarterly_draft_builder')");
    }
  });

  it("removes the draft-builder feature precondition from consent and sandbox submission paths", () => {
    const consentSql = read("supabase/hmrc_mtd_phase5a_consent_scaffolding.sql");
    const sandboxSql = read("supabase/hmrc_mtd_phase4_sandbox_submission.sql");
    const migration = read("supabase/migrations/20260611001000_make_quarterly_drafts_general_available.sql");
    const sandboxFunction = read("supabase/functions/hmrc-submit-uk-property-period-summary-sandbox/index.ts");

    expect(consentSql).not.toContain("hmrc_quarterly_drafts_not_enabled");
    expect(consentSql).not.toContain("public.account_has_feature(p_account_id, 'hmrc_mtd_quarterly_draft_builder')");
    expect(sandboxSql).not.toContain("public.account_has_feature(account_id, 'hmrc_mtd_quarterly_draft_builder')");
    expect(migration).not.toContain("hmrc_quarterly_drafts_not_enabled");
    expect(sandboxFunction).not.toContain('"hmrc_mtd_quarterly_draft_builder"');

    expect(sandboxFunction).toContain('"hmrc_mtd_sandbox_submission"');
    expect(sandboxFunction).toContain("assertLiveSubmissionFlagOff(accountId)");
  });
});
