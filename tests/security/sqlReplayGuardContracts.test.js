/**
 * E-149 SQL Replay Guard — ensures dbApplyRepoSql.js --dry-run
 * enumerates the full overlay sequence without errors.
 *
 * This test is a canary: if someone adds a new .sql file without
 * classifying it (OVERLAY_SEQUENCE or EXCLUDED_FILES), or removes
 * a critical file reference, the dry-run throws and this test fails.
 *
 * It does NOT require a live database — dry-run only prints the plan.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function runDryRun() {
  const result = spawnSync(
    process.execPath,
    ["scripts/dbApplyRepoSql.js", "--dry-run"],
    {
      cwd: repoRoot,
      stdio: "pipe",
      encoding: "utf8",
      env: process.env,
    },
  );
  return {
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: ((result.stdout ?? "") + "\n" + (result.stderr ?? "")).trim(),
  };
}

describe("E-149 sql replay guard contracts", () => {
  it("dbApplyRepoSql.js --dry-run exits cleanly with no error", () => {
    const { exitCode, output } = runDryRun();
    expect(exitCode, `dry-run exited non-zero\n${output}`).toBe(0);
    expect(output).not.toMatch(/Error:/i);
    expect(output).not.toMatch(/FATAL/);
  });

  it("dry-run prints the full-sequence header and dry-run sentinel", () => {
    const { stdout } = runDryRun();
    expect(stdout).toContain("OASIS repo SQL apply");
    expect(stdout).toContain("Execution order:");
    expect(stdout).toContain("Dry run only. No SQL executed.");
  });

  it("sequence includes the E-149 landmine files that now carry DROP guards", () => {
    const { stdout } = runDryRun();
    // vs2b was the first landmine fixed in E-149
    expect(stdout).toContain("regulatory_proof_engine_vs2b_obligations.sql");
    // evidence layer files must appear after vs2b in the sequence
    expect(stdout).toContain("compliance_safe_e084_interim_gate.sql");
    expect(stdout).toContain("evidence_provenance_stub.sql");

    // Verify ordering: vs2b must precede both evidence-layer files
    const vs2bPos = stdout.indexOf("regulatory_proof_engine_vs2b_obligations.sql");
    const e084Pos = stdout.indexOf("compliance_safe_e084_interim_gate.sql");
    const provenancePos = stdout.indexOf("evidence_provenance_stub.sql");
    expect(vs2bPos).toBeGreaterThan(-1);
    expect(e084Pos).toBeGreaterThan(vs2bPos);
    expect(provenancePos).toBeGreaterThan(vs2bPos);
  });

  it("all .sql files in supabase/ are classified (no unclassified-file error)", () => {
    // ensureAllSqlFilesAreClassified() throws if any file is unclassified;
    // a clean dry-run proves all files are covered.
    const { exitCode, output } = runDryRun();
    expect(exitCode, `unclassified SQL file detected\n${output}`).toBe(0);
    expect(output).not.toMatch(/SQL files missing from DbApplyRepo classification/);
  });
});
