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

export async function listRraInfoSheetServiceEvidence({
  accountId,
  obligationInstanceId,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!obligationInstanceId) throw new Error("Missing obligationInstanceId");

  const { data, error } = await supabase.rpc("list_rra_info_sheet_service_evidence", {
    p_account_id: accountId,
    p_obligation_instance_id: obligationInstanceId,
  });

  if (error) throw friendly(error, "Failed to list RRA information-sheet service evidence");
  return data ?? [];
}

export async function captureRraInfoSheetServiceEvidence({
  accountId,
  obligationInstanceId,
  officialInfoSheetIdentity,
  serviceEvidenceTimestamp,
  evidenceType,
  evidenceBasis,
  officialInfoSheetSource = "official_document_catalogue",
  captureSource = "manual_rpe_service_evidence_capture",
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!obligationInstanceId) throw new Error("Missing obligationInstanceId");
  if (!officialInfoSheetIdentity) throw new Error("Missing officialInfoSheetIdentity");
  if (!serviceEvidenceTimestamp) throw new Error("Missing serviceEvidenceTimestamp");
  if (!evidenceType) throw new Error("Missing evidenceType");
  if (!evidenceBasis) throw new Error("Missing evidenceBasis");

  const { data, error } = await supabase.rpc("capture_rra_info_sheet_service_evidence", {
    p_account_id: accountId,
    p_obligation_instance_id: obligationInstanceId,
    p_official_info_sheet_identity: officialInfoSheetIdentity,
    p_service_evidence_timestamp: serviceEvidenceTimestamp,
    p_evidence_type: evidenceType,
    p_evidence_basis: evidenceBasis,
    p_official_info_sheet_source: officialInfoSheetSource,
    p_capture_source: captureSource,
    p_demo_mode: true,
  });

  if (error) throw friendly(error, "Failed to capture RRA information-sheet service evidence");
  return data ?? null;
}

export async function dischargeRraInfoSheetObligation({
  accountId,
  obligationInstanceId,
  serviceEvidenceId,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!obligationInstanceId) throw new Error("Missing obligationInstanceId");
  if (!serviceEvidenceId) throw new Error("Missing serviceEvidenceId");

  const { data, error } = await supabase.rpc("reconcile_rra_info_sheet_obligation_discharge", {
    p_account_id: accountId,
    p_obligation_instance_id: obligationInstanceId,
    p_service_evidence_id: serviceEvidenceId,
    p_demo_mode: true,
  });

  if (error) throw friendly(error, "Failed to discharge RRA information-sheet obligation");
  return data ?? null;
}

export async function captureAndDischargeRraInfoSheetObligation({
  accountId,
  obligationInstanceId,
  officialInfoSheetIdentity,
  serviceEvidenceTimestamp,
  evidenceType,
  evidenceBasis,
  officialInfoSheetSource = "official_document_catalogue",
  captureSource = "manual_rpe_service_evidence_capture",
} = {}) {
  const evidence = await captureRraInfoSheetServiceEvidence({
    accountId,
    obligationInstanceId,
    officialInfoSheetIdentity,
    serviceEvidenceTimestamp,
    evidenceType,
    evidenceBasis,
    officialInfoSheetSource,
    captureSource,
  });

  const discharge = await dischargeRraInfoSheetObligation({
    accountId,
    obligationInstanceId,
    serviceEvidenceId: evidence?.evidence_id,
  });

  return { evidence, discharge };
}

export async function listObligationBasisReviews({
  accountId,
  obligationInstanceId = null,
  limit = 100,
  offset = 0,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");

  const params = {
    p_account_id: accountId,
    p_limit: limit,
    p_offset: offset,
  };
  if (obligationInstanceId) params.p_obligation_instance_id = obligationInstanceId;

  const { data, error } = await supabase.rpc("list_obligation_basis_reviews", params);

  if (error) throw friendly(error, "Failed to list obligation basis reviews");
  return data ?? [];
}

export async function getObligationProofPack({
  accountId,
  obligationInstanceId,
} = {}) {
  if (!accountId) throw new Error("Missing accountId");
  if (!obligationInstanceId) throw new Error("Missing obligationInstanceId");

  const { data, error } = await supabase.rpc("get_obligation_proof_pack", {
    p_account_id: accountId,
    p_obligation_instance_id: obligationInstanceId,
  });

  if (error) throw friendly(error, "Failed to load obligation proof pack");
  return data ?? null;
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
