import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("HMRC Phase 5B controlled live pilot contracts", () => {
  it("adds explicit live pilot flags without putting them in starter plan entitlements", () => {
    const entitlements = read("src/lib/entitlements.js");
    const sql = read("supabase/hmrc_mtd_phase5b_live_pilot.sql");

    [
      "hmrc_mtd_live_submission",
      "hmrc_mtd_live_submission_pilot",
      "hmrc_mtd_live_submission_allowlist",
      "hmrc_mtd_live_submission_operator_controls",
    ].forEach((flag) => {
      expect(entitlements).toContain(flag);
      expect(sql).toContain(`'${flag}'`);
    });

    const planSection = entitlements.slice(entitlements.indexOf("const STARTER_FEATURES"), entitlements.indexOf("export const PLAN_ENTITLEMENTS"));
    expect(planSection).not.toContain("HMRC_MTD_LIVE_SUBMISSION");
    expect(planSection).not.toContain("HMRC_MTD_LIVE_SUBMISSION_PILOT");
    expect(planSection).not.toContain("HMRC_MTD_LIVE_SUBMISSION_ALLOWLIST");
    expect(planSection).not.toContain("HMRC_MTD_LIVE_SUBMISSION_OPERATOR_CONTROLS");
  });

  it("creates an account-scoped pilot allowlist with audit fields and disabled defaults", () => {
    const sql = read("supabase/hmrc_mtd_phase5b_live_pilot.sql");

    expect(sql).toContain("create table if not exists public.hmrc_live_submission_pilot_accounts");
    expect(sql).toContain("account_id uuid not null references public.accounts(id) on delete cascade");
    expect(sql).toContain("enabled boolean not null default false");
    expect(sql).toContain("enabled_by uuid");
    expect(sql).toContain("enabled_at timestamptz");
    expect(sql).toContain("disabled_by uuid");
    expect(sql).toContain("disabled_at timestamptz");
    expect(sql).not.toContain(" nullable");
    expect(sql).toContain("unique(account_id)");
    expect(sql).toContain("on conflict (account_id, feature_key) do nothing");
  });

  it("keeps allowlist mutation root/operator controlled and auditable", () => {
    const sql = read("supabase/hmrc_mtd_phase5b_live_pilot.sql");

    expect(sql).toContain("set_hmrc_live_submission_pilot_account");
    expect(sql).toContain("if not public.user_is_root_operator() then");
    expect(sql).toContain("raise exception 'not_permitted'");
    expect(sql).toContain("live_pilot_enabled");
    expect(sql).toContain("live_pilot_disabled");
    expect(sql).toContain("hmrc_api_audit_log");
    expect(sql).toContain("jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''))");
    expect(sql).toContain("jsonb_build_object('enabled', p_enabled)");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*hmrc_live_submission_pilot_accounts.*authenticated/i);
  });

  it("blocks tenants, contractors, normal landlord mutation and cross-account reads through RLS", () => {
    const sql = read("supabase/hmrc_mtd_phase5b_live_pilot.sql");

    expect(sql).toContain("alter table public.hmrc_live_submission_pilot_accounts enable row level security");
    expect(sql).toContain("revoke all on public.hmrc_live_submission_pilot_accounts from anon, authenticated");
    expect(sql).toContain("using (public.user_can_manage_account(account_id))");
    expect(sql).toContain("if auth.uid() is not null and not public.user_can_manage_account(p_account_id) then");
    expect(sql).toContain("grant select on public.hmrc_live_submission_pilot_accounts to authenticated");
    expect(sql).toContain("grant execute on function public.set_hmrc_live_submission_pilot_account(uuid, boolean, text) to authenticated");
    expect(sql).not.toMatch(/create\s+policy[\s\S]+for\s+(insert|update|delete)[\s\S]+hmrc_live_submission_pilot_accounts/i);
  });

  it("implements a server-side pilot guard without making a live network submission", () => {
    const helper = read("supabase/functions/_shared/hmrcLiveSubmissionPilot.ts");

    expect(helper).toContain("assertHmrcLiveSubmissionPilotAllowed");
    [
      "Missing account id.",
      "Missing quarterly draft id.",
      "Missing authenticated user id.",
      "Explicit landlord consent is required before live HMRC submission.",
      "owner_or_admin_required",
      "live_feature_disabled",
      "live_pilot_feature_disabled",
      "account_not_allowlisted",
      "sandbox_environment",
      "production_base_url_not_configured",
      "duplicate_successful_live_submission",
      "draft_not_reviewed_and_locked",
      "draft_has_unresolved_issues",
      "consent_user_mismatch",
      "live_connection_missing",
      "live_token_not_refreshable",
      "support_runbook_not_ready",
    ].forEach((block) => expect(helper).toContain(block));
    expect(helper).toContain("hmrc_mtd_live_submission");
    expect(helper).toContain("hmrc_mtd_live_submission_pilot");
    expect(helper).toContain("checkFeature");
    expect(helper).toContain("live_feature_disabled");
    expect(helper).toContain("live_pilot_feature_disabled");
    expect(helper).toContain("hmrc_live_submission_pilot_accounts");
    expect(helper).toContain("owner\", \"admin");
    expect(helper).toContain("draft.status !== \"locked\"");
    expect(helper).toContain("countUnresolvedIssues");
    expect(helper).toContain("assertHmrcLiveSubmissionConsent");
    expect(helper).toContain("assertHmrcLiveSubmissionConsent({ accountId, draftId, userId, consentId })");
    expect(helper).toContain("consent_user_mismatch");
    expect(helper).toContain("environment\", \"live");
    expect(helper).toContain("HMRC_BASE_URL === HMRC_SANDBOX_API_BASE_URL");
    expect(helper).toContain("hasValidOrRefreshableToken");
    expect(helper).toContain("access_token_expires_at");
    expect(helper).toContain("refresh_token_expires_at");
    expect(helper).toContain("duplicate_successful_live_submission");
    expect(helper).toContain("try {");
    expect(helper).toContain("console.warn(\"[hmrc-live-pilot] audit block insert failed\"");
    expect(helper).toContain("console.warn(\"[hmrc-live-pilot] success audit insert failed\"");
    expect(helper).toContain("live_pilot_checked");
    expect(helper).toContain("live_pilot_blocked");
    expect(helper).not.toMatch(/fetch\s*\(|submit.*live|period-summary.*POST/i);
  });

  it("documents Phase 5B consent and pilot interactions without bypassing Phase 5A", () => {
    const helper = read("supabase/functions/_shared/hmrcLiveSubmissionPilot.ts");
    const consentHelper = read("supabase/functions/_shared/hmrcLiveSubmissionConsent.ts");

    expect(helper.indexOf("const allowlist = await getAllowlist(accountId)")).toBeLessThan(helper.indexOf("const consent = await assertHmrcLiveSubmissionConsent"));
    expect(helper.indexOf("draft.status !== \"locked\"")).toBeLessThan(helper.indexOf("const consent = await assertHmrcLiveSubmissionConsent"));
    expect(helper).toContain("countUnresolvedIssues(draft) > 0");
    expect(helper).toContain("consent_user_mismatch");
    expect(consentHelper).toContain("stale_user_consent");
    expect(consentHelper).toContain("consent_draft_mismatch");
    expect(consentHelper).toContain("p_account_id");
    expect(consentHelper).toContain("p_draft_id");
    expect(consentHelper).toContain("consentedBy: string");
  });

  it("renders a readiness-only UI panel with no enabled live submit button", () => {
    const component = read("src/components/compliance/QuarterlyDraftsTab.jsx");
    const page = read("src/pages/compliance/TaxToolsPage.jsx");

    expect(component).toContain("Live HMRC submission pilot");
    expect(component).toContain("livePilotStatus !== null");
    expect(component).toContain("Live submission: Disabled / Pilot controls only");
    expect(component).toContain("Live HMRC submission is not available for this account.");
    expect(component).toContain("This account is eligible for a controlled pilot, but live submission is not enabled from this screen yet.");
    expect(component).toContain("Run live submission dry run");
    expect(component).toContain("[\"Live network\", \"Disabled\"]");
    expect(component).not.toContain("Submit to live HMRC");
    expect(component).not.toContain("mode: \"live_network\"");
    expect(component).not.toMatch(/fully MTD compliant|guaranteed compliant|HMRC recognised/i);
    expect(page).toContain("livePilotControlsEnabled");
    expect(page).toContain("livePilotStatus={livePilotStatus}");
  });

  it("contains no callable live HMRC submission endpoint or unsafe live filing copy", () => {
    const service = read("src/services/hmrcMtdService.js");
    const component = read("src/components/compliance/QuarterlyDraftsTab.jsx");
    const pilotHelper = read("supabase/functions/_shared/hmrcLiveSubmissionPilot.ts");
    const sandboxFunction = read("supabase/functions/hmrc-submit-uk-property-period-summary-sandbox/index.ts");

    [service, component, pilotHelper].forEach((surface) => {
      expect(surface).not.toMatch(/Submit live|File with HMRC|Live filed|Fully MTD compliant|HMRC-recognised|HMRC recognised|Tax advice/i);
    });
    expect(service).not.toContain("mode: \"live_network\"");
    expect(component).not.toContain("mode: \"live_network\"");
    expect(pilotHelper).not.toMatch(/fetch\s*\(|period-summary.*POST|submit.*live/i);
    expect(sandboxFunction).toContain("HMRC_BASE_URL !== \"https://test-api.service.hmrc.gov.uk\"");
  });

  it("extends the readiness gate while keeping READY_FOR_LIVE_SUBMISSION false", () => {
    const helper = read("src/lib/mtd/hmrcPhase5ReadinessGate.js");
    const script = read("scripts/hmrcPhase5ReadinessGate.mjs");

    [
      "livePilotAllowlistImplemented",
      "livePilotGuardImplemented",
      "livePilotUiSafe",
      "livePilotSupportRunbookReady",
      "liveSubmissionEndpointStillDisabled",
    ].forEach((flag) => {
      expect(helper).toContain(flag);
    });
    expect(helper).toContain("READY_FOR_PHASE_5B");
    expect(helper).toContain("READY_FOR_LIVE_SUBMISSION: false");
    expect(helper).toContain("Phase 5B readiness does not enable live submission.");
    expect(helper).toContain("READY_FOR_LIVE_SUBMISSION remains false until a later controlled live endpoint phase.");
    expect(script).toContain("HMRC_PHASE_5B_READINESS_REQUIREMENTS");
    expect(script).toContain("READY_FOR_PHASE_5B");
    expect(script).toContain("READY_FOR_LIVE_SUBMISSION");
    expect(script).toContain("Timestamp:");
    expect(script).toContain("Git commit:");
    expect(script).toContain("Evidence source:");
    expect(script).toContain("Manual evidence:");
    expect(script).toContain("Automated evidence:");
    expect(script).toContain("Missing evidence:");
  });

  it("updates support and release docs with required pilot-safe wording", () => {
    const runbook = read("docs/support/hmrc-submission-support-runbook.md");
    const release = read("docs/release/hmrc-phase5b-live-pilot-design.md");

    [
      "account not allowlisted",
      "pilot disabled",
      "stale consent",
      "draft changed after consent",
      "live token expired",
      "live HMRC connection missing",
      "duplicate live submission blocked",
      "user asks to enable live submission",
      "user asks whether sandbox submission counts as filing",
      "user asks whether Tenaqo guarantees compliance",
      "Live HMRC submission is only available through a controlled pilot when explicitly enabled. Sandbox submissions do not affect a real HMRC account.",
    ].forEach((copy) => expect(runbook).toContain(copy));

    expect(release).toContain("It does not enable live HMRC submission");
    expect(release).toContain("READY_FOR_LIVE_SUBMISSION = false");
  });
});
