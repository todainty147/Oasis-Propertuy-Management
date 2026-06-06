import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

function resolveSafeTempDir() {
  const candidates = process.platform === "win32"
    ? [process.env.TEMP, process.env.TMP, process.env.TMPDIR]
    : ["/tmp", process.env.TMPDIR, process.env.TEMP, process.env.TMP];

  return candidates.find((candidate) => candidate && existsSync(candidate)) || "/tmp";
}

const tempDir = resolveSafeTempDir();
const args = process.argv.slice(2);
const cliPath = resolve(process.cwd(), "node_modules", "playwright", "cli.js");
const jsonOutputPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;
const classificationOutputPath = process.env.PLAYWRIGHT_CLASSIFICATION_OUTPUT || "tmp/e2e-last-classification.json";

function runClassifier() {
  if (!jsonOutputPath) return Promise.resolve();

  const classifierPath = resolve(process.cwd(), "scripts", "classifyPlaywrightJson.mjs");
  return new Promise((resolvePromise) => {
    const classifier = spawn(process.execPath, [classifierPath, jsonOutputPath, classificationOutputPath], {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: false,
      env: {
        ...process.env,
        TMPDIR: tempDir,
        TEMP: tempDir,
        TMP: tempDir,
      },
    });

    classifier.on("error", (error) => {
      console.error(`[e2e-classifier] ${error?.message || error}`);
      resolvePromise();
    });
    classifier.on("close", () => resolvePromise());
  });
}

const child = spawn(process.execPath, [cliPath, ...args], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    TMPDIR: tempDir,
    TEMP: tempDir,
    TMP: tempDir,
  },
});

child.on("error", (error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});

child.on("close", async (code) => {
  await runClassifier();
  process.exitCode = code ?? 1;
});
