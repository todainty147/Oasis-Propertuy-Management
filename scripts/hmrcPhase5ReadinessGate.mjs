#!/usr/bin/env node
import {
  evaluateHmrcPhase5ReadinessGate,
  HMRC_PHASE_5_READINESS_REQUIREMENTS,
} from "../src/lib/mtd/hmrcPhase5ReadinessGate.js";

const explicitResults = Object.fromEntries(
  HMRC_PHASE_5_READINESS_REQUIREMENTS.map((key) => [key, process.env[key] === "true"]),
);
const result = evaluateHmrcPhase5ReadinessGate(explicitResults);

console.log(`READY_FOR_PHASE_5A = ${result.READY_FOR_PHASE_5A ? "true" : "false"}`);
for (const check of result.checks) {
  console.log(`${check.passed ? "PASS" : "MISSING"} ${check.key}`);
}

if (!result.READY_FOR_PHASE_5A) {
  process.exitCode = 1;
}
