import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const QUARTERLY_DRAFTS = "src/components/compliance/QuarterlyDraftsTab.jsx";
const TAX_TOOLS_PAGE = "src/pages/compliance/TaxToolsPage.jsx";
const HMRC_CONNECTION_PAGE = "src/pages/compliance/HmrcConnectionPage.jsx";
const PHASE1_SQL = "supabase/hmrc_mtd_phase1.sql";
const PHASE5C_SQL = "supabase/hmrc_mtd_phase5c_live_endpoint_skeleton.sql";
const LIVE_PILOT_FUNCTION = "supabase/functions/hmrc-submit-uk-property-period-summary-live-pilot/index.ts";
const LIVE_PILOT_HELPER = "supabase/functions/_shared/hmrcLiveSubmissionPilot.ts";

function read(path) {
  return readFileSync(path, "utf8");
}

test.describe("HMRC Phase 5D dependency-path guardrails", () => {
  test("quarterly draft export and accountant-pack paths remain wired", () => {
    const quarterlyDrafts = read(QUARTERLY_DRAFTS);
    const taxTools = read(TAX_TOOLS_PAGE);

    expect(taxTools).toContain("Export / Accountant Pack");
    expect(quarterlyDrafts).toContain("exportDraftSummary");
    expect(quarterlyDrafts).toContain("generateQuarterlyDraftSummaryCsv");
    expect(quarterlyDrafts).toContain("generateQuarterlyDraftLinesCsv");
    expect(quarterlyDrafts).toContain("Record export");
    expect(quarterlyDrafts).toContain("This is a preview only. It is not submitted to HMRC.");
  });

  test("HMRC audit/support visibility remains manager-readable without exposing mutation", () => {
    const phase1 = read(PHASE1_SQL);
    const phase5c = read(PHASE5C_SQL);
    const connectionPage = read(HMRC_CONNECTION_PAGE);

    expect(phase1).toContain("create policy hmrc_api_audit_log_select_managers");
    expect(phase1).toContain("public.user_can_manage_account(account_id)");
    expect(phase1).toContain("grant select on public.hmrc_api_audit_log to authenticated");
    expect(phase1).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\.hmrc_api_audit_log\s+to\s+authenticated/i);
    expect(phase5c).toContain("Managers can read live HMRC attempt summaries");
    expect(phase5c).toContain("Managers can read live HMRC event summaries");
    expect(connectionPage).toContain("Recent HMRC audit events");
  });

  test("HMRC UI and audit paths do not render raw tokens, secrets, or ciphertext fields", () => {
    const uiSurfaces = [
      read(QUARTERLY_DRAFTS),
      read(TAX_TOOLS_PAGE),
      read(HMRC_CONNECTION_PAGE),
    ].join("\n");

    expect(uiSurfaces).not.toMatch(/access_token|refresh_token|client_secret|ciphertext/i);
    expect(uiSurfaces).toContain("Sandbox accepted status is recorded");
    expect(uiSurfaces).toContain("does not represent a live HMRC filing");
  });

  test("Phase 5D live pilot network path stays operator-only and typed-confirmed", () => {
    const livePilotFunction = read(LIVE_PILOT_FUNCTION);
    const livePilotHelper = read(LIVE_PILOT_HELPER);

    expect(livePilotFunction).toContain("Only a Tenaqo root operator can trigger the one-account live network pilot.");
    expect(livePilotFunction).toContain("typedConfirmation");
    expect(livePilotFunction).toContain("LIVE PILOT");
    expect(livePilotFunction).toContain("confirmLiveNetworkSubmission");
    expect(livePilotFunction).toContain("assertPhase5DLivePilotEvidence");
    expect(livePilotHelper).toContain("pilotAllowed: true");
    expect(livePilotHelper).toContain("live_pilot_blocked");
    expect(livePilotHelper).toContain("live_pilot_checked");
  });
});
