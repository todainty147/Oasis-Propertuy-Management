import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("HMRC MTD Phase 5D one-account live pilot contracts", () => {
  it("creates pilot evidence with strict type/status checks and account isolation", () => {
    const sql = read("supabase/hmrc_mtd_phase5d_one_account_live_pilot.sql");

    expect(sql).toContain("create table if not exists public.hmrc_live_pilot_evidence");
    expect(sql).toContain("constraint hmrc_live_pilot_evidence_type_check check");
    expect(sql).toContain("'support_runbook_reviewed'");
    expect(sql).toContain("'dry_run_passed'");
    expect(sql).toContain("'operator_approval'");
    expect(sql).toContain("'rollback_verified'");
    expect(sql).toContain("constraint hmrc_live_pilot_evidence_status_check check");
    expect(sql).toContain("public.enforce_hmrc_live_pilot_evidence_account");
    expect(sql).toContain("hmrc_live_pilot_evidence_account_mismatch");
  });

  it("keeps pilot evidence tenant/contractor safe and root-operator managed", () => {
    const sql = read("supabase/hmrc_mtd_phase5d_one_account_live_pilot.sql");

    expect(sql).toContain("alter table public.hmrc_live_pilot_evidence enable row level security");
    expect(sql).toContain("revoke all on public.hmrc_live_pilot_evidence from anon, authenticated");
    expect(sql).toContain("Root operators can manage HMRC live pilot evidence");
    expect(sql).toContain("public.user_is_root_operator()");
    expect(sql).toContain("Account managers can read HMRC live pilot evidence summaries");
    expect(sql).toContain("public.user_can_manage_account(account_id)");
    expect(sql).not.toMatch(/tenant.*hmrc_live_pilot_evidence/i);
    expect(sql).not.toMatch(/contractor.*hmrc_live_pilot_evidence/i);
  });

  it("limits the pilot allowlist to one enabled account and keeps live flags account-flag only", () => {
    const sql = read("supabase/hmrc_mtd_phase5d_one_account_live_pilot.sql");

    expect(sql).toContain("one_live_pilot_account_already_enabled");
    expect(sql).toContain("'hmrc_mtd_live_submission_network_enabled'");
    expect(sql).toContain("HMRC MTD live pilot flags are account-flag only and disabled by default");
    expect(sql).toContain("'hmrc_mtd_live_submission'");
    expect(sql).toContain("'hmrc_mtd_live_submission_pilot'");
    expect(sql).toContain("'hmrc_mtd_live_submission_allowlist'");
    expect(sql).toContain("'hmrc_mtd_live_submission_operator_controls'");
  });

  it("registers the Phase 5D SQL overlay after Phase 5C", () => {
    const apply = read("scripts/dbApplyRepoSql.js");
    const bootstrap = read("scripts/dbBootstrap.js");

    expect(apply.indexOf('"hmrc_mtd_phase5c_live_endpoint_skeleton.sql"')).toBeLessThan(
      apply.indexOf('"hmrc_mtd_phase5d_one_account_live_pilot.sql"'),
    );
    expect(bootstrap).toContain("Apply HMRC MTD Phase 5D one-account live pilot overlay");
  });

  it("requires operator confirmation, root operator, dry run, support, rollback and duplicate checks before live network", () => {
    const fn = read("supabase/functions/hmrc-submit-uk-property-period-summary-live-pilot/index.ts");

    expect(fn).toContain("assertLiveNetworkOperatorConfirmation");
    expect(fn).toContain("typedConfirmation");
    expect(fn).toContain("LIVE PILOT");
    expect(fn).toContain("confirmLiveNetworkSubmission");
    expect(fn).toContain("hmrc_user_is_root_operator");
    expect(fn).toContain("assertDryRunPassedForDraftConsent");
    expect(fn).toContain("support_runbook_reviewed");
    expect(fn).toContain("rollback_verified");
    expect(fn).toContain("operator_approval");
    expect(fn).toContain("assertNoExistingLiveAttempt");
    expect(fn).toContain(".eq(\"mode\", \"live_network\")");
  });

  it("keeps frontend services and quarterly draft UI away from live_network mode", () => {
    const service = read("src/services/hmrcMtdService.js");
    const component = read("src/components/compliance/QuarterlyDraftsTab.jsx");

    expect(service).toContain("mode: \"dry_run\"");
    expect(service).not.toContain("mode: \"live_network\"");
    expect(component).not.toContain("mode: \"live_network\"");
    expect(component).toContain("Live submission is not self-service");
  });

  it("handles accepted no-body responses and local success write failure safely", () => {
    const fn = read("supabase/functions/hmrc-submit-uk-property-period-summary-live-pilot/index.ts");

    expect(fn).toContain("HMRC accepted this update. No submission ID was returned by this endpoint.");
    expect(fn).toContain("noSubmissionIdReturned: true");
    expect(fn).toContain("accepted_local_write_failed");
    expect(fn).toContain("Do not retry blindly");
    expect(fn).toContain("live_network_local_write_failed");
    expect(fn).toContain("live_network_readback_failed");
  });

  it("updates the readiness gate while keeping general live submission false", () => {
    const gate = read("src/lib/mtd/hmrcPhase5ReadinessGate.js");
    const cli = read("scripts/hmrcPhase5ReadinessGate.mjs");

    expect(gate).toContain("HMRC_PHASE_5D_PILOT_READINESS_REQUIREMENTS");
    expect(gate).toContain("HMRC_REAL_LIVE_NETWORK_ATTEMPT_REQUIREMENTS");
    expect(gate).toContain("READY_FOR_PHASE_5D_PILOT");
    expect(gate).toContain("READY_FOR_REAL_LIVE_NETWORK_ATTEMPT");
    expect(gate).toContain("READY_FOR_GENERAL_LIVE_SUBMISSION: false");
    expect(gate).toContain("READY_FOR_LIVE_SUBMISSION: false");
    expect(gate).toContain("Phase 5D pilot readiness is not general live submission readiness.");
    expect(cli).toContain("READY_FOR_PHASE_5D_PILOT");
    expect(cli).toContain("READY_FOR_REAL_LIVE_NETWORK_ATTEMPT");
    expect(cli).toContain("READY_FOR_GENERAL_LIVE_SUBMISSION");
  });
});
