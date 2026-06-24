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
      obligation_kind: null,
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

  it("loads grouped evaluation summary", async () => {
    mockRpc.mockResolvedValue({ data: [{ result: "affected", evaluation_count: 2 }], error: null });

    const result = await service.getRraInfoSheetEvaluationSummary({ accountId: "acct-1" });

    expect(mockRpc).toHaveBeenCalledWith("rra_info_sheet_evaluation_summary", {
      p_account_id: "acct-1",
    });
    expect(result).toEqual([{ result: "affected", evaluation_count: 2 }]);
  });
});
