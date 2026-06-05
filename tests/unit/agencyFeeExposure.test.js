import { describe, expect, it } from "vitest";

import { calculateAgencyFeeExposure } from "../../marketing-site/lib/agencyFeeExposure.ts";

describe("calculateAgencyFeeExposure", () => {
  it("calculates monthly and annual estimated agency fee exposure", () => {
    expect(calculateAgencyFeeExposure({
      propertyCount: 4,
      averageMonthlyRent: 1250,
      agentFeePercent: 10,
    })).toEqual({
      monthly: 500,
      annual: 6000,
    });
  });

  it("clamps invalid negative values to zero", () => {
    expect(calculateAgencyFeeExposure({
      propertyCount: -1,
      averageMonthlyRent: 1200,
      agentFeePercent: 12,
    })).toEqual({
      monthly: 0,
      annual: 0,
    });
  });
});
