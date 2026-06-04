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
});

export const HMRC_PHASE_5_READINESS_WARNING =
  "READY_FOR_PHASE_5A only means ready to begin Phase 5A readiness work. It does not enable live submission.";

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
    missing,
    warning: HMRC_PHASE_5_READINESS_WARNING,
  };
}
