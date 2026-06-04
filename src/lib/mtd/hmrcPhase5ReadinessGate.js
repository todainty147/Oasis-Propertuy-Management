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
});

export const HMRC_PHASE_5_READINESS_WARNING =
  "READY_FOR_PHASE_5A only means ready to begin Phase 5A readiness work. It does not enable live submission.";
export const HMRC_PHASE_5B_READINESS_WARNING =
  "Phase 5B readiness does not enable live submission.";
export const HMRC_PHASE_5B_LIVE_SUBMISSION_WARNING =
  "READY_FOR_LIVE_SUBMISSION remains false until a later controlled live endpoint phase.";

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
