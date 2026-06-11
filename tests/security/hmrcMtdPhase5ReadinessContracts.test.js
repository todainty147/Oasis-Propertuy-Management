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
    const sandboxFunction = read("supabase/functions/hmrc-submit-uk-property-period-summary-sandbox/index.ts");

    expect(component).toContain("hasSuccessfulSandboxAttempt");
    expect(component).toContain("disabled={busy || !canSubmitSandbox || hasSuccessfulSandboxAttempt}");
    expect(component).toContain("Create a new draft or amendment flow to test another submission.");
    expect(sandboxFunction).toContain("already_submitted");
    expect(sandboxFunction).toContain("draftRecord.sandbox_submission_status");
    expect(sandboxFunction).toContain("draftRecord.sandbox_submitted_at");
    expect(draftService).toContain(".order(\"submitted_at\", { ascending: false })");
    expect(readinessDocs).toContain("Confirm repeat submit disabled.");
  });

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
    expect(phase3).toContain("using (public.user_can_manage_account(account_id))");
    expect(phase3).not.toContain("public.user_can_manage_account(account_id) and public.account_has_feature(account_id, 'hmrc_mtd_quarterly_draft_builder')");
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
    expect(gateScript).toContain("Timestamp:");
    expect(gateScript).toContain("Git commit:");
    expect(gateScript).toContain("--evidence-file=");
    expect(gateScript).toContain("Missing evidence:");
    expect(gateHelper).toContain("READY_FOR_PHASE_5A");
    expect(gateHelper).toContain("READY_FOR_PHASE_5A only means ready to begin Phase 5A readiness work. It does not enable live submission.");
    expect(smoke).toContain("Log in as landlord owner.");
    expect(smoke).toContain("Confirm no live submission button.");
    expect(runbook).toContain("user wants live submission enabled");
  });
});

describe("HMRC Phase 5A consent framework contracts", () => {
  it("blocks simulated live submission with missing_user_consent", () => {
    const helper = read("supabase/functions/_shared/hmrcLiveSubmissionConsent.ts");
    const sql = read("supabase/hmrc_mtd_phase5a_consent_scaffolding.sql");

    expect(helper).toContain("assertHmrcLiveSubmissionConsent");
    expect(helper).toContain("missing_user_consent");
    expect(helper).toContain("Explicit landlord consent is required before live HMRC submission.");
    expect(sql).toContain("assert_hmrc_live_submission_consent");
    expect(sql).toContain("raise exception 'missing_user_consent'");
  });

  it("requires checkbox_confirmed=true before live submission can proceed", () => {
    const helper = read("supabase/functions/_shared/hmrcLiveSubmissionConsent.ts");
    const sql = read("supabase/hmrc_mtd_phase5a_consent_scaffolding.sql");

    expect(sql).toContain("checkbox_confirmed boolean not null");
    expect(sql).toContain("checkbox_confirmed is true");
    expect(sql).toContain("p_checkbox_confirmed is distinct from true");
    expect(sql).toContain("raise exception 'checkbox_confirmed_required'");
    expect(helper).toContain("checkbox_confirmed_required");
  });

  it("blocks consent recorded for a different quarterly draft", () => {
    const sql = read("supabase/hmrc_mtd_phase5a_consent_scaffolding.sql");

    expect(sql).toContain("enforce_hmrc_live_submission_consent_account");
    expect(sql).toContain("HMRC live submission consent draft account mismatch");
    expect(sql).toContain("v_consent.account_id <> p_account_id or v_consent.draft_id <> p_draft_id");
    expect(sql).toContain("raise exception 'consent_draft_mismatch'");
  });

  it("blocks stale consent recorded before the final reviewed and locked draft", () => {
    const sql = read("supabase/hmrc_mtd_phase5a_consent_scaffolding.sql");
    const helper = read("supabase/functions/_shared/hmrcLiveSubmissionConsent.ts");

    expect(sql).toContain("draft_status_at_consent = 'locked'");
    expect(sql).toContain("v_draft.status <> 'locked'");
    expect(sql).toContain("draft_review_and_lock_required_for_live_consent");
    expect(sql).toContain("v_consent.draft_updated_at_at_consent is distinct from v_draft.updated_at");
    expect(sql).toContain("v_consent.draft_lines_hash is distinct from public.hmrc_quarterly_draft_lines_snapshot_hash");
    expect(sql).toContain("v_consent.category_totals_hash is distinct from md5");
    expect(sql).toContain("v_consent.validation_summary_hash is distinct from md5");
    expect(sql).toContain("v_consent.payload_preview_hash is distinct from md5");
    expect(sql).toContain("raise exception 'stale_user_consent'");
    expect(helper).toContain("The quarterly draft changed after consent was recorded.");
  });

  it("stores independent draft snapshot hashes for lines, totals, validation and payload", () => {
    const sql = read("supabase/hmrc_mtd_phase5a_consent_scaffolding.sql");

    expect(sql).toContain("hmrc_quarterly_draft_lines_snapshot_hash");
    expect(sql).toContain("v_lines_hash text");
    expect(sql).toContain("v_lines_hash := public.hmrc_quarterly_draft_lines_snapshot_hash");
    expect(sql).toContain("draft_lines_hash text not null");
    expect(sql).toContain("category_totals_hash text not null");
    expect(sql).toContain("validation_summary_hash text not null");
    expect(sql).toContain("payload_preview_hash text");
    expect(sql).toContain("payload_preview_hash = coalesce(payload_preview_hash, md5(''))");
    expect(sql).toContain("'draftLinesHash'");
    expect(sql).toContain("'categoryTotalsHash'");
    expect(sql).toContain("'validationSummaryHash'");
    expect(sql).toContain("'payloadPreviewHash'");
  });

  it("keeps old stale consent auditable while allowing a later consent to be asserted", () => {
    const sql = read("supabase/hmrc_mtd_phase5a_consent_scaffolding.sql");

    expect(sql).toContain("created_at timestamptz not null default now()");
    expect(sql).toContain("idx_hmrc_live_submission_consents_draft");
    expect(sql).toContain("order by l.transaction_date, l.id");
    expect(sql).not.toMatch(/unique\s*\(\s*account_id\s*,\s*draft_id/i);
    expect(sql).toContain("before update or delete on public.hmrc_live_submission_consents");
  });

  it("stores consent_text_version and consent_text_snapshot", () => {
    const sql = read("supabase/hmrc_mtd_phase5a_consent_scaffolding.sql");

    expect(sql).toContain("consent_text_version text not null");
    expect(sql).toContain("consent_text_snapshot text not null");
    expect(sql).toContain("consent_text_version_required");
    expect(sql).toContain("consent_text_snapshot_required");
    expect(sql).toContain("trim(p_consent_text_version)");
    expect(sql).toContain("trim(p_consent_text_snapshot)");
  });

  it("writes hmrc_live_submission_consent_recorded audit events", () => {
    const sql = read("supabase/hmrc_mtd_phase5a_consent_scaffolding.sql");

    expect(sql).toContain("mtd_quarterly_update_audit_events");
    expect(sql).toContain("hmrc_live_submission_consent_recorded");
    expect(sql).toContain("'consentId', v_consent_id");
    expect(sql).toContain("'consentTextVersion', trim(p_consent_text_version)");
    expect(sql).toContain("'accountId', p_account_id");
    expect(sql).toContain("'draftId', p_draft_id");
    expect(sql).toContain("'userId', auth.uid()");
    expect(sql).toContain("'confirmedAt', now()");
    expect(sql).not.toMatch(/access_token|refresh_token|client_secret/i);
  });

  it("keeps consent rows append-only and manager-scoped", () => {
    const sql = read("supabase/hmrc_mtd_phase5a_consent_scaffolding.sql");

    expect(sql).toContain("alter table public.hmrc_live_submission_consents enable row level security");
    expect(sql).toContain("revoke all on public.hmrc_live_submission_consents from anon, authenticated");
    expect(sql).toContain("grant select on public.hmrc_live_submission_consents to authenticated");
    expect(sql).toContain("before update or delete on public.hmrc_live_submission_consents");
    expect(sql).toContain("revoke execute on function public.assert_hmrc_live_submission_consent(uuid, uuid, uuid) from authenticated");
    expect(sql).toContain("grant execute on function public.assert_hmrc_live_submission_consent(uuid, uuid, uuid) to service_role");
    expect(sql).toContain("public.user_can_manage_account(account_id)");
    expect(sql).toContain("public.user_can_manage_account(account_id)");
    expect(sql).not.toContain("public.account_has_feature(account_id, 'hmrc_mtd_quarterly_draft_builder')");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*hmrc_live_submission_consents.*authenticated/i);
  });

  it("prevents tenant, contractor and cross-account consent access through manager/account checks", () => {
    const sql = read("supabase/hmrc_mtd_phase5a_consent_scaffolding.sql");

    expect(sql).toContain("if not public.user_can_manage_account(p_account_id) then");
    expect(sql).toContain("raise exception 'not_permitted'");
    expect(sql).toContain("where d.id = p_draft_id");
    expect(sql).toContain("and d.account_id = p_account_id");
    expect(sql).toContain("HMRC live submission consent draft account mismatch");
    expect(sql).toContain("v_consent.account_id <> p_account_id or v_consent.draft_id <> p_draft_id");
  });

  it("keeps the Edge helper strict and safe", () => {
    const helper = read("supabase/functions/_shared/hmrcLiveSubmissionConsent.ts");

    expect(helper).toContain("accountId: string");
    expect(helper).toContain("draftId: string");
    expect(helper).toContain("userId: string");
    expect(helper).toContain("Missing authenticated user id.");
    expect(helper).toContain("assert_hmrc_live_submission_consent");
    expect(helper).toContain("consent_draft_mismatch");
    expect(helper).toContain("stale_user_consent");
    expect(helper).toContain("not_permitted");
    expect(helper).toContain("You do not have permission to submit for this account.");
    expect(helper).toContain("quarterly_draft_not_found");
    expect(helper).toContain("The quarterly draft was not found. It may have been deleted.");
    expect(helper).toContain("consentTextVersion");
    expect(helper).not.toContain("consent_text_snapshot");
    expect(helper).not.toMatch(/access_token|refresh_token|client_secret/i);
  });

  it("keeps consent readiness copy away from live-filing claims", () => {
    const docs = read("docs/release/hmrc-phase5a-consent-scaffolding.md");
    const component = read("src/components/compliance/QuarterlyDraftsTab.jsx");

    for (const surface of [docs, component]) {
      expect(surface).toContain("Live submission is not enabled");
      expect(surface).toContain("Future live submission will require explicit consent");
      expect(surface).toContain("Consent framework ready");
      expect(surface).not.toMatch(/Submit live|File with HMRC|MTD compliant|HMRC recognised|Tax advice/i);
    }
  });
});
