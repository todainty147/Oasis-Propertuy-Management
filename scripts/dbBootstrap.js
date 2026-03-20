import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const supabaseDir = path.join(repoRoot, "supabase");
const defaultDbUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const bootstrapSteps = [
  {
    label: "Load baseline schema",
    file: path.join(supabaseDir, "baseline_schema.sql"),
    onErrorStop: false,
  },
  {
    label: "Apply invite and membership overlay",
    file: path.join(supabaseDir, "account_invitations_saas.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply notifications overlay",
    file: path.join(supabaseDir, "create_notifications.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply security denied-event overlay",
    file: path.join(supabaseDir, "security_denied_event_stream.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply security observability overlay",
    file: path.join(supabaseDir, "security_observability_events.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply payment write authorization overlay",
    file: path.join(supabaseDir, "payment_write_authorization.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply storage bucket overlay",
    file: path.join(supabaseDir, "storage_buckets.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply document storage policy overlay",
    file: path.join(supabaseDir, "storage_documents_policies.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply maintenance attachment storage overlay",
    file: path.join(supabaseDir, "storage_maintenance_request_attachments_policies.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply work-order attachment storage overlay",
    file: path.join(supabaseDir, "storage_work_order_attachments_policies.sql"),
    onErrorStop: true,
  },
];

function resolvePsqlCommand() {
  const configured = process.env.PSQL_BIN;
  if (configured) return configured;

  const pathCandidates = process.platform === "win32"
    ? [
        "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe",
        "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe",
        "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe",
      ]
    : [
        "/mnt/c/Program Files/PostgreSQL/18/bin/psql.exe",
        "/mnt/c/Program Files/PostgreSQL/17/bin/psql.exe",
        "/mnt/c/Program Files/PostgreSQL/16/bin/psql.exe",
      ];

  for (const candidate of pathCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return process.platform === "win32" ? "psql.exe" : "psql";
}

function resolveSupabaseCommand() {
  if (process.env.SUPABASE_BIN) return process.env.SUPABASE_BIN;
  return process.platform === "win32" ? "supabase.exe" : "supabase";
}

function runPsql({ args, label }) {
  const cmd = resolvePsqlCommand();
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
    env: {
      ...process.env,
      PGPASSWORD: process.env.PGPASSWORD || "postgres",
    },
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} failed using ${cmd}\n${output}`);
  }

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (output) {
    console.log(output);
  }
}

function runSupabase({ args, label }) {
  const cmd = resolveSupabaseCommand();
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
    env: process.env,
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} failed using ${cmd}\n${output}`);
  }

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (output) {
    console.log(output);
  }
}

function main() {
  const dbUrl = process.env.DB_BOOTSTRAP_URL || process.env.DATABASE_URL || defaultDbUrl;

  console.log("OASIS local DB bootstrap");
  console.log(`Target database: ${dbUrl}`);
  console.log("Resetting local Supabase database before baseline apply");
  console.log(`Overlay order:`);
  bootstrapSteps.forEach((step, index) => {
    console.log(`${index + 1}. ${path.relative(repoRoot, step.file)}`);
  });

  console.log("");
  console.log("Preflight: resetting local Supabase DB");
  runSupabase({
    label: "local supabase reset",
    args: ["db", "reset", "--local", "--no-seed", "--yes"],
  });

  console.log("");
  console.log("Preflight: checking database connectivity");
  runPsql({
    label: "database preflight",
    args: ["--dbname", dbUrl, "-c", "select 1;"],
  });

  for (const step of bootstrapSteps) {
    console.log("");
    console.log(`==> ${step.label}`);
    runPsql({
      label: step.label,
      args: [
        "--set",
        `ON_ERROR_STOP=${step.onErrorStop ? "1" : "0"}`,
        "--dbname",
        dbUrl,
        "--file",
        step.file,
      ],
    });
  }

  console.log("");
  console.log("Bootstrap complete.");
  console.log("Next steps:");
  console.log("  npm run test:integration:seed");
  console.log("  npm run test:integration:run");
}

main();
