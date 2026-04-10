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
const e2eCommand = "npm run test:e2e";

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

async function main() {
  const integrationEnvPath = resolve(process.cwd(), ".env.integration.local");
  if (!existsSync(integrationEnvPath)) {
    throw new Error("Missing .env.integration.local. Copy .env.integration.example and set local integration keys.");
  }

  const localDbUrl = process.env.DB_BOOTSTRAP_URL || "postgresql://postgres:postgres@127.0.0.1:61022/postgres";
  let startSucceeded = false;

  try {
    await runCommand(supabaseStartCommand);
    startSucceeded = true;
    await runCommand(dbBootstrapCommand, { DB_BOOTSTRAP_URL: localDbUrl });
    await runCommand(dbVerifyCommand, { DB_BOOTSTRAP_URL: localDbUrl });
    await runCommand(integrationSeedCommand);
    await runCommand(e2eCommand);
  } finally {
    if (startSucceeded) {
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
