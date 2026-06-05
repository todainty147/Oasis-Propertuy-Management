import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("HMRC Phase 5C controlled live endpoint skeleton contracts", () => {
  it("creates additive live attempt and event tables with safe defaults and event types", () => {
    const sql = read("supabase/hmrc_mtd_phase5c_live_endpoint_skeleton.sql");

    expect(sql).toContain("create table if not exists public.hmrc_live_submission_attempts");
    expect(sql).toContain("mode text not null default 'dry_run'");
    expect(sql).toContain("status text not null default 'started'");
    expect(sql).toContain("constraint hmrc_live_submission_attempts_mode_check check (mode in ('dry_run', 'live_network'))");
    expect(sql).toContain("constraint hmrc_live_submission_attempts_status_check check (status in ('started', 'dry_run_passed', 'blocked', 'validation_failed', 'success', 'failed'))");
    expect(sql).toContain("create unique index if not exists idx_hmrc_live_submission_attempts_one_success");
    expect(sql).toContain("create table if not exists public.hmrc_live_submission_events");
    [
      "live_dry_run_started",
      "live_dry_run_passed",
      "live_submission_blocked",
      "live_network_submission_started",
      "live_network_submission_success",
      "live_network_submission_failed",
      "live_duplicate_blocked",
      "live_operator_kill_switch_checked",
    ].forEach((event) => expect(sql).toContain(event));
  });

  it("keeps live flags account-flag-only and defaults network disabled", () => {
    const sql = read("supabase/hmrc_mtd_phase5c_live_endpoint_skeleton.sql");
    const entitlements = read("src/lib/entitlements.js");
    const accountEntitlements = read("supabase/account_entitlements.sql");

    expect(entitlements).toContain("HMRC_MTD_LIVE_SUBMISSION_DRY_RUN");
    expect(entitlements).toContain("HMRC_MTD_LIVE_SUBMISSION_NETWORK_ENABLED");
    expect(sql).toContain("('hmrc_mtd_live_submission_dry_run', false)");
    expect(sql).toContain("('hmrc_mtd_live_submission_network_enabled', false)");
    expect(sql).toContain("on conflict (account_id, feature_key) do nothing");
    expect(accountEntitlements).toContain("'hmrc_mtd_live_submission_dry_run'");
    expect(accountEntitlements).toContain("'hmrc_mtd_live_submission_network_enabled'");
  });

  it("write-locks live attempts and events from authenticated clients", () => {
    const sql = read("supabase/hmrc_mtd_phase5c_live_endpoint_skeleton.sql");

    expect(sql).toContain("alter table public.hmrc_live_submission_attempts enable row level security");
    expect(sql).toContain("alter table public.hmrc_live_submission_events enable row level security");
    expect(sql).toContain("revoke all on public.hmrc_live_submission_attempts from anon, authenticated");
    expect(sql).toContain("revoke all on public.hmrc_live_submission_events from anon, authenticated");
    expect(sql).toContain("public.user_can_manage_account(account_id)");
    expect(sql).toContain("public.hmrc_live_submission_pilot_enabled(account_id)");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*hmrc_live_submission_attempts.*authenticated/i);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*hmrc_live_submission_events.*authenticated/i);
  });

  it("creates a live pilot Edge Function that dry-runs by default and enforces Phase 5A/5B guards", () => {
    const fn = read("supabase/functions/hmrc-submit-uk-property-period-summary-live-pilot/index.ts");

    expect(fn).toContain("const mode = normalizeMode(body.mode)");
    expect(fn).toContain("confirmLivePilot");
    expect(fn).toContain("assertHmrcLiveSubmissionPilotAllowed");
    expect(fn).toContain("assertDryRunFeatureEnabled(accountId)");
    expect(fn).toContain("p_feature: \"hmrc_mtd_live_submission_dry_run\"");
    expect(fn).toContain("supportRunbookReady");
    expect(fn).toContain("buildUkPropertyPeriodSummaryPayload");
    expect(fn).toContain("mode === \"dry_run\"");
    expect(fn).toContain("networkCallMade: false");
    expect(fn).toContain("Live submission dry run passed. No data was sent to HMRC.");
    expect(fn.indexOf("mode === \"dry_run\"")).toBeLessThan(fn.indexOf("performLiveNetworkSubmission"));
  });

  it("blocks live network by explicit feature and environment kill switches", () => {
    const fn = read("supabase/functions/hmrc-submit-uk-property-period-summary-live-pilot/index.ts");

    expect(fn).toContain("assertNetworkFeatureEnabled(accountId)");
    expect(fn).toContain("p_feature: \"hmrc_mtd_live_submission_network_enabled\"");
    expect(fn).toContain("export function assertHmrcLiveNetworkEnabled()");
    expect(fn).toContain("HMRC_LIVE_NETWORK_ENABLED !== \"true\"");
    expect(fn).toContain("HMRC_ENVIRONMENT !== \"live\"");
    expect(fn).toContain("HMRC_BASE_URL !== HMRC_PRODUCTION_API_BASE_URL");
    expect(fn).toContain("Deno.env.get(\"HMRC_LIVE_SUBMISSION_ENABLED\")");
    expect(fn).toContain("String(HMRC_LIVE_SUBMISSION_ENABLED).toLowerCase() !== \"true\"");
    expect(fn).toContain("live_operator_kill_switch_checked");
    expect(fn).toContain("live_network_disabled");
    expect(fn).toContain("safeWriteLiveEvent(args.accountId");
  });

  it("has a server-side duplicate live submission guard while allowing repeated dry runs", () => {
    const fn = read("supabase/functions/hmrc-submit-uk-property-period-summary-live-pilot/index.ts");

    expect(fn).toContain("assertLiveNetworkDuplicateClear");
    expect(fn).toContain(".eq(\"mode\", \"live_network\")");
    expect(fn).toContain(".in(\"status\", [\"started\", \"success\"])");
    expect(fn).toContain("draft?.live_submitted_at");
    expect(fn).toContain("draft?.live_submission_status === \"success\"");
    expect(fn).toContain("live_duplicate_blocked");
    expect(fn.indexOf("if (mode === \"dry_run\")")).toBeLessThan(fn.indexOf("assertLiveNetworkDuplicateClear"));
    expect(fn.indexOf("await markDraftLiveSubmitted")).toBeLessThan(fn.indexOf("eventType: \"live_network_submission_success\""));
    expect(fn).toContain("await safeWriteLiveEvent(accountId, {");
  });

  it("safe frontend service calls dry_run only and does not expose tokens or raw HMRC payload", () => {
    const service = read("src/services/hmrcMtdService.js");

    expect(service).toContain("runHmrcUkPropertyPeriodSummaryLiveDryRun");
    expect(service).toContain("hmrc-submit-uk-property-period-summary-live-pilot");
    expect(service).toContain("mode: \"dry_run\"");
    expect(service).not.toContain("mode: \"live_network\"");
    expect(service).not.toMatch(/access_token|refresh_token|client_secret/i);
  });

  it("UI exposes dry-run only and no public live filing button", () => {
    const component = read("src/components/compliance/QuarterlyDraftsTab.jsx");

    expect(component).toContain("Run live submission dry run");
    expect(component).toContain("liveDryRunFeatureEnabled");
    expect(component).toContain("canRunLiveDryRun");
    expect(component).toContain("[\"Dry run feature\", liveDryRunFeatureEnabled ? \"Enabled\" : \"Disabled\"]");
    expect(component).toContain("Live submission dry run passed. No data was sent to HMRC.");
    expect(component).toContain("READY_FOR_LIVE_SUBMISSION");
    expect(component).toContain("[\"Live network\", \"Disabled\"]");
    expect(component).not.toMatch(/Submit live|File with HMRC|Submit to HMRC live|Fully MTD compliant|HMRC-recognised|HMRC recognised|Tax advice/i);
    expect(component).not.toContain("mode: \"live_network\"");
  });

  it("documents Phase 5C checkpoint and keeps READY_FOR_LIVE_SUBMISSION false", () => {
    const release = read("docs/release/hmrc-phase5c-live-endpoint-skeleton.md");
    const checkpoint = read("docs/release/hmrc-phase5c-security-checkpoint.md");
    const roadmap = read("docs/integrations/hmrc-mtd-roadmap.md");
    const runbook = read("docs/support/hmrc-submission-support-runbook.md");

    expect(release).toContain("Dry run is the default mode");
    expect(release).toContain("sends no data to HMRC");
    expect(release).toContain("No general live rollout");
    expect(release).toContain("READY_FOR_LIVE_SUBMISSION` remains `false`");
    expect(checkpoint).toContain("Phase 5C is an endpoint skeleton and dry-run control layer. It does not make Tenaqo live-submission ready.");
    expect(checkpoint).toContain("The flag now seeds `false`.");
    expect(checkpoint).toContain("The success event now uses `safeWriteLiveEvent`.");
    expect(checkpoint).toContain("This is deliberately preserved as a hard DB failure.");
    expect(checkpoint).toContain("Catch-path event writes now use `safeWriteLiveEvent`.");
    expect(checkpoint).toContain("Phase 5C now uses the shared `HMRC_LIVE_SUBMISSION_ENABLED` name.");
    expect(roadmap).toContain("Phase 5C live endpoint skeleton/dry run - complete");
    expect(roadmap).toContain("Phase 5D one-account live network pilot - current");
    expect(runbook).toContain("dry run passed but no HMRC filing occurred");
    expect(runbook).toContain("dry run flag disabled");
    expect(runbook).toContain("operator kill switch disabled");
    expect(runbook).toContain("HMRC accepted but local success write failed");
    expect(runbook).toContain("user asks why live submit button is missing");
    expect(runbook).toContain("user asks whether sandbox or dry run counts as filing");
    expect(runbook).toContain("user asks whether Tenaqo guarantees MTD compliance");
    expect(runbook).toContain("Dry run does not send data to HMRC.");
    expect(runbook).toContain("Sandbox submission does not affect a real HMRC account.");
    expect(runbook).toContain("Live HMRC submission is not enabled for general users.");
    expect(runbook).toContain("Tenaqo does not provide tax advice.");
  });
});
