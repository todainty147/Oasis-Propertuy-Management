import { describe, expect, it } from "vitest";
import {
  evaluateHmrcPhase5BReadinessGate,
  evaluateHmrcPhase5CReadinessGate,
  evaluateHmrcPhase5ReadinessGate,
  HMRC_PHASE_5B_READINESS_REQUIREMENTS,
  HMRC_PHASE_5C_READINESS_REQUIREMENTS,
  HMRC_PHASE_5C_READINESS_WARNING,
  HMRC_PHASE_5C_LIVE_PILOT_WARNING,
  HMRC_PHASE_5C_LIVE_SUBMISSION_WARNING,
  HMRC_PHASE_5B_LIVE_SUBMISSION_WARNING,
  HMRC_PHASE_5B_READINESS_WARNING,
  HMRC_PHASE_5_READINESS_WARNING,
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

  it("stays false when consent scaffolding evidence is missing", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5ReadinessGate({ ...allPassing, consentScaffoldingPresent: false });

    expect(result.READY_FOR_PHASE_5A).toBe(false);
    expect(result.missing).toEqual(["consentScaffoldingPresent"]);
  });

  it("stays false when automated test evidence is missing", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5ReadinessGate({ ...allPassing, automatedTestsPass: false });

    expect(result.READY_FOR_PHASE_5A).toBe(false);
    expect(result.missing).toEqual(["automatedTestsPass"]);
  });

  it("stays false when manual smoke evidence is missing", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5ReadinessGate({ ...allPassing, stagingSandboxSubmissionRepeated: false });

    expect(result.READY_FOR_PHASE_5A).toBe(false);
    expect(result.missing).toEqual(["stagingSandboxSubmissionRepeated"]);
  });

  it("labels manual and automated evidence and warns that live submission remains disabled", () => {
    const result = evaluateHmrcPhase5ReadinessGate({});

    expect(result.warning).toBe(HMRC_PHASE_5_READINESS_WARNING);
    expect(result.warnings).toEqual([HMRC_PHASE_5_READINESS_WARNING]);
    expect(result.manualEvidence.every((check) => check.source === "manual")).toBe(true);
    expect(result.automatedEvidence.every((check) => check.source === "automated")).toBe(true);
    expect(result.checks.find((check) => check.key === "consentScaffoldingPresent")).toMatchObject({
      label: "Consent scaffolding tests passed",
      source: "automated",
    });
    expect(result.checks.find((check) => check.key === "readBackVerificationPasses")).toMatchObject({
      source: "manual",
    });
  });

  it("keeps Phase 5B false when pilot allowlist evidence is missing", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5B_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5BReadinessGate({ ...allPassing, livePilotAllowlistImplemented: false });

    expect(result.READY_FOR_PHASE_5B).toBe(false);
    expect(result.READY_FOR_LIVE_SUBMISSION).toBe(false);
    expect(result.missing).toEqual(["livePilotAllowlistImplemented"]);
  });

  it("keeps Phase 5B false when pilot guard evidence is missing", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5B_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5BReadinessGate({ ...allPassing, livePilotGuardImplemented: false });

    expect(result.READY_FOR_PHASE_5B).toBe(false);
    expect(result.READY_FOR_LIVE_SUBMISSION).toBe(false);
    expect(result.missing).toEqual(["livePilotGuardImplemented"]);
  });

  it("reports Phase 5B true only when all pilot evidence is true while live submission remains false", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5B_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5BReadinessGate(allPassing);

    expect(result.READY_FOR_PHASE_5A).toBe(true);
    expect(result.READY_FOR_PHASE_5B).toBe(true);
    expect(result.READY_FOR_LIVE_SUBMISSION).toBe(false);
    expect(result.warning).toBe(HMRC_PHASE_5B_READINESS_WARNING);
    expect(result.warnings).toEqual([
      HMRC_PHASE_5B_READINESS_WARNING,
      HMRC_PHASE_5B_LIVE_SUBMISSION_WARNING,
    ]);
    expect(result.manualEvidence.every((check) => check.source === "manual")).toBe(true);
    expect(result.automatedEvidence.every((check) => check.source === "automated")).toBe(true);
  });

  it("keeps Phase 5C false when dry run evidence is missing", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5C_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5CReadinessGate({ ...allPassing, liveDryRunPasses: false });

    expect(result.READY_FOR_PHASE_5C).toBe(false);
    expect(result.READY_FOR_LIVE_SUBMISSION).toBe(false);
    expect(result.missing).toEqual(["liveDryRunPasses"]);
  });

  it("keeps Phase 5C false when kill switch evidence is missing", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5C_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5CReadinessGate({ ...allPassing, liveNetworkKillSwitchExists: false });

    expect(result.READY_FOR_PHASE_5C).toBe(false);
    expect(result.READY_FOR_LIVE_SUBMISSION).toBe(false);
    expect(result.missing).toEqual(["liveNetworkKillSwitchExists"]);
  });

  it("keeps Phase 5C false when duplicate guard evidence is missing", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5C_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5CReadinessGate({ ...allPassing, duplicateLiveGuardExists: false });

    expect(result.READY_FOR_PHASE_5C).toBe(false);
    expect(result.READY_FOR_LIVE_SUBMISSION).toBe(false);
    expect(result.missing).toEqual(["duplicateLiveGuardExists"]);
  });

  it("keeps Phase 5C false when live dry-run UI safety evidence is missing", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5C_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5CReadinessGate({ ...allPassing, liveDryRunUiSafe: false });

    expect(result.READY_FOR_PHASE_5C).toBe(false);
    expect(result.READY_FOR_LIVE_SUBMISSION).toBe(false);
    expect(result.missing).toEqual(["liveDryRunUiSafe"]);
  });

  it("reports Phase 5C true only when controls pass while live submission remains false", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5C_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5CReadinessGate(allPassing);

    expect(result.READY_FOR_PHASE_5A).toBe(true);
    expect(result.READY_FOR_PHASE_5B).toBe(true);
    expect(result.READY_FOR_PHASE_5C).toBe(true);
    expect(result.READY_FOR_LIVE_SUBMISSION).toBe(false);
    expect(result.warning).toBe(HMRC_PHASE_5C_READINESS_WARNING);
    expect(result.warnings).toEqual([
      HMRC_PHASE_5C_READINESS_WARNING,
      HMRC_PHASE_5C_LIVE_SUBMISSION_WARNING,
      HMRC_PHASE_5C_LIVE_PILOT_WARNING,
    ]);
  });
});
