/**
 * E-170 validation suite harness.
 *
 * DISPOSABLE-DB GUARD: All helpers that mutate the DB are gated on
 * isLocalSupabase() so they can never run against a shared or production
 * instance. Tests that skip on this guard report BLOCKED, not a pass.
 *
 * SQL application (applying pre-fix / post-fix function) uses
 * `npx supabase db query --file` — the same mechanism as
 * tests/integration/finance_calculations.test.js forceBatchCleanupCalcData.
 */

import { randomUUID }  from "node:crypto";
import { execSync }    from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { isolationFixtures } from "../../tests/fixtures/isolationFixtures.js";
import {
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "../../tests/integration/helpers/localSupabaseHarness.js";
import {
  isIntegrationHarnessConfigured,
  isLocalSupabase,
  localPsqlExec,
} from "../../tests/integration/helpers/env.js";

export { isIntegrationHarnessConfigured, isLocalSupabase };

// ── Disposable-DB guard ───────────────────────────────────────────────────────

export function isE170SuiteEligible() {
  return isIntegrationHarnessConfigured() && isLocalSupabase();
}

// ── Account constants ─────────────────────────────────────────────────────────

export const ACCOUNT_ID = isolationFixtures.accounts.accountA.id;

// ── SQL application helpers ───────────────────────────────────────────────────

const REPO_ROOT = resolve(import.meta.dirname, "../..");

/**
 * Apply SQL to the local DB via psql stdin (no temp-file, no Windows-path issues).
 * Uses localPsqlExec from env.js which pipes the SQL string via stdin.
 */
function applySql(sql) {
  localPsqlExec(sql);
}

/**
 * Notify PostgREST to reload the schema cache and wait 3 s for it to process.
 */
function reloadSchemaCache() {
  applySql("SELECT pg_notify('pgrst', 'reload schema');");
  execSync("node -e \"setTimeout(()=>{},3000)\"", {
    timeout: 5_000,
    cwd: REPO_ROOT,
  });
}

export function applyPreFixFunction() {
  // git show HEAD:supabase/finance_snapshot.sql is the committed pre-E-170 version.
  let preFixSql;
  try {
    preFixSql = execSync("git show HEAD:supabase/finance_snapshot.sql", {
      encoding: "utf8",
      cwd: REPO_ROOT,
      timeout: 10_000,
    });
  } catch (err) {
    throw new Error(`Could not read pre-fix function from git HEAD: ${err.message}`);
  }
  applySql(preFixSql);
  reloadSchemaCache();
}

export function applyPostFixFunction() {
  const postFixSql = readFileSync(
    resolve(REPO_ROOT, "supabase", "finance_snapshot.sql"),
    "utf8",
  );
  applySql(postFixSql);
  reloadSchemaCache();
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function monthStart(nMonthsAgo) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - nMonthsAgo);
  return d.toISOString().slice(0, 10);
}

/** Months elapsed from startDateISO to today, inclusive (matching SQL formula). */
export function monthsElapsed(startDateISO) {
  const [sy, sm] = startDateISO.split("-").map(Number);
  const now = new Date();
  const ny = now.getFullYear();
  const nm = now.getMonth() + 1;
  return Math.max((ny - sy) * 12 + (nm - sm) + 1, 1);
}

// ── RPC helpers ───────────────────────────────────────────────────────────────

export async function callSnapshot(client, accountId = ACCOUNT_ID) {
  const { data, error } = await client.rpc("finance_snapshot", {
    p_account_id: accountId,
  });
  if (error) throw new Error(`finance_snapshot RPC failed: ${error.message}`);
  return data[0];
}

export function findProp(snapshot, propId) {
  const arr = Array.isArray(snapshot.property_finance)
    ? snapshot.property_finance
    : JSON.parse(snapshot.property_finance ?? "[]");
  return arr.find((p) => p.propertyId === propId) ?? null;
}

export async function callCoverageState(client, accountId, propId) {
  const { data, error } = await client.rpc("get_finance_coverage_state", {
    p_account_id: accountId,
    p_property_id: propId,
  });
  if (error) throw new Error(`get_finance_coverage_state RPC failed: ${error.message}`);
  return data;
}

// ── Property + tenant creation ────────────────────────────────────────────────

/**
 * Create an isolated property + tenant for the E-170 suite.
 * Returns { propId, tenantId }.
 */
export async function createE170Property(admin, ownerUserId, {
  rent = 1000,
  address,
} = {}) {
  const propId   = randomUUID();
  const tenantId = randomUUID();
  const addr     = address ?? `E170 Prop ${propId.slice(0, 8)}`;

  const { error: pErr } = await admin.from("properties").insert({
    id:         propId,
    owner_id:   ownerUserId,
    account_id: ACCOUNT_ID,
    address:    addr,
    city:       "TestCity",
    rent,
    status:     "Wolne",
    tenant_id:  null,
  });
  if (pErr) throw new Error(`insert property: ${pErr.message}`);

  const { error: tErr } = await admin.from("tenants").insert({
    id:         tenantId,
    owner_id:   ownerUserId,
    account_id: ACCOUNT_ID,
    user_id:    null,
    property_id: propId,
    name:       `E170 Tenant ${tenantId.slice(0, 8)}`,
    email:      `e170.${tenantId.slice(0, 8)}@test.invalid`,
    phone:      "+447700000000",
    status:     "active",
  });
  if (tErr) throw new Error(`insert tenant: ${tErr.message}`);

  const { error: uErr } = await admin.from("properties").update({
    tenant_id: tenantId,
    status:    "Wynajęte",
  }).eq("id", propId);
  if (uErr) throw new Error(`update property tenant_id: ${uErr.message}`);

  return { propId, tenantId };
}

/**
 * Seed a lease row. Used to set lease_start_date and renewal_status on a property.
 */
export async function insertLease(admin, {
  propId,
  tenantId,
  leaseStartDate,
  leaseEndDate   = null,
  renewalStatus  = "active",
}) {
  const { error } = await admin.from("leases").insert({
    id:               randomUUID(),
    account_id:       ACCOUNT_ID,
    property_id:      propId,
    tenant_id:        tenantId,
    lease_start_date: leaseStartDate,
    lease_end_date:   leaseEndDate,
    renewal_status:   renewalStatus,
  });
  if (error) throw new Error(`insert lease: ${error.message}`);
}

/**
 * Seed payment row(s).
 */
export async function insertPayments(admin, ownerUserId, rows) {
  const toInsert = rows.map((r) => ({
    id:         randomUUID(),
    owner_id:   ownerUserId,
    account_id: ACCOUNT_ID,
    ...r,
  }));
  const { error } = await admin.from("payments").insert(toInsert);
  if (error) throw new Error(`insert payments: ${error.message}`);
  return toInsert.map((r) => r.id);
}

/**
 * Call activate_tenancy_finance_tracking via authenticated ownerClient.
 * Returns { activationId } or throws on error.
 */
export async function activateTenancy(ownerClient, {
  accountId          = ACCOUNT_ID,
  propId,
  coverageStart,
  openingBalanceMinor = 0,
  attests            = true,
  note               = null,
} = {}) {
  const { data, error } = await ownerClient.rpc("activate_tenancy_finance_tracking", {
    p_account_id:                       accountId,
    p_property_id:                      propId,
    p_coverage_start:                   coverageStart,
    p_opening_balance_minor:            openingBalanceMinor,
    p_attests_prospective_completeness: attests,
    p_note:                             note,
  });
  if (error) throw new Error(`activate_tenancy_finance_tracking failed: ${error.message}`);
  return { activationId: data };
}

/**
 * Destroy an isolated E-170 property and all its related data.
 */
export async function destroyE170Property(admin, propId, tenantId) {
  await admin.from("tenancy_finance_activations").delete().eq("property_id", propId);
  await admin.from("leases").delete().eq("property_id", propId);
  await admin.from("payments").delete().eq("property_id", propId);
  if (tenantId) {
    await admin.from("tenants").delete().eq("id", tenantId);
  }
  await admin.from("properties").delete().eq("id", propId);
}

// ── Shared fixture setup ──────────────────────────────────────────────────────

/**
 * Bootstrap the harness: sign in as ownerA and get the admin client.
 * Returns { admin, ownerClient, ownerUserId }.
 */
export async function bootstrapHarness() {
  const admin = getIntegrationAdminClient();
  const { client: ownerClient, user } = await signInAsFixtureUser("ownerA");
  return { admin, ownerClient, ownerUserId: user.id };
}
