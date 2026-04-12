import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const FUNCTIONS = [
  "sync-operational-automation",
  "send-reminder-emails",
  "send-sms-notifications",
  "cleanup-security-audit-exports",
  "cleanup-security-observability-events",
];

function parseArgs(argv) {
  const result = {
    projectRef: "",
    cronSecret: process.env.CRON_SECRET || "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--project-ref") {
      result.projectRef = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--secret") {
      result.cronSecret = argv[i + 1] || "";
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }

  return result;
}

function printHelp() {
  console.log(`Rotate CRON_SECRET and deploy the scheduled OASIS Edge Functions.

Usage:
  npm run functions:cron:deploy -- --project-ref <supabase-project-ref>
  npm run functions:cron:deploy -- --project-ref <supabase-project-ref> --secret <value>

Options:
  --project-ref <ref>   Optional Supabase project ref. If omitted, uses the linked project.
  --secret <value>      Optional CRON_SECRET to set. If omitted, a new random secret is generated.
  --help                Show this help.

What it does:
  1. Sets CRON_SECRET in Supabase secrets.
  2. Deploys sync-operational-automation.
  3. Deploys send-reminder-emails.
  4. Deploys send-sms-notifications.
  5. Deploys cleanup-security-audit-exports.
  6. Deploys cleanup-security-observability-events.

After it runs:
  Update any Supabase Cron / pg_net jobs to send the printed CRON_SECRET in
  either the x-cron-secret header or Authorization: Bearer <secret>.
`);
}

function resolveNpxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const cronSecret = args.cronSecret || randomBytes(24).toString("hex");
  const npx = resolveNpxCommand();
  const projectArgs = args.projectRef ? ["--project-ref", args.projectRef] : [];

  console.log("");
  console.log("Setting CRON_SECRET and deploying scheduled functions...");
  console.log("");

  run(npx, [
    "supabase",
    "secrets",
    "set",
    `CRON_SECRET=${cronSecret}`,
    ...projectArgs,
  ]);

  for (const fn of FUNCTIONS) {
    run(npx, [
      "supabase",
      "functions",
      "deploy",
      fn,
      ...projectArgs,
    ]);
  }

  console.log("");
  console.log("Done.");
  console.log("");
  console.log("New CRON_SECRET:");
  console.log(cronSecret);
  console.log("");
  console.log("Next step:");
  console.log("Update your Supabase Cron / pg_net jobs to send this secret in the request headers.");
}

main();
