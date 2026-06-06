import { describe, expect, it } from "vitest";
import {
  evaluateHmrcPhase5BReadinessGate,
  evaluateHmrcPhase5CReadinessGate,
  evaluateHmrcPhase5DReadinessGate,
  evaluateHmrcPhase5ReadinessGate,
  HMRC_PHASE_5B_READINESS_REQUIREMENTS,
  HMRC_PHASE_5C_READINESS_REQUIREMENTS,
  HMRC_PHASE_5D_PILOT_READINESS_REQUIREMENTS,
  HMRC_PHASE_5D_PRE_RUN_CHECKLIST_ITEMS,
  HMRC_PHASE_5D_WAIVED_E2E_GROUPS,
  HMRC_PHASE_5D_PILOT_READINESS_WARNING,
  HMRC_PHASE_5D_ONE_ACCOUNT_WARNING,
  HMRC_PHASE_5D_LIMITATION_WARNING,
  HMRC_GENERAL_LIVE_SUBMISSION_WARNING,
  HMRC_REAL_LIVE_NETWORK_ATTEMPT_REQUIREMENTS,
  HMRC_REAL_LIVE_NETWORK_ATTEMPT_WARNING,
  HMRC_PHASE_5C_READINESS_WARNING,
  HMRC_PHASE_5C_LIVE_PILOT_WARNING,
  HMRC_PHASE_5C_LIVE_SUBMISSION_WARNING,
  HMRC_PHASE_5B_LIVE_SUBMISSION_WARNING,
  HMRC_PHASE_5B_READINESS_WARNING,
  HMRC_PHASE_5_READINESS_WARNING,
  HMRC_PHASE_5_READINESS_REQUIREMENTS,
} from "../../src/lib/mtd/hmrcPhase5ReadinessGate.js";


function allTrue(keys) {
  return Object.fromEntries(keys.map((key) => [key, true]));
}

function completeBacklogReferences(overrides = {}) {
  return {
    ...Object.fromEntries(HMRC_PHASE_5D_WAIVED_E2E_GROUPS.map((group) => [group, `PHASE5D-BACKLOG-${group}`])),
    ...overrides,
  };
}

function completePreRunChecklist(overrides = {}) {
  return {
    ...Object.fromEntries(HMRC_PHASE_5D_PRE_RUN_CHECKLIST_ITEMS.map((item) => [item, true])),
    ...overrides,
  };
}

function completeOneAccountLiveEvidence(overrides = {}) {
  return {
    ...allTrue(HMRC_REAL_LIVE_NETWORK_ATTEMPT_REQUIREMENTS),
    waiverAcceptance: {
      acceptedBy: "Tenaqo release owner",
      acceptedAt: "2026-06-05",
    },
    backlogReferences: completeBacklogReferences(),
    preRunChecklist: completePreRunChecklist(),
    ...overrides,
  };
}

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

  it("keeps Phase 5D pilot false without focused pilot E2E evidence", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5D_PILOT_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5DReadinessGate({ ...allPassing, phase5dPilotE2ePassed: false });

    expect(result.READY_FOR_PHASE_5D_PILOT).toBe(false);
    expect(result.READY_FOR_GENERAL_LIVE_SUBMISSION).toBe(false);
    expect(result.READY_FOR_LIVE_SUBMISSION).toBe(false);
    expect(result.missing).toEqual(["phase5dPilotE2ePassed"]);
  });

  it("keeps Phase 5D pilot false without dry-run evidence", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5D_PILOT_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5DReadinessGate({ ...allPassing, pilotDryRunEvidencePassed: false });

    expect(result.READY_FOR_PHASE_5D_PILOT).toBe(false);
    expect(result.READY_FOR_GENERAL_LIVE_SUBMISSION).toBe(false);
    expect(result.missing).toEqual(["pilotDryRunEvidencePassed"]);
  });

  it("keeps Phase 5D pilot false without support evidence", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5D_PILOT_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5DReadinessGate({ ...allPassing, supportRunbookReviewed: false });

    expect(result.READY_FOR_PHASE_5D_PILOT).toBe(false);
    expect(result.READY_FOR_GENERAL_LIVE_SUBMISSION).toBe(false);
    expect(result.missing).toEqual(["supportRunbookReviewed"]);
  });

  it("keeps Phase 5D pilot false without rollback evidence", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5D_PILOT_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5DReadinessGate({ ...allPassing, rollbackVerified: false });

    expect(result.READY_FOR_PHASE_5D_PILOT).toBe(false);
    expect(result.READY_FOR_GENERAL_LIVE_SUBMISSION).toBe(false);
    expect(result.missing).toEqual(["rollbackVerified"]);
  });

  it("reports Phase 5D pilot true only with all pilot evidence while general live readiness remains false", () => {
    const allPassing = Object.fromEntries(HMRC_PHASE_5D_PILOT_READINESS_REQUIREMENTS.map((key) => [key, true]));
    const result = evaluateHmrcPhase5DReadinessGate(allPassing);

    expect(result.READY_FOR_PHASE_5A).toBe(true);
    expect(result.READY_FOR_PHASE_5B).toBe(true);
    expect(result.READY_FOR_PHASE_5C).toBe(true);
    expect(result.READY_FOR_PHASE_5D_PILOT).toBe(true);
    expect(result.READY_FOR_REAL_LIVE_NETWORK_ATTEMPT).toBe(false);
    expect(result.realLiveMissing).toEqual([
      "waiverMatrixAccepted",
      "backlogTicketsScheduled",
      "e2eTriageComplete",
      "denoTypeCheckPassed",
      "operatorDryRunSmokePassed",
      "productionSecretsVerified",
      "validConsentExists",
      "operatorPreRunChecklistComplete",
    ]);
    expect(result.READY_FOR_GENERAL_LIVE_SUBMISSION).toBe(false);
    expect(result.READY_FOR_LIVE_SUBMISSION).toBe(false);
    expect(result.warning).toBe(HMRC_PHASE_5D_PILOT_READINESS_WARNING);
    expect(result.warnings).toEqual([
      HMRC_PHASE_5D_PILOT_READINESS_WARNING,
      HMRC_REAL_LIVE_NETWORK_ATTEMPT_WARNING,
      HMRC_PHASE_5D_ONE_ACCOUNT_WARNING,
      HMRC_PHASE_5D_LIMITATION_WARNING,
      HMRC_GENERAL_LIVE_SUBMISSION_WARNING,
    ]);
  });

  it("keeps real live-network attempt false until Deno, E2E, dry-run smoke and secret evidence pass", () => {
    const allPassing = completeOneAccountLiveEvidence();
    const result = evaluateHmrcPhase5DReadinessGate({ ...allPassing, denoTypeCheckPassed: false });

    expect(result.READY_FOR_PHASE_5D_PILOT).toBe(true);
    expect(result.READY_FOR_REAL_LIVE_NETWORK_ATTEMPT).toBe(false);
    expect(result.realLiveMissing).toEqual(["denoTypeCheckPassed"]);
    expect(result.READY_FOR_GENERAL_LIVE_SUBMISSION).toBe(false);
    expect(result.READY_FOR_LIVE_SUBMISSION).toBe(false);
  });

  it("keeps real live-network attempt false when waiver accepted_by is missing", () => {
    const allPassing = completeOneAccountLiveEvidence({
      waiverAcceptance: { acceptedAt: "2026-06-05" },
    });
    const result = evaluateHmrcPhase5DReadinessGate(allPassing);

    expect(result.READY_FOR_REAL_LIVE_NETWORK_ATTEMPT).toBe(false);
    expect(result.realLiveMissing).toEqual(["waiverMatrixAccepted"]);
  });

  it("keeps real live-network attempt false when waiver accepted_at is missing", () => {
    const allPassing = completeOneAccountLiveEvidence({
      waiverAcceptance: { acceptedBy: "Tenaqo release owner" },
    });
    const result = evaluateHmrcPhase5DReadinessGate(allPassing);

    expect(result.READY_FOR_REAL_LIVE_NETWORK_ATTEMPT).toBe(false);
    expect(result.realLiveMissing).toEqual(["waiverMatrixAccepted"]);
  });

  it("keeps real live-network attempt false when any waived group lacks a backlog reference", () => {
    const allPassing = completeOneAccountLiveEvidence({
      backlogReferences: completeBacklogReferences({ notificationFlows: "" }),
    });
    const result = evaluateHmrcPhase5DReadinessGate(allPassing);

    expect(result.READY_FOR_REAL_LIVE_NETWORK_ATTEMPT).toBe(false);
    expect(result.realLiveMissing).toEqual(["backlogTicketsScheduled"]);
  });

  it("keeps real live-network attempt false when the pre-run checklist is incomplete", () => {
    const allPassing = completeOneAccountLiveEvidence({
      preRunChecklist: completePreRunChecklist({ consentHashesValid: false }),
    });
    const result = evaluateHmrcPhase5DReadinessGate(allPassing);

    expect(result.READY_FOR_REAL_LIVE_NETWORK_ATTEMPT).toBe(false);
    expect(result.realLiveMissing).toEqual(["operatorPreRunChecklistComplete"]);
  });

  it("keeps real live-network attempt false when waiver matrix is not accepted", () => {
    const allPassing = completeOneAccountLiveEvidence();
    const result = evaluateHmrcPhase5DReadinessGate({ ...allPassing, waiverMatrixAccepted: false });

    expect(result.READY_FOR_REAL_LIVE_NETWORK_ATTEMPT).toBe(false);
    expect(result.realLiveMissing).toEqual(["waiverMatrixAccepted"]);
  });

  it("keeps real live-network attempt false when backlog tickets are not scheduled", () => {
    const allPassing = completeOneAccountLiveEvidence();
    const result = evaluateHmrcPhase5DReadinessGate({ ...allPassing, backlogTicketsScheduled: false });

    expect(result.READY_FOR_REAL_LIVE_NETWORK_ATTEMPT).toBe(false);
    expect(result.realLiveMissing).toEqual(["backlogTicketsScheduled"]);
  });

  it("keeps real live-network attempt false when pilot dry-run evidence is missing", () => {
    const allPassing = completeOneAccountLiveEvidence();
    const result = evaluateHmrcPhase5DReadinessGate({ ...allPassing, pilotDryRunEvidencePassed: false });

    expect(result.READY_FOR_REAL_LIVE_NETWORK_ATTEMPT).toBe(false);
    expect(result.realLiveMissing).toEqual(["pilotDryRunEvidencePassed"]);
  });

  it("keeps real live-network attempt false when valid consent evidence is missing", () => {
    const allPassing = completeOneAccountLiveEvidence();
    const result = evaluateHmrcPhase5DReadinessGate({ ...allPassing, validConsentExists: false });

    expect(result.READY_FOR_REAL_LIVE_NETWORK_ATTEMPT).toBe(false);
    expect(result.realLiveMissing).toEqual(["validConsentExists"]);
  });

  it("keeps real live-network attempt false when the pilot account is not allowlisted", () => {
    const allPassing = completeOneAccountLiveEvidence();
    const result = evaluateHmrcPhase5DReadinessGate({ ...allPassing, pilotAllowlistConfigured: false });

    expect(result.READY_FOR_REAL_LIVE_NETWORK_ATTEMPT).toBe(false);
    expect(result.realLiveMissing).toEqual(["pilotAllowlistConfigured"]);
  });

  it("can report a one-account real live-network attempt ready while general live remains false", () => {
    const allPassing = completeOneAccountLiveEvidence();
    const result = evaluateHmrcPhase5DReadinessGate(allPassing);

    expect(result.READY_FOR_PHASE_5D_PILOT).toBe(true);
    expect(result.READY_FOR_REAL_LIVE_NETWORK_ATTEMPT).toBe(true);
    expect(result.READY_FOR_GENERAL_LIVE_SUBMISSION).toBe(false);
    expect(result.READY_FOR_LIVE_SUBMISSION).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.realLiveMissing).toEqual([]);
  });
});
