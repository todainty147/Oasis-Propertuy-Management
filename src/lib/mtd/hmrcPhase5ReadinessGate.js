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

export function evaluateHmrcPhase5ReadinessGate(results = {}) {
  const checks = HMRC_PHASE_5_READINESS_REQUIREMENTS.map((key) => ({
    key,
    passed: results[key] === true,
  }));
  const missing = checks.filter((check) => !check.passed).map((check) => check.key);
  return {
    READY_FOR_PHASE_5A: missing.length === 0,
    checks,
    missing,
  };
}
