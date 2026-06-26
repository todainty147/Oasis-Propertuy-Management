import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.fn();
const mockMaybeSingle = vi.fn();
const mockEqVersion = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockEqRule = vi.fn(() => ({ eq: mockEqVersion }));
const mockSelect = vi.fn(() => ({ eq: mockEqRule }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    rpc: (...args) => mockRpc(...args),
    from: (...args) => mockFrom(...args),
  },
}));

const service = await import("../../src/services/regulatoryProofEngineService.js");

beforeEach(() => {
  mockRpc.mockReset();
  mockMaybeSingle.mockReset();
  mockEqVersion.mockClear();
  mockEqRule.mockClear();
  mockSelect.mockClear();
  mockFrom.mockClear();
});

describe("regulatoryProofEngineService", () => {
  it("loads the RRA information-sheet impact rule v1", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: "rule-1", rule_key: "rra_info_sheet_v1", version: 1 },
      error: null,
    });

    const result = await service.loadRraInfoSheetImpactRule();

    expect(mockFrom).toHaveBeenCalledWith("impact_rule");
    expect(mockSelect).toHaveBeenCalledWith("id, rule_key, version, active, demo_mode_only, correctness_approved_by");
    expect(mockEqRule).toHaveBeenCalledWith("rule_key", "rra_info_sheet_v1");
    expect(mockEqVersion).toHaveBeenCalledWith("version", 1);
    expect(result.id).toBe("rule-1");
  });

  it("loads and parses VS-0 classified readiness rows", async () => {
    mockRpc.mockResolvedValue({
      data: [
        { input_key: "jurisdiction", classified_input: { classification: "exists", value: "ENG" } },
      ],
      error: null,
    });

    const result = await service.loadRraInfoSheetVs0Map({
      accountId: "acct-1",
      tenancyId: "lease-1",
    });

    expect(mockRpc).toHaveBeenCalledWith("get_rra_info_sheet_data_readiness", {
      p_account_id: "acct-1",
      p_lease_id: "lease-1",
    });
    expect(result.jurisdiction).toEqual({ classification: "exists", value: "ENG" });
  });

  it("records evaluation rows through the gated RPC with snapshot hash computed server-side", async () => {
    mockRpc.mockResolvedValue({ data: { id: "eval-1" }, error: null });

    const evaluation = {
      tenancy_id: "lease-1",
      input_snapshot: { jurisdiction: { classification: "exists", value: "WLS" } },
      decision_path: ["jurisdiction"],
      result: "not_affected",
      aod_branch: "not_reached",
      obligation_kind: null,
      exposure_gbp_ceiling: null,
      reason_codes: ["EXCL_JURISDICTION"],
      missing_fields: [],
      deferred_until: null,
      deferred_until_basis: null,
      evaluation_confidence: "high",
      demo_mode: true,
      evaluated_at: "2026-06-24T12:00:00Z",
    };

    const result = await service.recordRraInfoSheetRuleEvaluation({
      accountId: "acct-1",
      evaluation,
    });

    expect(mockRpc).toHaveBeenCalledWith("record_rra_info_sheet_rule_evaluation", {
      p_account_id: "acct-1",
      p_tenancy_id: "lease-1",
      p_input_snapshot: evaluation.input_snapshot,
      p_decision_path: ["jurisdiction"],
      p_result: "not_affected",
      p_obligation_kind: null,
      p_exposure_gbp_ceiling: null,
      p_reason_codes: ["EXCL_JURISDICTION"],
      p_missing_fields: [],
      p_deferred_until: null,
      p_deferred_until_basis: null,
      p_evaluation_confidence: "high",
      p_demo_mode: true,
      p_evaluated_at: "2026-06-24T12:00:00Z",
    });
    expect(result.id).toBe("eval-1");
  });

  it("previews evaluations without recording them", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "rule-1",
        rule_key: "rra_info_sheet_v1",
        version: 1,
        active: false,
        demo_mode_only: true,
        correctness_approved_by: null,
      },
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: [
        { input_key: "jurisdiction", classified_input: { classification: "exists", value: "WLS" } },
      ],
      error: null,
    });

    const result = await service.previewRraInfoSheetEvaluationForTenancy({
      accountId: "acct-1",
      tenancyId: "lease-1",
    });

    expect(result.result).toBe("not_affected");
    expect(result.reason_codes).toEqual(["EXCL_JURISDICTION"]);
    expect(result.aod_branch).toBe("not_reached");
    expect(result.id).toBeUndefined();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("get_rra_info_sheet_data_readiness", {
      p_account_id: "acct-1",
      p_lease_id: "lease-1",
    });
  });

  it("loads grouped evaluation summary", async () => {
    mockRpc.mockResolvedValue({ data: [{ result: "affected", evaluation_count: 2 }], error: null });

    const result = await service.getRraInfoSheetEvaluationSummary({ accountId: "acct-1" });

    expect(mockRpc).toHaveBeenCalledWith("rra_info_sheet_evaluation_summary", {
      p_account_id: "acct-1",
    });
    expect(result).toEqual([{ result: "affected", evaluation_count: 2 }]);
  });

  it("loads VS-2A capture readiness for the selected tenancy", async () => {
    mockRpc.mockResolvedValue({
      data: {
        result: "needs_data",
        blocking_fields: ["jurisdiction"],
        next_capture_action: "capture_jurisdiction",
      },
      error: null,
    });

    const result = await service.getRraCaptureReadiness({
      accountId: "acct-1",
      tenancyId: "lease-1",
    });

    expect(mockRpc).toHaveBeenCalledWith("get_rra_capture_readiness", {
      p_account_id: "acct-1",
      p_lease_id: "lease-1",
    });
    expect(result.next_capture_action).toBe("capture_jurisdiction");
  });

  it("captures jurisdiction and immediately records a fresh demo evaluation", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "rule-1",
        rule_key: "rra_info_sheet_v1",
        version: 1,
        active: false,
        demo_mode_only: true,
        correctness_approved_by: null,
      },
      error: null,
    });
    mockRpc.mockImplementation((fn) => {
      if (fn === "capture_rra_jurisdiction") {
        return Promise.resolve({ data: { capture_event_id: "event-1" }, error: null });
      }
      if (fn === "get_rra_info_sheet_data_readiness") {
        return Promise.resolve({
          data: [
            { input_key: "jurisdiction", classified_input: { classification: "exists", value: "Wales" } },
          ],
          error: null,
        });
      }
      if (fn === "record_rra_info_sheet_rule_evaluation") {
        return Promise.resolve({ data: { id: "eval-1" }, error: null });
      }
      throw new Error(`Unexpected RPC ${fn}`);
    });

    const result = await service.captureRraJurisdictionAndEvaluate({
      accountId: "acct-1",
      propertyId: "property-1",
      tenancyId: "lease-1",
      countrySubdivision: "Wales",
      evidenceBasis: "manual diagnostic confirmation",
    });

    expect(mockRpc).toHaveBeenNthCalledWith(1, "capture_rra_jurisdiction", {
      p_account_id: "acct-1",
      p_property_id: "property-1",
      p_country_subdivision: "Wales",
      p_evidence_basis: "manual diagnostic confirmation",
      p_demo_mode: true,
    });
    expect(mockRpc).toHaveBeenCalledWith("record_rra_info_sheet_rule_evaluation", expect.objectContaining({
      p_account_id: "acct-1",
      p_tenancy_id: "lease-1",
      p_result: "not_affected",
      p_reason_codes: ["EXCL_JURISDICTION"],
      p_demo_mode: true,
    }));
    expect(result.capture.capture_event_id).toBe("event-1");
    expect(result.evaluation.id).toBe("eval-1");
  });

  it("captures a term indicator with the admissible evidence trio before re-evaluation", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "rule-1",
        rule_key: "rra_info_sheet_v1",
        version: 1,
        active: false,
        demo_mode_only: true,
        correctness_approved_by: null,
      },
      error: null,
    });
    mockRpc.mockImplementation((fn) => {
      if (fn === "capture_rra_term_indicator") {
        return Promise.resolve({ data: { capture_event_id: "event-2" }, error: null });
      }
      if (fn === "get_rra_info_sheet_data_readiness") {
        return Promise.resolve({
          data: [
            { input_key: "jurisdiction", classified_input: { classification: "exists", value: "Wales" } },
          ],
          error: null,
        });
      }
      if (fn === "record_rra_info_sheet_rule_evaluation") {
        return Promise.resolve({ data: { id: "eval-2" }, error: null });
      }
      throw new Error(`Unexpected RPC ${fn}`);
    });

    const result = await service.captureRraTermIndicatorAndEvaluate({
      accountId: "acct-1",
      tenancyId: "lease-1",
      termType: "periodic",
      termTypeEffectiveFrom: "2025-10-01",
      termTypeEvidenceBasis: "signed periodic tenancy record",
    });

    expect(mockRpc).toHaveBeenNthCalledWith(1, "capture_rra_term_indicator", {
      p_account_id: "acct-1",
      p_lease_id: "lease-1",
      p_term_type: "periodic",
      p_term_type_effective_from: "2025-10-01",
      p_term_type_evidence_basis: "signed periodic tenancy record",
      p_demo_mode: true,
    });
    expect(result.capture.capture_event_id).toBe("event-2");
    expect(result.evaluation.id).toBe("eval-2");
  });

  it("captures Tier-4 classifications and preserves explicit false values", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "rule-1",
        rule_key: "rra_info_sheet_v1",
        version: 1,
        active: false,
        demo_mode_only: true,
        correctness_approved_by: null,
      },
      error: null,
    });
    mockRpc.mockImplementation((fn) => {
      if (fn === "capture_rra_tier4_classification") {
        return Promise.resolve({ data: { capture_event_id: "event-3" }, error: null });
      }
      if (fn === "get_rra_info_sheet_data_readiness") {
        return Promise.resolve({
          data: [
            { input_key: "jurisdiction", classified_input: { classification: "exists", value: "Wales" } },
          ],
          error: null,
        });
      }
      if (fn === "record_rra_info_sheet_rule_evaluation") {
        return Promise.resolve({ data: { id: "eval-3" }, error: null });
      }
      throw new Error(`Unexpected RPC ${fn}`);
    });

    const result = await service.captureRraTier4ClassificationAndEvaluate({
      accountId: "acct-1",
      tenancyId: "lease-1",
      tenancyClass: "assured_shorthold",
      companyLet: false,
      residentLandlord: false,
      rentAct1977: false,
      pbsa: false,
      isWhollyOral: false,
      evidenceBasis: "operator reviewed tenancy file",
    });

    expect(mockRpc).toHaveBeenNthCalledWith(1, "capture_rra_tier4_classification", {
      p_account_id: "acct-1",
      p_lease_id: "lease-1",
      p_tenancy_class: "assured_shorthold",
      p_company_let: false,
      p_resident_landlord: false,
      p_rent_act_1977: false,
      p_pbsa: false,
      p_is_wholly_oral: false,
      p_evidence_basis: "operator reviewed tenancy file",
      p_demo_mode: true,
    });
    expect(result.capture.capture_event_id).toBe("event-3");
    expect(result.evaluation.id).toBe("eval-3");
  });
});
