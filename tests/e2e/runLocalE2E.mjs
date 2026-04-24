import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const supabaseStartCommand = [
  "npx -y supabase@2.84.2 start",
  "--exclude studio,imgproxy,mailpit,logflare,vector,storage-api,realtime,postgres-meta,supavisor",
].join(" ");

const supabaseStopCommand = "npx -y supabase@2.84.2 stop --project-id oasisrentalmanagementapp";
const dbBootstrapCommand = "npm run db:bootstrap";
const dbVerifyCommand = "npm run db:verify";
const integrationSeedCommand = "npm run test:integration:seed";
const functionsServeCommand = "npx -y supabase@2.84.2 functions serve --env-file .env.integration.local --no-verify-jwt";
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

function startBackgroundCommand(command, extraEnv = {}) {
  const child = spawn(command, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: "inherit",
    shell: true,
  });

  return child;
}

async function waitForFunctionRuntime(url, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "OPTIONS" });
      if (response.ok) return;
    } catch {
      // wait and retry
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(`Timed out waiting for local function runtime at ${url}`);
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
  let functionsServer = null;

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
    functionsServer = startBackgroundCommand(functionsServeCommand);
    await waitForFunctionRuntime("http://127.0.0.1:61021/functions/v1/create-signature-packet");
    await runCommand(e2eCommand);
  } finally {
    if (functionsServer) {
      functionsServer.kill("SIGINT");
      await new Promise((resolvePromise) => {
        functionsServer.on("close", () => resolvePromise());
        setTimeout(resolvePromise, 5000);
      });
    }
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
