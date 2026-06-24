import { supabase } from "../lib/supabase";
import { runRraInfoSheetEvaluation } from "../lib/regulatoryProofEngine";

function friendly(error, fallback) {
  return new Error(error?.message ?? fallback);
}

export function parseVs0ReadinessRows(rows = []) {
  return Object.fromEntries(
    (rows ?? []).map((row) => [row.input_key, row.classified_input]),
  );
}

export async function loadRraInfoSheetImpactRule() {
  const { data, error } = await supabase
    .from("impact_rule")
    .select("id, rule_key, version, active, demo_mode_only, correctness_approved_by")
    .eq("rule_key", "rra_info_sheet_v1")
    .eq("version", 1)
    .maybeSingle();

  if (error) throw friendly(error, "Failed to load RRA information-sheet rule");
  return data;
}

export async function loadRraInfoSheetVs0Map({ accountId, tenancyId } = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!tenancyId) throw new Error("Missing tenancyId");

  const { data, error } = await supabase.rpc("get_rra_info_sheet_data_readiness", {
    p_account_id: accountId,
    p_lease_id: tenancyId,
  });

  if (error) throw friendly(error, "Failed to load RRA information-sheet data readiness");
  return parseVs0ReadinessRows(data ?? []);
}

export async function recordRraInfoSheetRuleEvaluation({ accountId, evaluation } = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!evaluation) throw new Error("Missing evaluation");

  const { data, error } = await supabase.rpc("record_rra_info_sheet_rule_evaluation", {
    p_account_id: accountId,
    p_tenancy_id: evaluation.tenancy_id,
    p_input_snapshot: evaluation.input_snapshot,
    p_decision_path: evaluation.decision_path,
    p_result: evaluation.result,
    p_obligation_kind: evaluation.obligation_kind,
    p_reason_codes: evaluation.reason_codes,
    p_missing_fields: evaluation.missing_fields,
    p_deferred_until: evaluation.deferred_until,
    p_deferred_until_basis: evaluation.deferred_until_basis,
    p_evaluation_confidence: evaluation.evaluation_confidence,
    p_demo_mode: evaluation.demo_mode,
    p_evaluated_at: evaluation.evaluated_at,
  });

  if (error) throw friendly(error, "Failed to record RRA information-sheet evaluation");
  return data;
}

export async function runRraInfoSheetEvaluationForTenancy({
  accountId,
  tenancyId,
  demoMode = false,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!tenancyId) throw new Error("Missing tenancyId");

  const evaluation = await runRraInfoSheetEvaluation(tenancyId, {
    demoMode,
    loadImpactRule: loadRraInfoSheetImpactRule,
    loadVs0Map: () => loadRraInfoSheetVs0Map({ accountId, tenancyId }),
  });

  const persisted = await recordRraInfoSheetRuleEvaluation({
    accountId,
    evaluation,
  });

  return { ...evaluation, id: persisted?.id ?? null };
}

export async function listRraInfoSheetRuleEvaluations({
  accountId,
  limit = 100,
  offset = 0,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("list_rra_info_sheet_rule_evaluations", {
    p_account_id: accountId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw friendly(error, "Failed to list RRA information-sheet evaluations");
  return data ?? [];
}

export async function getRraInfoSheetEvaluationSummary({ accountId } = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("rra_info_sheet_evaluation_summary", {
    p_account_id: accountId,
  });

  if (error) throw friendly(error, "Failed to load RRA information-sheet evaluation summary");
  return data ?? [];
}
