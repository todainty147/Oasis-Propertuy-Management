import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const vs1Sql = read("supabase/regulatory_monitoring_vs1_intake.sql");
const vs2Sql = read("supabase/regulatory_monitoring_vs2_sources.sql");
const service = read("src/services/regulatoryMonitoringService.js");
const edgeFunction = read("supabase/functions/check-regulatory-source/index.ts");
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

describe("Monitoring VS-2 source register overlay", () => {
  it("adds a minimal internal source register without forking the VS-1 candidate loop", () => {
    expect(vs1Sql).toMatch(/create table if not exists public\.regulatory_change_candidate/i);
    expect(vs2Sql).toMatch(/create table if not exists public\.regulatory_source/i);
    expect(vs2Sql).not.toMatch(/create table if not exists public\.regulatory_change\s*\(/i);
    expect(vs2Sql).not.toMatch(/create table if not exists public\.impact_rule\s*\(/i);
    expect(vs2Sql).toContain("account_id uuid not null references public.accounts");
    expect(vs2Sql).toContain("status in ('active', 'paused')");
    expect(vs2Sql).toContain("last_check_status in ('success', 'error', 'never')");
  });

  it("keeps regulatory_source root-only and blocks direct authenticated writes", () => {
    expect(vs2Sql).toContain("revoke all on table public.regulatory_source from public, anon, authenticated");
    expect(vs2Sql).toContain("grant select on table public.regulatory_source to authenticated");
    expect(vs2Sql).toContain("regulatory_source_select_root_operator");
    expect(vs2Sql).toContain("using (public.user_is_root_operator())");
    expect(vs2Sql).toContain("regulatory_source_no_direct_write");
    expect(vs2Sql).toContain("perform public.regulatory_intake_require_root_operator()");
    expect(vs2Sql).toContain("revoke all on function public.regulatory_source_touch_updated_at()");
    expect(vs2Sql).not.toContain("public.user_can_manage_account");
  });

  it("uses a dedicated detection RPC with DB-owned canonical SHA-256 hashing", () => {
    expect(vs2Sql).toMatch(/create or replace function public\.record_regulatory_source_check_result/i);
    expect(vs2Sql).toContain("extensions.digest(convert_to(p_normalized_content, 'UTF8'), 'sha256')");
    expect(vs2Sql).toContain("p_normalized_content text");
    expect(vs2Sql).toContain("normalized content is required");
    expect(edgeFunction).not.toMatch(/subtle\.digest|SHA-256|sha256/i);
    expect(sharedCheckHelper).not.toMatch(/subtle\.digest|SHA-256|sha256/i);
  });

  it("adds detection lineage and DB-enforced idempotency to candidates", () => {
    for (const column of [
      "source_id uuid references public.regulatory_source",
      "old_hash text",
      "new_hash text",
      "detected_at timestamptz",
      "snapshot_excerpt text",
      "snapshot_ref text",
      "intake_origin text not null default 'manual_candidate'",
    ]) {
      expect(vs2Sql).toContain(column);
    }

    expect(vs2Sql).toContain("regulatory_change_candidate_detection_hash_unique");
    expect(vs2Sql).toContain("on public.regulatory_change_candidate(source_id, new_hash, intake_origin)");
    expect(vs2Sql).toContain("intake_origin = 'automated_source_detection'");
    expect(vs2Sql).toContain("on conflict (source_id, new_hash, intake_origin)");
  });

  it("records success, baseline, changed, and failure states honestly", () => {
    expect(vs2Sql).toContain("v_baseline := v_old_hash is null");
    expect(vs2Sql).toContain("v_changed := v_old_hash is not null and v_old_hash <> v_hash");
    expect(vs2Sql).toContain("public.regulatory_source_apply_check_result_core");
    expect(vs2Sql).toContain("regulatory_source.checked");
    expect(vs2Sql).toContain("'baseline', (v_result->>'baseline')::boolean");
    expect(vs2Sql).toContain("regulatory_source.change_detected");
    expect(vs2Sql).toContain("regulatory_source.check_failed");
    expect(vs2Sql).toContain("if v_source.status <> 'active' then");
    expect(vs2Sql).toContain("last_check_status = 'error'");
    expect(vs2Sql).toContain("last_successful_check_at_unchanged");
    expect(vs2Sql).toContain("candidate_created', false");
    expect(vs2Sql).toContain("hash_updated', false");

    const checkedEvent = vs2Sql.match(/'regulatory_source\.checked'[\s\S]*?\);\n\n  if \(v_result->>'changed'\)::boolean then/)?.[0] || "";
    expect(checkedEvent).toContain("'baseline', (v_result->>'baseline')::boolean");
    expect(checkedEvent).toContain("'changed', (v_result->>'changed')::boolean");
    expect(checkedEvent).not.toContain("candidate_created");
  });

  it("keeps detection authority stopped at candidate status new", () => {
    expect(vs2Sql).toContain("Automated source hash change detected; internal review required.");
    expect(vs2Sql).toContain("detection_authority_stopped_at");
    expect(vs2Sql).toContain("regulatory_change_candidate.status=new");
    expect(vs2Sql).not.toMatch(/insert into public\.regulatory_change\s*\(/i);
    expect(vs2Sql).not.toMatch(/insert into public\.impact_rule\s*\(/i);
    expect(vs2Sql).not.toMatch(/insert into public\.obligation_instance\s*\(/i);
    expect(vs2Sql).not.toMatch(/insert into public\.command_center_items\s*\(/i);
    expect(vs2Sql).not.toMatch(/insert into public\.notifications\s*\(/i);
  });

  it("applies after Monitoring VS-1 and before RPE VS-2A", () => {
    const vs1 = dbApply.indexOf('"regulatory_monitoring_vs1_intake.sql"');
    const vs2 = dbApply.indexOf('"regulatory_monitoring_vs2_sources.sql"');
    const vs2a = dbApply.indexOf('"regulatory_proof_engine_vs2a_capture.sql"');

    expect(vs1).toBeGreaterThan(-1);
    expect(vs2).toBeGreaterThan(vs1);
    expect(vs2a).toBeGreaterThan(vs2);
  });
});

describe("Monitoring VS-2 Edge Function boundary", () => {
  it("preserves user-JWT authorization instead of using service-role authority", () => {
    expect(edgeFunction).toContain('Deno.env.get("SUPABASE_ANON_KEY")');
    expect(edgeFunction).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(edgeFunction).toContain("Authorization: authHeader");
    expect(edgeFunction).toContain('userClient.auth.getUser()');
    expect(edgeFunction).toContain('userClient.rpc("get_regulatory_source_for_check"');
    expect(edgeFunction).toContain("performRegulatorySourceCheck");
    expect(edgeFunction).toContain('resultRpc: "record_regulatory_source_check_result"');
    expect(edgeFunction).toContain('failureRpc: "record_regulatory_source_check_failed"');
    expect(edgeFunction).toContain('triggerType: "operator"');
  });

  it("keeps fetch server-side with explicit SSRF and response guards", () => {
    expect(service).toContain('supabase.functions.invoke("check-regulatory-source"');
    expect(service).not.toMatch(/fetch\s*\(/);
    expect(edgeFunction).not.toMatch(/fetch\s*\(/);
    expect(vs2Sql).not.toMatch(/http_get|net\.http|fetch\s*\(/i);

    for (const guard of [
      "REGULATORY_SOURCE_ALLOWED_HOSTS",
      "source_url_must_use_https",
      "source_host_not_allowlisted",
      "source_private_host_rejected",
      "source_private_ip_rejected",
      "resolveDnsRecords(hostname, \"A\")",
      "resolveDnsRecords(hostname, \"AAAA\")",
      "normalized === \"::\" || normalized === \"::1\"",
      "normalized.startsWith(\"fe80:\")",
      "(firstHextet & 0xfe00) === 0xfc00",
      "(firstHextet & 0xff00) === 0xff00",
      "redirect: \"manual\"",
      "REGULATORY_SOURCE_FETCH_TIMEOUT_MS",
      "REGULATORY_SOURCE_MAX_BYTES",
      "source_response_too_large",
      "source_content_type_rejected",
      "extractHexMappedIpv4",
    ]) {
      expect(sharedCheckHelper).toContain(guard);
    }
  });

  it("treats fetched content as opaque data with no AI or legal interpretation path", () => {
    expect(edgeFunction).not.toMatch(/openai|chat\.completions|responses\.create|generateObject|prompt/i);
    expect(edgeFunction).not.toMatch(/summary|summarize|classification|legalClassification|interpretation/i);
    expect(sharedCheckHelper).not.toMatch(/openai|chat\.completions|responses\.create|generateObject|prompt/i);
    expect(sharedCheckHelper).not.toMatch(/summary|summarize|classification|legalClassification|interpretation/i);
    expect(vs2Sql).not.toMatch(/ai_summary|legal_classification|interpretation|classification/i);
    expect(vs2Sql).toContain("hash + bounded snapshot only");
  });
});

describe("Monitoring VS-2 customer boundary", () => {
  it("keeps regulatory_source and source-checking out of customer-facing surfaces", () => {
    for (const file of customerSurfaceFiles) {
      const source = read(file);
      expect(source, `${file} must not reference internal regulatory source data`).not.toContain(
        "regulatory_source",
      );
      expect(source, `${file} must not trigger source checks`).not.toMatch(
        /check-regulatory-source|checkRegulatorySource|listRegulatorySources|list_regulatory_sources/,
      );
    }
  });
});
