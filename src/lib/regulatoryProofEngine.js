import {
  CLASSIFICATIONS,
  RRA_INFO_SHEET_RULE_REF,
} from "./regulatoryDataReadiness.js";

export const RRA_INFO_SHEET_COMMENCEMENT = "2026-05-01";

export const RRA_INFO_SHEET_REASON_CODES = Object.freeze([
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
]);

export const RRA_INFO_SHEET_AOD_BRANCHES = Object.freeze([
  "known_end_date",
  "time_qualified_periodic_indicator",
  "missing",
  "not_reached",
]);

const ENGLAND_VALUES = new Set(["ENG", "ENGLAND", "GB-ENG"]);
const AST_VALUES = new Set([
  "ast",
  "assured",
  "assured_shorthold",
  "assured_shorthold_tenancy",
  "assured shorthold",
  "assured shorthold tenancy",
]);
const CONCLUDED_PROCEEDINGS = new Set(["concluded", "closed", "complete", "completed"]);

function input(map, key) {
  return map?.[key] ?? {
    input_key: key,
    classification: CLASSIFICATIONS.MISSING,
    value: null,
    confidence_basis: null,
  };
}

function isMissing(item) {
  return item.classification === CLASSIFICATIONS.MISSING;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeJurisdiction(value) {
  return normalizeString(value).toUpperCase();
}

function normalizeTenancyClass(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function normalizeDate(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function result(payload) {
  return {
    result: payload.result,
    aod_branch: payload.aod_branch ?? "not_reached",
    reason_codes: payload.reason_codes ?? [],
    decision_path: payload.decision_path ?? [],
    missing_fields: payload.missing_fields ?? [],
    obligation_kind: payload.obligation_kind ?? null,
    exposure_gbp_ceiling: payload.exposure_gbp_ceiling ?? null,
    deferred_until: payload.deferred_until ?? null,
    deferred_until_basis: payload.deferred_until_basis ?? null,
  };
}

export function deriveAodBranch(classifiedMap, decisionPath = []) {
  if (!decisionPath.includes("active_on_qualifying_date")) return "not_reached";

  const activeOnQualifyingDate = input(classifiedMap, "active_on_qualifying_date");
  if (isMissing(activeOnQualifyingDate)) return "missing";

  const sourceFields = activeOnQualifyingDate.source_fields ?? [];
  const reason = normalizeString(activeOnQualifyingDate.admissibility_reason).toLowerCase();
  const usedPeriodicIndicator = sourceFields.some((field) => [
    "leases.term_type",
    "leases.term_type_effective_from",
    "leases.term_type_evidence_basis",
  ].includes(field));

  if (
    usedPeriodicIndicator ||
    reason.includes("periodic") ||
    reason.includes("open-ended") ||
    reason.includes("open_ended") ||
    reason.includes("time-qualified")
  ) {
    return "time_qualified_periodic_indicator";
  }

  return "known_end_date";
}

function needsData(missingFields, decisionPath, classifiedMap) {
  return result({
    result: "needs_data",
    aod_branch: deriveAodBranch(classifiedMap, decisionPath),
    missing_fields: missingFields,
    reason_codes: [],
    decision_path: decisionPath,
  });
}

function pushRead(decisionPath, key) {
  if (!decisionPath.includes(key)) decisionPath.push(key);
  return key;
}

export function evaluateRraInfoSheetV1(classifiedMap) {
  const decisionPath = [];
  const makeResult = (payload) => result({
    ...payload,
    aod_branch: deriveAodBranch(classifiedMap, payload.decision_path ?? decisionPath),
  });

  const jurisdiction = input(classifiedMap, pushRead(decisionPath, "jurisdiction"));
  if (isMissing(jurisdiction)) return needsData(["jurisdiction"], decisionPath, classifiedMap);
  if (!ENGLAND_VALUES.has(normalizeJurisdiction(jurisdiction.value))) {
    return makeResult({
      result: "not_affected",
      reason_codes: ["EXCL_JURISDICTION"],
      decision_path: decisionPath,
    });
  }

  const tenancyExists = input(classifiedMap, pushRead(decisionPath, "tenancy_exists"));
  if (isMissing(tenancyExists) || tenancyExists.value !== true) {
    return needsData(["tenancy_exists"], decisionPath, classifiedMap);
  }

  const tenancyStart = input(classifiedMap, pushRead(decisionPath, "tenancy_start_date"));
  if (isMissing(tenancyStart)) return needsData(["tenancy_start_date"], decisionPath, classifiedMap);
  if (normalizeDate(tenancyStart.value) >= RRA_INFO_SHEET_COMMENCEMENT) {
    return makeResult({
      result: "not_affected",
      reason_codes: ["EXCL_ENTERED_AFTER"],
      decision_path: decisionPath,
    });
  }

  const activeOnQualifyingDate = input(classifiedMap, pushRead(decisionPath, "active_on_qualifying_date"));
  if (isMissing(activeOnQualifyingDate)) return needsData(["active_on_qualifying_date"], decisionPath, classifiedMap);
  if (activeOnQualifyingDate.value !== true) {
    return makeResult({
      result: "not_affected",
      reason_codes: ["EXCL_NOT_ACTIVE_ON_DATE"],
      decision_path: decisionPath,
    });
  }

  for (const [noticeKey, reasonCode] of [
    ["s21_served", "DEFER_PENDING_S21"],
    ["s8_served", "DEFER_PENDING_S8"],
  ]) {
    const notice = input(classifiedMap, noticeKey);
    if (notice.classification === CLASSIFICATIONS.NOT_APPLICABLE) continue;
    pushRead(decisionPath, noticeKey);
    if (isMissing(notice)) return needsData([noticeKey], decisionPath, classifiedMap);

    const noticeDate = normalizeDate(notice.value);
    if (noticeDate && noticeDate < RRA_INFO_SHEET_COMMENCEMENT) {
      const proceedings = input(classifiedMap, pushRead(decisionPath, "proceedings_status"));
      if (isMissing(proceedings)) return needsData(["proceedings_status"], decisionPath, classifiedMap);
      if (!CONCLUDED_PROCEEDINGS.has(normalizeString(proceedings.value).toLowerCase())) {
        return makeResult({
          result: "deferred",
          reason_codes: [reasonCode],
          decision_path: decisionPath,
          deferred_until_basis: "unknown_pending_proceedings",
        });
      }
    }
  }

  const annualRent = input(classifiedMap, pushRead(decisionPath, "annual_rent_gbp"));
  if (!isMissing(annualRent) && Number(annualRent.value) > 100000) {
    return makeResult({
      result: "not_affected",
      reason_codes: ["EXCL_HIGH_RENT"],
      decision_path: decisionPath,
    });
  }

  const companyLet = input(classifiedMap, pushRead(decisionPath, "company_let"));
  if (!isMissing(companyLet) && normalizeBoolean(companyLet.value) === true) {
    return makeResult({
      result: "not_affected",
      reason_codes: ["EXCL_CLASS_COMPANY_LET"],
      decision_path: decisionPath,
    });
  }

  const residentLandlord = input(classifiedMap, pushRead(decisionPath, "resident_landlord"));
  if (!isMissing(residentLandlord) && normalizeBoolean(residentLandlord.value) === true) {
    return makeResult({
      result: "not_affected",
      reason_codes: ["EXCL_CLASS_LODGER"],
      decision_path: decisionPath,
    });
  }

  const rentAct1977 = input(classifiedMap, pushRead(decisionPath, "rent_act_1977"));
  if (!isMissing(rentAct1977) && normalizeBoolean(rentAct1977.value) === true) {
    return makeResult({
      result: "not_affected",
      reason_codes: ["EXCL_CLASS_RENT_ACT_1977"],
      decision_path: decisionPath,
    });
  }

  const pbsa = input(classifiedMap, pushRead(decisionPath, "pbsa"));
  if (!isMissing(pbsa) && normalizeBoolean(pbsa.value) === true) {
    return makeResult({
      result: "not_affected",
      reason_codes: ["EXCL_CLASS_PBSA"],
      decision_path: decisionPath,
    });
  }

  const tenancyClass = input(classifiedMap, pushRead(decisionPath, "tenancy_class"));
  if (isMissing(tenancyClass)) return needsData(["tenancy_class"], decisionPath, classifiedMap);
  if (!AST_VALUES.has(normalizeTenancyClass(tenancyClass.value))) {
    return makeResult({
      result: "not_affected",
      reason_codes: ["EXCL_NOT_AST"],
      decision_path: decisionPath,
    });
  }

  const whollyOral = input(classifiedMap, pushRead(decisionPath, "is_wholly_oral"));

  const missingFields = [
    ["annual_rent_gbp", annualRent],
    ["company_let", companyLet],
    ["resident_landlord", residentLandlord],
    ["rent_act_1977", rentAct1977],
    ["pbsa", pbsa],
    ["is_wholly_oral", whollyOral],
  ].filter(([, item]) => isMissing(item)).map(([key]) => key);

  if (missingFields.length > 0) {
    return needsData(missingFields, decisionPath, classifiedMap);
  }

  if (normalizeBoolean(whollyOral.value) === true) {
    return makeResult({
      result: "affected",
      reason_codes: ["AFF_WRITTEN_STATEMENT"],
      decision_path: decisionPath,
      obligation_kind: "written_statement",
      exposure_gbp_ceiling: 7000,
    });
  }

  return makeResult({
    result: "affected",
    reason_codes: ["AFF_INFO_SHEET"],
    decision_path: decisionPath,
    obligation_kind: "information_sheet",
    exposure_gbp_ceiling: 7000,
  });
}

export function deriveEvaluationConfidence(classifiedMap, decisionPath, resultValue) {
  if (resultValue === "needs_data") return null;

  const pathInputs = decisionPath.map((key) => input(classifiedMap, key));
  if (pathInputs.some((item) => item.low_confidence_reason)) return "low";
  if (pathInputs.some((item) => item.classification === CLASSIFICATIONS.DERIVABLE)) return "medium";
  return "high";
}


export async function runRraInfoSheetEvaluation(tenancyId, {
  demoMode = false,
  loadImpactRule,
  loadVs0Map,
  persistEvaluation,
  appendProvenanceEvent,
  now = () => new Date().toISOString(),
} = {}) {
  if (!tenancyId) throw new Error("Missing tenancyId");
  if (typeof loadImpactRule !== "function") throw new Error("Missing loadImpactRule dependency");
  if (typeof loadVs0Map !== "function") throw new Error("Missing loadVs0Map dependency");

  if (typeof persistEvaluation === "function" && typeof appendProvenanceEvent !== "function") {
    throw new Error("Cannot persist evaluation without a provenance writer; route production persistence through the SQL RPC");
  }

  const impactRule = await loadImpactRule({
    ruleRef: RRA_INFO_SHEET_RULE_REF,
    version: 1,
  });
  if (!impactRule) throw new Error("RRA information-sheet impact rule v1 not found");

  const inputSnapshot = await loadVs0Map({ tenancyId, ruleRef: RRA_INFO_SHEET_RULE_REF });
  const approved = Boolean(impactRule.active && impactRule.correctness_approved_by && impactRule.demo_mode_only !== true);
  if (!approved && demoMode !== true) {
    throw new Error("RRA information-sheet rule v1 is not Gate-B approved; run with demoMode=true only");
  }

  const demo_mode = Boolean(demoMode || !approved);
  const evaluation = evaluateRraInfoSheetV1(inputSnapshot);
  const evaluation_confidence = deriveEvaluationConfidence(
    inputSnapshot,
    evaluation.decision_path,
    evaluation.result,
  );
  const evaluated_at = now();

  const row = {
    impact_rule_id: impactRule.id,
    impact_rule_version: impactRule.version ?? 1,
    tenancy_id: tenancyId,
    input_snapshot: inputSnapshot,
    decision_path: evaluation.decision_path,
    result: evaluation.result,
    aod_branch: evaluation.aod_branch,
    obligation_kind: evaluation.obligation_kind,
    exposure_gbp_ceiling: evaluation.exposure_gbp_ceiling,
    reason_codes: evaluation.reason_codes,
    missing_fields: evaluation.missing_fields,
    deferred_until: evaluation.deferred_until,
    deferred_until_basis: evaluation.deferred_until_basis,
    evaluation_confidence,
    demo_mode,
    evaluated_at,
  };

  if (typeof persistEvaluation !== "function") {
    return row;
  }

  const persisted = await persistEvaluation(row);
  const persistedId = persisted?.id ?? row.id ?? null;

  await appendProvenanceEvent({
    evaluationId: persistedId,
    eventType: "evaluation_run",
    payload: {
      ruleId: impactRule.id,
      ruleVersion: row.impact_rule_version,
      tenancyId,
      result: row.result,
      reasonCodes: row.reason_codes,
      decisionPath: row.decision_path,
      confidence: row.evaluation_confidence,
      demoMode: row.demo_mode,
      evaluatedAt: row.evaluated_at,
    },
  });

  return {
    ...row,
    id: persistedId,
  };
}
