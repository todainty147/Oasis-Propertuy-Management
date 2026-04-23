/* global process */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const supabaseDir = path.join(repoRoot, "supabase");
const defaultDbUrl = "postgresql://postgres:postgres@127.0.0.1:61022/postgres";
const localSupabaseStartArgs = [
  "start",
  "--exclude",
  "studio,imgproxy,mailpit,logflare,vector,storage-api,realtime,postgres-meta,edge-runtime,supavisor",
];

const bootstrapSteps = [
  {
    label: "Load baseline schema",
    file: path.join(supabaseDir, "baseline_schema.sql"),
    onErrorStop: false,
  },
  {
    label: "Apply account entitlements overlay",
    file: path.join(supabaseDir, "account_entitlements.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply custom staff roles schema overlay",
    file: path.join(supabaseDir, "custom_staff_roles.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply custom staff roles membership overlay",
    file: path.join(supabaseDir, "custom_staff_roles_membership.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply custom staff roles seed overlay",
    file: path.join(supabaseDir, "custom_staff_roles_seed.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply custom staff roles helper overlay",
    file: path.join(supabaseDir, "custom_staff_roles_helpers.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply custom staff roles management overlay",
    file: path.join(supabaseDir, "custom_staff_roles_management.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply account member permission keys overlay",
    file: path.join(supabaseDir, "account_member_permission_keys.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply account role compatibility helper overlay",
    file: path.join(supabaseDir, "account_role_compatibility_helpers.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply account role helper custom-role overlay",
    file: path.join(supabaseDir, "account_role_for_custom_roles.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply property/tenant dynamic permission policies overlay",
    file: path.join(supabaseDir, "property_tenant_dynamic_permission_policies.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply account branding overlay",
    file: path.join(supabaseDir, "account_branding.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply invite and membership overlay",
    file: path.join(supabaseDir, "account_invitations_saas.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply account owner contact overlay",
    file: path.join(supabaseDir, "account_owner_contact.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply account report settings overlay",
    file: path.join(supabaseDir, "account_report_settings.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply account payment collection settings overlay",
    file: path.join(supabaseDir, "account_payment_collection_settings.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply account sandbox profiles overlay",
    file: path.join(supabaseDir, "account_sandbox_profiles.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply custom fields overlay",
    file: path.join(supabaseDir, "custom_fields.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply outbound email events overlay",
    file: path.join(supabaseDir, "outbound_email_events.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply outbound sms events overlay",
    file: path.join(supabaseDir, "outbound_sms_events.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply operations foundations overlay",
    file: path.join(supabaseDir, "operations_foundations.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply leases overlay",
    file: path.join(supabaseDir, "leases.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply maintenance waiting reason overlay",
    file: path.join(supabaseDir, "maintenance_waiting_reason.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply maintenance expense facts overlay",
    file: path.join(supabaseDir, "maintenance_expense_facts.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply maintenance KPI snapshot overlay",
    file: path.join(supabaseDir, "maintenance_kpi_snapshot.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply prevent-close-if-work-order-open overlay",
    file: path.join(supabaseDir, "prevent_close_if_work_order_open.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply preventive maintenance overlay",
    file: path.join(supabaseDir, "preventive_maintenance.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply work-order workflow seed overlay",
    file: path.join(supabaseDir, "work_order_workflow_seed.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply work-order assignment authorization overlay",
    file: path.join(supabaseDir, "work_order_assignment_authorization.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply work-order allowed-actions authorization overlay",
    file: path.join(supabaseDir, "work_order_allowed_actions_authorization.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply property operational health overlay",
    file: path.join(supabaseDir, "property_operational_health_snapshot.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply contractor work-order cards overlay",
    file: path.join(supabaseDir, "contractor_work_order_cards.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply contractor ratings overlay",
    file: path.join(supabaseDir, "contractor_ratings.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply dashboard snapshot overlay",
    file: path.join(supabaseDir, "dashboard_snapshot.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply finance snapshot overlay",
    file: path.join(supabaseDir, "finance_snapshot.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply portfolio health snapshot overlay",
    file: path.join(supabaseDir, "portfolio_health_snapshot.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply dashboard hub extras overlay",
    file: path.join(supabaseDir, "dashboard_hub_extras.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply tenant activity feed overlay",
    file: path.join(supabaseDir, "tenant_activity_feed.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply command center items overlay",
    file: path.join(supabaseDir, "command_center_items.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply attention center items overlay",
    file: path.join(supabaseDir, "attention_center_items.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply portfolio attention items overlay",
    file: path.join(supabaseDir, "portfolio_attention_items.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply portfolio weekly summary overlay",
    file: path.join(supabaseDir, "portfolio_weekly_summary.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply playbook status snapshot overlay",
    file: path.join(supabaseDir, "playbook_status_snapshot.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply automation playbooks overlay",
    file: path.join(supabaseDir, "automation_playbooks.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply notifications overlay",
    file: path.join(supabaseDir, "create_notifications.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply document uploaded notification trigger patch",
    file: path.join(supabaseDir, "fn_documents_notify_uploaded_patch.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply notifications RPC grants overlay",
    file: path.join(supabaseDir, "notifications_rpc_grants.sql"),
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
    label: "Apply API rate limits overlay",
    file: path.join(supabaseDir, "api_rate_limits.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply support telemetry access overlay",
    file: path.join(supabaseDir, "support_telemetry_access.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply security failure observability overlay",
    file: path.join(supabaseDir, "security_failure_observability.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply security log event overlay",
    file: path.join(supabaseDir, "log_security_event.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply security audit ledger overlay",
    file: path.join(supabaseDir, "security_audit_ledger.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply security audit settings overlay",
    file: path.join(supabaseDir, "security_audit_settings.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply security audit export jobs overlay",
    file: path.join(supabaseDir, "security_audit_export_jobs.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply security audit event wiring overlay",
    file: path.join(supabaseDir, "security_audit_event_wiring.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply security anomaly alerts overlay",
    file: path.join(supabaseDir, "security_anomaly_alerts.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply security anomaly alert workflow overlay",
    file: path.join(supabaseDir, "security_anomaly_alert_workflow.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply payment write authorization overlay",
    file: path.join(supabaseDir, "payment_write_authorization.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply self-serve landlord signup overlay",
    file: path.join(supabaseDir, "self_serve_landlord_signup.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply compliance document links overlay",
    file: path.join(supabaseDir, "compliance_document_links.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply document audit scope overlay",
    file: path.join(supabaseDir, "document_audit_scope.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply document template repository overlay",
    file: path.join(supabaseDir, "document_templates.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply tenant document prioritization overlay",
    file: path.join(supabaseDir, "document_tenant_highlight.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply compliance calendar upgrade overlay",
    file: path.join(supabaseDir, "compliance_calendar_upgrade.sql"),
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
  {
    label: "Apply performance RPC indexes overlay",
    file: path.join(supabaseDir, "performance_rpc_indexes.sql"),
    onErrorStop: true,
  },
];

function resolvePsqlCommand() {
  const configured = process.env.PSQL_BIN;
  if (configured) return configured;

  const dockerWrapper = path.join(repoRoot, "scripts", "psql-docker-wrapper.sh");
  if (process.platform !== "win32" && fs.existsSync(dockerWrapper)) {
    return dockerWrapper;
  }

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

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  if (result.status !== 0) {
    throw new Error(`${label} failed using ${cmd}\n${output}`);
  }

  const filteredOutput = label === "Load baseline schema"
    ? filterBaselineBootstrapOutput(output)
    : output;

  if (label === "Load baseline schema" && output && !filteredOutput) {
    console.log("Baseline schema applied with expected local bootstrap noise suppressed.");
    return;
  }

  if (label === "Load baseline schema" && output && filteredOutput && filteredOutput !== output) {
    console.log(filteredOutput);
    return;
  }

  if (output) {
    console.log(output);
  }
}

function runPsqlWithResult({ args }) {
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

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  return {
    cmd,
    status: result.status ?? 1,
    output,
  };
}

function runSupabaseWithResult({ args }) {
  const cmd = resolveSupabaseCommand();
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
    env: process.env,
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  return {
    cmd,
    status: result.status ?? 1,
    output,
  };
}

function filterBaselineBootstrapOutput(output) {
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

function runSupabase({ args, label }) {
  const { cmd, status, output } = runSupabaseWithResult({ args });

  if (status !== 0) {
    throw new Error(`${label} failed using ${cmd}\n${output}`);
  }

  if (output) {
    console.log(output);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSupabaseNotRunningOutput(output) {
  return /supabase start is not running/i.test(output || "");
}

function isSupabaseTransientOutput(output) {
  const message = String(output || "").toLowerCase();
  return (
    message.includes("no such container") ||
    message.includes("container") && message.includes("not running") ||
    message.includes("container") && message.includes("not found") ||
    message.includes("database system is starting up") ||
    message.includes("connection refused") ||
    message.includes("econnrefused")
  );
}

function isDatabaseNotReadyOutput(output) {
  const message = String(output || "").toLowerCase();
  return (
    message.includes("connection refused") ||
    message.includes("database system is starting up") ||
    message.includes("the database system is shutting down")
  );
}

async function ensureLocalSupabaseRunning() {
  console.log("Ensuring local Supabase is running...");
  runSupabase({
    label: "local supabase start",
    args: localSupabaseStartArgs,
  });
}

async function resetLocalSupabaseDb() {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { cmd, status, output } = runSupabaseWithResult({
      args: ["db", "reset", "--local", "--no-seed", "--yes"],
    });

    if (status === 0) {
      if (output) console.log(output);
      return;
    }

    const shouldRecover = isSupabaseNotRunningOutput(output) || isSupabaseTransientOutput(output);
    if (!shouldRecover || attempt === maxAttempts) {
      throw new Error(`local supabase reset failed using ${cmd}\n${output}`);
    }

    console.warn(`Local Supabase reset attempt ${attempt} failed; trying to recover and retry.`);
    if (output) {
      console.warn(output);
    }
    await ensureLocalSupabaseRunning();
    await sleep(1500 * attempt);
  }
}

async function waitForDatabaseConnectivity(dbUrl) {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { cmd, status, output } = runPsqlWithResult({
      args: ["--dbname", dbUrl, "-c", "select 1;"],
    });

    if (status === 0) {
      if (output) console.log(output);
      return;
    }

    if (!isDatabaseNotReadyOutput(output) || attempt === maxAttempts) {
      throw new Error(`database preflight failed using ${cmd}\n${output}`);
    }

    console.warn(`Database preflight attempt ${attempt} failed; waiting for local Postgres to settle.`);
    await sleep(1000 * attempt);
  }
}

async function main() {
  const dbUrl = process.env.DB_BOOTSTRAP_URL || process.env.DATABASE_URL || defaultDbUrl;
  const tempFiles = [];

  console.log("OASIS local DB bootstrap");
  console.log(`Target database: ${dbUrl}`);
  console.log("Resetting local Supabase database before baseline apply");
  console.log(`Overlay order:`);
  bootstrapSteps.forEach((step, index) => {
    console.log(`${index + 1}. ${path.relative(repoRoot, step.file)}`);
  });

  console.log("");
  console.log("Preflight: resetting local Supabase DB");
  await resetLocalSupabaseDb();

  console.log("");
  console.log("Preflight: checking database connectivity");
  await waitForDatabaseConnectivity(dbUrl);

  for (const step of bootstrapSteps) {
    console.log("");
    console.log(`==> ${step.label}`);
    const filePath = path.basename(step.file) === "baseline_schema.sql"
      ? (() => {
          const sanitizedPath = createSanitizedBaselineFile(step.file);
          tempFiles.push(sanitizedPath);
          return sanitizedPath;
        })()
      : step.file;
    runPsql({
      label: step.label,
      args: [
        "--set",
        `ON_ERROR_STOP=${step.onErrorStop ? "1" : "0"}`,
        "--dbname",
        dbUrl,
        "--file",
        filePath,
      ],
    });
  }

  console.log("");
  console.log("Bootstrap complete.");
  console.log("Next steps:");
  console.log("  npm run test:integration:seed");
  console.log("  npm run test:integration:run");

  for (const filePath of tempFiles) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // best-effort cleanup
    }
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
