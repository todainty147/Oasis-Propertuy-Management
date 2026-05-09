import { spawnSync } from "node:child_process";
import fs from "node:fs";

const defaultDbUrl = "postgresql://postgres:postgres@127.0.0.1:61022/postgres";

const verificationChecks = [
  {
    label: "Core invite table",
    why: "Confirms the account invite lifecycle surface exists after baseline + overlays.",
    sql: "select to_regclass('public.account_invitations') is not null;",
  },
  {
    label: "Denied-event stream table",
    why: "Confirms durable denied-event logging is present for launch safety diagnostics.",
    sql: "select to_regclass('public.security_denied_events') is not null;",
  },
  {
    label: "Observability sink table",
    why: "Confirms hosted security observability storage exists for manager-safe diagnostics.",
    sql: "select to_regclass('public.security_observability_events') is not null;",
  },
  {
    label: "API rate-limit table",
    why: "Confirms limited Edge/API abuse protection can persist rate-limit attempts.",
    sql: "select to_regclass('public.api_rate_limit_events') is not null;",
  },
  {
    label: "Account sandbox profile table",
    why: "Confirms demo/sandbox account lifecycle metadata exists before demo reset tooling is enabled.",
    sql: "select to_regclass('public.account_sandbox_profiles') is not null;",
  },
  {
    label: "Tenant payment settings table",
    why: "Confirms landlord-configurable tenant payment collection metadata exists for the standalone tenant portal.",
    sql: "select to_regclass('public.account_payment_collection_settings') is not null;",
  },
  {
    label: "Denied-event recorder RPC",
    why: "Confirms app-side durable denied logging can be invoked.",
    sql: "select to_regprocedure('public.record_security_denied_event(text,uuid,text,uuid,text,jsonb)') is not null;",
  },
  {
    label: "Observability feed RPC",
    why: "Confirms the manager-safe hosted event feed exists.",
    sql: "select to_regprocedure('public.security_observability_event_feed(uuid,text,text,text,integer,timestamptz,timestamptz)') is not null;",
  },
  {
    label: "Document storage access helper",
    why: "Confirms document bucket reads are protected by the checked-in access helper.",
    sql: "select to_regprocedure('public.can_access_document_storage(uuid,uuid)') is not null;",
  },
  {
    label: "Tenant document prioritization RPC",
    why: "Confirms tenant-facing document priority metadata can be managed through the checked-in RPC.",
    sql: "select to_regprocedure('public.set_document_tenant_highlight(uuid,text,text,integer,uuid)') is not null;",
  },
  {
    label: "Dashboard snapshot RPC",
    why: "Confirms the main dashboard aggregate surface exists with the current signature.",
    sql: "select to_regprocedure('public.dashboard_snapshot(uuid,uuid,integer)') is not null;",
  },
  {
    label: "Finance snapshot RPC",
    why: "Confirms the finance aggregate surface exists with the current signature.",
    sql: "select to_regprocedure('public.finance_snapshot(uuid,uuid)') is not null;",
  },
  {
    label: "Portfolio health snapshot RPC",
    why: "Confirms the portfolio health aggregate surface exists with the current signature.",
    sql: "select to_regprocedure('public.portfolio_health_snapshot(uuid,uuid)') is not null;",
  },
  {
    label: "Payment create RPC",
    why: "Confirms the authoritative payment write entry point exists.",
    sql: "select to_regprocedure('public.create_payment(uuid,uuid,uuid,numeric,date,date,text)') is not null;",
  },
  {
    label: "Payment mark-paid RPC",
    why: "Confirms payment status mutation surface exists after auth hardening overlays.",
    sql: "select to_regprocedure('public.mark_payment_paid(uuid,date)') is not null;",
  },
  {
    label: "System notification RPC",
    why: "Confirms write-side notification fan-out exists for invite/document/payment side effects.",
    sql: "select to_regprocedure('public.create_notifications_system(uuid,uuid[],text,text,text,text,uuid,text,jsonb)') is not null;",
  },
  {
    label: "API rate-limit RPC",
    why: "Confirms Edge Functions can enforce account/actor/identifier scoped throttles.",
    sql: "select to_regprocedure('public.record_api_rate_limit_attempt(text,uuid,uuid,text,integer,integer,jsonb)') is not null;",
  },
  {
    label: "Account sandbox status RPC",
    why: "Confirms managers can safely read whether the active account is production or demo/sandbox.",
    sql: "select to_regprocedure('public.get_account_sandbox_status(uuid)') is not null;",
  },
  {
    label: "Account sandbox fixture seed RPC",
    why: "Confirms demo accounts can be seeded and reset from a manager-safe server-side contract.",
    sql: "select to_regprocedure('public.seed_demo_account_fixtures(uuid,boolean)') is not null and to_regprocedure('public.reset_demo_account(uuid)') is not null;",
  },
  {
    label: "Documents bucket",
    why: "Confirms the checked-in private documents bucket exists for document flows.",
    sql: "select exists (select 1 from storage.buckets where id = 'documents');",
  },
];

function resolvePsqlCommand() {
  const configured = process.env.PSQL_BIN;
  if (configured) return configured;

  const dockerWrapperUrl = new URL("./psql-docker-wrapper.sh", import.meta.url);
  const dockerWrapperPath = dockerWrapperUrl.pathname;
  if (process.platform !== "win32" && fs.existsSync(dockerWrapperPath)) {
    return dockerWrapperPath;
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

function runScalarQuery(dbUrl, sql, label) {
  const cmd = resolvePsqlCommand();
  const result = spawnSync(
    cmd,
    ["--dbname", dbUrl, "-At", "-c", sql],
    {
      stdio: "pipe",
      encoding: "utf8",
      env: {
        ...process.env,
        PGPASSWORD: process.env.PGPASSWORD || "postgres",
      },
    },
  );

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} query failed using ${cmd}\n${output}`);
  }

  return String(result.stdout || "").trim().toLowerCase();
}

function main() {
  const dbUrl = process.env.DB_BOOTSTRAP_URL || process.env.DATABASE_URL || defaultDbUrl;

  console.log("OASIS local DB verification");
  console.log(`Target database: ${dbUrl}`);
  console.log("Checking launch-relevant schema objects after bootstrap");

  const failures = [];

  for (const check of verificationChecks) {
    const result = runScalarQuery(dbUrl, check.sql, check.label);
    const ok = result === "t" || result === "true";

    if (ok) {
      console.log(`PASS ${check.label}`);
      continue;
    }

    console.log(`FAIL ${check.label}`);
    console.log(`  Why it matters: ${check.why}`);
    failures.push(check.label);
  }

  if (failures.length > 0) {
    console.error("");
    console.error("db:verify failed.");
    console.error("Missing or unresolved objects:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error("Run `npm run db:bootstrap` first, then rerun `npm run db:verify`.");
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("db:verify passed.");
  console.log("Recommended next steps:");
  console.log("  npm run test:integration:seed");
  console.log("  npm run test:integration:run");
}

main();
