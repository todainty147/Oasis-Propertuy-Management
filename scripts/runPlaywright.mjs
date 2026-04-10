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

child.on("close", (code) => {
  process.exitCode = code ?? 1;
});
