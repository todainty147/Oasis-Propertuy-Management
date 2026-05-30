import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("HMRC MTD Phase 4 sandbox submission contracts", () => {
  it("stores sandbox submission attempts and events without authenticated writes", () => {
    const sql = read("supabase/hmrc_mtd_phase4_sandbox_submission.sql");

    expect(sql).toContain("create table if not exists public.mtd_quarterly_submission_attempts");
    expect(sql).toContain("submission_mode text not null default 'sandbox'");
    expect(sql).toContain("submission_type text not null default 'uk_property_period_summary'");
    expect(sql).toContain("hmrc_connection_id uuid");
    expect(sql).toContain("mtd_quarterly_submission_attempts_connection_fkey");
    expect(sql).toContain("foreign key (hmrc_connection_id)");
    expect(sql).toContain("status in ('started', 'success', 'failed', 'blocked', 'validation_failed')");
    expect(sql).toContain("create table if not exists public.mtd_quarterly_submission_events");
    expect(sql).toContain("sandbox_submission_attempt_id");
    expect(sql).toContain("sandbox_receipt_summary");
    expect(sql).toContain("mtd_quarterly_submission_events_type_check");
    expect(sql).toContain("revoke all on public.mtd_quarterly_submission_attempts from anon, authenticated");
    expect(sql).toContain("revoke all on public.mtd_quarterly_submission_events from anon, authenticated");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("enforce_mtd_quarterly_submission_attempt_account");
    expect(sql).toContain("MTD quarterly submission attempt account mismatch");
    expect(sql).toContain("grant select on public.mtd_quarterly_submission_attempts to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on public\.mtd_quarterly_submission_attempts to authenticated/i);
  });

  it("keeps sandbox submission behind exact sandbox guards and feature flags", () => {
    const fn = read("supabase/functions/hmrc-submit-uk-property-period-summary-sandbox/index.ts");

    expect(fn).toContain("hmrc_mtd_sandbox_submission");
    expect(fn).toContain("hmrc_mtd_live_submission");
    expect(fn).toContain("HMRC_ENVIRONMENT !== \"sandbox\"");
    expect(fn).toContain("HMRC_BASE_URL !== \"https://test-api.service.hmrc.gov.uk\"");
    expect(fn).toContain("confirmSandboxSubmission");
    expect(fn).toContain("assertWriteSelfAssessmentScope");
    expect(fn).toContain("Only reviewed or locked quarterly drafts can be submitted");
    expect(fn).toContain("Resolve quarterly draft issues before sandbox submission");
    expect(fn).toContain("buildPropertyBusinessReadPath");
    expect(fn).toContain("method: \"PUT\"");
    expect(fn).toContain("assertSupportedSubmissionTaxYear");
    expect(fn).toContain("safeWriteSubmissionEvent");
    expect(fn).toContain("safeCompleteAttempt");
    expect(fn).toContain("updateDraftSandboxReceipt");
    expect(fn).toContain("status === 403 ? \"blocked\" : \"failed\"");
    expect(fn).toContain("sandbox_submission_success");
    expect(fn).toContain("sandbox_submission_retrieved_after_submit");
    expect(fn).toContain("safeSummary");
    expect(fn).not.toContain("safeSummary: { access_token");
    expect(fn).not.toContain("safeSummary: { refresh_token");
  });

  it("uses safe disconnect revocation metadata", () => {
    const disconnect = read("supabase/functions/hmrc-disconnect/index.ts");

    expect(disconnect).toContain("revocationAttempted");
    expect(disconnect).toContain("revocationStatus");
    expect(disconnect).toContain("environment: HMRC_ENVIRONMENT");
    expect(disconnect).toContain("timestamp");
    expect(disconnect).not.toContain("revoke_endpoint_called");
    expect(disconnect).not.toContain("revoke_ok");
    expect(disconnect).toContain("requestSummary: revokeSummary");
    expect(disconnect).not.toContain("access_token:");
    expect(disconnect).not.toContain("refresh_token:");
  });

  it("wires the Quarterly Drafts UI to sandbox submission without a live button", () => {
    const component = read("src/components/compliance/QuarterlyDraftsTab.jsx");
    const page = read("src/pages/compliance/TaxToolsPage.jsx");
    const service = read("src/services/hmrcMtdService.js");

    expect(page).toContain("const sandboxSubmissionEnabled = hasEntitlement(ENTITLEMENT_FEATURES.HMRC_MTD_SANDBOX_SUBMISSION)");
    expect(page).toContain("sandboxSubmissionEnabled={sandboxSubmissionEnabled}");
    expect(component).toContain("HMRC Sandbox Submission");
    expect(component).toContain("Submit to HMRC sandbox");
    expect(component).toContain("connectionStatus === \"connected\"");
    expect(component).toContain("connection?.connection_status");
    expect(component).toContain("I understand this is a sandbox test submission only");
    expect(component).toContain("setConfirmSandbox(false)");
    expect(component).toContain("hasSuccessfulSandboxAttempt");
    expect(read("src/services/mtdQuarterlyDraftService.js")).toContain("No submission ID returned; 204 No Content accepted.");
    expect(component).toContain("Earlier failed attempts may reflect previous sandbox payload validation");
    expect(component).toContain("This draft has already been submitted to HMRC sandbox");
    expect(component).toContain("Live submission disabled");
    expect(page).toContain("Sandbox submission tested successfully. Live HMRC submission remains disabled.");
    expect(page).toContain("This was a sandbox submission and does not represent a live HMRC filing.");
    expect(service).toContain("hmrc-submit-uk-property-period-summary-sandbox");
    expect(read("src/services/mtdQuarterlyDraftService.js")).toContain(".order(\"submitted_at\", { ascending: false })");
    expect(`${component}\n${service}`).not.toMatch(/access_token|refresh_token|HMRC_CLIENT_SECRET|VITE_HMRC/);
    expect(component).not.toContain("Submit to live HMRC");
  });
});
