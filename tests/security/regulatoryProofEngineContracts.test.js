import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const vs1Sql = readFileSync(join(process.cwd(), "supabase/regulatory_proof_engine_vs1.sql"), "utf8");
const vs2aSql = readFileSync(join(process.cwd(), "supabase/regulatory_proof_engine_vs2a_capture.sql"), "utf8");
const vs2bSql = readFileSync(join(process.cwd(), "supabase/regulatory_proof_engine_vs2b_obligations.sql"), "utf8");
const vs2cSql = readFileSync(join(process.cwd(), "supabase/regulatory_proof_engine_vs2c_discharge.sql"), "utf8");
const engineJs = readFileSync(join(process.cwd(), "src/lib/regulatoryProofEngine.js"), "utf8");
const engineService = readFileSync(join(process.cwd(), "src/services/regulatoryProofEngineService.js"), "utf8");
const dbApply = readFileSync(join(process.cwd(), "scripts/dbApplyRepoSql.js"), "utf8");
const fullAbcdReportSql = readFileSync(
  join(process.cwd(), "scripts/dev/rpe_full_abcd_contract_report.sql"),
  "utf8",
);
const coverageSeedSql = readFileSync(
  join(process.cwd(), "scripts/dev/rpe_contract_coverage_seed.sql"),
  "utf8",
);
const coveragePrepareSql = readFileSync(
  join(process.cwd(), "scripts/dev/rpe_contract_coverage_prepare_case.sql"),
  "utf8",
);
const coverageReportSql = readFileSync(
  join(process.cwd(), "scripts/dev/rpe_contract_coverage_report.sql"),
  "utf8",
);
const measurementReportSql = readFileSync(
  join(process.cwd(), "scripts/dev/rpe_contract_measurement_report_template.sql"),
  "utf8",
);
const measurementRunner = readFileSync(
  join(process.cwd(), "scripts/dev/rpe_contract_measurement_e2e_runner.mjs"),
  "utf8",
);

describe("RPE VS-1 SQL persistence contract", () => {
  it("creates regulatory_change, impact_rule, and rule_evaluation with v0.3 fields", () => {
    expect(vs1Sql).toMatch(/create table if not exists public\.regulatory_change/i);
    expect(vs1Sql).toMatch(/create table if not exists public\.impact_rule/i);
    expect(vs1Sql).toMatch(/create table if not exists public\.rule_evaluation/i);
    expect(vs1Sql).toContain("source_hash text");
    expect(vs1Sql).toContain("source_excerpt_hash text");
    expect(vs1Sql).toContain("pdf_hash text");
    expect(vs1Sql).toContain("deadline_date date");
    expect(vs1Sql).toContain("penalty_ceiling_gbp numeric");
    expect(vs1Sql).toContain("validity_approved_by uuid");
    expect(vs1Sql).toContain("predicate_ref text");
    expect(vs1Sql).toContain("evidence_requirement jsonb");
    expect(vs1Sql).toContain("deferral_logic jsonb");
    expect(vs1Sql).toContain("legal_source_ref text");
    expect(vs1Sql).toContain("decision_path text[] not null default '{}'");
    expect(vs1Sql).toContain("evaluation_confidence text check (evaluation_confidence in ('high','medium','low'))");
    expect(vs1Sql).toContain("result text not null check (result in ('affected','not_affected','deferred','needs_data'))");
    expect(vs1Sql).toContain("obligation_kind text check (obligation_kind in ('information_sheet','written_statement'))");
    expect(vs1Sql).toContain("exposure_gbp_ceiling numeric");
  });

  it("seeds one demo-only inactive RRA information-sheet rule v1", () => {
    expect(vs1Sql).toContain("'renters_rights_act_2026'");
    expect(vs1Sql).toContain("'rra_info_sheet_v1'");
    expect(vs1Sql).toContain("'spec_version', '0.3.1'");
    expect(vs1Sql).toContain("'commencement', '2026-05-01'");
    expect(vs1Sql).toContain("'2026-05-31'");
    expect(vs1Sql).toContain("7000");
    expect(vs1Sql).toMatch(/'rra_info_sheet_v1',\s*1,/);
    expect(vs1Sql).toMatch(/true,\s*null,\s*null,\s*false,/);
  });

  it("stores the closed VS-1 reason-code set and Gate-B questions", () => {
    for (const reason of [
      "EXCL_JURISDICTION",
      "EXCL_NOT_AST",
      "EXCL_ENTERED_AFTER",
      "EXCL_NOT_ACTIVE_ON_DATE",
      "EXCL_HIGH_RENT",
      "EXCL_CLASS_LODGER",
      "EXCL_CLASS_COMPANY_LET",
      "EXCL_CLASS_RENT_ACT_1977",
      "EXCL_CLASS_PBSA",
      "DEFER_PENDING_S21",
      "DEFER_PENDING_S8",
      "AFF_INFO_SHEET",
      "AFF_WRITTEN_STATEMENT",
    ]) {
      expect(vs1Sql).toContain(reason);
    }

    expect(vs1Sql).toContain("Oral tenancy: written statement only");
    expect(vs1Sql).toContain("No-notice default");
    expect(vs1Sql).toContain("Excluded-class completeness");
  });

  it("enables RLS and blocks direct authenticated writes", () => {
    expect(vs1Sql).toContain("alter table public.regulatory_change enable row level security");
    expect(vs1Sql).toContain("alter table public.impact_rule enable row level security");
    expect(vs1Sql).toContain("alter table public.rule_evaluation enable row level security");
    expect(vs1Sql).toContain("regulatory_change_no_direct_write");
    expect(vs1Sql).toContain("impact_rule_no_direct_write");
    expect(vs1Sql).toContain("rule_evaluation_no_direct_write");
    expect(vs1Sql).toContain("grant select on table public.rule_evaluation to authenticated");
    expect(vs1Sql).toContain("grant all on table public.rule_evaluation to service_role");
  });

  it("scopes rule_evaluation reads through the tenancy owner portfolio", () => {
    expect(vs1Sql).toContain("rule_evaluation_select_account_managers");
    expect(vs1Sql).toContain("from public.leases l");
    expect(vs1Sql).toContain("where l.id = rule_evaluation.tenancy_id");
    expect(vs1Sql).toContain("public.user_can_manage_account(l.account_id)");
  });
});

describe("RPE VS-1 evaluation write/read RPC contract", () => {
  it("records evaluations through a gated SECURITY DEFINER RPC", () => {
    expect(vs1Sql).toMatch(/create or replace function public\.record_rra_info_sheet_rule_evaluation/i);
    expect(vs1Sql).toContain("security definer");
    expect(vs1Sql).toContain("set search_path = public");
    expect(vs1Sql).toContain("if not public.user_can_manage_account(p_account_id)");
    expect(vs1Sql).toContain("and l.account_id = p_account_id");
    expect(vs1Sql).toContain("RRA information-sheet rule v1 is not Gate-B approved; demo_mode is required");
    expect(vs1Sql).toContain("grant execute on function public.record_rra_info_sheet_rule_evaluation");
  });

  it("persists full snapshot and relied-upon decision path without evaluating from task state", () => {
    expect(vs1Sql).toContain("p_input_snapshot");
    expect(vs1Sql).toContain("p_decision_path");
    expect(vs1Sql).toContain("input_snapshot,");
    expect(vs1Sql).toContain("decision_path,");
    expect(vs1Sql).not.toMatch(/update public\.renters_rights_tasks/i);
    expect(vs1Sql).not.toMatch(/insert into public\.renters_rights_tasks/i);
  });

  it("records and lists affected exposure ceiling without creating obligation instances", () => {
    expect(vs1Sql).toContain("p_exposure_gbp_ceiling numeric default null");
    expect(vs1Sql).toContain("exposure_gbp_ceiling,");
    expect(vs1Sql).toContain("v_evaluation.exposure_gbp_ceiling");
    expect(vs1Sql).toContain("re.exposure_gbp_ceiling");
    expect(vs1Sql).not.toMatch(/create table if not exists public\.obligation_instance/i);
  });

  it("derives aod_branch in read output without storing it in the input snapshot", () => {
    expect(engineJs).toContain("deriveAodBranch");
    expect(engineJs).toContain("aod_branch:");
    expect(vs1Sql).toContain("aod_branch text");
    expect(vs1Sql).toContain("time_qualified_periodic_indicator");
    expect(vs1Sql).toContain("active_on_qualifying_date");
    expect(vs1Sql).not.toMatch(/p_aod_branch/i);
    const insertColumnList = vs1Sql.slice(
      vs1Sql.indexOf("insert into public.rule_evaluation"),
      vs1Sql.indexOf("values (", vs1Sql.indexOf("insert into public.rule_evaluation")),
    );
    expect(insertColumnList).not.toContain("aod_branch");
  });

  it("enforces confidence nullability rules", () => {
    expect(vs1Sql).toContain("rule_eval_needs_data_confidence_null");
    expect(vs1Sql).toContain("needs_data evaluations must have null confidence");
    expect(vs1Sql).toContain("non-needs_data evaluations require confidence");
  });

  it("appends exactly one evaluation_run event to the existing provenance ledger with SHA-256 hash", () => {
    expect(vs1Sql).toContain("perform public.record_provenance_event");
    expect(vs1Sql).toContain("'rule_evaluation'");
    expect(vs1Sql).toContain("'evaluation_run'");
    expect(vs1Sql).toContain("'regulatory_proof_engine'");
    expect(vs1Sql).toContain("'inputSnapshotHash', v_snapshot_hash");
    expect(vs1Sql).toContain("'rra_info_sheet:evaluation_run:' || v_evaluation.id::text");
    expect(vs1Sql).not.toContain("p_input_snapshot_hash");
  });

  it("provides grouped result/confidence read models", () => {
    expect(vs1Sql).toMatch(/create or replace function public\.list_rra_info_sheet_rule_evaluations/i);
    expect(vs1Sql).toMatch(/create or replace function public\.rra_info_sheet_evaluation_summary/i);
    expect(vs1Sql).toContain("group by re.result, re.evaluation_confidence");
    expect(vs1Sql).toContain("grant execute on function public.rra_info_sheet_evaluation_summary(uuid) to authenticated");
  });

  it("keeps list_rra_info_sheet_rule_evaluations on the corrected three-argument signature", () => {
    expect(vs1Sql).toMatch(
      /create or replace function public\.list_rra_info_sheet_rule_evaluations\(\s*p_account_id uuid,\s*p_limit integer default 100,\s*p_offset integer default 0\s*\)/i,
    );

    const listFnHeader = vs1Sql.slice(
      vs1Sql.indexOf("create or replace function public.list_rra_info_sheet_rule_evaluations"),
      vs1Sql.indexOf("returns table", vs1Sql.indexOf("create or replace function public.list_rra_info_sheet_rule_evaluations")),
    );
    expect((listFnHeader.match(/p_limit integer default 100/g) || [])).toHaveLength(1);
  });
});

describe("RPE VS-1 provenance-integrity contract", () => {
  it("computes inputSnapshotHash via pgcrypto SHA-256, not a client-supplied value", () => {
    expect(vs1Sql).toContain("extensions.digest(convert_to(p_input_snapshot::text, 'UTF8'), 'sha256')");
    expect(vs1Sql).toContain("v_snapshot_hash");
    expect(vs1Sql).not.toContain("p_input_snapshot_hash");
    expect(vs1Sql).not.toContain("'aodBranch'");
  });

  it("enforces atomicity: rule_evaluation insert requires a same-transaction provenance event", () => {
    expect(vs1Sql).toContain("rule_evaluation_require_provenance_event");
    expect(vs1Sql).toContain("trg_rule_evaluation_require_provenance");
    expect(vs1Sql).toMatch(/constraint trigger/i);
    expect(vs1Sql).toMatch(/deferrable initially deferred/i);
    expect(vs1Sql).toContain("pe.entity_type = 'rule_evaluation'");
    expect(vs1Sql).toContain("pe.event_type = 'evaluation_run'");
  });

  it("enforces deferred_until_basis constraint on deferred results", () => {
    expect(vs1Sql).toContain("deferred_until_basis text");
    expect(vs1Sql).toContain("rule_eval_deferred_basis_required");
    expect(vs1Sql).toMatch(/result <> 'deferred'\s+or deferred_until is not null\s+or deferred_until_basis is not null/);
  });

  it("includes deferred_until_basis in the list read model", () => {
    const listFn = vs1Sql.slice(vs1Sql.indexOf("list_rra_info_sheet_rule_evaluations"));
    expect(listFn).toContain("re.deferred_until_basis");
  });

  it("drops the old function signature before creating the new one", () => {
    expect(vs1Sql).toMatch(/drop function if exists public\.record_rra_info_sheet_rule_evaluation/i);
  });

  it("DJB2 hash is removed from the JS evaluator module", () => {
    expect(engineJs).not.toContain("hashInputSnapshot");
    expect(engineJs).not.toContain("stableJson");
    expect(engineJs).not.toContain("5381");
    expect(engineJs).not.toMatch(/stable:/);
  });

  it("JS runner refuses to persist without a provenance writer", () => {
    expect(engineJs).toContain("Cannot persist evaluation without a provenance writer");
  });
});

describe("RPE VS-1 deployment order", () => {
  it("applies after VS-0 and before later unrelated overlays", () => {
    const vs0 = dbApply.indexOf('"regulatory_proof_engine_vs0.sql"');
    const vs1 = dbApply.indexOf('"regulatory_proof_engine_vs1.sql"');
    const trial = dbApply.indexOf('"trial_period_enforcement.sql"');

    expect(vs0).toBeGreaterThan(-1);
    expect(vs1).toBeGreaterThan(vs0);
    expect(trial).toBeGreaterThan(vs1);
  });
});

describe("RPE VS-2A capture-to-evaluation contract", () => {
  it("is applied after VS-1 and before unrelated overlays", () => {
    const vs1 = dbApply.indexOf('"regulatory_proof_engine_vs1.sql"');
    const vs2a = dbApply.indexOf('"regulatory_proof_engine_vs2a_capture.sql"');
    const trial = dbApply.indexOf('"trial_period_enforcement.sql"');

    expect(vs1).toBeGreaterThan(-1);
    expect(vs2a).toBeGreaterThan(vs1);
    expect(trial).toBeGreaterThan(vs2a);
  });

  it("provides narrow SECURITY DEFINER capture RPCs and a readiness read model", () => {
    for (const fn of [
      "capture_rra_jurisdiction",
      "capture_rra_term_indicator",
      "capture_rra_tier4_classification",
      "get_rra_capture_readiness",
    ]) {
      expect(vs2aSql).toMatch(new RegExp(`create or replace function public\\.${fn}`, "i"));
    }

    expect(vs2aSql).toMatch(/security definer/gi);
    expect(vs2aSql).toContain("set search_path = public");
    expect(vs2aSql).toContain("public.user_can_manage_account(p_account_id)");
    expect(vs2aSql).toContain("revoke all on function public.capture_rra_jurisdiction");
    expect(vs2aSql).toContain("grant execute on function public.capture_rra_jurisdiction");
    expect(vs2aSql).toContain("grant execute on function public.get_rra_capture_readiness");
  });

  it("keeps VS-2A capture demo-only and avoids obligation/state-machine work", () => {
    expect(vs2aSql).toContain("RPE VS-2A capture is demo_mode only until Gate-B approval");
    expect(vs2aSql).toContain("if p_demo_mode is not true then");
    expect(vs2aSql).toContain("'demo_mode', true");
    expect(vs2aSql).not.toMatch(/create table if not exists public\.obligation_instance/i);
    expect(vs2aSql).not.toMatch(/insert into public\.obligation_instance/i);
    expect(vs2aSql).not.toMatch(/update public\.renters_rights_tasks/i);
  });

  it("captures jurisdiction only from canonical property-level subdivisions", () => {
    expect(vs2aSql).toContain("p_country_subdivision is null");
    expect(vs2aSql).toContain("p_country_subdivision not in ('England','Wales','Scotland','Northern Ireland','Other')");
    expect(vs2aSql).toContain("set country_subdivision = p_country_subdivision");
    expect(vs2aSql).toContain("'field_name', 'properties.country_subdivision'");
    expect(vs2aSql).not.toMatch(/accounts\.country_code\s*=/i);
    expect(vs2aSql).not.toMatch(/renters_rights_tasks\.jurisdiction\s*=/i);
  });

  it("enforces the full admissible term-indicator trio before updating a lease", () => {
    expect(vs2aSql).toContain("p_term_type is null");
    expect(vs2aSql).toContain("p_term_type not in ('periodic','open_ended')");
    expect(vs2aSql).toContain("p_term_type_effective_from is null");
    expect(vs2aSql).toContain("p_term_type_effective_from > v_qualifying_date");
    expect(vs2aSql).toContain("nullif(btrim(p_term_type_evidence_basis), '') is null");
    expect(vs2aSql).toContain("regulation_key = 'renters_rights_act_2026'");
    expect(vs2aSql).toContain("term_type = p_term_type");
    expect(vs2aSql).toContain("term_type_effective_from = p_term_type_effective_from");
    expect(vs2aSql).toContain("term_type_evidence_basis = p_term_type_evidence_basis");
  });

  it("requires all Tier-4 fields as explicit captured facts", () => {
    for (const field of [
      "p_tenancy_class",
      "p_company_let",
      "p_resident_landlord",
      "p_rent_act_1977",
      "p_pbsa",
      "p_is_wholly_oral",
    ]) {
      expect(vs2aSql).toContain(field);
    }

    expect(vs2aSql).toContain("p_tenancy_class is null");
    expect(vs2aSql).toContain("p_tenancy_class not in ('assured_shorthold','assured','regulated_rent_act','business','agricultural','licence','other')");
    expect(vs2aSql).toContain("or p_is_wholly_oral is null");
    expect(vs2aSql).toContain("evidence_basis is required for Tier-4 capture attribution");
    expect(vs2aSql).toContain("set tenancy_class = p_tenancy_class");
    expect(vs2aSql).toContain("set pbsa = p_pbsa");
    expect(vs2aSql).toContain("Property not found for lease/account");
  });

  it("records one narrow RPE provenance event per capture with attribution and old/new values", () => {
    for (const eventType of [
      "rpe.capture.jurisdiction_confirmed",
      "rpe.capture.term_indicator_confirmed",
      "rpe.capture.tier4_classification_confirmed",
    ]) {
      expect(vs2aSql).toContain(eventType);
    }

    expect((vs2aSql.match(/public\.record_provenance_event/g) || [])).toHaveLength(3);
    expect(vs2aSql).toContain("'actor_type'");
    expect(vs2aSql).toContain("'captured_by', auth.uid()");
    expect(vs2aSql).toContain("'captured_at', v_captured_at");
    expect(vs2aSql).toContain("'old_value'");
    expect(vs2aSql).toContain("'new_value'");
    expect(vs2aSql).toContain("'capture_source', 'manual_rpe_capture'");
    expect(vs2aSql).toContain("'test_confirmation_notice', 'demo_mode capture only; not a customer-facing legal attestation'");
  });

  it("exposes next capture action in the agreed blocker order", () => {
    expect(vs2aSql).toContain("'jurisdiction'");
    expect(vs2aSql).toContain("'active_on_qualifying_date'");
    expect(vs2aSql).toContain("'tenancy_class'");
    expect(vs2aSql).toContain("'company_let'");
    expect(vs2aSql).toContain("'resident_landlord'");
    expect(vs2aSql).toContain("'rent_act_1977'");
    expect(vs2aSql).toContain("'pbsa'");
    expect(vs2aSql).toContain("'is_wholly_oral'");
    expect(vs2aSql).toContain("then 'capture_jurisdiction'");
    expect(vs2aSql).toContain("then 'capture_term_indicator'");
    expect(vs2aSql).toContain("else 'capture_tier4_classification'");
  });

  it("browser service wrappers capture then immediately run a fresh demo evaluation", () => {
    for (const wrapper of [
      "captureRraJurisdictionAndEvaluate",
      "captureRraTermIndicatorAndEvaluate",
      "captureRraTier4ClassificationAndEvaluate",
    ]) {
      expect(engineService).toContain(`export async function ${wrapper}`);
    }

    expect(engineService).toContain('supabase.rpc("capture_rra_jurisdiction"');
    expect(engineService).toContain('supabase.rpc("capture_rra_term_indicator"');
    expect(engineService).toContain('supabase.rpc("capture_rra_tier4_classification"');
    expect(engineService).toContain("runFreshDemoEvaluation({ accountId, tenancyId })");
    expect(engineService).toContain("demoMode: true");
    expect(engineService).toContain("getRraCaptureReadiness");
  });
});

describe("RPE VS-2B obligation-instance lifecycle contract", () => {
  it("is applied after VS-2A and before unrelated overlays", () => {
    const vs2a = dbApply.indexOf('"regulatory_proof_engine_vs2a_capture.sql"');
    const vs2b = dbApply.indexOf('"regulatory_proof_engine_vs2b_obligations.sql"');
    const trial = dbApply.indexOf('"trial_period_enforcement.sql"');

    expect(vs2a).toBeGreaterThan(-1);
    expect(vs2b).toBeGreaterThan(vs2a);
    expect(trial).toBeGreaterThan(vs2b);
  });

  it("creates the authoritative obligation_instance table with demo-only legal posture fields", () => {
    expect(vs2bSql).toMatch(/create table if not exists public\.obligation_instance/i);
    for (const field of [
      "account_id uuid not null",
      "property_id uuid",
      "lease_id uuid not null",
      "regulatory_change_id uuid not null",
      "impact_rule_id uuid not null",
      "obligation_kind text not null",
      "exposure_gbp_ceiling numeric not null default 7000",
      "source_evaluation_id uuid not null",
      "related_task_id uuid",
      "last_transition_at timestamptz not null default now()",
      "demo_mode boolean not null default true",
    ]) {
      expect(vs2bSql).toContain(field);
    }

    expect(vs2bSql).toContain("posture in ('open','superseded','requires_review','discharged')");
    expect(vs2bSql).toContain("obligation_instance_no_discharged_vs2b");
    expect(vs2bSql).toContain("posture <> 'discharged'");
    expect(vs2bSql).toContain("obligation_instance_one_active_per_rule_idx");
    expect(vs2bSql).toContain("where posture in ('open','requires_review')");
  });

  it("enforces account-scoped RLS and blocks direct authenticated writes", () => {
    expect(vs2bSql).toContain("alter table public.obligation_instance enable row level security");
    expect(vs2bSql).toContain("grant select on table public.obligation_instance to authenticated");
    expect(vs2bSql).toContain("grant all on table public.obligation_instance to service_role");
    expect(vs2bSql).toContain("obligation_instance_select_account_managers");
    expect(vs2bSql).toContain("public.user_can_manage_account(account_id)");
    expect(vs2bSql).toContain("obligation_instance_no_direct_write");
    expect(vs2bSql).toContain("using (false)");
    expect(vs2bSql).toContain("with check (false)");
  });

  it("provides a single evaluation-driven reconciliation RPC and keeps it demo-only", () => {
    expect(vs2bSql).toMatch(/create or replace function public\.reconcile_rra_info_sheet_obligation/i);
    expect(vs2bSql).toContain("security definer");
    expect(vs2bSql).toContain("set search_path = public");
    expect(vs2bSql).toContain("if p_demo_mode is not true then");
    expect(vs2bSql).toContain("RPE VS-2B obligation reconciliation is demo_mode only until Gate-B approval");
    expect(vs2bSql).toContain("if not public.user_can_manage_account(p_account_id)");
    expect(vs2bSql).toContain("where re.id = p_evaluation_id");
    expect(vs2bSql).toContain("v_evaluation.demo_mode is not true");
    expect(vs2bSql).toContain("ir.rule_key = 'rra_info_sheet_v1'");
    expect(vs2bSql).toContain("grant execute on function public.reconcile_rra_info_sheet_obligation");
  });

  it("creates affected obligations idempotently and supersedes on obligation_kind change", () => {
    expect(vs2bSql).toContain("if v_evaluation.result = 'affected' then");
    expect(vs2bSql).toContain("affected evaluation requires obligation_kind");
    expect(vs2bSql).toContain("v_active.obligation_kind = v_evaluation.obligation_kind");
    expect(vs2bSql).toContain("'idempotent_update'");
    expect(vs2bSql).toContain("v_active.obligation_kind <> v_evaluation.obligation_kind");
    expect(vs2bSql).toContain("fresh affected evaluation changed obligation_kind; old obligation superseded");
    expect(vs2bSql).toContain("'kind_changed_new_open'");
    expect(vs2bSql).toContain("'rpe.obligation.created'");
  });

  it("moves open obligations to superseded or requires_review from later fresh evaluations", () => {
    expect(vs2bSql).toContain("v_evaluation.result in ('not_affected','needs_data')");
    expect(vs2bSql).toContain("when 'not_affected' then 'superseded'");
    expect(vs2bSql).toContain("when 'needs_data' then 'requires_review'");
    expect(vs2bSql).toContain("'fresh evaluation returned not_affected'");
    expect(vs2bSql).toContain("'fresh evaluation returned needs_data; current posture no longer provable'");
    expect(vs2bSql).toContain("'rpe.obligation.superseded'");
    expect(vs2bSql).toContain("'rpe.obligation.requires_review'");
  });

  it("does not revive superseded obligations; later affected evaluations create a new open row", () => {
    expect(vs2bSql).toContain("and oi.posture in ('open','requires_review')");
    expect(vs2bSql).not.toMatch(/where id = .*posture = 'superseded'[\s\S]{0,240}set posture = 'open'/i);
    expect(vs2bSql).toContain("insert into public.obligation_instance");
    expect(vs2bSql).toContain("'fresh affected evaluation created obligation'");
  });

  it("links renters_rights_tasks for context only and contains no task-to-posture path", () => {
    expect(vs2bSql).toContain("related_task_id");
    expect(vs2bSql).toContain("Operational context only");
    expect(vs2bSql).toContain("from public.renters_rights_tasks t");
    expect(vs2bSql).not.toMatch(/create\s+(constraint\s+)?trigger[\s\S]{0,200}renters_rights_tasks/i);
    expect(vs2bSql).not.toMatch(/after\s+update[\s\S]{0,200}on public\.renters_rights_tasks/i);
    expect(vs2bSql).not.toMatch(/update public\.obligation_instance[\s\S]{0,240}from public\.renters_rights_tasks/i);
  });

  it("emits atomic narrow provenance events for every posture transition", () => {
    expect(vs2bSql).toContain("record_rpe_obligation_transition_event");
    for (const eventType of [
      "rpe.obligation.created",
      "rpe.obligation.superseded",
      "rpe.obligation.requires_review",
    ]) {
      expect(vs2bSql).toContain(eventType);
    }

    expect(vs2bSql).toContain("obligation_instance_require_transition_event");
    expect(vs2bSql).toMatch(/constraint trigger trg_obligation_instance_require_transition/i);
    expect(vs2bSql).toMatch(/deferrable initially deferred/i);
    for (const metadataKey of [
      "'obligation_instance_id'",
      "'evaluation_id'",
      "'regulatory_change_id'",
      "'impact_rule_id'",
      "'lease_id'",
      "'property_id'",
      "'obligation_kind'",
      "'previous_posture'",
      "'new_posture'",
      "'reason'",
      "'demo_mode', true",
    ]) {
      expect(vs2bSql).toContain(metadataKey);
    }
  });

  it("reports requires_review as a separate non-compliant posture bucket", () => {
    expect(vs2bSql).toMatch(/create or replace function public\.rra_obligation_posture_summary/i);
    const summaryFn = vs2bSql.slice(vs2bSql.indexOf("create or replace function public.rra_obligation_posture_summary"));
    expect(summaryFn).toContain("group by oi.posture");
    expect(summaryFn).not.toMatch(/case[\s\S]{0,160}requires_review[\s\S]{0,160}open/i);
    expect(summaryFn).not.toMatch(/case[\s\S]{0,160}requires_review[\s\S]{0,160}superseded/i);
    expect(summaryFn).not.toMatch(/case[\s\S]{0,160}requires_review[\s\S]{0,160}compliant/i);
  });

  it("browser service reconciles obligations after persisted evaluations and exposes read models", () => {
    expect(engineService).toContain("export async function reconcileRraInfoSheetObligationForEvaluation");
    expect(engineService).toContain('supabase.rpc("reconcile_rra_info_sheet_obligation"');
    expect(engineService).toContain("await reconcileRraInfoSheetObligationForEvaluation");
    expect(engineService).toContain("export async function listRraObligationInstances");
    expect(engineService).toContain('supabase.rpc("list_rra_obligation_instances"');
    expect(engineService).toContain("export async function getRraObligationPostureSummary");
    expect(engineService).toContain('supabase.rpc("rra_obligation_posture_summary"');
  });
});

describe("RPE VS-2C discharge-path contract", () => {
  it("is applied after VS-2B and before unrelated overlays", () => {
    const vs2b = dbApply.indexOf('"regulatory_proof_engine_vs2b_obligations.sql"');
    const vs2c = dbApply.indexOf('"regulatory_proof_engine_vs2c_discharge.sql"');
    const trial = dbApply.indexOf('"trial_period_enforcement.sql"');

    expect(vs2b).toBeGreaterThan(-1);
    expect(vs2c).toBeGreaterThan(vs2b);
    expect(trial).toBeGreaterThan(vs2c);
  });

  it("creates first-class queryable service evidence, not JSON-only obligation metadata", () => {
    expect(vs2cSql).toMatch(/create table if not exists public\.rra_info_sheet_service_evidence/i);
    for (const field of [
      "account_id uuid not null",
      "property_id uuid",
      "lease_id uuid not null",
      "obligation_instance_id uuid not null",
      "official_info_sheet_identity text not null",
      "service_evidence_timestamp timestamptz not null",
      "evidence_type text not null",
      "captured_by uuid",
      "capture_source text not null",
      "demo_mode boolean not null default true",
    ]) {
      expect(vs2cSql).toContain(field);
    }
    expect(vs2cSql).toContain("rra_info_sheet_service_evidence_no_direct_write");
    expect(vs2cSql).not.toMatch(/alter table public\.obligation_instance[\s\S]{0,200}add column if not exists service_evidence jsonb/i);
  });

  it("rejects half-admissible or inadmissible service evidence at the RPC/database level", () => {
    expect(vs2cSql).toMatch(/create or replace function public\.capture_rra_info_sheet_service_evidence/i);
    expect(vs2cSql).toContain("official_info_sheet_identity is required");
    expect(vs2cSql).toContain("service_evidence_timestamp is required");
    expect(vs2cSql).toContain("official_info_sheet_source is inadmissible for discharge");
    expect(vs2cSql).toContain("evidence_basis is required");
    expect(vs2cSql).toContain("official_info_sheet_source in ('govuk_official_identity','official_document_catalogue','controlled_template_registry')");
    expect(vs2cSql).not.toContain("filename");
    expect(vs2cSql).not.toContain("document tags");
  });

  it("lifts discharged reachability only through the discharge reconciliation path", () => {
    expect(vs2cSql).toContain("drop constraint if exists obligation_instance_no_discharged_vs2b");
    expect(vs2cSql).toMatch(/create or replace function public\.reconcile_rra_info_sheet_obligation_discharge/i);
    expect(vs2cSql).toContain("only open obligations can be discharged");
    expect(vs2cSql).toContain("update public.obligation_instance");
    expect(vs2cSql).toContain("set posture = 'discharged'");
    expect(vs2cSql).toContain("'rpe.obligation.discharged'");
    expect(vs2cSql).toContain("pe.metadata ? 'evidence_id'");
    expect(vs2cSql).toContain("obligation_instance can only discharge from open posture");
  });

  it("preserves the VS-2B operational boundary with no task-to-posture path", () => {
    expect(vs2cSql).not.toMatch(/create\s+(constraint\s+)?trigger[\s\S]{0,200}renters_rights_tasks/i);
    expect(vs2cSql).not.toMatch(/after\s+update[\s\S]{0,200}on public\.renters_rights_tasks/i);
    expect(vs2cSql).not.toMatch(/update public\.obligation_instance[\s\S]{0,240}from public\.renters_rights_tasks/i);
  });

  it("freezes discharged obligations on later not_affected/needs_data and exposes the review flag", () => {
    expect(vs2cSql).toContain("review_flag text");
    expect(vs2cSql).toContain("'discharged_basis_changed'");
    expect(vs2cSql).toContain("v_had_active and v_active.posture = 'discharged'");
    expect(vs2cSql).toContain("v_evaluation.result in ('not_affected','needs_data')");
    expect(vs2cSql).toContain("'rpe.obligation.discharged_basis_changed_flag'");
    expect(vs2cSql).toContain("'action', 'discharged_basis_changed_flag'");
    expect(vs2cSql).toContain("review_flag_count");
    expect(vs2cSql).toContain("oi.review_flag");
  });

  it("browser service exposes capture, discharge, evidence read, and combined demo helpers", () => {
    expect(engineService).toContain("export async function captureRraInfoSheetServiceEvidence");
    expect(engineService).toContain('supabase.rpc("capture_rra_info_sheet_service_evidence"');
    expect(engineService).toContain("export async function dischargeRraInfoSheetObligation");
    expect(engineService).toContain('supabase.rpc("reconcile_rra_info_sheet_obligation_discharge"');
    expect(engineService).toContain("export async function captureAndDischargeRraInfoSheetObligation");
    expect(engineService).toContain("export async function listRraInfoSheetServiceEvidence");
    expect(engineService).toContain('supabase.rpc("list_rra_info_sheet_service_evidence"');
  });
});

describe("RPE VS-2C read-surface authorization contract", () => {
  it("does NOT grant direct SELECT on rra_info_sheet_service_evidence to authenticated", () => {
    expect(vs2cSql).not.toMatch(/grant\s+select\s+on\s+table\s+public\.rra_info_sheet_service_evidence\s+to\s+authenticated/i);
  });

  it("provides a throwing SECURITY DEFINER evidence read RPC with obligation ownership check", () => {
    expect(vs2cSql).toMatch(/create or replace function public\.list_rra_info_sheet_service_evidence/i);
    expect(vs2cSql).toMatch(/list_rra_info_sheet_service_evidence[\s\S]*?security definer/i);
    expect(vs2cSql).toMatch(/list_rra_info_sheet_service_evidence[\s\S]*?set search_path = public/i);
    expect(vs2cSql).toMatch(/list_rra_info_sheet_service_evidence[\s\S]*?user_can_manage_account\(p_account_id\)/i);
    expect(vs2cSql).toMatch(/list_rra_info_sheet_service_evidence[\s\S]*?Obligation not found for account/i);
    expect(vs2cSql).toMatch(/list_rra_info_sheet_service_evidence[\s\S]*?oi\.account_id = p_account_id/i);
  });

  it("revokes evidence read RPC from public and grants to authenticated only", () => {
    expect(vs2cSql).toMatch(/revoke all on function public\.list_rra_info_sheet_service_evidence\(uuid, uuid\) from public/i);
    expect(vs2cSql).toMatch(/grant execute on function public\.list_rra_info_sheet_service_evidence\(uuid, uuid\) to authenticated/i);
  });
});

describe("RPE VS-2A get_rra_capture_readiness lease ownership contract", () => {
  it("throws on cross-account lease instead of returning neutral not_run", () => {
    expect(vs2aSql).toMatch(/get_rra_capture_readiness[\s\S]*?Lease not found for account/i);
    expect(vs2aSql).toMatch(/get_rra_capture_readiness[\s\S]*?l\.account_id = p_account_id/i);
  });
});

describe("RPE full A/B/C/D + C-bad closure report contract", () => {
  it("uses the latest recorded evaluation per target tenancy without expected-result filtering", () => {
    expect(fullAbcdReportSql).toContain("latest recorded evaluation per target");
    expect(fullAbcdReportSql).toContain("left join public.rule_evaluation re");
    expect(fullAbcdReportSql).toContain("order by tc.case_name, re.evaluated_at desc nulls last");
    expect(fullAbcdReportSql).not.toMatch(/and\s+re\.result\s*=\s*tc\.expected_result/i);
    expect(fullAbcdReportSql).not.toMatch(/where\s+re\.result\s*=\s*tc\.expected_result/i);
  });

  it("covers the pinned A/B/C/D, C-bad, and B-prereq-3 lease set", () => {
    for (const leaseId of [
      "9f7e9d23-0000-4e1a-9000-000000000301",
      "9f7e9d24-0000-4e1a-9000-000000000301",
      "9f7e9d24-0000-4e1a-9000-000000000302",
      "9f7e9d24-0000-4e1a-9000-000000000303",
      "9f7e9d24-0000-4e1a-9000-000000000304",
      "9f7e9d24-0000-4e1a-9000-000000000305",
      "9f7e9d24-0000-4e1a-9000-000000000306",
      "9f7e9d24-0000-4e1a-9000-000000000307",
      "9f7e9d25-0000-4e1a-9000-000000000401",
      "9f7e9d25-0000-4e1a-9000-000000000402",
      "9f7e9d25-0000-4e1a-9000-000000000403",
      "9f7e9d25-0000-4e1a-9000-000000000404",
      "9f7e9d25-0000-4e1a-9000-000000000405",
      "9f7e9d25-0000-4e1a-9000-000000000406",
      "9f7e9d25-0000-4e1a-9000-000000000407",
      "9f7e9d25-0000-4e1a-9000-000000000408",
      "9f7e9d25-0000-4e1a-9000-000000000409",
      "9f7e9d25-0000-4e1a-9000-000000000410",
      "9f7e9d25-0000-4e1a-9000-000000000411",
    ]) {
      expect(fullAbcdReportSql).toContain(leaseId);
    }

    for (const caseName of [
      "D_not_reached_wales",
      "A_known_end",
      "B_periodic_indicator",
      "C_no_indicator",
      "C_bad_1_no_effective_date",
      "C_bad_2_effective_after",
      "C_bad_3_no_evidence_basis",
      "C_bad_4_fixed_null_end",
    ]) {
      expect(fullAbcdReportSql).toContain(caseName);
    }
  });

  it("reports first-class aod_branch and Section-B split counters", () => {
    for (const branch of [
      "known_end_date",
      "time_qualified_periodic_indicator",
      "missing",
      "not_reached",
    ]) {
      expect(fullAbcdReportSql).toContain(branch);
    }

    for (const counter of [
      "b_shaped_evaluable_count",
      "c_shaped_needs_capture_count",
      "not_reached_count",
      "affected_count",
      "not_affected_count",
      "needs_data_count",
      "deferred_count",
      "observed_aod_branches",
      "full_contract_pass",
    ]) {
      expect(fullAbcdReportSql).toContain(counter);
    }
  });

  it("requires fresh recorded evaluations, provenance events, demo mode, and input snapshot hashes", () => {
    expect(fullAbcdReportSql).toContain("d.recorded_evaluation_id is not null");
    expect(fullAbcdReportSql).toContain("e.provenance_event_id is not null");
    expect(fullAbcdReportSql).toContain("d.demo_mode is true");
    expect(fullAbcdReportSql).toContain("pe.event_type = 'evaluation_run'");
    expect(fullAbcdReportSql).toContain("inputSnapshotHash");
    expect(fullAbcdReportSql).toContain("contract_row_pass");
  });
});

describe("RPE contract test coverage portfolio artefacts", () => {
  const coverageLeaseIds = [
    "9f7e9d26-0000-4e1a-9000-000000000501",
    "9f7e9d26-0000-4e1a-9000-000000000502",
    "9f7e9d26-0000-4e1a-9000-000000000503",
    "9f7e9d26-0000-4e1a-9000-000000000504",
    "9f7e9d26-0000-4e1a-9000-000000000505",
    "9f7e9d26-0000-4e1a-9000-000000000506",
    "9f7e9d26-0000-4e1a-9000-000000000507",
    "9f7e9d26-0000-4e1a-9000-000000000508",
    "9f7e9d26-0000-4e1a-9000-000000000509",
    "9f7e9d26-0000-4e1a-9000-000000000510",
    "9f7e9d26-0000-4e1a-9000-000000000511",
    "9f7e9d26-0000-4e1a-9000-000000000512",
    "9f7e9d26-0000-4e1a-9000-000000000513",
    "9f7e9d26-0000-4e1a-9000-000000000514",
  ];

  it("seeds the pinned C1-C14 coverage leases without creating properties or tenants", () => {
    for (const leaseId of coverageLeaseIds) {
      expect(coverageSeedSql).toContain(leaseId);
    }

    expect(coverageSeedSql).toContain("Creates no properties or tenants");
    expect(coverageSeedSql).not.toMatch(/insert into public\.properties/i);
    expect(coverageSeedSql).not.toMatch(/insert into public\.tenants/i);
    expect(coverageSeedSql).toContain("status = 'ended'");
    expect(coverageSeedSql).toContain("'renters_rights_readiness'");
  });

  it("provides a per-case property preparation helper for property-level jurisdiction and PBSA cases", () => {
    expect(coveragePrepareSql).toContain("app.rpe_contract_case");
    expect(coveragePrepareSql).toContain("when 'C4' then '9f7e9d26-0000-4e1a-9000-000000000504'");
    expect(coveragePrepareSql).toContain("when 'C7' then 'Wales'");
    expect(coveragePrepareSql).toContain("when 'C8' then 'Scotland'");
    expect(coveragePrepareSql).toContain("when 'C10' then null");
    expect(coveragePrepareSql).toContain("v_pbsa := (v_case_name = 'C4')");
    expect(coveragePrepareSql).toContain("set country_subdivision = v_country_subdivision");
  });

  it("hard-gates all pinned coverage expectations including branches, confidence, exposure, and missing fields", () => {
    for (const leaseId of coverageLeaseIds) {
      expect(coverageReportSql).toContain(leaseId);
    }

    for (const expected of [
      "AFF_INFO_SHEET",
      "AFF_WRITTEN_STATEMENT",
      "EXCL_CLASS_COMPANY_LET",
      "EXCL_CLASS_PBSA",
      "EXCL_CLASS_LODGER",
      "EXCL_CLASS_RENT_ACT_1977",
      "EXCL_JURISDICTION",
      "EXCL_NOT_AST",
      "known_end_date",
      "time_qualified_periodic_indicator",
      "missing",
      "not_reached",
      "information_sheet",
      "written_statement",
      "expected_exposure_gbp_ceiling",
      "expected_confidence",
      "expected_missing_fields",
    ]) {
      expect(coverageReportSql).toContain(expected);
    }

    expect(coverageReportSql).toContain("coverage_contract_pass");
    expect(coverageReportSql).toContain("coverage_case_count");
    expect(coverageReportSql).toContain("coverage_pass_count");
    expect(coverageReportSql).toContain("e.input_snapshot_hash ~ '^[a-f0-9]{64}$'");
    expect(coverageReportSql).toContain("d.demo_mode is true");
  });
});

describe("RPE contract test representative measurement artefact", () => {
  it("keeps Part B separate from the pass/fail coverage gate and aggregates only pasted recorded evaluation IDs", () => {
    expect(measurementReportSql).toContain("representative measurement");
    expect(measurementReportSql).toContain("measurement report, not a correctness gate");
    expect(measurementReportSql).toContain("recorded_evaluation_id");
    expect(measurementReportSql).toContain("where recorded_evaluation_id is not null");
    expect(measurementReportSql).not.toMatch(/from public\.rule_evaluation re\s+where/i);
  });

  it("reports the seven PM-facing split lines for both brackets", () => {
    for (const expected of [
      "current_capture_state",
      "post_capture_steady_state",
      "1_aod_branch_distribution",
      "2_result_distribution",
      "3_needs_data_blocking_field",
      "4_confidence_distribution",
      "5_headline_terminal_vs_capture",
      "capture_priority_order",
      "weighted_percentage",
      "bracket_hard_checks_pass",
    ]) {
      expect(measurementReportSql).toContain(expected);
    }
  });

  it("includes the hard checks required by v0.3.2 freshness and provenance rules", () => {
    expect(measurementReportSql).toContain("d.demo_mode is true");
    expect(measurementReportSql).toContain("pe.event_type = 'evaluation_run'");
    expect(measurementReportSql).toContain("inputSnapshotHash");
    expect(measurementReportSql).toContain("e.input_snapshot_hash ~ '^[a-f0-9]{64}$'");
    expect(measurementReportSql).toContain("bracket_hard_checks");
    expect(measurementReportSql).toContain("sum(c.weight) as weighted_count");
  });

  it("has a local e2e runner that builds Part B from fresh Part A recorded evaluation IDs", () => {
    expect(measurementRunner).toContain("rpe_contract_coverage_e2e_runner.mjs");
    expect(measurementRunner).toContain("current_capture_state");
    expect(measurementRunner).toContain("post_capture_steady_state");
    expect(measurementRunner).toContain("fresh_recorded_evaluation_ids");
    expect(measurementRunner).toContain("recordedEvaluationId");
    expect(measurementRunner).toContain("Part B is a weighted bracket model, not a prevalence claim");
  });
});
