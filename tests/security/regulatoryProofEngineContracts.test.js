import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const vs1Sql = readFileSync(join(process.cwd(), "supabase/regulatory_proof_engine_vs1.sql"), "utf8");
const engineJs = readFileSync(join(process.cwd(), "src/lib/regulatoryProofEngine.js"), "utf8");
const dbApply = readFileSync(join(process.cwd(), "scripts/dbApplyRepoSql.js"), "utf8");

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
