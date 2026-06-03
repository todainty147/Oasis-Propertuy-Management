import { describe, expect, it } from "vitest";
import {
  evaluateHmrcPhase5ReadinessGate,
  HMRC_PHASE_5_READINESS_REQUIREMENTS,
} from "../../src/lib/mtd/hmrcPhase5ReadinessGate.js";

describe("HMRC Phase 5 readiness gate", () => {
  it("does not report READY_FOR_PHASE_5A until every required condition is true", () => {
    const result = evaluateHmrcPhase5ReadinessGate({
      automatedTestsPass: true,
      liveSubmissionFlagFalse: true,
    });

    expect(result.READY_FOR_PHASE_5A).toBe(false);
    expect(result.missing).toContain("consentScaffoldingPresent");
    expect(result.missing).toContain("productionWriteEndpointBlocked");
  });

  it("reports READY_FOR_PHASE_5A only when all readiness evidence is present", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5ReadinessGate(allPassing);

    expect(result.READY_FOR_PHASE_5A).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
