import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const COVERAGE_RUNNER = "scripts/dev/rpe_contract_coverage_e2e_runner.mjs";
const MEASUREMENT_TEMPLATE = readFileSync(
  join(process.cwd(), "scripts/dev/rpe_contract_measurement_report_template.sql"),
  "utf8",
);
const CONTAINER = process.env.RPE_DB_CONTAINER || "supabase_db_oasisrentalmanagementapp";

// Explicit model weights. These are not prevalence claims; they are the two
// bracket assumptions from the prompt expressed as a runnable population.
const BRACKETS = {
  current_capture_state: [
    { caseName: "C10", label: "current_jurisdiction_missing", weight: 80 },
    { caseName: "C11", label: "current_active_on_date_missing", weight: 10 },
    { caseName: "C13", label: "current_tenancy_class_missing", weight: 5 },
    { caseName: "C1", label: "current_terminal_information_sheet", weight: 3 },
    { caseName: "C2", label: "current_terminal_written_statement", weight: 2 },
  ],
  post_capture_steady_state: [
    { caseName: "C1", label: "post_information_sheet_known_end", weight: 40 },
    { caseName: "C2", label: "post_written_statement_periodic", weight: 25 },
    { caseName: "C3", label: "post_company_exclusion", weight: 5 },
    { caseName: "C5", label: "post_lodger_exclusion", weight: 5 },
    { caseName: "C6", label: "post_rent_act_exclusion", weight: 5 },
    { caseName: "C9", label: "post_non_ast_exclusion", weight: 5 },
    { caseName: "C11", label: "post_c_shaped_no_indicator", weight: 10 },
    { caseName: "C13", label: "post_residual_tenancy_class_capture", weight: 5 },
  ],
};

function runNodeScript(scriptPath) {
  const result = spawnSync("cmd.exe", [
    "/c",
    `cd /d C:\\Users\\Home\\oasisrentalmanagementapp && node scripts\\with-local-node.mjs node ${scriptPath.replaceAll("/", "\\")}`,
  ], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error([
      `${scriptPath} failed`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }

  return result.stdout;
}

function runPsql(sql) {
  const result = spawnSync("docker", [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "-",
  ], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error([
      "measurement report failed",
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }

  return result.stdout;
}

function extractCoverageJson(stdout) {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Could not parse coverage runner JSON output:\n${stdout}`);
  }

  return JSON.parse(stdout.slice(start, end + 1));
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildRunPopulation(coverageRun) {
  const idByCaseName = new Map(
    coverageRun.recorded.map((row) => [row.caseName, row.recordedEvaluationId]),
  );

  const rows = [];
  for (const [bracketName, entries] of Object.entries(BRACKETS)) {
    for (const entry of entries) {
      const recordedEvaluationId = idByCaseName.get(entry.caseName);
      if (!recordedEvaluationId) {
        throw new Error(`No fresh recordedEvaluationId found for ${entry.caseName}`);
      }
      rows.push(
        `      (${sqlString(bracketName)}::text, ${sqlString(entry.label)}::text, '${recordedEvaluationId}'::uuid, ${entry.weight}::numeric)`,
      );
    }
  }

  return `with run_population as (
  select *
  from (
    values
${rows.join(",\n")}
  ) as population(bracket_name, portfolio_row_label, recorded_evaluation_id, weight)
  where recorded_evaluation_id is not null
)`;
}

function buildMeasurementSql(coverageRun) {
  const replacement = buildRunPopulation(coverageRun);
  const startMarker = "with run_population as (";
  const marker = "),\nrecorded as (";
  const startIndex = MEASUREMENT_TEMPLATE.indexOf(startMarker);
  const markerIndex = MEASUREMENT_TEMPLATE.indexOf(marker);
  if (startIndex === -1 || markerIndex === -1 || markerIndex <= startIndex) {
    throw new Error("Unexpected measurement template shape");
  }

  return `${replacement}${MEASUREMENT_TEMPLATE.slice(markerIndex + 1)}`;
}

async function main() {
  const coverageStdout = runNodeScript(COVERAGE_RUNNER);
  const coverageRun = extractCoverageJson(coverageStdout);

  const measurementSql = buildMeasurementSql(coverageRun);
  const measurementReport = runPsql(measurementSql);

  console.log(JSON.stringify({
    model_note: "Part B is a weighted bracket model, not a prevalence claim. Aggregation uses only the fresh recorded_evaluation_id values from this run.",
    brackets: BRACKETS,
    fresh_recorded_evaluation_ids: Object.fromEntries(
      coverageRun.recorded.map((row) => [row.caseName, row.recordedEvaluationId]),
    ),
    coverage_contract_pass: coverageRun.report.includes("coverage_contract_pass") && coverageRun.report.includes(" t "),
    measurement_report: measurementReport,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
