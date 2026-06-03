import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("HMRC MTD Phase 5A readiness contracts", () => {
  it("keeps source records traceable and quarterly drafts as the review snapshot layer", () => {
    const sourceService = read("src/services/mtdQuarterlyDraftSourceService.js");
    const draftService = read("src/services/mtdQuarterlyDraftService.js");
    const draftLib = read("src/lib/mtd/mtdQuarterlyDraft.js");

    expect(sourceService).toContain('sourceTable: "tax_records"');
    expect(sourceService).toContain('sourceTable: "tax_expense_classifications"');
    expect(sourceService).toContain('sourceTable: "tax_finance_cost_summaries"');
    expect(sourceService).toContain('sourceTable: "tax_carried_forward_finance_costs"');
    expect(draftLib).toContain("capital_improvement");
    expect(draftLib).toContain("mixed_use_review");
    expect(draftLib).toContain("needs_accountant_review");
    expect(draftLib).toContain("source_type");
    expect(draftLib).toContain("source_table");
    expect(draftLib).toContain("source_id");
    expect(draftService).toContain("assertEditable(draft)");
    expect(draftService).toContain("This quarterly draft is locked or archived and cannot be edited.");
    expect(draftService).toContain('eventType: "source_records_collected"');
    expect(draftService).toContain("Export timestamp");
    expect(draftService).toContain("not a tax return");
  });

  it("keeps live submission impossible and sandbox submission pinned to the HMRC test API", () => {
    const entitlements = read("src/lib/entitlements.js");
    const sandboxFunction = read("supabase/functions/hmrc-submit-uk-property-period-summary-sandbox/index.ts");
    const service = read("src/services/hmrcMtdService.js");
    const component = read("src/components/compliance/QuarterlyDraftsTab.jsx");

    expect(entitlements).toContain("const STARTER_FEATURES");
    expect(entitlements).toContain("export const PLAN_ENTITLEMENTS");
    const planSection = entitlements.slice(entitlements.indexOf("const STARTER_FEATURES"), entitlements.indexOf("export const PLAN_ENTITLEMENTS"));
    expect(planSection).not.toContain("ENTITLEMENT_FEATURES.HMRC_MTD_LIVE_SUBMISSION");
    expect(sandboxFunction).toContain("assertLiveSubmissionFlagOff(accountId)");
    expect(sandboxFunction).toContain("HMRC_ENVIRONMENT !== \"sandbox\"");
    expect(sandboxFunction).toContain("HMRC_BASE_URL !== \"https://test-api.service.hmrc.gov.uk\"");
    expect(sandboxFunction).toContain("HMRC_LIVE_SUBMISSION_ENV");
    expect(service).toContain("hmrc-submit-uk-property-period-summary-sandbox");
    expect(service).not.toMatch(/live-submission|submitHmrc.*Live/i);
    expect(component).toContain("Live submission disabled");
    expect(component).toContain("Submit to HMRC sandbox");
    expect(component).not.toContain("Submit to live HMRC");
  });

  it("documents and tests duplicate prevention without pretending an amendment flow exists", () => {
    const component = read("src/components/compliance/QuarterlyDraftsTab.jsx");
    const draftService = read("src/services/mtdQuarterlyDraftService.js");
    const readinessDocs = read("docs/release/hmrc-phase-5-readiness-smoke-test.md");

    expect(component).toContain("hasSuccessfulSandboxAttempt");
    expect(component).toContain("disabled={busy || !canSubmitSandbox || hasSuccessfulSandboxAttempt}");
    expect(component).toContain("Create a new draft or amendment flow to test another submission.");
    expect(draftService).toContain(".order(\"submitted_at\", { ascending: false })");
    expect(readinessDocs).toContain("Confirm repeat submit disabled.");
  });

  it.todo("adds a server-side already_submitted guard before Phase 5A can be marked ready");

  it("maps HMRC failure modes to safe support-ready summaries without exposing secrets", () => {
    const sandboxFunction = read("supabase/functions/hmrc-submit-uk-property-period-summary-sandbox/index.ts");
    const edge = read("supabase/functions/_shared/hmrcEdge.ts");
    const runbook = read("docs/support/hmrc-submission-support-runbook.md");

    [
      "400 validation error",
      "401 expired token",
      "403 insufficient scope",
      "404 missing business/source",
      "409 duplicate",
      "500/503 HMRC unavailable",
      "network timeout",
    ].forEach((scenario) => expect(runbook).toContain(scenario));

    expect(sandboxFunction).toContain("safeFailureSummary");
    expect(sandboxFunction).toContain("hmrc_correlation_id");
    expect(sandboxFunction).toContain("hmrc_error_code");
    expect(sandboxFunction).toContain("hmrc_error_message");
    expect(edge).toContain("safeHmrcError");
    expect(`${sandboxFunction}\n${edge}`).not.toMatch(/safeSummary:\s*{[^}]*access_token|safeSummary:\s*{[^}]*refresh_token/i);
  });

  it("keeps the audit trail account-scoped, manager-visible, and safe for support", () => {
    const phase3 = read("supabase/hmrc_mtd_phase3_quarterly_drafts.sql");
    const phase4 = read("supabase/hmrc_mtd_phase4_sandbox_submission.sql");
    const draftService = read("src/services/mtdQuarterlyDraftService.js");
    const sandboxFunction = read("supabase/functions/hmrc-submit-uk-property-period-summary-sandbox/index.ts");

    expect(phase3).toContain("mtd_quarterly_update_audit_events");
    expect(phase3).toContain("using (public.user_can_manage_account(account_id) and public.account_has_feature(account_id, 'hmrc_mtd_quarterly_draft_builder'))");
    expect(phase4).toContain("mtd_quarterly_submission_events");
    expect(phase4).toContain("revoke all on public.mtd_quarterly_submission_events from anon, authenticated");
    expect(phase4).toContain("grant select on public.mtd_quarterly_submission_events to authenticated");
    expect(phase4).toContain("enforce_mtd_quarterly_submission_event_account");
    expect(draftService).toContain('eventType: "draft_created"');
    expect(draftService).toContain('"draft_reviewed"');
    expect(draftService).toContain('"draft_locked"');
    expect(draftService).toContain('eventType: "draft_exported"');
    expect(sandboxFunction).toContain("sandbox_submission_started");
    expect(sandboxFunction).toContain("sandbox_submission_success");
    expect(sandboxFunction).toContain("sandbox_submission_retrieved_after_submit");
    expect(`${phase3}\n${phase4}\n${draftService}`).not.toMatch(/access_token|refresh_token|client_secret/i);
    expect(sandboxFunction).not.toMatch(/metadata:\s*{[^}]*access_token|metadata:\s*{[^}]*refresh_token|metadata:\s*{[^}]*client_secret/i);
  });

  it("keeps landlord tax/HMRC records isolated from tenants, contractors, and other accounts", () => {
    const taxToolsSql = read("supabase/tax_tools_phase2.sql");
    const phase3 = read("supabase/hmrc_mtd_phase3_quarterly_drafts.sql");
    const phase4 = read("supabase/hmrc_mtd_phase4_sandbox_submission.sql");
    const routes = read("src/routes/ManagerRoutes.jsx");
    const sidebar = read("src/layout/Sidebar.jsx");

    expect(taxToolsSql).toContain("public.user_can_manage_account(account_id)");
    expect(phase3).toContain("public.user_can_manage_account(account_id)");
    expect(phase4).toContain("public.user_can_manage_account(account_id)");
    expect(phase4).toContain("MTD quarterly submission attempt account mismatch");
    expect(phase4).toContain("MTD quarterly submission event draft account mismatch");
    expect(routes).toContain("ENTITLEMENT_FEATURES.TAX_TOOLS_IN_APP");
    expect(sidebar).toContain("ENTITLEMENT_FEATURES.TAX_TOOLS_IN_APP");
  });

  it("keeps public copy in readiness/sandbox language and bans overclaiming", () => {
    const surfaces = [
      read("src/pages/compliance/TaxToolsPage.jsx"),
      read("src/components/compliance/QuarterlyDraftsTab.jsx"),
      read("src/pages/compliance/HmrcConnectionPage.jsx"),
      read("src/services/mtdQuarterlyDraftService.js"),
      read("src/utils/taxTools.js"),
      read("docs/release/hmrc-phase-5-readiness-smoke-test.md"),
      read("docs/support/hmrc-submission-support-runbook.md"),
    ].join("\n");
    const normalizedSurfaces = surfaces.toLowerCase();

    expect(surfaces).toContain("Live HMRC submission remains disabled");
    expect(normalizedSurfaces).toContain("preview only");
    expect(normalizedSurfaces).toContain("not a tax return");
    expect(normalizedSurfaces).toMatch(/not tax advice|does not replace tax advice/i);
    expect(surfaces).not.toMatch(/fully MTD compliant|HMRC recognised|guaranteed compliant|guaranteed tax accuracy|no accountant needed|official HMRC filing|live submitted|guaranteed accepted/i);
  });

  it("provides the Phase 5 readiness smoke test, support runbook, and gate command", () => {
    const packageJson = read("package.json");
    const gateScript = read("scripts/hmrcPhase5ReadinessGate.mjs");
    const gateHelper = read("src/lib/mtd/hmrcPhase5ReadinessGate.js");
    const smoke = read("docs/release/hmrc-phase-5-readiness-smoke-test.md");
    const runbook = read("docs/support/hmrc-submission-support-runbook.md");

    expect(packageJson).toContain("hmrc:phase5:gate");
    expect(gateScript).toContain("READY_FOR_PHASE_5A");
    expect(gateHelper).toContain("READY_FOR_PHASE_5A");
    expect(smoke).toContain("Log in as landlord owner.");
    expect(smoke).toContain("Confirm no live submission button.");
    expect(runbook).toContain("user wants live submission enabled");
  });
});

describe("HMRC Phase 5A consent framework TODO contracts", () => {
  it.todo("blocks simulated live submission with missing_user_consent");
  it.todo("requires checkbox_confirmed=true before live submission can proceed");
  it.todo("blocks consent recorded for a different quarterly draft");
  it.todo("blocks stale consent recorded before the final reviewed and locked draft");
  it.todo("stores consent_text_version and consent_text_snapshot");
  it.todo("writes hmrc_live_submission_consent_recorded audit events");
});
