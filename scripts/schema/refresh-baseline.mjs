import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const baselinePath = path.join(repoRoot, "supabase", "baseline_schema.sql");
const remoteSnapshotPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20260319114347_remote_schema.sql",
);

const REMOTE_PLACEHOLDER = `-- Intentionally left blank.
-- This placeholder snapshot migration exists for remote-schema bookkeeping only.
-- Use supabase/baseline_schema.sql as the local bootstrap source of truth.
`;

function usage() {
  console.log(`Usage:
  node scripts/schema/refresh-baseline.mjs refresh
  node scripts/schema/refresh-baseline.mjs check

Commands:
  refresh   Dump the current local Supabase schema, normalize it, and overwrite supabase/baseline_schema.sql
  check     Dump the current local Supabase schema, normalize it, and fail if it differs from supabase/baseline_schema.sql
`);
}

function normalizeDump(content) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/^\\restrict .+$/m, "\\restrict BASELINE_TOKEN")
    .replace(/^\\unrestrict .+$/m, "\\unrestrict BASELINE_TOKEN")
    .replace(/\n+$/g, "\n");
}

function ensureRemoteSnapshotIsPlaceholder() {
  if (!fs.existsSync(remoteSnapshotPath)) {
    throw new Error(`Missing placeholder snapshot file: ${remoteSnapshotPath}`);
  }

  const current = fs.readFileSync(remoteSnapshotPath, "utf8").replace(/\r\n/g, "\n");
  if (current !== REMOTE_PLACEHOLDER) {
    throw new Error(
      "supabase/migrations/20260319114347_remote_schema.sql is no longer the expected placeholder. " +
        "Restore it before refreshing the baseline so contributors do not confuse a snapshot dump with the real bootstrap source.",
    );
  }
}

function toWindowsPath(posixPath) {
  const match = posixPath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (!match) return null;
  const drive = match[1].toUpperCase();
  const tail = match[2].replace(/\//g, "\\");
  return `${drive}:\\${tail}`;
}

function runDump(tempPath) {
  const attempts = [];
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

  attempts.push({
    cmd: npxCmd,
    args: ["supabase", "db", "dump", "--local", "--file", tempPath],
    label: "npx supabase db dump --local",
  });

  const windowsTempPath = toWindowsPath(tempPath);
  if (windowsTempPath) {
    attempts.push({
      cmd: "cmd.exe",
      args: ["/c", "supabase", "db", "dump", "--local", "--file", windowsTempPath],
      label: "cmd.exe /c supabase db dump --local",
    });
  } else if (process.platform === "win32") {
    attempts.push({
      cmd: "cmd.exe",
      args: ["/c", "supabase", "db", "dump", "--local", "--file", tempPath],
      label: "cmd.exe /c supabase db dump --local",
    });
  }

  const failures = [];
  for (const attempt of attempts) {
    const result = spawnSync(attempt.cmd, attempt.args, {
      cwd: repoRoot,
      stdio: "pipe",
      encoding: "utf8",
    });

    if (result.status === 0 && fs.existsSync(tempPath)) {
      return attempt.label;
    }

    failures.push(
      `${attempt.label} failed with status ${result.status ?? "null"}\n${result.stderr || result.stdout || ""}`.trim(),
    );
  }

  throw new Error(
    "Unable to dump the local Supabase schema.\n\n" +
      failures.join("\n\n---\n\n") +
      "\n\nMake sure local Supabase is running before retrying.",
  );
}

function main() {
  const mode = process.argv[2];
  if (!mode || mode === "--help" || mode === "-h") {
    usage();
    process.exit(mode ? 0 : 1);
  }

  if (!["refresh", "check"].includes(mode)) {
    usage();
    process.exit(1);
  }

  ensureRemoteSnapshotIsPlaceholder();

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oasis-schema-"));
  const tempPath = path.join(tempDir, "baseline_schema.dump.sql");

  const dumpRunner = runDump(tempPath);
  const dumped = fs.readFileSync(tempPath, "utf8");
  const normalized = normalizeDump(dumped);

  if (mode === "refresh") {
    fs.writeFileSync(baselinePath, normalized, "utf8");
    console.log(`Baseline refreshed from local Supabase using ${dumpRunner}`);
    console.log(`Wrote ${path.relative(repoRoot, baselinePath)}`);
    return;
  }

  const current = fs.existsSync(baselinePath)
    ? normalizeDump(fs.readFileSync(baselinePath, "utf8"))
    : "";

  if (current !== normalized) {
    console.error("Baseline drift detected: supabase/baseline_schema.sql is out of date.");
    console.error("Run: npm run schema:baseline:refresh");
    process.exit(1);
  }

  console.log(`Baseline is up to date (${dumpRunner})`);
}

main();
