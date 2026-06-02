import { describe, expect, it } from "vitest";

import {
  calculateUpgradePlanTotals,
  estimateUpgradeImpact,
  getEpcRiskLevel,
  scoreToEpcBand,
  suggestUpgradePath,
} from "../../src/lib/ecoUpgradePlanner";

describe("Eco-Upgrade Planner helpers", () => {
  it("maps EPC scores to standard bands", () => {
    expect(scoreToEpcBand(92)).toBe("A");
    expect(scoreToEpcBand(81)).toBe("B");
    expect(scoreToEpcBand(69)).toBe("C");
    expect(scoreToEpcBand(55)).toBe("D");
    expect(scoreToEpcBand(39)).toBe("E");
    expect(scoreToEpcBand(21)).toBe("F");
    expect(scoreToEpcBand(1)).toBe("G");
    expect(scoreToEpcBand(null)).toBe("unknown");
  });

  it("uses band midpoint fallback and calculates selected totals", () => {
    const impact = estimateUpgradeImpact(
      { current_epc_band: "E", target_epc_band: "C" },
      [
        { selected: true, estimated_cost: 500, estimated_epc_points_gain: 10, priority: "high" },
        { selected: true, typical_cost_low: 100, typical_cost_high: 300, estimated_epc_points_low: 2, estimated_epc_points_high: 4 },
        { selected: false, estimated_cost: 999, estimated_epc_points_gain: 99 },
      ],
    );

    expect(impact.currentScore).toBe(47);
    expect(impact.estimatedTotalCost).toBe(700);
    expect(impact.estimatedEpcPointsGain).toBe(13);
    expect(impact.estimatedResultBand).toBe("D");
    expect(impact.targetReached).toBe(false);
    expect(calculateUpgradePlanTotals([{ selected: true, completed_at: "2026-06-01" }]).completedUpgrades).toBe(1);
  });

  it("detects target reached and risk levels without guarantees", () => {
    const impact = estimateUpgradeImpact(
      { current_epc_score: 54, target_epc_band: "C" },
      [{ selected: true, estimated_cost: 1150, estimated_epc_points_gain: 16 }],
    );
    expect(impact.estimatedResultBand).toBe("C");
    expect(impact.targetReached).toBe(true);
    expect(impact.disclaimer).toMatch(/indicative/i);
    expect(impact.disclaimer).toMatch(/EPC assessor/i);

    expect(getEpcRiskLevel({ current_epc_band: "F" })).toBe("critical");
    expect(getEpcRiskLevel({ current_epc_band: "G" })).toBe("critical");
    expect(getEpcRiskLevel({ current_epc_band: "E" })).toBe("warning");
    expect(getEpcRiskLevel({ current_epc_band: "D" })).toBe("planning");
    expect(getEpcRiskLevel({ current_epc_band: "C" })).toBe("good");
    expect(getEpcRiskLevel({ current_epc_band: "unknown" })).toBe("needs_data");
  });

  it("suggests an indicative upgrade path toward the planning target", () => {
    const suggestion = suggestUpgradePath(
      { current_epc_band: "E" },
      [
        { upgrade_key: "expensive", label: "Big", typical_cost_low: 1000, typical_cost_high: 1000, estimated_epc_points_low: 20, estimated_epc_points_high: 20 },
        { upgrade_key: "cheap", label: "Small", typical_cost_low: 100, typical_cost_high: 100, estimated_epc_points_low: 3, estimated_epc_points_high: 3 },
      ],
      "C",
    );
    expect(suggestion.targetBand).toBe("C");
    expect(suggestion.items[0].upgrade_key).toBe("cheap");
    expect(suggestion.impact.confidence).toMatch(/medium|low/);
  });
});
