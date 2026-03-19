import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILES = [
  ".env.staging.local",
  ".env.staging.test.local",
  ".env.local",
  ".env",
];

let envLoaded = false;

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const separator = trimmed.indexOf("=");
  if (separator === -1) return null;

  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export function loadStagingEnv() {
  if (envLoaded) return;

  for (const relativePath of ENV_FILES) {
    const absolutePath = resolve(process.cwd(), relativePath);
    if (!existsSync(absolutePath)) continue;

    const contents = readFileSync(absolutePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const entry = parseEnvLine(line);
      if (!entry) continue;
      const [key, value] = entry;
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  envLoaded = true;
}

export function getStagingEnv() {
  loadStagingEnv();

  return {
    url: process.env.STAGING_SUPABASE_URL || "",
    anonKey: process.env.STAGING_SUPABASE_ANON_KEY || "",
    userPassword: process.env.STAGING_USER_PASSWORD || process.env.TEST_USER_PASSWORD || "OasisTest123!",
  };
}

export function isStagingSmokeConfigured() {
  const env = getStagingEnv();
  return Boolean(env.url && env.anonKey && env.userPassword);
}
