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
  "studio,imgproxy,mailpit,logflare,vector,realtime,postgres-meta,edge-runtime,supavisor",
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
    label: "Apply work-order contractor identity overlay",
    file: path.join(supabaseDir, "work_order_contractor_identity.sql"),
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
    label: "Apply marketplace integrations overlay",
    file: path.join(supabaseDir, "marketplace_integrations.sql"),
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
    label: "Apply rent engine tables overlay",
    file: path.join(supabaseDir, "rent_engine_tables.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply advanced rent models overlay",
    file: path.join(supabaseDir, "advanced_rent_models.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply rent reminders RPC overlay",
    file: path.join(supabaseDir, "rent_reminders_rpc.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply operating calendar overlay",
    file: path.join(supabaseDir, "operating_calendar.sql"),
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
    label: "Apply AI attention insights overlay",
    file: path.join(supabaseDir, "ai_attention_insights.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply AI property health explainer overlay",
    file: path.join(supabaseDir, "ai_property_health_explainer.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply AI maintenance triage overlay",
    file: path.join(supabaseDir, "ai_maintenance_triage.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply AI contractor recommendation overlay",
    file: path.join(supabaseDir, "ai_contractor_recommendation.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply AI weekly portfolio summary overlay",
    file: path.join(supabaseDir, "ai_weekly_portfolio_summary.sql"),
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
    label: "Apply work order audit security fixes",
    file: path.join(supabaseDir, "work_order_audit_security_fixes.sql"),
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
    label: "Apply payment ledger reversal hardening overlay",
    file: path.join(supabaseDir, "payment_ledger_reversal_hardening.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply account sandbox demo seed overlay",
    file: path.join(supabaseDir, "account_sandbox_demo_seed.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply self-serve landlord signup overlay",
    file: path.join(supabaseDir, "self_serve_landlord_signup.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply create_landlord_invitation overlay",
    file: path.join(supabaseDir, "create_landlord_invitation.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply auth user profile bootstrap hardening overlay",
    file: path.join(supabaseDir, "auth_user_profile_bootstrap_hardening.sql"),
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
    label: "Apply document template storage-path repair overlay",
    file: path.join(supabaseDir, "document_templates_storage_path_repair.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply document request intake overlay",
    file: path.join(supabaseDir, "document_requests.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply agreement packet overlay",
    file: path.join(supabaseDir, "document_packets.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply document signature readiness overlay",
    file: path.join(supabaseDir, "document_signature_readiness.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply DocuSeal signature provider overlay",
    file: path.join(supabaseDir, "document_signature_docuseal.sql"),
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
  {
    label: "Apply Renters' Rights Readiness Pack overlay",
    file: path.join(supabaseDir, "renters_rights_readiness.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply Renters' Rights entitlement feature key overlay",
    file: path.join(supabaseDir, "renters_rights_entitlement.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply Renters' Rights Phase 2 (rent_review_records, tenancy prompts)",
    file: path.join(supabaseDir, "renters_rights_phase2.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply Renters' Rights tenant filter fix (include all non-archived tenants)",
    file: path.join(supabaseDir, "renters_rights_tenant_filter_fix.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply landlord tax tools Phase 2 overlay",
    file: path.join(supabaseDir, "tax_tools_phase2.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply legal security Phase 3 overlay",
    file: path.join(supabaseDir, "legal_security_phase3.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply Compliance Safe Phase 2 overlay",
    file: path.join(supabaseDir, "compliance_safe_phase2.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply Compliance Safe E-084 interim gate overlay",
    file: path.join(supabaseDir, "compliance_safe_e084_interim_gate.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply Evidence Vault Phase 2 overlay",
    file: path.join(supabaseDir, "evidence_vault_phase2.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply Evidence Vault Phase 2 fixes overlay",
    file: path.join(supabaseDir, "evidence_vault_phase2_fixes.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply Property Risk & Deposit Controls overlay",
    file: path.join(supabaseDir, "property_risk_deposit_controls.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply Maintenance Smart Diagnostics overlay",
    file: path.join(supabaseDir, "maintenance_smart_diagnostics.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply Phase 2 repair pass (E-066b / E-077 / E-074)",
    file: path.join(supabaseDir, "phase2_repair_e066b_e077_e074.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply HMRC MTD Phase 1 overlay",
    file: path.join(supabaseDir, "hmrc_mtd_phase1.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply HMRC MTD Phase 2 read-only overlay",
    file: path.join(supabaseDir, "hmrc_mtd_phase2_readonly.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply HMRC MTD Phase 3 sandbox test-data overlay",
    file: path.join(supabaseDir, "hmrc_mtd_phase3_sandbox_test_data.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply HMRC MTD Phase 3 quarterly drafts overlay",
    file: path.join(supabaseDir, "hmrc_mtd_phase3_quarterly_drafts.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply HMRC MTD Phase 4 sandbox submission overlay",
    file: path.join(supabaseDir, "hmrc_mtd_phase4_sandbox_submission.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply HMRC MTD Phase 5A consent scaffolding overlay",
    file: path.join(supabaseDir, "hmrc_mtd_phase5a_consent_scaffolding.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply HMRC MTD Phase 5B live pilot overlay",
    file: path.join(supabaseDir, "hmrc_mtd_phase5b_live_pilot.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply HMRC MTD Phase 5C live endpoint skeleton overlay",
    file: path.join(supabaseDir, "hmrc_mtd_phase5c_live_endpoint_skeleton.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply HMRC MTD Phase 5D one-account live pilot overlay",
    file: path.join(supabaseDir, "hmrc_mtd_phase5d_one_account_live_pilot.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply HMRC E1 UK Property compliance overlay",
    file: path.join(supabaseDir, "hmrc_mtd_e1_uk_property_compliance.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply provenance event ledger overlay",
    file: path.join(supabaseDir, "provenance_events.sql"),
    onErrorStop: true,
  },
  {
    label: "Backfill and verify provenance hash chains",
    file: path.join(
      supabaseDir,
      "migrations",
      "20260622000000_provenance_hash_chain_backfill.sql",
    ),
    onErrorStop: true,
  },
  {
    label: "Apply provenance finance cutover overlay",
    file: path.join(supabaseDir, "provenance_finance_cutover.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply provenance explain balance overlay",
    file: path.join(supabaseDir, "provenance_explain_balance.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply provenance document service overlay",
    file: path.join(supabaseDir, "provenance_document_service.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply evidence provenance stub overlay",
    file: path.join(supabaseDir, "evidence_provenance_stub.sql"),
    onErrorStop: true,
  },
  {
    label: "Apply inspection report lock and signature binding overlay",
    file: path.join(supabaseDir, "inspection_report_lock_signature_binding.sql"),
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

function isMigrationFailureOutput(output) {
  const msg = String(output || "").toLowerCase();
  return (
    msg.includes("applying migration") &&
    (msg.includes("error:") || msg.includes("sqlstate"))
  );
}

function rawPublicSchemaReset(dbUrl) {
  // Fallback for when supabase db reset fails due to migration ordering issues
  // (migrations that reference overlay-created tables). Wipes public schema so
  // baseline_schema.sql + overlays can be applied from scratch.
  const sql = [
    "drop schema if exists public cascade;",
    "create schema public authorization pg_database_owner;",
    "grant usage on schema public to anon;",
    "grant usage on schema public to authenticated;",
    "grant usage on schema public to service_role;",
    "grant all on schema public to postgres;",
    "grant all on schema public to pg_database_owner;",
  ].join(" ");

  const { status, output } = runPsqlWithResult({
    args: ["--dbname", dbUrl, "-c", sql],
  });

  if (status !== 0) {
    throw new Error(`raw public schema reset failed\n${output}`);
  }

  if (output) console.log(output);
  console.log("Raw public schema reset complete (supabase db reset bypassed due to migration ordering).");
}

async function resetLocalSupabaseDb(dbUrl) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { cmd, status, output } = runSupabaseWithResult({
      args: ["db", "reset", "--local", "--no-seed", "--yes"],
    });

    if (status === 0) {
      if (output) console.log(output);
      return;
    }

    if (isMigrationFailureOutput(output)) {
      console.warn("supabase db reset failed due to migration ordering issue; falling back to raw public schema reset.");
      if (output) console.warn(output);
      rawPublicSchemaReset(dbUrl);
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
  await resetLocalSupabaseDb(dbUrl);

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
