import { describe, expect, it, vi } from "vitest";

import { CLASSIFICATIONS } from "../../src/lib/regulatoryDataReadiness.js";
import {
  deriveEvaluationConfidence,
  evaluateRraInfoSheetV1,
  runRraInfoSheetEvaluation,
} from "../../src/lib/regulatoryProofEngine.js";

function classified(input_key, classification, value, extra = {}) {
  return {
    input_key,
    classification,
    value,
    source_fields: [],
    admissibility_reason: "test",
    confidence_basis: classification === CLASSIFICATIONS.MISSING || classification === CLASSIFICATIONS.NOT_APPLICABLE
      ? null
      : classification,
    low_confidence_reason: null,
    capture_tier: null,
    capture_location: null,
    ...extra,
  };
}

function exists(key, value, extra) {
  return classified(key, CLASSIFICATIONS.EXISTS, value, extra);
}

function derivable(key, value, extra) {
  return classified(key, CLASSIFICATIONS.DERIVABLE, value, extra);
}

function missing(key, extra) {
  return classified(key, CLASSIFICATIONS.MISSING, null, extra);
}

function notApplicable(key) {
  return classified(key, CLASSIFICATIONS.NOT_APPLICABLE, null);
}

function affectedMap(overrides = {}) {
  return {
    regulatory_change_version: missing("regulatory_change_version"),
    impact_rule_version: missing("impact_rule_version"),
    qualifying_date: missing("qualifying_date"),
    official_info_sheet_identity: missing("official_info_sheet_identity"),
    evaluation_outcome_record: missing("evaluation_outcome_record"),
    jurisdiction: exists("jurisdiction", "ENG"),
    tenancy_exists: exists("tenancy_exists", true),
    tenancy_start_date: exists("tenancy_start_date", "2026-01-01"),
    tenancy_end_date: exists("tenancy_end_date", "2026-12-31"),
    active_on_qualifying_date: derivable("active_on_qualifying_date", true),
    tenancy_class: exists("tenancy_class", "assured_shorthold"),
    s21_served: notApplicable("s21_served"),
    s8_served: notApplicable("s8_served"),
    proceedings_status: notApplicable("proceedings_status"),
    notice_cutoff_date: missing("notice_cutoff_date"),
    annual_rent_gbp: derivable("annual_rent_gbp", 100000),
    resident_landlord: exists("resident_landlord", false),
    company_let: exists("company_let", false),
    rent_act_1977: exists("rent_act_1977", false),
    pbsa: exists("pbsa", false),
    is_wholly_oral: exists("is_wholly_oral", false),
    information_sheet_served: missing("information_sheet_served"),
    service_evidence_timestamp: missing("service_evidence_timestamp"),
    ...overrides,
  };
}

describe("evaluateRraInfoSheetV1 results", () => {
  it("returns needs_data when jurisdiction is missing", () => {
    const result = evaluateRraInfoSheetV1(affectedMap({ jurisdiction: missing("jurisdiction") }));

    expect(result).toMatchObject({
      result: "needs_data",
      missing_fields: ["jurisdiction"],
      decision_path: ["jurisdiction"],
    });
  });

  it("returns not_affected for Wales and stops at jurisdiction", () => {
    const result = evaluateRraInfoSheetV1(affectedMap({ jurisdiction: exists("jurisdiction", "WLS") }));

    expect(result.result).toBe("not_affected");
    expect(result.reason_codes).toEqual(["EXCL_JURISDICTION"]);
    expect(result.decision_path).toEqual(["jurisdiction"]);
  });

  it("returns not_affected for non-AST tenancies", () => {
    const result = evaluateRraInfoSheetV1(affectedMap({ tenancy_class: exists("tenancy_class", "licence") }));

    expect(result.result).toBe("not_affected");
    expect(result.reason_codes).toEqual(["EXCL_NOT_AST"]);
    expect(result.decision_path).toContain("tenancy_class");
  });

  it("returns not_affected for tenancies entered on or after commencement", () => {
    const result = evaluateRraInfoSheetV1(affectedMap({
      tenancy_start_date: exists("tenancy_start_date", "2026-05-01"),
    }));

    expect(result.result).toBe("not_affected");
    expect(result.reason_codes).toEqual(["EXCL_ENTERED_AFTER"]);
    expect(result.decision_path).toEqual(["jurisdiction", "tenancy_exists", "tenancy_start_date"]);
  });

  it("returns EXCL_NOT_ACTIVE_ON_DATE separately from entered-after cases", () => {
    const result = evaluateRraInfoSheetV1(affectedMap({
      active_on_qualifying_date: derivable("active_on_qualifying_date", false),
    }));

    expect(result.result).toBe("not_affected");
    expect(result.reason_codes).toEqual(["EXCL_NOT_ACTIVE_ON_DATE"]);
    expect(result.reason_codes).not.toEqual(["EXCL_ENTERED_AFTER"]);
    expect(result.decision_path).toEqual([
      "jurisdiction",
      "tenancy_exists",
      "tenancy_start_date",
      "active_on_qualifying_date",
    ]);
  });

  it("returns not_affected for annual rent above £100,000 and treats the boundary as affected", () => {
    expect(evaluateRraInfoSheetV1(affectedMap({
      annual_rent_gbp: derivable("annual_rent_gbp", 100001),
    }))).toMatchObject({
      result: "not_affected",
      reason_codes: ["EXCL_HIGH_RENT"],
    });

    expect(evaluateRraInfoSheetV1(affectedMap({
      annual_rent_gbp: derivable("annual_rent_gbp", 100000),
    }))).toMatchObject({
      result: "affected",
      reason_codes: ["AFF_INFO_SHEET"],
      obligation_kind: "information_sheet",
    });
  });

  it("returns not_affected for each excluded class", () => {
    const cases = [
      ["resident_landlord", true, "EXCL_CLASS_LODGER"],
      ["company_let", true, "EXCL_CLASS_COMPANY_LET"],
      ["rent_act_1977", true, "EXCL_CLASS_RENT_ACT_1977"],
      ["pbsa", true, "EXCL_CLASS_PBSA"],
    ];

    for (const [key, value, reason] of cases) {
      const result = evaluateRraInfoSheetV1(affectedMap({ [key]: exists(key, value) }));
      expect(result.result).toBe("not_affected");
      expect(result.reason_codes).toEqual([reason]);
    }
  });

  it("evaluates provable exclusions before completeness", () => {
    const result = evaluateRraInfoSheetV1(affectedMap({
      annual_rent_gbp: missing("annual_rent_gbp"),
      company_let: exists("company_let", true),
    }));

    expect(result.result).toBe("not_affected");
    expect(result.reason_codes).toEqual(["EXCL_CLASS_COMPANY_LET"]);
    expect(result.missing_fields).toEqual([]);
  });

  it("returns information_sheet for written/partly-written tenancies and written_statement for wholly oral", () => {
    expect(evaluateRraInfoSheetV1(affectedMap({
      is_wholly_oral: exists("is_wholly_oral", false),
    }))).toMatchObject({
      result: "affected",
      reason_codes: ["AFF_INFO_SHEET"],
      obligation_kind: "information_sheet",
    });

    expect(evaluateRraInfoSheetV1(affectedMap({
      is_wholly_oral: exists("is_wholly_oral", true),
    }))).toMatchObject({
      result: "affected",
      reason_codes: ["AFF_WRITTEN_STATEMENT"],
      obligation_kind: "written_statement",
    });
  });

  it("returns needs_data for missing decision-path fields after no exclusion can be proved", () => {
    const result = evaluateRraInfoSheetV1(affectedMap({
      annual_rent_gbp: missing("annual_rent_gbp"),
      resident_landlord: exists("resident_landlord", false),
      company_let: exists("company_let", false),
      rent_act_1977: exists("rent_act_1977", false),
      pbsa: exists("pbsa", false),
    }));

    expect(result.result).toBe("needs_data");
    expect(result.missing_fields).toEqual(["annual_rent_gbp"]);
    expect(result.decision_path).toContain("annual_rent_gbp");
  });
});

describe("evaluateRraInfoSheetV1 deferral conditionality and decision_path", () => {
  it("skips possession inputs classified not_applicable", () => {
    const result = evaluateRraInfoSheetV1(affectedMap());

    expect(result.result).toBe("affected");
    expect(result.decision_path).not.toContain("s21_served");
    expect(result.decision_path).not.toContain("s8_served");
    expect(result.decision_path).not.toContain("proceedings_status");
  });

  it("defers when an admissible pre-commencement S21 notice is pending", () => {
    const result = evaluateRraInfoSheetV1(affectedMap({
      s21_served: exists("s21_served", "2026-04-01"),
      proceedings_status: exists("proceedings_status", "issued"),
    }));

    expect(result.result).toBe("deferred");
    expect(result.reason_codes).toEqual(["DEFER_PENDING_S21"]);
    expect(result.deferred_until_basis).toBe("unknown_pending_proceedings");
    expect(result.decision_path).toContain("s21_served");
    expect(result.decision_path).toContain("proceedings_status");
  });

  it("defers when an admissible pre-commencement S8 notice is pending", () => {
    const result = evaluateRraInfoSheetV1(affectedMap({
      s8_served: exists("s8_served", "2026-04-15"),
      proceedings_status: exists("proceedings_status", "pending"),
    }));

    expect(result.result).toBe("deferred");
    expect(result.reason_codes).toEqual(["DEFER_PENDING_S8"]);
    expect(result.deferred_until_basis).toBe("unknown_pending_proceedings");
  });

  it("falls through when proceedings are concluded", () => {
    const result = evaluateRraInfoSheetV1(affectedMap({
      s21_served: exists("s21_served", "2026-04-01"),
      proceedings_status: exists("proceedings_status", "concluded"),
    }));

    expect(result.result).toBe("affected");
    expect(result.reason_codes).toEqual(["AFF_INFO_SHEET"]);
  });

  it("needs proceedings_status only when a qualifying notice exists", () => {
    const result = evaluateRraInfoSheetV1(affectedMap({
      s21_served: exists("s21_served", "2026-04-01"),
      proceedings_status: missing("proceedings_status"),
    }));

    expect(result.result).toBe("needs_data");
    expect(result.missing_fields).toEqual(["proceedings_status"]);
  });
});

describe("evaluation confidence", () => {
  it("is high when all decision-path inputs are exists", () => {
    const map = affectedMap({
      active_on_qualifying_date: exists("active_on_qualifying_date", true),
      annual_rent_gbp: exists("annual_rent_gbp", 100000),
    });
    const evaluation = evaluateRraInfoSheetV1(map);

    expect(deriveEvaluationConfidence(map, evaluation.decision_path, evaluation.result)).toBe("high");
  });

  it("is medium when any decision-path input is derivable", () => {
    const map = affectedMap();
    const evaluation = evaluateRraInfoSheetV1(map);

    expect(deriveEvaluationConfidence(map, evaluation.decision_path, evaluation.result)).toBe("medium");
  });

  it("is null for needs_data", () => {
    const map = affectedMap({ jurisdiction: missing("jurisdiction") });
    const evaluation = evaluateRraInfoSheetV1(map);

    expect(deriveEvaluationConfidence(map, evaluation.decision_path, evaluation.result)).toBeNull();
  });

  it("ignores off-path missing and not_applicable inputs", () => {
    const map = affectedMap({
      jurisdiction: exists("jurisdiction", "WLS"),
      annual_rent_gbp: missing("annual_rent_gbp"),
      s21_served: notApplicable("s21_served"),
    });
    const evaluation = evaluateRraInfoSheetV1(map);

    expect(evaluation.decision_path).toEqual(["jurisdiction"]);
    expect(deriveEvaluationConfidence(map, evaluation.decision_path, evaluation.result)).toBe("high");
  });

  it("keeps a forward-looking low branch for future weaker-rule classifications", () => {
    const map = affectedMap({
      jurisdiction: derivable("jurisdiction", "ENG", {
        low_confidence_reason: "synthetic future weaker rule",
      }),
    });
    const evaluation = evaluateRraInfoSheetV1(map);

    expect(deriveEvaluationConfidence(map, evaluation.decision_path, evaluation.result)).toBe("low");
  });
});

describe("runRraInfoSheetEvaluation", () => {
  it("refuses non-demo runs while the rule is not Gate-B approved", async () => {
    await expect(runRraInfoSheetEvaluation("lease-1", {
      demoMode: false,
      loadImpactRule: vi.fn().mockResolvedValue({
        id: "rule-1",
        version: 1,
        active: false,
        demo_mode_only: true,
        correctness_approved_by: null,
      }),
      loadVs0Map: vi.fn().mockResolvedValue(affectedMap()),
    })).rejects.toThrow(/not Gate-B approved/i);
  });

  it("returns evaluate-only result when no persistEvaluation is injected", async () => {
    const fullMap = affectedMap({ jurisdiction: exists("jurisdiction", "WLS") });

    const result = await runRraInfoSheetEvaluation("lease-1", {
      demoMode: true,
      loadImpactRule: vi.fn().mockResolvedValue({
        id: "rule-1",
        version: 1,
        active: false,
        demo_mode_only: true,
        correctness_approved_by: null,
      }),
      loadVs0Map: vi.fn().mockResolvedValue(fullMap),
    });

    expect(result.result).toBe("not_affected");
    expect(result.reason_codes).toEqual(["EXCL_JURISDICTION"]);
    expect(result.decision_path).toEqual(["jurisdiction"]);
    expect(Object.keys(result.input_snapshot)).toHaveLength(Object.keys(fullMap).length);
    expect(result.id).toBeUndefined();
  });

  it("throws when persistEvaluation is provided without appendProvenanceEvent", async () => {
    await expect(runRraInfoSheetEvaluation("lease-1", {
      demoMode: true,
      loadImpactRule: vi.fn().mockResolvedValue({
        id: "rule-1",
        version: 1,
        active: false,
        demo_mode_only: true,
        correctness_approved_by: null,
      }),
      loadVs0Map: vi.fn().mockResolvedValue(affectedMap()),
      persistEvaluation: vi.fn(),
    })).rejects.toThrow(/provenance writer/i);
  });

  it("persists and writes mandatory provenance event when both persist and provenance are injected", async () => {
    const fullMap = affectedMap({ jurisdiction: exists("jurisdiction", "WLS") });
    const persistEvaluation = vi.fn().mockImplementation(async (row) => ({ ...row, id: "eval-1" }));
    const appendProvenanceEvent = vi.fn().mockResolvedValue(null);

    const result = await runRraInfoSheetEvaluation("lease-1", {
      demoMode: true,
      loadImpactRule: vi.fn().mockResolvedValue({
        id: "rule-1",
        version: 1,
        active: false,
        demo_mode_only: true,
        correctness_approved_by: null,
      }),
      loadVs0Map: vi.fn().mockResolvedValue(fullMap),
      persistEvaluation,
      appendProvenanceEvent,
      now: () => "2026-06-24T12:00:00.000Z",
    });

    expect(persistEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      input_snapshot: fullMap,
      decision_path: ["jurisdiction"],
      result: "not_affected",
      reason_codes: ["EXCL_JURISDICTION"],
      evaluation_confidence: "high",
      demo_mode: true,
    }));
    expect(result.id).toBe("eval-1");
    expect(appendProvenanceEvent).toHaveBeenCalledWith({
      evaluationId: "eval-1",
      eventType: "evaluation_run",
      payload: expect.objectContaining({
        ruleId: "rule-1",
        ruleVersion: 1,
        tenancyId: "lease-1",
        result: "not_affected",
        reasonCodes: ["EXCL_JURISDICTION"],
        decisionPath: ["jurisdiction"],
        confidence: "high",
        demoMode: true,
        evaluatedAt: "2026-06-24T12:00:00.000Z",
      }),
    });
    expect(appendProvenanceEvent.mock.calls[0][0].payload).not.toHaveProperty("inputSnapshotHash");
  });

  it("includes deferred_until_basis in the row for deferred evaluations", async () => {
    const deferMap = affectedMap({
      s21_served: exists("s21_served", "2026-04-01"),
      proceedings_status: exists("proceedings_status", "issued"),
    });

    const result = await runRraInfoSheetEvaluation("lease-1", {
      demoMode: true,
      loadImpactRule: vi.fn().mockResolvedValue({
        id: "rule-1",
        version: 1,
        active: false,
        demo_mode_only: true,
        correctness_approved_by: null,
      }),
      loadVs0Map: vi.fn().mockResolvedValue(deferMap),
    });

    expect(result.result).toBe("deferred");
    expect(result.deferred_until_basis).toBe("unknown_pending_proceedings");
  });

  it("is deterministic for the same input snapshot", () => {
    const map = affectedMap();
    expect(evaluateRraInfoSheetV1(map)).toEqual(evaluateRraInfoSheetV1(map));
  });
});
