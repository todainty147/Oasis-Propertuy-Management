import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const vs2Sql = read("supabase/regulatory_monitoring_vs2_sources.sql");
const vs25Sql = read("supabase/regulatory_monitoring_vs2_5_scheduled.sql");
const operatorFunction = read("supabase/functions/check-regulatory-source/index.ts");
const scheduledFunction = read("supabase/functions/check-regulatory-sources-scheduled/index.ts");
const sharedCheckHelper = read("supabase/functions/_shared/regulatorySourceCheck.ts");
const dbApply = read("scripts/dbApplyRepoSql.js");

const customerSurfaceFiles = [
  "src/pages/compliance/RentersRightsPage.jsx",
  "src/pages/compliance/RentersRightsProofPackPage.jsx",
  "src/pages/CommandCenterPage.jsx",
  "src/services/regulatoryProofEngineService.js",
  "src/services/commandCenterService.js",
  "src/services/notificationService.js",
  "src/components/compliance/ObligationProofPackPanel.jsx",
  "src/utils/proofPackPdfExport.js",
  "supabase/regulatory_proof_engine_proof_pack_vs1.sql",
  "supabase/regulatory_proof_engine_vs2b_obligations.sql",
  "supabase/regulatory_proof_engine_vs2c_discharge.sql",
  "supabase/regulatory_proof_engine_vs2d_basis_review.sql",
];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

describe("Monitoring VS-2.5 scheduled trigger", () => {
  it("keeps operator and scheduler on the same shared check helper", () => {
    expect(operatorFunction).toContain("../_shared/regulatorySourceCheck.ts");
    expect(scheduledFunction).toContain("../_shared/regulatorySourceCheck.ts");
    expect(operatorFunction).toContain("performRegulatorySourceCheck");
    expect(scheduledFunction).toContain("performRegulatorySourceCheck");

    expect(operatorFunction).not.toMatch(/fetchRegulatorySource|validateAllowedUrl|rejectPrivateAddressHost|normalizeFetchedContent/);
    expect(scheduledFunction).not.toMatch(/fetchRegulatorySource|validateAllowedUrl|rejectPrivateAddressHost|normalizeFetchedContent/);
    expect(sharedCheckHelper).toContain("async function fetchRegulatorySource");
    expect(sharedCheckHelper).toContain("async function rejectPrivateAddressHost");
    expect(sharedCheckHelper).toContain("function normalizeFetchedContent");
  });

  it("leaves the operator path user-JWT/root-operator authorized and service-role free", () => {
    expect(operatorFunction).toContain('Deno.env.get("SUPABASE_ANON_KEY")');
    expect(operatorFunction).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(operatorFunction).toContain("Authorization: authHeader");
    expect(operatorFunction).toContain("userClient.auth.getUser()");
    expect(operatorFunction).toContain('userClient.rpc("get_regulatory_source_for_check"');
    expect(operatorFunction).toContain('resultRpc: "record_regulatory_source_check_result"');
    expect(operatorFunction).toContain('failureRpc: "record_regulatory_source_check_failed"');
    expect(operatorFunction).toContain('triggerType: "operator"');
    expect(vs2Sql).toContain("perform public.regulatory_intake_require_root_operator()");
  });

  it("uses CRON_SECRET and boxed service-role RPCs for the scheduled path without fake root JWTs", () => {
    expect(scheduledFunction).toContain('Deno.env.get("CRON_SECRET")');
    expect(scheduledFunction).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(scheduledFunction).toContain("getCronAuthResult(req, CRON_SECRET)");
    expect(scheduledFunction).toContain("recordScheduledFunctionEvent(admin");
    expect(scheduledFunction).not.toContain("SUPABASE_ANON_KEY");
    expect(scheduledFunction).not.toContain("auth.getUser()");
    expect(scheduledFunction).not.toContain('functions.invoke("check-regulatory-source"');
    expect(scheduledFunction).not.toContain("/functions/v1/check-regulatory-source");
    expect(scheduledFunction).not.toContain("Authorization: authHeader");
    expect(scheduledFunction).not.toMatch(/request\.jwt\.claim\.sub|set_config\('request\.jwt|root operator/i);

    for (const rpc of [
      "list_regulatory_sources_for_scheduled_check",
      "begin_regulatory_source_scheduled_run",
      "record_regulatory_source_scheduled_check_result",
      "record_regulatory_source_scheduled_check_failed",
      "complete_regulatory_source_scheduled_run",
      "fail_regulatory_source_scheduled_run",
    ]) {
      expect(scheduledFunction).toContain(rpc);
      expect(vs25Sql).toContain(`public.${rpc}`);
    }

    expect(vs25Sql).toContain("current_setting('role', true)");
    expect(vs25Sql).toContain("service_role required for scheduled regulatory source monitor");
  });

  it("keeps scheduled detection stopped at candidate status new with no downstream writes", () => {
    expect(vs25Sql).toContain("scheduled_detection_stops_at");
    expect(vs25Sql).toContain("regulatory_change_candidate.status=new");
    expect(vs2Sql).toContain("create or replace function public.regulatory_source_apply_check_result_core");
    expect(vs2Sql).toContain("insert into public.regulatory_change_candidate");
    expect(vs25Sql).toContain("public.regulatory_source_apply_check_result_core");
    expect(vs25Sql).not.toContain("insert into public.regulatory_change_candidate");
    expect(vs25Sql).not.toMatch(/insert into public\.regulatory_change\s*\(/i);
    expect(vs25Sql).not.toMatch(/insert into public\.impact_rule\s*\(/i);
    expect(vs25Sql).not.toMatch(/insert into public\.obligation_instance\s*\(/i);
    expect(vs25Sql).not.toMatch(/insert into public\.command_center_items\s*\(/i);
    expect(vs25Sql).not.toMatch(/insert into public\.notifications\s*\(/i);
  });

  it("records account-homed scheduled runs and rejects cross-account source checks", () => {
    expect(vs25Sql).toContain("create table if not exists public.regulatory_source_scheduled_run");
    expect(vs25Sql).toContain("account_id uuid not null references public.accounts");
    expect(vs25Sql).toContain("regulatory_source_scheduled_run_one_running");
    expect(vs25Sql).toContain("v_source.account_id <> v_run.account_id");
    expect(vs25Sql).toContain("regulatory source does not belong to scheduled run account");
    expect(vs25Sql).toContain("regulatory_source.scheduled_run_started");
    expect(vs25Sql).toContain("regulatory_source.scheduled_run_completed");
    expect(vs25Sql).toContain("regulatory_source.scheduled_run_failed");
    expect(vs25Sql).toContain("regulatory_source.scheduled_run_skipped");
  });

  it("marks stale running jobs failed before starting a new run and skips live overlaps", () => {
    expect(vs25Sql).toContain("p_stale_after_minutes");
    expect(vs25Sql).toContain("started_at < now() - v_stale_after");
    expect(vs25Sql).toContain("stale running job marked failed before new scheduled run");
    expect(vs25Sql).toContain("'skipped',");
    expect(vs25Sql).toContain("scheduled run already active");
    expect(vs25Sql).toContain("exception when unique_violation then");
  });

  it("applies after VS-2 and before RPE VS-2A", () => {
    const vs2 = dbApply.indexOf('"regulatory_monitoring_vs2_sources.sql"');
    const vs25 = dbApply.indexOf('"regulatory_monitoring_vs2_5_scheduled.sql"');
    const vs2a = dbApply.indexOf('"regulatory_proof_engine_vs2a_capture.sql"');

    expect(vs2).toBeGreaterThan(-1);
    expect(vs25).toBeGreaterThan(vs2);
    expect(vs2a).toBeGreaterThan(vs25);
  });
});

describe("Monitoring VS-2.5 customer boundary", () => {
  it("keeps scheduled monitoring internals out of customer-facing surfaces", () => {
    for (const file of customerSurfaceFiles) {
      const source = read(file);
      expect(source, `${file} must not reference scheduled source run data`).not.toContain(
        "regulatory_source_scheduled_run",
      );
      expect(source, `${file} must not trigger scheduled source checks`).not.toMatch(
        /check-regulatory-sources-scheduled|begin_regulatory_source_scheduled_run|scheduled_run_started/,
      );
    }
  });
});
