export const HMRC_PHASE_5_READINESS_REQUIREMENTS = Object.freeze([
  "automatedTestsPass",
  "stagingSandboxSubmissionRepeated",
  "readBackVerificationPasses",
  "duplicateSubmissionBlocked",
  "consentScaffoldingPresent",
  "auditTrailComplete",
  "tenantContractorBlocked",
  "noSecretsExposed",
  "uiCopySafe",
  "supportRunbookExists",
  "liveSubmissionFlagFalse",
  "productionWriteEndpointBlocked",
]);

export const HMRC_PHASE_5B_READINESS_REQUIREMENTS = Object.freeze([
  ...HMRC_PHASE_5_READINESS_REQUIREMENTS,
  "livePilotAllowlistImplemented",
  "livePilotGuardImplemented",
  "livePilotUiSafe",
  "livePilotSupportRunbookReady",
  "liveSubmissionEndpointStillDisabled",
]);

export const HMRC_PHASE_5C_READINESS_REQUIREMENTS = Object.freeze([
  ...HMRC_PHASE_5B_READINESS_REQUIREMENTS,
  "liveEndpointSkeletonExists",
  "liveDryRunPasses",
  "liveNetworkKillSwitchExists",
  "duplicateLiveGuardExists",
  "liveDryRunUiSafe",
]);

export const HMRC_PHASE_5D_PILOT_READINESS_REQUIREMENTS = Object.freeze([
  ...HMRC_PHASE_5C_READINESS_REQUIREMENTS,
  "edgeFunctionChecksPassed",
  "focusedHmrcTestsPassed",
  "automatedTestSuitePassed",
  "buildPassed",
  "lintPassed",
  "phase5dPilotE2ePassed",
  "dependencyPathE2ePassed",
  "pilotDryRunEvidencePassed",
  "pilotAllowlistConfigured",
  "supportRunbookReviewed",
  "rollbackVerified",
  "networkKillSwitchConfigured",
]);

export const HMRC_REAL_LIVE_NETWORK_ATTEMPT_REQUIREMENTS = Object.freeze([
  ...HMRC_PHASE_5D_PILOT_READINESS_REQUIREMENTS,
  "waiverMatrixAccepted",
  "backlogTicketsScheduled",
  "e2eTriageComplete",
  "denoTypeCheckPassed",
  "operatorDryRunSmokePassed",
  "productionSecretsVerified",
  "validConsentExists",
  "operatorPreRunChecklistComplete",
]);


export const HMRC_PHASE_5D_WAIVED_E2E_GROUPS = Object.freeze([
  "aiSurfaceExpectations",
  "screenshotCaptureFlows",
  "localizationSelectorDrift",
  "degradedPathUx",
  "documentPacketRequestTemplateFlows",
  "genericAccessibilityShellSelectorDrift",
  "maintenanceWorkflowDrift",
  "notificationFlows",
  "operatingCalendarSchemaDrift",
  "polandComplianceEvidenceDrift",
  "selfServeSignupDrift",
]);

export const HMRC_PHASE_5D_PRE_RUN_CHECKLIST_ITEMS = Object.freeze([
  "pilotAccountSelected",
  "pilotAccountNotGeneralProductionUser",
  "pilotAccountAllowlistedByRootOperator",
  "allowlistReasonRecorded",
  "draftSelected",
  "draftReviewed",
  "draftLocked",
  "noUnresolvedIssues",
  "consentRecordedAfterDraftLock",
  "consentHashesValid",
  "phase5bPilotGuardPasses",
  "phase5cDryRunPassedForSameAccountDraftConsent",
  "pilotHmrcAccountMfaReady",
  "supportRunbookReviewed",
  "rollbackKillSwitchTested",
  "hmrcLiveCredentialsServerSideOnly",
  "productionBaseUrlPilotOnly",
  "hmrcLiveNetworkEnabledFalseUntilApproval",
  "noFrontendLiveNetworkCall",
  "noLandlordFacingLiveSubmitButton",
  "operatorTypedConfirmationVerified",
  "duplicateLiveSubmissionGuardVerified",
  "receiptAuditStorageVerified",
  "noRealHmrcLiveNetworkCallOccurred",
]);

export const HMRC_PHASE_5_READINESS_EVIDENCE = Object.freeze({
  automatedTestsPass: {
    label: "Automated tests passed",
    source: "automated",
  },
  stagingSandboxSubmissionRepeated: {
    label: "Manual smoke: repeated sandbox submission checked",
    source: "manual",
  },
  readBackVerificationPasses: {
    label: "Manual smoke: sandbox read-back verified",
    source: "manual",
  },
  duplicateSubmissionBlocked: {
    label: "Manual smoke: repeat submission blocked",
    source: "manual",
  },
  consentScaffoldingPresent: {
    label: "Consent scaffolding tests passed",
    source: "automated",
  },
  auditTrailComplete: {
    label: "Manual smoke: audit trail checked",
    source: "manual",
  },
  tenantContractorBlocked: {
    label: "Manual smoke: tenant and contractor access blocked",
    source: "manual",
  },
  noSecretsExposed: {
    label: "Manual smoke: no secrets exposed",
    source: "manual",
  },
  uiCopySafe: {
    label: "Automated copy contracts passed",
    source: "automated",
  },
  supportRunbookExists: {
    label: "Support runbook exists",
    source: "automated",
  },
  liveSubmissionFlagFalse: {
    label: "Manual smoke: live submission flag remains false",
    source: "manual",
  },
  productionWriteEndpointBlocked: {
    label: "Production write endpoint remains blocked",
    source: "automated",
  },
  livePilotAllowlistImplemented: {
    label: "Live pilot allowlist implemented",
    source: "automated",
  },
  livePilotGuardImplemented: {
    label: "Live pilot pre-flight guard implemented",
    source: "automated",
  },
  livePilotUiSafe: {
    label: "Live pilot UI is readiness-only",
    source: "automated",
  },
  livePilotSupportRunbookReady: {
    label: "Live pilot support runbook ready",
    source: "automated",
  },
  liveSubmissionEndpointStillDisabled: {
    label: "Live submission endpoint remains disabled",
    source: "automated",
  },
  liveEndpointSkeletonExists: {
    label: "Live endpoint skeleton exists",
    source: "automated",
  },
  liveDryRunPasses: {
    label: "Live endpoint dry-run path passes",
    source: "automated",
  },
  liveNetworkKillSwitchExists: {
    label: "Live network kill switch exists",
    source: "automated",
  },
  duplicateLiveGuardExists: {
    label: "Duplicate live submission guard exists",
    source: "automated",
  },
  liveDryRunUiSafe: {
    label: "Live dry-run UI has no enabled live filing button",
    source: "automated",
  },
  edgeFunctionChecksPassed: {
    label: "HMRC Edge Function checks passed",
    source: "automated",
  },
  automatedTestSuitePassed: {
    label: "npm run test passed",
    source: "automated",
  },
  focusedHmrcTestsPassed: {
    label: "Focused HMRC Phase 5A/5B/5C tests passed",
    source: "automated",
  },
  buildPassed: {
    label: "Production build passed",
    source: "automated",
  },
  lintPassed: {
    label: "Lint passed with existing warnings only",
    source: "automated",
  },
  phase5dPilotE2ePassed: {
    label: "Phase 5D pilot E2E passed",
    source: "automated",
  },
  dependencyPathE2ePassed: {
    label: "HMRC Phase 5D dependency-path E2E passed",
    source: "automated",
  },
  pilotDryRunEvidencePassed: {
    label: "Pilot dry-run evidence is passed",
    source: "manual",
  },
  pilotAllowlistConfigured: {
    label: "Exactly one pilot account is allowlisted",
    source: "manual",
  },
  supportRunbookReviewed: {
    label: "Support runbook reviewed for the pilot",
    source: "manual",
  },
  rollbackVerified: {
    label: "Rollback and kill-switch procedure verified",
    source: "manual",
  },
  networkKillSwitchConfigured: {
    label: "Live network kill switch configured explicitly",
    source: "manual",
  },
  waiverMatrixAccepted: {
    label: "Release owner accepted the one-account waiver matrix",
    source: "manual",
  },
  backlogTicketsScheduled: {
    label: "Backlog tickets scheduled for waived broad E2E groups",
    source: "manual",
  },
  e2eTriageComplete: {
    label: "E2E failures triaged and blocking failures fixed or formally waived",
    source: "manual",
  },
  denoTypeCheckPassed: {
    label: "Live pilot Edge Function Deno/type check passed",
    source: "manual",
  },
  operatorDryRunSmokePassed: {
    label: "Operator dry-run smoke test passed without a live HMRC network call",
    source: "manual",
  },
  productionSecretsVerified: {
    label: "Production live-network secrets and kill switches verified server-side",
    source: "manual",
  },
  validConsentExists: {
    label: "Valid Phase 5A consent exists for the selected locked draft",
    source: "manual",
  },
  operatorPreRunChecklistComplete: {
    label: "Operator pre-run checklist complete",
    source: "manual",
  },
});

export const HMRC_PHASE_5_READINESS_WARNING =
  "READY_FOR_PHASE_5A only means ready to begin Phase 5A readiness work. It does not enable live submission.";
export const HMRC_PHASE_5B_READINESS_WARNING =
  "Phase 5B readiness does not enable live submission.";
export const HMRC_PHASE_5B_LIVE_SUBMISSION_WARNING =
  "READY_FOR_LIVE_SUBMISSION remains false until a later controlled live endpoint phase.";
export const HMRC_PHASE_5C_READINESS_WARNING =
  "Phase 5C readiness means the endpoint skeleton and dry-run controls exist.";
export const HMRC_PHASE_5C_LIVE_SUBMISSION_WARNING =
  "It does not mean live HMRC filing is enabled.";
export const HMRC_PHASE_5C_LIVE_PILOT_WARNING =
  "READY_FOR_LIVE_SUBMISSION remains false until a later explicit live network pilot approval.";
export const HMRC_PHASE_5D_PILOT_READINESS_WARNING =
  "Phase 5D pilot readiness is not general live submission readiness.";
export const HMRC_PHASE_5D_ONE_ACCOUNT_WARNING =
  "Only one allowlisted pilot account may be used.";
export const HMRC_PHASE_5D_LIMITATION_WARNING =
  "Annual update and final declaration are not implemented.";
export const HMRC_GENERAL_LIVE_SUBMISSION_WARNING =
  "General live submission remains disabled.";
export const HMRC_REAL_LIVE_NETWORK_ATTEMPT_WARNING =
  "READY_FOR_REAL_LIVE_NETWORK_ATTEMPT is only for the one-account pilot and does not enable general live submission.";


function presentManualValue(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !normalized.startsWith("pending") && normalized !== "tbd";
}

function getWaiverAcceptanceEvidence(results) {
  return results.waiverAcceptance || results.waiver || {};
}

function hasAcceptedWaiverMatrix(results) {
  if (results.waiverMatrixAccepted !== true) return false;
  const acceptance = getWaiverAcceptanceEvidence(results);
  const acceptedBy = acceptance.acceptedBy || acceptance.accepted_by || results.acceptedBy || results.accepted_by;
  const acceptedAt = acceptance.acceptedAt || acceptance.accepted_at || results.acceptedAt || results.accepted_at;
  return presentManualValue(acceptedBy) && presentManualValue(acceptedAt);
}

function getBacklogReferences(results) {
  return results.backlogReferences || results.waivedGroupBacklogReferences || {};
}

function hasScheduledBacklogTickets(results) {
  if (results.backlogTicketsScheduled !== true) return false;
  const references = getBacklogReferences(results);
  return HMRC_PHASE_5D_WAIVED_E2E_GROUPS.every((group) => presentManualValue(references[group]));
}

function getPreRunChecklist(results) {
  return results.preRunChecklist || results.operatorPreRunChecklist || {};
}

function hasCompletePreRunChecklist(results) {
  if (results.operatorPreRunChecklistComplete !== true) return false;
  const checklist = getPreRunChecklist(results);
  return HMRC_PHASE_5D_PRE_RUN_CHECKLIST_ITEMS.every((item) => checklist[item] === true);
}

function manualEvidencePassed(key, results) {
  if (key === "waiverMatrixAccepted") return hasAcceptedWaiverMatrix(results);
  if (key === "backlogTicketsScheduled") return hasScheduledBacklogTickets(results);
  if (key === "operatorPreRunChecklistComplete") return hasCompletePreRunChecklist(results);
  return results[key] === true;
}

export function evaluateHmrcPhase5ReadinessGate(results = {}) {
  const checks = HMRC_PHASE_5_READINESS_REQUIREMENTS.map((key) => ({
    key,
    label: HMRC_PHASE_5_READINESS_EVIDENCE[key]?.label || key,
    source: HMRC_PHASE_5_READINESS_EVIDENCE[key]?.source || "manual",
    passed: results[key] === true,
  }));
  const missing = checks.filter((check) => !check.passed).map((check) => check.key);
  return {
    READY_FOR_PHASE_5A: missing.length === 0,
    checks,
    manualEvidence: checks.filter((check) => check.source === "manual"),
    automatedEvidence: checks.filter((check) => check.source === "automated"),
    missing,
    warning: HMRC_PHASE_5_READINESS_WARNING,
    warnings: [HMRC_PHASE_5_READINESS_WARNING],
  };
}

export function evaluateHmrcPhase5BReadinessGate(results = {}) {
  const checks = HMRC_PHASE_5B_READINESS_REQUIREMENTS.map((key) => ({
    key,
    label: HMRC_PHASE_5_READINESS_EVIDENCE[key]?.label || key,
    source: HMRC_PHASE_5_READINESS_EVIDENCE[key]?.source || "manual",
    passed: results[key] === true,
  }));
  const missing = checks.filter((check) => !check.passed).map((check) => check.key);
  return {
    READY_FOR_PHASE_5A: HMRC_PHASE_5_READINESS_REQUIREMENTS.every((key) => results[key] === true),
    READY_FOR_PHASE_5B: missing.length === 0,
    READY_FOR_LIVE_SUBMISSION: false,
    checks,
    manualEvidence: checks.filter((check) => check.source === "manual"),
    automatedEvidence: checks.filter((check) => check.source === "automated"),
    missing,
    warning: HMRC_PHASE_5B_READINESS_WARNING,
    warnings: [
      HMRC_PHASE_5B_READINESS_WARNING,
      HMRC_PHASE_5B_LIVE_SUBMISSION_WARNING,
    ],
  };
}

export function evaluateHmrcPhase5CReadinessGate(results = {}) {
  const checks = HMRC_PHASE_5C_READINESS_REQUIREMENTS.map((key) => ({
    key,
    label: HMRC_PHASE_5_READINESS_EVIDENCE[key]?.label || key,
    source: HMRC_PHASE_5_READINESS_EVIDENCE[key]?.source || "manual",
    passed: results[key] === true,
  }));
  const missing = checks.filter((check) => !check.passed).map((check) => check.key);
  return {
    READY_FOR_PHASE_5A: HMRC_PHASE_5_READINESS_REQUIREMENTS.every((key) => results[key] === true),
    READY_FOR_PHASE_5B: HMRC_PHASE_5B_READINESS_REQUIREMENTS.every((key) => results[key] === true),
    READY_FOR_PHASE_5C: missing.length === 0,
    READY_FOR_LIVE_SUBMISSION: false,
    checks,
    manualEvidence: checks.filter((check) => check.source === "manual"),
    automatedEvidence: checks.filter((check) => check.source === "automated"),
    missing,
    warning: HMRC_PHASE_5C_READINESS_WARNING,
    warnings: [
      HMRC_PHASE_5C_READINESS_WARNING,
      HMRC_PHASE_5C_LIVE_SUBMISSION_WARNING,
      HMRC_PHASE_5C_LIVE_PILOT_WARNING,
    ],
  };
}

export function evaluateHmrcPhase5DReadinessGate(results = {}) {
  const checks = HMRC_REAL_LIVE_NETWORK_ATTEMPT_REQUIREMENTS.map((key) => ({
    key,
    label: HMRC_PHASE_5_READINESS_EVIDENCE[key]?.label || key,
    source: HMRC_PHASE_5_READINESS_EVIDENCE[key]?.source || "manual",
    passed: manualEvidencePassed(key, results),
  }));
  const phase5dMissing = HMRC_PHASE_5D_PILOT_READINESS_REQUIREMENTS.filter((key) => results[key] !== true);
  const realLiveMissing = checks.filter((check) => !check.passed).map((check) => check.key);
  return {
    READY_FOR_PHASE_5A: HMRC_PHASE_5_READINESS_REQUIREMENTS.every((key) => results[key] === true),
    READY_FOR_PHASE_5B: HMRC_PHASE_5B_READINESS_REQUIREMENTS.every((key) => results[key] === true),
    READY_FOR_PHASE_5C: HMRC_PHASE_5C_READINESS_REQUIREMENTS.every((key) => results[key] === true),
    READY_FOR_PHASE_5D_PILOT: phase5dMissing.length === 0,
    READY_FOR_REAL_LIVE_NETWORK_ATTEMPT: realLiveMissing.length === 0,
    READY_FOR_GENERAL_LIVE_SUBMISSION: false,
    READY_FOR_LIVE_SUBMISSION: false,
    checks,
    manualEvidence: checks.filter((check) => check.source === "manual"),
    automatedEvidence: checks.filter((check) => check.source === "automated"),
    missing: phase5dMissing,
    realLiveMissing,
    warning: HMRC_PHASE_5D_PILOT_READINESS_WARNING,
    warnings: [
      HMRC_PHASE_5D_PILOT_READINESS_WARNING,
      HMRC_REAL_LIVE_NETWORK_ATTEMPT_WARNING,
      HMRC_PHASE_5D_ONE_ACCOUNT_WARNING,
      HMRC_PHASE_5D_LIMITATION_WARNING,
      HMRC_GENERAL_LIVE_SUBMISSION_WARNING,
    ],
  };
}
