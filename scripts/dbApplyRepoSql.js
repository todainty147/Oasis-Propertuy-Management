/* global process */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const supabaseDir = path.join(repoRoot, "supabase");

const BASELINE_FILE = "baseline_schema.sql";

// One-off, obsolete, or non-SQL-runtime artifacts that should not be replayed blindly.
const EXCLUDED_FILES = new Map([
  ["baseline_schema.old.sql", "legacy snapshot"],
  ["account_email_dedup_cleanup.sql", "one-off data cleanup"],
  ["performance_staging_explain.sql", "manual staging explain helper"],
  ["rls.sql", "obsolete stub that intentionally raises"],
  ["config.toml", "Supabase CLI config, not SQL"],
]);

// Curated additive order for bringing an existing environment up to the repo's current shape.
// This intentionally prefers idempotent schema/function overlays over raw directory iteration.
const OVERLAY_SEQUENCE = [
  "20260315_billing.sql",
  "account_entitlements.sql",
  "custom_staff_roles.sql",
  "custom_staff_roles_membership.sql",
  "custom_staff_roles_seed.sql",
  "custom_staff_roles_helpers.sql",
  "custom_staff_roles_management.sql",
  "account_member_permission_keys.sql",
  "account_role_compatibility_helpers.sql",
  "account_role_for_custom_roles.sql",
  "property_tenant_dynamic_permission_policies.sql",
  "account_branding.sql",
  "account_invitations_saas.sql",
  "account_owner_contact.sql",
  "account_report_settings.sql",
  "account_sandbox_profiles.sql",
  "custom_fields.sql",
  "outbound_email_events.sql",
  "outbound_sms_events.sql",
  "operations_foundations.sql",
  "leases.sql",
  "maintenance_waiting_reason.sql",
  "maintenance_expense_facts.sql",
  "maintenance_kpi_snapshot.sql",
  "prevent_close_if_work_order_open.sql",
  "preventive_maintenance.sql",
  "work_order_workflow_seed.sql",
  "work_order_assignment_authorization.sql",
  "work_order_allowed_actions_authorization.sql",
  "property_operational_health_snapshot.sql",
  "contractor_work_order_cards.sql",
  "contractor_ratings.sql",
  "dashboard_snapshot.sql",
  "finance_snapshot.sql",
  "portfolio_health_snapshot.sql",
  "dashboard_hub_extras.sql",
  "tenant_activity_feed.sql",
  "command_center_items.sql",
  "attention_center_items.sql",
  "portfolio_attention_items.sql",
  "portfolio_weekly_summary.sql",
  "ai_attention_insights.sql",
  "ai_property_health_explainer.sql",
  "ai_maintenance_triage.sql",
  "ai_contractor_recommendation.sql",
  "ai_weekly_portfolio_summary.sql",
  "playbook_status_snapshot.sql",
  "automation_playbooks.sql",
  "create_notifications.sql",
  "fn_documents_notify_uploaded_patch.sql",
  "notifications_rpc_grants.sql",
  "payment_write_authorization.sql",
  "security_denied_event_stream.sql",
  "security_observability_events.sql",
  "api_rate_limits.sql",
  "support_telemetry_access.sql",
  "security_failure_observability.sql",
  "log_security_event.sql",
  "security_audit_ledger.sql",
  "security_audit_settings.sql",
  "security_audit_export_jobs.sql",
  "security_audit_event_wiring.sql",
  "security_anomaly_alerts.sql",
  "security_anomaly_alert_workflow.sql",
  "self_serve_landlord_signup.sql",
  "auth_user_profile_bootstrap_hardening.sql",
  "compliance_document_links.sql",
  "document_audit_scope.sql",
  "document_templates.sql",
  "document_templates_storage_path_repair.sql",
  "document_requests.sql",
  "document_packets.sql",
  "document_signature_readiness.sql",
  "document_signature_docuseal.sql",
  "compliance_calendar_upgrade.sql",
  "storage_buckets.sql",
  "storage_documents_policies.sql",
  "storage_maintenance_request_attachments_policies.sql",
  "storage_work_order_attachments_policies.sql",
  "performance_rpc_indexes.sql",
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
    if (fs.existsSync(candidate)) return candidate;
  }

  return process.platform === "win32" ? "psql.exe" : "psql";
}

function parseArgs(argv) {
  const result = {
    includeBaseline: false,
    dryRun: false,
    dbUrl: process.env.DB_APPLY_URL || process.env.DATABASE_URL || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--include-baseline") result.includeBaseline = true;
    else if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--db-url") {
      result.dbUrl = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }

  return result;
}

function printHelp() {
  console.log(`OASIS repo SQL apply helper

Usage:
  node scripts/dbApplyRepoSql.js --db-url "postgresql://postgres@db.<ref>.supabase.co:5432/postgres"

Options:
  --db-url <url>         Target database URL. Falls back to DB_APPLY_URL or DATABASE_URL.
  --include-baseline     Replay supabase/baseline_schema.sql before overlays.
                         Use this only if you intentionally want a full repo replay.
  --dry-run              Print the execution order without running psql.
  --help                 Show this help.

Authentication:
  Supply the password via PGPASSWORD in your shell, or embed it in the connection string.

Examples:
  PGPASSWORD=secret node scripts/dbApplyRepoSql.js --db-url "postgresql://postgres@db.<ref>.supabase.co:5432/postgres"
  PGPASSWORD=secret node scripts/dbApplyRepoSql.js --db-url "postgresql://postgres@db.<ref>.supabase.co:5432/postgres" --include-baseline
`);
}

function ensureFilesExist(files) {
  const missing = files.filter((file) => !fs.existsSync(path.join(supabaseDir, file)));
  if (missing.length > 0) {
    throw new Error(`Missing SQL files:\n${missing.map((file) => `- supabase/${file}`).join("\n")}`);
  }
}

function createSanitizedBaselineFile(sourcePath) {
  const original = fs.readFileSync(sourcePath, "utf8");
  const lines = original.split(/\r?\n/);
  const sanitized = [];
  let skippingCopyData = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (skippingCopyData) {
      if (trimmed === "\\.") {
        skippingCopyData = false;
      }
      continue;
    }

    if (trimmed.startsWith("\\restrict") || trimmed.startsWith("\\unrestrict")) {
      continue;
    }

    if (/^COPY\s+.+\s+FROM\s+stdin;$/i.test(trimmed)) {
      skippingCopyData = true;
      continue;
    }

    sanitized.push(line);
  }

  const tempPath = path.join(os.tmpdir(), `oasis-baseline-sanitized-${Date.now()}.sql`);
  fs.writeFileSync(tempPath, `${sanitized.join("\n")}\n`, "utf8");
  return tempPath;
}

function buildPlan({ includeBaseline }) {
  const files = includeBaseline ? [BASELINE_FILE, ...OVERLAY_SEQUENCE] : [...OVERLAY_SEQUENCE];
  ensureFilesExist(files);

  return files.map((file) => ({
    file,
    path: path.join(supabaseDir, file),
    onErrorStop: file === BASELINE_FILE ? false : true,
  }));
}

function runPsql({ dbUrl, filePath, onErrorStop }) {
  const cmd = resolvePsqlCommand();
  const args = [
    "--set",
    `ON_ERROR_STOP=${onErrorStop ? "1" : "0"}`,
    "--dbname",
    dbUrl,
    "--file",
    filePath,
  ];

  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
    env: process.env,
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  if (result.status !== 0) {
    throw new Error(`${path.basename(filePath)} failed\n${output}`);
  }

  const filteredOutput = path.basename(filePath) === BASELINE_FILE
    ? filterBaselineApplyOutput(output)
    : output;

  if (path.basename(filePath) === BASELINE_FILE && output && !filteredOutput) {
    console.log("Baseline schema replay completed with expected noise suppressed.");
    return;
  }

  if (filteredOutput) console.log(filteredOutput);
}

function filterBaselineApplyOutput(output) {
  if (!output) return output;

  const noisyPatterns = [
    /permission denied for schema auth/i,
    /must be owner of/i,
    /relation ".*" already exists/i,
    /multiple primary keys .* are not allowed/i,
    /constraint ".*" .* already exists/i,
    /policy ".*" .* already exists/i,
    /trigger ".*" .* already exists/i,
    /grant options cannot be granted back to your own grantor/i,
    /permission denied to change default privileges/i,
    /no privileges were granted/i,
    /type "extensions\.citext" does not exist/i,
  ];

  return output
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^(SET|CREATE|ALTER|COMMENT|GRANT|REVOKE|BEGIN|COMMIT|DO|INSERT|UPDATE|DELETE|DROP)\b/i.test(trimmed)) {
        return false;
      }
      return !noisyPatterns.some((pattern) => pattern.test(trimmed));
    })
    .join("\n")
    .trim();
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const tempFiles = [];
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.dbUrl) {
    throw new Error("Missing database URL. Pass --db-url or set DB_APPLY_URL / DATABASE_URL.");
  }

  const plan = buildPlan({ includeBaseline: options.includeBaseline });

  console.log("OASIS repo SQL apply");
  console.log(`Target database: ${options.dbUrl}`);
  console.log(`Mode: ${options.includeBaseline ? "baseline + overlays" : "overlays only (recommended for existing environments)"}`);
  console.log("");
  console.log("Excluded files:");
  for (const [file, reason] of EXCLUDED_FILES.entries()) {
    console.log(`- supabase/${file} (${reason})`);
  }
  console.log("");
  console.log("Execution order:");
  plan.forEach((step, index) => {
    console.log(`${index + 1}. supabase/${step.file}${step.file === BASELINE_FILE ? " [ON_ERROR_STOP=0]" : ""}`);
  });

  if (options.dryRun) {
    console.log("");
    console.log("Dry run only. No SQL executed.");
    return;
  }

  for (const step of plan) {
    console.log("");
    console.log(`==> Applying supabase/${step.file}`);
    const filePath = step.file === BASELINE_FILE
      ? (() => {
          const sanitizedPath = createSanitizedBaselineFile(step.path);
          tempFiles.push(sanitizedPath);
          return sanitizedPath;
        })()
      : step.path;
    runPsql({
      dbUrl: options.dbUrl,
      filePath,
      onErrorStop: step.onErrorStop,
    });
  }

  console.log("");
  console.log("Repo SQL apply complete.");

  for (const filePath of tempFiles) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // best-effort cleanup
    }
  }
}

main();
