import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILES = [
  ".env.integration.local",
  ".env.test.local",
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

export function loadIntegrationEnv() {
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

export function getIntegrationEnv() {
  loadIntegrationEnv();

  const url = process.env.TEST_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || "";
  const userPassword = process.env.TEST_USER_PASSWORD || "OasisTest123!";

  return {
    url,
    anonKey,
    serviceRoleKey,
    userPassword,
  };
}

export function isIntegrationHarnessConfigured() {
  const env = getIntegrationEnv();
  return Boolean(env.url && env.anonKey && env.serviceRoleKey);
}

// Returns true only when pointed at a local Supabase instance (127.0.0.1 or localhost).
// Tests that perform release-state transitions must guard on this to avoid mutating a
// shared or production registry. The env guard is a defence-in-depth layer on top of
// the isolated TEST_PACK_TYPE pattern used by Gate-B1 transition tests.
export function isLocalSupabase() {
  const { url } = getIntegrationEnv();
  return url.includes("127.0.0.1") || url.includes("localhost");
}

// ── Local psql helpers (localhost-only) ───────────────────────────────────────

function _resolvePsqlBin() {
  if (process.env.PSQL_BIN) return process.env.PSQL_BIN;
  if (process.platform === "win32") return "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe";
  return "psql";
}

function _resolveDbUrl() {
  if (process.env.DB_BOOTSTRAP_URL) return process.env.DB_BOOTSTRAP_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { url } = getIntegrationEnv();
  const apiUrl = new URL(url);
  const dbPort = parseInt(apiUrl.port, 10) + 1;
  return `postgresql://postgres:postgres@${apiUrl.hostname}:${dbPort}/postgres`;
}

// Executes SQL via psql as the postgres database user. Throws on error.
// Reads SQL from stdin so multiple statements with session settings work correctly.
// Only valid in local environments (isLocalSupabase() === true).
export function localPsqlExec(sql) {
  execFileSync(
    _resolvePsqlBin(),
    ["--dbname", _resolveDbUrl(), "--variable=ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8", timeout: 30000 },
  );
}

// Like localPsqlExec but returns { success, stdout, stderr } instead of throwing.
// Use this to assert that SQL fails and inspect the error message.
export function localPsqlRun(sql) {
  try {
    const stdout = execFileSync(
      _resolvePsqlBin(),
      ["--dbname", _resolveDbUrl(), "--variable=ON_ERROR_STOP=1"],
      { input: sql, encoding: "utf8", timeout: 30000 },
    );
    return { success: true, stdout, stderr: "" };
  } catch (err) {
    return { success: false, stdout: err.stdout || "", stderr: err.stderr || err.message };
  }
}

// Validates arguments and environment before localPsqlBreakGlassDelete executes any psql.
// Exported separately so tests can prove each guard fires before any SQL runs.
//
//   packType        — must be non-empty and must NOT be the real production pack.
//   supabaseUrl     — must contain 127.0.0.1 or localhost (refuses staging/prod URLs).
//   expectedPackType — optional exact-match assertion; callers should always supply it
//                      to prove deliberate intent about WHICH fixture they are cleaning.
export function validateBreakGlassCleanup(packType, supabaseUrl, expectedPackType) {
  if (!supabaseUrl.includes("127.0.0.1") && !supabaseUrl.includes("localhost")) {
    throw new Error(
      `localPsqlBreakGlassDelete: refused — environment is not local ` +
      `(url=${supabaseUrl}). This helper must only run against a local ` +
      `Docker Supabase instance (127.0.0.1 or localhost).`,
    );
  }
  if (!packType || packType.trim() === "") {
    throw new Error(
      "localPsqlBreakGlassDelete: packType must not be empty.",
    );
  }
  if (packType === "deposit_dispute_pack") {
    throw new Error(
      "localPsqlBreakGlassDelete: deletion of 'deposit_dispute_pack' is permanently " +
      "forbidden. This helper is for test fixture rows only, never the real registry row.",
    );
  }
  if (expectedPackType !== undefined && packType !== expectedPackType) {
    throw new Error(
      `localPsqlBreakGlassDelete: packType "${packType}" does not match ` +
      `expected "${expectedPackType}". Pass the expected pack type to prove deliberate intent.`,
    );
  }
}

// Deletes test registry and ledger rows using the break-glass bypass:
//   SET session_replication_role = 'replica' disables triggers for this session.
// Only postgres (rolreplication=true) can set this. The session ends immediately
// after the psql subprocess exits, restoring normal trigger behaviour.
// Required because Gate-B1G guard blocks admin client DELETE on both tables.
//
//   packType        — the fixture pack type to clean up.
//   expectedPackType — must match packType exactly (proof of deliberate intent).
export function localPsqlBreakGlassDelete(packType, expectedPackType) {
  const { url } = getIntegrationEnv();
  validateBreakGlassCleanup(packType, url, expectedPackType);
  localPsqlExec(
    `SET session_replication_role = 'replica'; ` +
    `DELETE FROM public.deposit_pack_release_transitions WHERE pack_type = '${packType}'; ` +
    `DELETE FROM public.deposit_pack_release_registry WHERE pack_type = '${packType}'; ` +
    `RESET session_replication_role;`,
  );
}
