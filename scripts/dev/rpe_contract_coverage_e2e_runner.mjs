import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

import { evaluateRraInfoSheetV1, deriveEvaluationConfidence } from "../../src/lib/regulatoryProofEngine.js";
import { isolationFixtures } from "../../tests/fixtures/isolationFixtures.js";
import { getIntegrationEnv } from "../../tests/integration/helpers/env.js";

const ACCOUNT_A_ID = "11111111-1111-1111-1111-111111111111";
const CONTAINER = process.env.RPE_DB_CONTAINER || "supabase_db_oasisrentalmanagementapp";
const PREPARE_SQL = readFileSync(join(process.cwd(), "scripts/dev/rpe_contract_coverage_prepare_case.sql"), "utf8");
const REPORT_SQL = readFileSync(join(process.cwd(), "scripts/dev/rpe_contract_coverage_report.sql"), "utf8");

const CASES = [
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "C8",
  "C9",
  "C10",
  "C11",
  "C12",
  "C13",
  "C14",
];

const LEASE_IDS = Object.fromEntries(
  CASES.map((caseName, index) => [
    caseName,
    `9f7e9d26-0000-4e1a-9000-0000000005${String(index + 1).padStart(2, "0")}`,
  ]),
);

function runPsql({ sql, caseName } = {}) {
  const args = [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ];

  if (caseName) {
    args.push("-c", `select set_config('app.rpe_contract_case', '${caseName}', false);`);
  }

  args.push("-f", "-");

  const result = spawnSync("docker", args, {
    input: sql,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error([
      `psql failed${caseName ? ` for ${caseName}` : ""}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }

  return result.stdout;
}

function parseVs0ReadinessRows(rows = []) {
  return Object.fromEntries((rows ?? []).map((row) => [row.input_key, row.classified_input]));
}

async function signInOwnerA() {
  const env = getIntegrationEnv();
  const client = createClient(env.url, env.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email: isolationFixtures.users.ownerA.email,
    password: env.userPassword,
  });

  if (error) throw error;
  if (!data.session) throw new Error("ownerA sign-in returned no session");

  return client;
}

async function loadImpactRule(client) {
  const { data, error } = await client
    .from("impact_rule")
    .select("id, rule_key, version, active, demo_mode_only, correctness_approved_by")
    .eq("rule_key", "rra_info_sheet_v1")
    .eq("version", 1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("RRA information-sheet impact rule v1 not found");
  return data;
}

async function loadVs0Map(client, tenancyId) {
  const { data, error } = await client.rpc("get_rra_info_sheet_data_readiness", {
    p_account_id: ACCOUNT_A_ID,
    p_lease_id: tenancyId,
  });

  if (error) throw error;
  return parseVs0ReadinessRows(data ?? []);
}

async function recordEvaluation(client, evaluation) {
  const { data, error } = await client.rpc("record_rra_info_sheet_rule_evaluation", {
    p_account_id: ACCOUNT_A_ID,
    p_tenancy_id: evaluation.tenancy_id,
    p_input_snapshot: evaluation.input_snapshot,
    p_decision_path: evaluation.decision_path,
    p_result: evaluation.result,
    p_obligation_kind: evaluation.obligation_kind,
    p_exposure_gbp_ceiling: evaluation.exposure_gbp_ceiling,
    p_reason_codes: evaluation.reason_codes,
    p_missing_fields: evaluation.missing_fields,
    p_deferred_until: evaluation.deferred_until,
    p_deferred_until_basis: evaluation.deferred_until_basis,
    p_evaluation_confidence: evaluation.evaluation_confidence,
    p_demo_mode: evaluation.demo_mode,
    p_evaluated_at: evaluation.evaluated_at,
  });

  if (error) throw error;
  return data;
}

async function runCase(client, caseName) {
  runPsql({ sql: PREPARE_SQL, caseName });

  const tenancyId = LEASE_IDS[caseName];
  const impactRule = await loadImpactRule(client);
  const inputSnapshot = await loadVs0Map(client, tenancyId);
  const evaluated = evaluateRraInfoSheetV1(inputSnapshot);
  const evaluation = {
    impact_rule_id: impactRule.id,
    impact_rule_version: impactRule.version ?? 1,
    tenancy_id: tenancyId,
    input_snapshot: inputSnapshot,
    decision_path: evaluated.decision_path,
    result: evaluated.result,
    aod_branch: evaluated.aod_branch,
    obligation_kind: evaluated.obligation_kind,
    exposure_gbp_ceiling: evaluated.exposure_gbp_ceiling,
    reason_codes: evaluated.reason_codes,
    missing_fields: evaluated.missing_fields,
    deferred_until: evaluated.deferred_until,
    deferred_until_basis: evaluated.deferred_until_basis,
    evaluation_confidence: deriveEvaluationConfidence(inputSnapshot, evaluated.decision_path, evaluated.result),
    demo_mode: true,
    evaluated_at: new Date().toISOString(),
  };

  const persisted = await recordEvaluation(client, evaluation);
  return {
    caseName,
    tenancyId,
    recordedEvaluationId: persisted.id,
    result: evaluation.result,
    aodBranch: evaluation.aod_branch,
    reasonCodes: evaluation.reason_codes,
    missingFields: evaluation.missing_fields,
    confidence: evaluation.evaluation_confidence,
  };
}

async function main() {
  const client = await signInOwnerA();
  const rows = [];

  for (const caseName of CASES) {
    rows.push(await runCase(client, caseName));
  }

  const report = runPsql({ sql: REPORT_SQL });

  console.log(JSON.stringify({
    recorded: rows,
    report,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
