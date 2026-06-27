import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const monitoringSql = readFileSync(join(root, "supabase/regulatory_monitoring_vs1_intake.sql"), "utf8");
const vs1Sql = readFileSync(join(root, "supabase/regulatory_proof_engine_vs1.sql"), "utf8");
const dbApply = readFileSync(join(root, "scripts/dbApplyRepoSql.js"), "utf8");
const monitoringService = readFileSync(join(root, "src/services/regulatoryMonitoringService.js"), "utf8");

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

describe("Monitoring VS-1 regulatory intake overlay", () => {
  it("extends existing RPE tables instead of forking regulatory_change or impact_rule", () => {
    expect(vs1Sql).toMatch(/create table if not exists public\.regulatory_change/i);
    expect(vs1Sql).toMatch(/create table if not exists public\.impact_rule/i);
    expect(monitoringSql).not.toMatch(/create table if not exists public\.regulatory_change\s*\(/i);
    expect(monitoringSql).not.toMatch(/create table if not exists public\.impact_rule\s*\(/i);
    expect(monitoringSql).toContain("alter table public.regulatory_change");
    expect(monitoringSql).toContain("add column if not exists candidate_id");
    expect(monitoringSql).toContain("add column if not exists intake_origin");
    expect(monitoringSql).toContain("regulatory_change_candidate_id_unique");
  });

  it("adds an internal-only candidate table with demo-only status machine", () => {
    expect(monitoringSql).toMatch(/create table if not exists public\.regulatory_change_candidate/i);
    expect(monitoringSql).toContain("status in ('new', 'triaged', 'needs_legal_review', 'gate_a_approved', 'rejected')");
    expect(monitoringSql).toContain("demo_mode boolean not null default true check (demo_mode is true)");
    expect(monitoringSql).toContain("candidate is evidence of detection, not evidence of law");
  });

  it("blocks ordinary candidate table access and requires root operator authorization", () => {
    expect(monitoringSql).toContain("revoke all on table public.regulatory_change_candidate from public, anon, authenticated");
    expect(monitoringSql).toContain("grant select on table public.regulatory_change_candidate to authenticated");
    expect(monitoringSql).toContain("regulatory_change_candidate_select_root_operator");
    expect(monitoringSql).toContain("using (public.user_is_root_operator())");
    expect(monitoringSql).toContain("regulatory_change_candidate_no_direct_write");
    expect(monitoringSql).toContain("public.regulatory_intake_require_root_operator()");
    expect(monitoringSql).toContain("root operator required for regulatory intake");
    expect(monitoringSql).not.toContain("public.user_can_manage_account");
  });

  it("uses named SECURITY DEFINER RPCs for every transition", () => {
    for (const fn of [
      "create_regulatory_change_candidate",
      "triage_regulatory_change_candidate",
      "mark_candidate_needs_legal_review",
      "reject_regulatory_change_candidate",
      "approve_regulatory_change_gate_a",
      "approve_impact_rule_gate_b",
      "list_regulatory_change_candidates",
    ]) {
      expect(monitoringSql).toMatch(new RegExp(`create or replace function public\\.${fn}`, "i"));
      expect(monitoringSql).toMatch(new RegExp(`grant execute on function public\\.${fn}`, "i"));
    }

    expect(monitoringSql).toMatch(/security definer/gi);
    expect(monitoringSql).toContain("set search_path = public");
  });

  it("writes provenance events for each candidate and gate transition", () => {
    expect(monitoringSql).toContain("public.record_provenance_event");
    for (const eventType of [
      "regulatory_change.candidate_created",
      "regulatory_change.candidate_triaged",
      "regulatory_change.candidate_needs_legal_review",
      "regulatory_change.candidate_rejected",
      "regulatory_change.gate_a_approved",
      "impact_rule.gate_b_approved",
    ]) {
      expect(monitoringSql).toContain(eventType);
    }
    expect(monitoringSql).toContain("'demo_mode', true");
    expect(monitoringSql).toContain("'candidate_is_detection_not_law', true");
    expect(monitoringSql).toContain("'internal'");
  });

  it("keeps historical seed exemption while requiring pipeline-created changes to link to a candidate", () => {
    expect(monitoringSql).toContain("Nullable for historical seed/system records");
    expect(monitoringSql).toContain("intake_origin text not null default 'system_seed'");
    expect(monitoringSql).toContain("'monitoring_vs1_gate_a'");
    expect(monitoringSql).toContain("Gate B requires a Monitoring VS-1 Gate-A regulatory_change");
    expect(monitoringSql).toContain("v_change.candidate_id is null");
  });

  it("prevents known-good reproduction from colliding with existing rule_key/version pairs", () => {
    expect(monitoringSql).toContain("where rule_key = p_rule_key");
    expect(monitoringSql).toContain("and version = p_version");
    expect(monitoringSql).toContain("already exists; use an isolated diagnostic key or the next version");
    expect(monitoringSql).not.toMatch(/on conflict\s*\(\s*rule_key\s*,\s*version\s*\)\s*do update/i);
  });

  it("can reproduce the trusted RRA information-sheet rule through isolated diagnostic keys", () => {
    const trustedChangeFields = [
      "'renters_rights_act_2026'",
      "'Renters'' Rights Act 2026 — Information Sheet'",
      "'GB-ENG'",
      "'housing'",
      "'gate_a_verified'",
      "'2026-05-01'",
      "'2026-05-31'",
      "7000",
    ];
    for (const field of trustedChangeFields) {
      expect(vs1Sql).toContain(field);
    }

    const trustedRuleFields = [
      "'rra_info_sheet_v1'",
      "'evaluateRraInfoSheetV1'",
      "'RRA information-sheet evaluation v1'",
      "array['affected','not_affected','deferred','needs_data']",
      "'spec_version', '0.3.1'",
      "'commencement', '2026-05-01'",
      "'EXCL_JURISDICTION'",
      "'EXCL_CLASS_COMPANY_LET'",
      "'AFF_INFO_SHEET'",
      "'AFF_WRITTEN_STATEMENT'",
    ];
    for (const field of trustedRuleFields) {
      expect(vs1Sql).toContain(field);
    }

    expect(monitoringSql).toContain("p_regulation_key text");
    expect(monitoringSql).toContain("p_version integer");
    expect(monitoringSql).toContain("p_title text");
    expect(monitoringSql).toContain("p_jurisdiction text");
    expect(monitoringSql).toContain("p_effective_from date");
    expect(monitoringSql).toContain("p_effective_date date default null");
    expect(monitoringSql).toContain("p_deadline_date date default null");
    expect(monitoringSql).toContain("p_category text default null");
    expect(monitoringSql).toContain("p_legal_status text default 'gate_a_verified'");
    expect(monitoringSql).toContain("p_penalty_ceiling_gbp numeric default null");
    expect(monitoringSql).toContain("p_rule_key text");
    expect(monitoringSql).toContain("p_predicate_ref text");
    expect(monitoringSql).toContain("p_result_domain text[] default array['affected','not_affected','deferred','needs_data']");
    expect(monitoringSql).toContain("p_rule_metadata jsonb default '{}'::jsonb");
    expect(monitoringSql).toContain("p_evidence_requirement jsonb default '{}'::jsonb");
    expect(monitoringSql).toContain("p_deferral_logic jsonb default '{}'::jsonb");
    expect(monitoringSql).toContain("p_legal_source_ref text default null");
    expect(monitoringSql).toContain("already exists; use an isolated diagnostic key or an explicit new version");
    expect(monitoringSql).toContain("already exists; use an isolated diagnostic key or the next version");
  });

  it("applies after RPE VS-1 and before VS-2A", () => {
    const vs1 = dbApply.indexOf('"regulatory_proof_engine_vs1.sql"');
    const monitoring = dbApply.indexOf('"regulatory_monitoring_vs1_intake.sql"');
    const vs2a = dbApply.indexOf('"regulatory_proof_engine_vs2a_capture.sql"');

    expect(vs1).toBeGreaterThan(-1);
    expect(monitoring).toBeGreaterThan(vs1);
    expect(vs2a).toBeGreaterThan(monitoring);
  });
});

describe("Monitoring VS-1 service boundary", () => {
  it("calls only the named internal RPCs and always passes demo mode", () => {
    for (const rpc of [
      "create_regulatory_change_candidate",
      "triage_regulatory_change_candidate",
      "mark_candidate_needs_legal_review",
      "reject_regulatory_change_candidate",
      "approve_regulatory_change_gate_a",
      "approve_impact_rule_gate_b",
      "list_regulatory_change_candidates",
    ]) {
      expect(monitoringService).toContain(`supabase.rpc("${rpc}"`);
    }

    expect(monitoringService).toContain("p_demo_mode: true");
    expect(monitoringService).not.toMatch(/from\("regulatory_change_candidate"\)/);
    expect(monitoringService).not.toMatch(/\.from\('regulatory_change_candidate'\)/);
  });

  it("keeps regulatory_change_candidate out of customer-facing surfaces", () => {
    for (const file of customerSurfaceFiles) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, `${file} must not reference internal candidate data`).not.toContain(
        "regulatory_change_candidate",
      );
      expect(source, `${file} must not call internal candidate RPCs`).not.toMatch(
        /create_regulatory_change_candidate|triage_regulatory_change_candidate|mark_candidate_needs_legal_review|approve_regulatory_change_gate_a|approve_impact_rule_gate_b|list_regulatory_change_candidates/,
      );
    }
  });
});
