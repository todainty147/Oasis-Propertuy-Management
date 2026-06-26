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
    p_exposure_gbp_ceiling: evaluation.exposure_gbp_ceiling,
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

export async function reconcileRraInfoSheetObligationForEvaluation({
  accountId,
  evaluationId,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!evaluationId) throw new Error("Missing evaluationId");

  const { data, error } = await supabase.rpc("reconcile_rra_info_sheet_obligation", {
    p_account_id: accountId,
    p_evaluation_id: evaluationId,
    p_demo_mode: true,
  });

  if (error) throw friendly(error, "Failed to reconcile RRA obligation instance");
  return data ?? null;
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

  const obligation = persisted?.id
    ? await reconcileRraInfoSheetObligationForEvaluation({
      accountId,
      evaluationId: persisted.id,
    })
    : null;

  return { ...evaluation, id: persisted?.id ?? null, obligation };
}

export async function previewRraInfoSheetEvaluationForTenancy({
  accountId,
  tenancyId,
  demoMode = true,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!tenancyId) throw new Error("Missing tenancyId");

  return runRraInfoSheetEvaluation(tenancyId, {
    demoMode,
    loadImpactRule: loadRraInfoSheetImpactRule,
    loadVs0Map: () => loadRraInfoSheetVs0Map({ accountId, tenancyId }),
  });
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

export async function listRraObligationInstances({
  accountId,
  limit = 100,
  offset = 0,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("list_rra_obligation_instances", {
    p_account_id: accountId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw friendly(error, "Failed to list RRA obligation instances");
  return data ?? [];
}

export async function getRraObligationPostureSummary({ accountId } = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const { data, error } = await supabase.rpc("rra_obligation_posture_summary", {
    p_account_id: accountId,
  });

  if (error) throw friendly(error, "Failed to load RRA obligation posture summary");
  return data ?? [];
}

export async function getRraCaptureReadiness({ accountId, tenancyId } = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!tenancyId) throw new Error("Missing tenancyId");

  const { data, error } = await supabase.rpc("get_rra_capture_readiness", {
    p_account_id: accountId,
    p_lease_id: tenancyId,
  });

  if (error) throw friendly(error, "Failed to load RRA capture readiness");
  return data ?? null;
}

async function runFreshDemoEvaluation({ accountId, tenancyId }) {
  return runRraInfoSheetEvaluationForTenancy({
    accountId,
    tenancyId,
    demoMode: true,
  });
}

export async function captureRraJurisdictionAndEvaluate({
  accountId,
  propertyId,
  tenancyId,
  countrySubdivision,
  evidenceBasis = null,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!propertyId) throw new Error("Missing propertyId");
  if (!tenancyId) throw new Error("Missing tenancyId");
  if (!countrySubdivision) throw new Error("Missing countrySubdivision");

  const { data, error } = await supabase.rpc("capture_rra_jurisdiction", {
    p_account_id: accountId,
    p_property_id: propertyId,
    p_country_subdivision: countrySubdivision,
    p_evidence_basis: evidenceBasis,
    p_demo_mode: true,
  });

  if (error) throw friendly(error, "Failed to capture RRA jurisdiction");

  const evaluation = await runFreshDemoEvaluation({ accountId, tenancyId });
  return { capture: data, evaluation };
}

export async function captureRraTermIndicatorAndEvaluate({
  accountId,
  tenancyId,
  termType,
  termTypeEffectiveFrom,
  termTypeEvidenceBasis,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!tenancyId) throw new Error("Missing tenancyId");
  if (!termType) throw new Error("Missing termType");
  if (!termTypeEffectiveFrom) throw new Error("Missing termTypeEffectiveFrom");
  if (!termTypeEvidenceBasis) throw new Error("Missing termTypeEvidenceBasis");

  const { data, error } = await supabase.rpc("capture_rra_term_indicator", {
    p_account_id: accountId,
    p_lease_id: tenancyId,
    p_term_type: termType,
    p_term_type_effective_from: termTypeEffectiveFrom,
    p_term_type_evidence_basis: termTypeEvidenceBasis,
    p_demo_mode: true,
  });

  if (error) throw friendly(error, "Failed to capture RRA term indicator");

  const evaluation = await runFreshDemoEvaluation({ accountId, tenancyId });
  return { capture: data, evaluation };
}

export async function captureRraTier4ClassificationAndEvaluate({
  accountId,
  tenancyId,
  tenancyClass,
  companyLet,
  residentLandlord,
  rentAct1977,
  pbsa,
  isWhollyOral,
  evidenceBasis,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!tenancyId) throw new Error("Missing tenancyId");
  if (!tenancyClass) throw new Error("Missing tenancyClass");
  if (typeof companyLet !== "boolean") throw new Error("Missing companyLet");
  if (typeof residentLandlord !== "boolean") throw new Error("Missing residentLandlord");
  if (typeof rentAct1977 !== "boolean") throw new Error("Missing rentAct1977");
  if (typeof pbsa !== "boolean") throw new Error("Missing pbsa");
  if (typeof isWhollyOral !== "boolean") throw new Error("Missing isWhollyOral");
  if (!evidenceBasis) throw new Error("Missing evidenceBasis");

  const { data, error } = await supabase.rpc("capture_rra_tier4_classification", {
    p_account_id: accountId,
    p_lease_id: tenancyId,
    p_tenancy_class: tenancyClass,
    p_company_let: companyLet,
    p_resident_landlord: residentLandlord,
    p_rent_act_1977: rentAct1977,
    p_pbsa: pbsa,
    p_is_wholly_oral: isWhollyOral,
    p_evidence_basis: evidenceBasis,
    p_demo_mode: true,
  });

  if (error) throw friendly(error, "Failed to capture RRA Tier-4 classification");

  const evaluation = await runFreshDemoEvaluation({ accountId, tenancyId });
  return { capture: data, evaluation };
}
