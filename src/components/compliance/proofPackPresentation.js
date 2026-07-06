export const defaultProofPackLabels = {
  packTitle: "RRA Information Sheet Proof Pack",
  watermark: "Demo proof pack — not legal sign-off",
  watermarkHelper: "This view shows recorded evidence state only. It is not a legal verdict.",
  headline: "A record of what Tenaqo checked for this tenancy, and the evidence behind it",
  componentStates: "What's on file",
  whatCovers: "What this pack covers",
  assessment: "Assessment",
  evidence: "Evidence",
  currentState: "Current state",
  proofTrail: "Proof trail",
  verificationDetails: "Verification details",
  verificationHelper:
    "These are the internal references for the assessment and evidence trail recorded in Tenaqo.",
  export: "Export",
  exportPdf: "Export PDF",
  obligationReference: "Pack reference",
  assessmentReference: "Assessment reference",
  evidenceFingerprint: "Evidence fingerprint",
  proofTrailReference: "Event sequence",
  exportedAt: "Exported",
  evaluatedAt: "Checked",
  obligationKind: "Obligation type",
  posture: "Current status",
  exposureCeiling: "Maximum recorded exposure ceiling",
  createdAt: "Obligation logged",
  result: "Result",
  confidence: "Confidence",
  officialIdentity: "Official document identity",
  evidenceType: "Evidence type",
  serviceTimestamp: "Service timestamp",
  capturedAt: "Captured at",
  traceComplete: "Provenance trail: complete",
  traceIncomplete: "Provenance trail: incomplete",
  expectedEventsPresent: "Expected events present",
  missingEventTypes: "Missing event types",
  orderedTrail: "Timeline",
  noProofPack: "No proof pack loaded",
};

export const rraProofPackLabels = {
  ...defaultProofPackLabels,
  packTitle: "RRA Information Sheet Proof Pack",
  traceComplete: "Expected compliance events present: Yes",
  traceIncomplete: "Expected compliance events: sequence incomplete",
  proofTrail: "Evaluation and proof-chain trail",
};

export function mergeProofPackLabels(labels = {}) {
  return { ...defaultProofPackLabels, ...(labels || {}) };
}

export function proofPackPdfOptions(labels = rraProofPackLabels) {
  return { labels: mergeProofPackLabels(labels), mode: "customer" };
}
