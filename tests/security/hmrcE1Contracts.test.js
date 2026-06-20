import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

describe("HMRC E1 UK Property compliance contracts", () => {
  it("attaches fraud headers to shared reads, sandbox submission, read-back, and live pilot paths", () => {
    const shared = read("supabase/functions/_shared/hmrcMtdReadOnly.ts");
    const sandbox = read("supabase/functions/hmrc-submit-uk-property-period-summary-sandbox/index.ts");
    const live = read("supabase/functions/hmrc-submit-uk-property-period-summary-live-pilot/index.ts");
    const liveTransport = read("supabase/functions/_shared/hmrcLiveNetworkTransport.ts");
    expect(shared).toContain("buildHmrcFraudPreventionHeaders");
    expect(shared).toContain("...fraud.headers");
    expect(sandbox).toContain("hmrcRequest");
    expect((live.match(/\.\.\.fraud\.headers/g)?.length || 0)
      + (liveTransport.match(/\.\.\.fraud\.headers/g)?.length || 0)).toBeGreaterThanOrEqual(2);
    expect(live).toContain("fraudPreventionHeaders");
  });

  it("adds accounting type snapshots, review blocks, amendments, and locked provenance immutability", () => {
    const sql = read("supabase/hmrc_mtd_e1_uk_property_compliance.sql");
    const pilot = read("supabase/functions/_shared/hmrcLiveSubmissionPilot.ts");
    const service = read("src/services/mtdQuarterlyDraftService.js");
    expect(sql).toContain("accounting_type_snapshot");
    expect(sql).toContain("accounting_type_review_required");
    expect(sql).toContain("draft_type in ('original', 'amendment')");
    expect(sql).toContain("locked_mtd_draft_snapshot_is_immutable");
    expect(pilot).toContain("accounting_type_review_required");
    expect(sql).toContain("public.revalidate_mtd_draft_accounting_type");
    expect(sql).toContain("security definer");
    expect(sql).toContain("hmrc.accounting_type_revalidated");
    expect(sql).toContain("accounting_type_revalidation_rpc_required");
    expect(sql).toContain("not in ('owner', 'admin')");
    expect(sql).toContain("v_is_root := public.user_is_root_operator()");
    expect(sql).toContain("accounting_type_not_returned_review_note_required");
    expect(service).toContain('supabase.rpc("revalidate_mtd_draft_accounting_type"');
    expect(service).not.toContain("accounting_type_review_required: false");
  });

  it("closes structured live network failures and documents the device-id fallback", () => {
    const live = read("supabase/functions/hmrc-submit-uk-property-period-summary-live-pilot/index.ts");
    const transport = read("supabase/functions/_shared/hmrcLiveNetworkTransport.ts");
    const evidence = read("docs/hmrc/production-access/fraud-prevention-header-evidence.md");
    expect(live).toContain("performHmrcLiveNetworkRequest");
    expect(live).toContain("await completeLiveAttempt");
    expect(live).toContain("status: response.outcome");
    expect(transport).toContain("unknown_acceptance_state");
    expect(transport).toContain("Do not retry blindly");
    expect(evidence).toContain("Known limitation: Gov-Client-Device-ID fallback");
    expect(evidence).toContain("account ID is account-scoped");
  });

  it("limits accounting-type revalidation to owner/admin/root and blocks direct or cross-role clearing", () => {
    const sql = read("supabase/hmrc_mtd_e1_uk_property_compliance.sql");
    expect(sql).toContain("v_role := public.account_member_effective_role(v_draft.account_id, v_actor_id)::text");
    expect(sql).toContain("v_is_root := public.user_is_root_operator()");
    expect(sql).toContain("not in ('owner', 'admin')");
    expect(sql).not.toMatch(/not in \('owner', 'admin', 'staff'\)/);
    expect(sql).toContain("accounting_type_revalidation_rpc_required");
    expect(sql).toContain("previous_accounting_type_review_required");
    expect(sql).toContain("'actor_id', v_actor_id");
    expect(sql).toContain("grant execute on function public.revalidate_mtd_draft_accounting_type(uuid, text) to authenticated");
  });

  it("keeps general live submission closed and quarterly copy within E1 scope", () => {
    const gate = read("src/lib/mtd/hmrcPhase5ReadinessGate.js");
    const ui = read("src/components/compliance/QuarterlyDraftsTab.jsx");
    expect(gate).toContain("READY_FOR_GENERAL_LIVE_SUBMISSION: false");
    expect(ui).toContain("quarterly update only");
    expect(ui).toContain("not a final declaration or full tax return");
    expect(ui).toContain("Tenaqo does not provide tax advice");
  });
});
