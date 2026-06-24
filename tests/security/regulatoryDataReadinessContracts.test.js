import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/regulatory_proof_engine_vs0.sql"), "utf8");
const dbApply = readFileSync(join(process.cwd(), "scripts/dbApplyRepoSql.js"), "utf8");

describe("RPE VS-0 SQL catalogue contract", () => {
  it("creates the regulatory_data_requirements catalogue with the required shape", () => {
    expect(sql).toMatch(/create table if not exists public\.regulatory_data_requirements/i);
    expect(sql).toContain("impact_rule_ref text not null");
    expect(sql).toContain("input_key text not null");
    expect(sql).toContain("capability text not null check (capability in ('exists','derivable','missing'))");
    expect(sql).toContain("capture_tier int check (capture_tier between 1 and 5)");
    expect(sql).toContain("conditional boolean not null default false");
    expect(sql).toContain("unique (impact_rule_ref, input_key)");
  });

  it("seeds exactly all 23 RRA information-sheet inputs", () => {
    const seededKeys = [...sql.matchAll(/\('rra_info_sheet_v1','([^']+)'/g)].map((match) => match[1]);

    expect(seededKeys).toHaveLength(23);
    expect(new Set(seededKeys).size).toBe(23);
    expect(seededKeys).toEqual([
      "regulatory_change_version",
      "impact_rule_version",
      "qualifying_date",
      "tenancy_exists",
      "tenancy_start_date",
      "tenancy_end_date",
      "active_on_qualifying_date",
      "jurisdiction",
      "annual_rent_gbp",
      "company_let",
      "resident_landlord",
      "is_wholly_oral",
      "tenancy_class",
      "rent_act_1977",
      "pbsa",
      "s21_served",
      "s8_served",
      "notice_cutoff_date",
      "proceedings_status",
      "official_info_sheet_identity",
      "information_sheet_served",
      "service_evidence_timestamp",
      "evaluation_outcome_record",
    ]);
  });

  it("documents inadmissible source boundaries in the catalogue/read model", () => {
    expect(sql).toContain("Account GB and property market uk are inadmissible");
    expect(sql).toContain("properties.rent is an inadmissible substitute");
    expect(sql).toContain("Existing Polish lease_type values are inadmissible");
    expect(sql).toContain("document tags or filenames are inadmissible");
    expect(sql).toContain("VS-0 must not use code constants");
    expect(sql).toContain("time-qualified periodic/open-ended indicator");
    expect(sql).toContain("leases.term_type_effective_from");
  });

  it("enables RLS and blocks direct authenticated writes to the curated catalogue", () => {
    expect(sql).toContain("alter table public.regulatory_data_requirements enable row level security");
    expect(sql).toContain("grant select on table public.regulatory_data_requirements to authenticated");
    expect(sql).toContain("grant all on table public.regulatory_data_requirements to service_role");
    expect(sql).toContain("regulatory_data_requirements_select_authenticated");
    expect(sql).toContain("regulatory_data_requirements_no_direct_write");
    expect(sql).toMatch(/for all\s+to authenticated\s+using \(false\)\s+with check \(false\)/i);
  });
});

describe("RPE VS-0 read-model contract", () => {
  it("exposes a scoped per-tenancy classified-input RPC", () => {
    expect(sql).toMatch(/create or replace function public\.get_rra_info_sheet_data_readiness\(\s*p_account_id uuid,\s*p_lease_id uuid\s*\)/i);
    expect(sql).toContain("returns table");
    expect(sql).toContain("classified_input jsonb");
    expect(sql).toContain("if not public.user_can_manage_account(p_account_id)");
    expect(sql).toContain("and l.account_id = p_account_id");
    expect(sql).toContain("grant execute on function public.get_rra_info_sheet_data_readiness(uuid, uuid) to authenticated");
  });

  it("returns the VS-0 classified-input shape and strips values from missing/not_applicable outputs", () => {
    expect(sql).toContain("'input_key', p_input_key");
    expect(sql).toContain("'classification', p_classification");
    expect(sql).toContain("'source_fields'");
    expect(sql).toContain("'admissibility_reason'");
    expect(sql).toContain("'confidence_basis'");
    expect(sql).toContain("case when p_classification in ('exists','derivable') then p_value else 'null'::jsonb end");
    expect(sql).toContain("case when p_classification in ('exists','derivable') then p_confidence_basis else null end");
  });

  it("does not create VS-1 evaluator persistence objects", () => {
    expect(sql).not.toMatch(/create table if not exists public\.rule_evaluation/i);
    expect(sql).not.toMatch(/create table if not exists public\.obligation_instance/i);
    expect(sql).not.toMatch(/insert into public\.rule_evaluation/i);
    expect(sql).not.toMatch(/insert into public\.obligation_instance/i);
  });

  it("keeps possession inputs not_applicable when no structured notice signal exists", () => {
    expect(sql).toContain("v_req.input_key in ('s21_served','s8_served','proceedings_status')");
    expect(sql).toContain("'not_applicable'");
    expect(sql).toContain("No admissible structured possession notice signal exists for this tenancy");
  });

  it("uses dynamic lease json so optional legacy columns do not break overlay compilation", () => {
    expect(sql).toContain("v_lease_json := to_jsonb(v_lease)");
    expect(sql).toContain("v_lease_json->>'lease_start_date'");
    expect(sql).toContain("v_lease_json->>'start_date'");
    expect(sql).toContain("v_lease_json->>'rent_amount'");
    expect(sql).toContain("v_lease_json->>'rent_frequency'");
  });
});

describe("RPE VS-0 deployment order", () => {
  it("applies after existing Renters' Rights overlays and before later unrelated modules", () => {
    const rr = dbApply.indexOf('"renters_rights_tenant_filter_fix.sql"');
    const vs0 = dbApply.indexOf('"regulatory_proof_engine_vs0.sql"');
    const trial = dbApply.indexOf('"trial_period_enforcement.sql"');

    expect(rr).toBeGreaterThan(-1);
    expect(vs0).toBeGreaterThan(rr);
    expect(trial).toBeGreaterThan(vs0);
  });
});
