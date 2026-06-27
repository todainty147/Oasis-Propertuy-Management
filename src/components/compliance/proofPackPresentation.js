export const defaultProofPackLabels = {
  packTitle: "RRA Information Sheet Proof Pack",
  watermark: "Demo proof pack — not legal sign-off",
  watermarkHelper: "This view shows recorded evidence state only. It is not a legal verdict.",
  headline: "Evidence state summary",
  componentStates: "Evidence state summary",
  whatCovers: "What this pack covers",
  assessment: "Assessment",
  evidence: "Evidence",
  currentState: "Current state",
  proofTrail: "Proof trail",
  verificationDetails: "Verification details",
  verificationHelper:
    "These references identify the recorded assessment and evidence trail used to assemble this pack.",
  export: "Export",
  exportPdf: "Export PDF",
  obligationReference: "Pack reference",
  assessmentReference: "Assessment reference",
  evidenceFingerprint: "Evidence fingerprint",
  proofTrailReference: "Proof trail reference",
  exportedAt: "Exported at",
  evaluatedAt: "Evaluated at",
  obligationKind: "Obligation type",
  posture: "Current posture",
  exposureCeiling: "Exposure ceiling",
  createdAt: "Created at",
  result: "Assessment result",
  confidence: "Confidence",
  officialIdentity: "Official document identity",
  evidenceType: "Evidence type",
  serviceTimestamp: "Service timestamp",
  capturedAt: "Captured at",
  traceComplete: "Provenance trail: complete",
  traceIncomplete: "Provenance trail: incomplete",
  expectedEventsPresent: "Expected events present",
  missingEventTypes: "Missing event types",
  orderedTrail: "Ordered proof trail",
  noProofPack: "No proof pack loaded",
};

export const rraProofPackLabels = {
  ...defaultProofPackLabels,
  packTitle: "RRA Information Sheet Proof Pack",
  traceComplete: "Proof trail: complete",
  traceIncomplete: "Proof trail: incomplete",
};

export function mergeProofPackLabels(labels = {}) {
  return { ...defaultProofPackLabels, ...(labels || {}) };
}

export function proofPackPdfOptions(labels = rraProofPackLabels) {
  return { labels: mergeProofPackLabels(labels), mode: "customer" };
}
