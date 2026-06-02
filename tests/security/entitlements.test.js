import { describe, expect, it } from "vitest";

import {
  ENTITLEMENT_FEATURES,
  assertFeature,
  assertUsageCapacity,
  getFeatureMinimumPlan,
  getPlanRank,
  getPlanUsageLimit,
  hasFeature,
  hasUsageCapacity,
  normalizePlan,
} from "../../src/lib/entitlements";

describe("entitlements", () => {
  it("normalizes unknown plans to starter", () => {
    expect(normalizePlan("growth")).toBe("growth");
    expect(normalizePlan("")).toBe("starter");
    expect(normalizePlan("unknown")).toBe("starter");
  });

  it("returns plan rank in ascending order", () => {
    expect(getPlanRank("starter")).toBeLessThan(getPlanRank("growth"));
    expect(getPlanRank("growth")).toBeLessThan(getPlanRank("pro"));
  });

  it("keeps growth features off starter plans", () => {
    expect(hasFeature("starter", ENTITLEMENT_FEATURES.COMMAND_CENTER)).toBe(false);
    expect(hasFeature("starter", ENTITLEMENT_FEATURES.MAINTENANCE)).toBe(true);
    expect(getFeatureMinimumPlan(ENTITLEMENT_FEATURES.COMMAND_CENTER)).toBe("growth");
  });

  it("makes property risk controls available to growth and above, but not starter", () => {
    [
      ENTITLEMENT_FEATURES.DEPOSIT_DEDUCTIONS_LOG,
      ENTITLEMENT_FEATURES.DEPOSIT_SETTLEMENT_STATEMENT,
      ENTITLEMENT_FEATURES.ECO_UPGRADE_PLANNER,
      ENTITLEMENT_FEATURES.PORTFOLIO_HEALTH_ECO_COMPLIANCE,
    ].forEach((feature) => {
      expect(hasFeature("starter", feature)).toBe(false);
      expect(hasFeature("growth", feature)).toBe(true);
      expect(hasFeature("pro", feature)).toBe(true);
      expect(hasFeature("operator_agency", feature)).toBe(true);
      expect(getFeatureMinimumPlan(feature)).toBe("growth");
    });
  });

  it("keeps pro features off growth plans", () => {
    expect(hasFeature("growth", ENTITLEMENT_FEATURES.SECURITY_AUDIT)).toBe(false);
    expect(hasFeature("growth", ENTITLEMENT_FEATURES.PORTFOLIO_HEALTH)).toBe(true);
    expect(getFeatureMinimumPlan(ENTITLEMENT_FEATURES.SECURITY_AUDIT)).toBe("pro");
  });

  it("lets pro plans use all current premium features", () => {
    expect(hasFeature("pro", ENTITLEMENT_FEATURES.COMMAND_CENTER)).toBe(true);
    expect(hasFeature("pro", ENTITLEMENT_FEATURES.PLAYBOOKS)).toBe(true);
    expect(hasFeature("pro", ENTITLEMENT_FEATURES.ROOT_TELEMETRY)).toBe(true);
  });

  it("throws on missing entitlement access", () => {
    expect(() => assertFeature("starter", ENTITLEMENT_FEATURES.PLAYBOOKS)).toThrow(/requires pro/i);
  });

  it("returns property usage caps by plan", () => {
    expect(getPlanUsageLimit("starter", "properties")).toBe(10);
    expect(getPlanUsageLimit("growth", "properties")).toBe(50);
    expect(getPlanUsageLimit("pro", "properties")).toBeNull();
  });

  it("checks usage capacity against the plan limit", () => {
    expect(hasUsageCapacity("starter", "properties", 9)).toBe(true);
    expect(hasUsageCapacity("starter", "properties", 10)).toBe(false);
    expect(hasUsageCapacity("pro", "properties", 999)).toBe(true);
  });

  it("throws when a usage limit is exceeded", () => {
    expect(() => assertUsageCapacity("starter", "properties", 10)).toThrow(/allows up to 10 properties/i);
  });
});
