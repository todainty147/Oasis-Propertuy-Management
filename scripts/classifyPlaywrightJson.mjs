import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const inputPath = process.argv[2] || process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;
const outputPath = process.argv[3] || "tmp/e2e-last-classification.json";

const INFRA_PATTERNS = [
  /E2E_INFRA_DEV_SERVER_UNAVAILABLE/i,
  /ERR_CONNECTION_REFUSED/i,
  /ERR_CONNECTION_RESET/i,
  /ERR_INSUFFICIENT_RESOURCES/i,
  /net::ERR_ABORTED/i,
  /webServer/i,
  /app server/i,
  /dev server/i,
];

const BROWSER_CRASH_PATTERNS = [
  /worker process exited unexpectedly/i,
  /Target page, context or browser has been closed/i,
  /Browser closed/i,
  /page crash/i,
];

const FIXTURE_PATTERNS = [
  /already exists/i,
  /duplicate key/i,
  /not found.*seed/i,
  /shared fixture/i,
  /plan\/country/i,
  /test order/i,
];

const SCREENSHOT_PATTERNS = [
  /screenshot/i,
  /captures .*screenshots/i,
  /linkedin-ready product shots/i,
  /marketing product screenshots/i,
];

function readJson(path) {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function textFromFailure(test, result) {
  const chunks = [
    test.title,
    result.status,
    result.error?.message,
    result.error?.stack,
    ...(result.errors || []).map((error) => `${error?.message || ""}\n${error?.stack || ""}`),
  ];
  return chunks.filter(Boolean).join("\n");
}

function classifyFailure(test, result) {
  const text = textFromFailure(test, result);
  if (/timeout/i.test(text) && INFRA_PATTERNS.some((pattern) => pattern.test(text))) {
    return "timeout due to app unavailable";
  }
  if (INFRA_PATTERNS.some((pattern) => pattern.test(text))) return "dev-server unavailable";
  if (BROWSER_CRASH_PATTERNS.some((pattern) => pattern.test(text))) return "browser/page crash";
  if (SCREENSHOT_PATTERNS.some((pattern) => pattern.test(text))) return "screenshot artifact failure";
  if (FIXTURE_PATTERNS.some((pattern) => pattern.test(text))) return "fixture collision";
  return "product assertion failure";
}

function walkSuite(suite, acc) {
  for (const child of suite.suites || []) walkSuite(child, acc);
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      for (const result of test.results || []) {
        if (result.status === "passed") acc.passed += 1;
        else if (result.status === "skipped") acc.skipped += 1;
        else {
          acc.failed += 1;
          const classification = classifyFailure({ ...test, title: spec.title }, result);
          acc.failureTypes[classification] = (acc.failureTypes[classification] || 0) + 1;
          acc.failures.push({
            title: spec.title,
            status: result.status,
            classification,
            message: result.error?.message || result.errors?.[0]?.message || "",
          });
        }
      }
    }
  }
}

const report = readJson(inputPath);
if (!report) {
  const missing = {
    status: "INFRASTRUCTURE_INVALID",
    reason: "missing-json-artifact",
    inputPath: inputPath || null,
  };
  writeFileSync(outputPath, `${JSON.stringify(missing, null, 2)}\n`);
  console.error(`[e2e-classifier] Missing Playwright JSON artifact: ${inputPath || "(not set)"}`);
  process.exitCode = 2;
} else {
  const summary = {
    passed: 0,
    failed: 0,
    skipped: 0,
    failureTypes: {},
    failures: [],
  };
  for (const suite of report.suites || []) walkSuite(suite, summary);

  const infraFailures = (summary.failureTypes["dev-server unavailable"] || 0)
    + (summary.failureTypes["browser/page crash"] || 0)
    + (summary.failureTypes["timeout due to app unavailable"] || 0)
    + (summary.failureTypes["screenshot artifact failure"] || 0)
    + (summary.failureTypes["fixture collision"] || 0);

  const status = infraFailures > 0
    ? "INFRASTRUCTURE_INVALID"
    : summary.failed > 0
      ? "PRODUCT_REGRESSION"
      : "PASSED";

  const output = {
    status,
    artifact: resolve(inputPath),
    ...summary,
  };

  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`[e2e-classifier] ${status}: ${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped.`);
  if (summary.failed > 0) {
    console.log(`[e2e-classifier] Failure types: ${JSON.stringify(summary.failureTypes)}`);
  }
}
