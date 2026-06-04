#!/usr/bin/env node
import {
  evaluateHmrcPhase5BReadinessGate,
  evaluateHmrcPhase5ReadinessGate,
  HMRC_PHASE_5_READINESS_EVIDENCE,
  HMRC_PHASE_5B_READINESS_REQUIREMENTS,
  HMRC_PHASE_5B_LIVE_SUBMISSION_WARNING,
  HMRC_PHASE_5_READINESS_REQUIREMENTS,
  HMRC_PHASE_5_READINESS_WARNING,
} from "../src/lib/mtd/hmrcPhase5ReadinessGate.js";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const evidenceFile = process.argv.find((arg) => arg.startsWith("--evidence-file="))?.split("=").slice(1).join("=");
const fileEvidence = evidenceFile ? readEvidenceFile(evidenceFile) : {};
const allRequirementKeys = [...new Set([...HMRC_PHASE_5_READINESS_REQUIREMENTS, ...HMRC_PHASE_5B_READINESS_REQUIREMENTS])];
const explicitResults = Object.fromEntries(allRequirementKeys.map((key) => [
  key,
  fileEvidence[key] === true || process.env[key] === "true",
]));
const result = evaluateHmrcPhase5ReadinessGate(explicitResults);
const phase5b = evaluateHmrcPhase5BReadinessGate(explicitResults);

console.log(`HMRC Phase 5 readiness gate`);
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log(`Git commit: ${currentGitCommit()}`);
console.log(`Evidence source: ${evidenceFile ? `file + env override (${evidenceFile})` : "environment flags"}`);
console.log(HMRC_PHASE_5_READINESS_WARNING);
console.log(phase5b.warning);
console.log(HMRC_PHASE_5B_LIVE_SUBMISSION_WARNING);
console.log(`READY_FOR_PHASE_5A = ${result.READY_FOR_PHASE_5A ? "true" : "false"}`);
console.log(`READY_FOR_PHASE_5B = ${phase5b.READY_FOR_PHASE_5B ? "true" : "false"}`);
console.log(`READY_FOR_LIVE_SUBMISSION = ${phase5b.READY_FOR_LIVE_SUBMISSION ? "true" : "false"}`);
console.log(`Manual evidence:`);
printChecks(phase5b.manualEvidence);
console.log(`Automated evidence:`);
printChecks(phase5b.automatedEvidence);

if (phase5b.missing.length) {
  console.log(`Missing evidence: ${phase5b.missing.join(", ")}`);
}

if (!result.READY_FOR_PHASE_5A || !phase5b.READY_FOR_PHASE_5B) {
  process.exitCode = 1;
}

function readEvidenceFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Could not read evidence file: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exitCode = 1;
    return {};
  }
}

function currentGitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function printChecks(checks) {
  for (const check of checks) {
    const evidence = HMRC_PHASE_5_READINESS_EVIDENCE[check.key] || {};
    console.log(`${check.passed ? "PASS" : "MISSING"} [${evidence.source || "manual"}] ${check.key} - ${evidence.label || check.key}`);
  }
}
