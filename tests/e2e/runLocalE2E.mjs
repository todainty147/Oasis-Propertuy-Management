import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const supabaseStartCommand = [
  "npx -y supabase@2.84.2 start",
  "--exclude studio,imgproxy,mailpit,logflare,vector,storage-api,realtime,postgres-meta,edge-runtime,supavisor",
].join(" ");

const supabaseStopCommand = "npx -y supabase@2.84.2 stop --project-id oasisrentalmanagementapp";
const dbBootstrapCommand = "npm run db:bootstrap";
const dbVerifyCommand = "npm run db:verify";
const integrationSeedCommand = "npm run test:integration:seed";
const e2eArgs = process.argv.slice(2);
const e2eCommand = ["npm run test:e2e", e2eArgs.length > 0 ? "--" : "", ...e2eArgs].filter(Boolean).join(" ");

function runCommand(command, extraEnv = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: "inherit",
      shell: true,
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`Command failed (${code}): ${command}`));
    });
  });
}

async function isLocalSupabaseRunning() {
  try {
    await runCommand("npx -y supabase@2.84.2 status --output env");
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const integrationEnvPath = resolve(process.cwd(), ".env.integration.local");
  if (!existsSync(integrationEnvPath)) {
    throw new Error("Missing .env.integration.local. Copy .env.integration.example and set local integration keys.");
  }

  const localDbUrl = process.env.DB_BOOTSTRAP_URL || "postgresql://postgres:postgres@127.0.0.1:61022/postgres";
  const alreadyRunning = await isLocalSupabaseRunning();
  let startedByHarness = false;

  try {
    if (!alreadyRunning) {
      await runCommand(supabaseStartCommand);
      startedByHarness = true;
    } else {
      console.log("[local-e2e] Reusing already-running local Supabase stack.");
    }
    await runCommand(dbBootstrapCommand, { DB_BOOTSTRAP_URL: localDbUrl });
    await runCommand(dbVerifyCommand, { DB_BOOTSTRAP_URL: localDbUrl });
    await runCommand(integrationSeedCommand);
    await runCommand(e2eCommand);
  } finally {
    if (startedByHarness) {
      try {
        await runCommand(supabaseStopCommand);
      } catch (stopError) {
        console.error(stopError?.message || stopError);
      }
    }
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
