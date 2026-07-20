/**
 * Gate-B-ENT: Explain Path — account_effective_feature_check + account_explain_effective_feature
 *
 * Proves:
 *   1. Structural sharing: account_has_effective_feature and account_explain_effective_feature
 *      both derive from account_effective_feature_check (single implementation authority).
 *   2. ACL: pg_catalog confirms authenticated has no execute on account_effective_feature_check;
 *      has execute on account_has_effective_feature and account_explain_effective_feature.
 *   3. Agreement: explain result matches boolean resolver result for all 7 priority branches.
 *   4. Authorisation: account_explain_effective_feature requires root-operator JWT.
 *
 * Boolean stability gate: after this overlay is applied, gate_b_ent_effective_feature_resolver.test.js
 * must still pass 35/35. Run separately: vitest run tests/integration/gate_b_ent_effective_feature_resolver.test.js
 *
 * Test inventory:
 *   EXP-S1      Static: file defines account_effective_feature_check
 *   EXP-S2      Static: file defines account_explain_effective_feature with user_is_root_operator guard
 *   EXP-S3      Static: account_has_effective_feature body calls account_effective_feature_check
 *   EXP-S4      Static: file revokes all on account_effective_feature_check from public (no grant)
 *
 *   EXP-ACL-01  pg_catalog: 'authenticated' has NO execute on account_effective_feature_check
 *   EXP-ACL-02  pg_catalog: 'authenticated' HAS execute on account_has_effective_feature
 *   EXP-ACL-03  pg_catalog: 'authenticated' HAS execute on account_explain_effective_feature
 *
 *   EXP-01  Growth plan, no flag → plan_grant, true (explain agrees with boolean)
 *   EXP-02  Starter plan, enabled=true flag → explicit_grant, true (explain agrees)
 *   EXP-03  Growth plan, enabled=false flag → explicit_deny, false (explain agrees)
 *   EXP-04  Unknown feature key → unknown_feature, false (explain agrees)
 *   EXP-05  Starter plan, no flag → not_granted, false (explain agrees)
 *   EXP-06  HMRC flag-only key, Growth, no flag → flag_required, false (explain agrees)
 *   EXP-07  NULL account_id → unknown_account, false (explain agrees)
 *
 *   EXP-08  ownerA → account_explain_effective_feature(accountA) → permission denied
 *   EXP-09  ownerA → account_explain_effective_feature(accountB) → permission denied
 *   EXP-10  rootOwner → account_explain_effective_feature(accountA) → allowed, valid JSONB
 *   EXP-11  rootOwner → account_explain_effective_feature(accountB) → allowed, valid JSONB
 */

import fs from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { isolationFixtures } from "../fixtures/isolationFixtures.js";
import {
  isIntegrationHarnessConfigured,
  isLocalSupabase,
  localPsqlRun,
} from "./helpers/env.js";
import {
  ensureIsolationHarnessSeed,
  getIntegrationAdminClient,
  signInAsFixtureUser,
} from "./helpers/localSupabaseHarness.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const accountAId = isolationFixtures.accounts.accountA.id;
const accountBId = isolationFixtures.accounts.accountB.id;
const FEATURE_EVD = "evidence_vault_dispute_pack";
const FEATURE_HMRC = "hmrc_mtd_connection";
const FEATURE_UNKNOWN = "not_a_real_feature_key_exp_test_xyz";

const SQL_PATH = path.join(process.cwd(), "supabase", "gate_b_ent_explain_path.sql");

// ── Helpers ───────────────────────────────────────────────────────────────────

async function hasEffectiveFeature(admin, accountId, feature) {
  const { data, error } = await admin.rpc("account_has_effective_feature", {
    p_account_id: accountId,
    p_feature: feature,
  });
  if (error) throw new Error(`account_has_effective_feature(${feature}): ${error.message}`);
  return data;
}

async function explainFeature(client, accountId, feature) {
  const { data, error } = await client.rpc("account_explain_effective_feature", {
    p_account_id: accountId,
    p_feature: feature,
  });
  return { data, error };
}

async function getAccountPlan(admin, accountId) {
  const { data } = await admin
    .from("accounts")
    .select("subscription_plan")
    .eq("id", accountId)
    .single();
  return data?.subscription_plan ?? "pro";
}

async function setAccountPlan(admin, accountId, plan) {
  const { error } = await admin
    .from("accounts")
    .update({ subscription_plan: plan })
    .eq("id", accountId);
  if (error) throw new Error(`setAccountPlan(${plan}): ${error.message}`);
}

async function setFlag(admin, accountId, featureKey, enabled) {
  const { error } = await admin.from("account_feature_flags").upsert(
    { account_id: accountId, feature_key: featureKey, enabled },
    { onConflict: "account_id,feature_key" },
  );
  if (error) throw new Error(`setFlag(${featureKey}, ${enabled}): ${error.message}`);
}

async function deleteFlag(admin, accountId, featureKey) {
  const { error } = await admin
    .from("account_feature_flags")
    .delete()
    .eq("account_id", accountId)
    .eq("feature_key", featureKey);
  if (error) throw new Error(`deleteFlag(${featureKey}): ${error.message}`);
}

// ── Static contracts ──────────────────────────────────────────────────────────

describe("EXP static contracts", () => {
  it("EXP-S1: file defines account_effective_feature_check", () => {
    const src = fs.readFileSync(SQL_PATH, "utf-8");
    expect(src).toContain("create or replace function public.account_effective_feature_check");
  });

  it("EXP-S2: file defines account_explain_effective_feature with user_is_root_operator guard", () => {
    const src = fs.readFileSync(SQL_PATH, "utf-8");
    expect(src).toContain("create or replace function public.account_explain_effective_feature");
    expect(src).toContain("user_is_root_operator()");
    expect(src).toContain("permission denied");
  });

  it("EXP-S3: account_has_effective_feature body calls account_effective_feature_check (structural sharing)", () => {
    const src = fs.readFileSync(SQL_PATH, "utf-8");
    // Confirm the thin projection delegates to the internal function
    expect(src).toContain(
      "account_effective_feature_check(p_account_id, p_feature) ->> 'result'",
    );
    // Confirm the call appears after the account_has_effective_feature definition
    const boolFnIdx = src.indexOf(
      "create or replace function public.account_has_effective_feature",
    );
    const checkCallIdx = src.indexOf(
      "account_effective_feature_check(p_account_id, p_feature) ->> 'result'",
    );
    expect(boolFnIdx).toBeGreaterThan(-1);
    expect(checkCallIdx).toBeGreaterThan(boolFnIdx);
  });

  it("EXP-S4: file revokes all on account_effective_feature_check from public (no authenticated grant)", () => {
    const src = fs.readFileSync(SQL_PATH, "utf-8");
    expect(src).toContain(
      "revoke all on function public.account_effective_feature_check(uuid, text) from public",
    );
    expect(src).toContain(
      "revoke all on function public.account_effective_feature_check(uuid, text) from authenticated",
    );
  });
});

// ── ACL: pg_catalog privilege verification ────────────────────────────────────

describe("EXP ACL: pg_catalog confirms effective PostgreSQL privileges", () => {
  it("EXP-ACL-01: authenticated has NO execute on account_effective_feature_check", () => {
    if (!isLocalSupabase()) return;
    const res = localPsqlRun(
      `SELECT CASE WHEN has_function_privilege('authenticated', ` +
        `'public.account_effective_feature_check(uuid, text)', 'EXECUTE') ` +
        `THEN 'GRANT_YES' ELSE 'GRANT_NO' END AS acl;`,
    );
    expect(res.success).toBe(true);
    expect(res.stdout).toContain("GRANT_NO");
    expect(res.stdout).not.toContain("GRANT_YES");
  });

  it("EXP-ACL-02: authenticated HAS execute on account_has_effective_feature", () => {
    if (!isLocalSupabase()) return;
    const res = localPsqlRun(
      `SELECT CASE WHEN has_function_privilege('authenticated', ` +
        `'public.account_has_effective_feature(uuid, text)', 'EXECUTE') ` +
        `THEN 'GRANT_YES' ELSE 'GRANT_NO' END AS acl;`,
    );
    expect(res.success).toBe(true);
    expect(res.stdout).toContain("GRANT_YES");
  });

  it("EXP-ACL-03: authenticated HAS execute on account_explain_effective_feature", () => {
    if (!isLocalSupabase()) return;
    const res = localPsqlRun(
      `SELECT CASE WHEN has_function_privilege('authenticated', ` +
        `'public.account_explain_effective_feature(uuid, text)', 'EXECUTE') ` +
        `THEN 'GRANT_YES' ELSE 'GRANT_NO' END AS acl;`,
    );
    expect(res.success).toBe(true);
    expect(res.stdout).toContain("GRANT_YES");
  });
});

// ── Agreement matrix ──────────────────────────────────────────────────────────

describe("EXP agreement matrix: explain reason codes agree with boolean resolver", () => {
  let admin;

  beforeAll(async () => {
    if (!isIntegrationHarnessConfigured()) return;
    await ensureIsolationHarnessSeed();
    admin = getIntegrationAdminClient();
  });

  async function rootExplain(accountId, feature) {
    const { client } = await signInAsFixtureUser("rootOwner");
    return explainFeature(client, accountId, feature);
  }

  it("EXP-01: Growth plan, no flag → plan_grant, true", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const orig = await getAccountPlan(admin, accountAId);
    await setAccountPlan(admin, accountAId, "growth");
    await deleteFlag(admin, accountAId, FEATURE_EVD);
    try {
      const boolResult = await hasEffectiveFeature(admin, accountAId, FEATURE_EVD);
      const { data: ex, error } = await rootExplain(accountAId, FEATURE_EVD);
      expect(error).toBeNull();
      expect(ex.result).toBe(true);
      expect(ex.reason).toBe("plan_grant");
      expect(ex.feature_key).toBe(FEATURE_EVD);
      expect(ex.min_plan).toBe("growth");
      expect(ex.effective_plan).toBe("growth");
      expect(ex.flag_enabled).toBeNull();
      expect(ex.result).toBe(boolResult);
    } finally {
      await setAccountPlan(admin, accountAId, orig);
    }
  });

  it("EXP-02: Starter plan, enabled=true flag → explicit_grant, true", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const orig = await getAccountPlan(admin, accountAId);
    await setAccountPlan(admin, accountAId, "starter");
    await setFlag(admin, accountAId, FEATURE_EVD, true);
    try {
      const boolResult = await hasEffectiveFeature(admin, accountAId, FEATURE_EVD);
      const { data: ex, error } = await rootExplain(accountAId, FEATURE_EVD);
      expect(error).toBeNull();
      expect(ex.result).toBe(true);
      expect(ex.reason).toBe("explicit_grant");
      expect(ex.flag_enabled).toBe(true);
      expect(ex.result).toBe(boolResult);
    } finally {
      await deleteFlag(admin, accountAId, FEATURE_EVD);
      await setAccountPlan(admin, accountAId, orig);
    }
  });

  it("EXP-03: Growth plan, enabled=false flag → explicit_deny, false", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const orig = await getAccountPlan(admin, accountAId);
    await setAccountPlan(admin, accountAId, "growth");
    await setFlag(admin, accountAId, FEATURE_EVD, false);
    try {
      const boolResult = await hasEffectiveFeature(admin, accountAId, FEATURE_EVD);
      const { data: ex, error } = await rootExplain(accountAId, FEATURE_EVD);
      expect(error).toBeNull();
      expect(ex.result).toBe(false);
      expect(ex.reason).toBe("explicit_deny");
      expect(ex.flag_enabled).toBe(false);
      expect(ex.result).toBe(boolResult);
    } finally {
      await deleteFlag(admin, accountAId, FEATURE_EVD);
      await setAccountPlan(admin, accountAId, orig);
    }
  });

  it("EXP-04: Unknown feature key → unknown_feature, false", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const boolResult = await hasEffectiveFeature(admin, accountAId, FEATURE_UNKNOWN);
    const { data: ex, error } = await rootExplain(accountAId, FEATURE_UNKNOWN);
    expect(error).toBeNull();
    expect(ex.result).toBe(false);
    expect(ex.reason).toBe("unknown_feature");
    expect(ex.min_plan).toBeNull();
    expect(ex.effective_plan).toBeNull();
    expect(ex.result).toBe(boolResult);
  });

  it("EXP-05: Starter plan, no flag → not_granted, false", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const orig = await getAccountPlan(admin, accountAId);
    await setAccountPlan(admin, accountAId, "starter");
    await deleteFlag(admin, accountAId, FEATURE_EVD);
    try {
      const boolResult = await hasEffectiveFeature(admin, accountAId, FEATURE_EVD);
      const { data: ex, error } = await rootExplain(accountAId, FEATURE_EVD);
      expect(error).toBeNull();
      expect(ex.result).toBe(false);
      expect(ex.reason).toBe("not_granted");
      expect(ex.effective_plan).toBe("starter");
      expect(ex.result).toBe(boolResult);
    } finally {
      await setAccountPlan(admin, accountAId, orig);
    }
  });

  it("EXP-06: HMRC flag-only key, Growth plan, no flag → flag_required, false", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const orig = await getAccountPlan(admin, accountAId);
    await setAccountPlan(admin, accountAId, "growth");
    await deleteFlag(admin, accountAId, FEATURE_HMRC);
    try {
      const boolResult = await hasEffectiveFeature(admin, accountAId, FEATURE_HMRC);
      const { data: ex, error } = await rootExplain(accountAId, FEATURE_HMRC);
      expect(error).toBeNull();
      expect(ex.result).toBe(false);
      expect(ex.reason).toBe("flag_required");
      expect(ex.min_plan).toBe("flag_only");
      expect(ex.effective_plan).toBeNull();
      expect(ex.result).toBe(boolResult);
    } finally {
      await setAccountPlan(admin, accountAId, orig);
    }
  });

  it("EXP-07: NULL account_id → unknown_account, false", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const boolResult = await hasEffectiveFeature(admin, null, FEATURE_EVD);
    const { data: ex, error } = await rootExplain(null, FEATURE_EVD);
    expect(error).toBeNull();
    expect(ex.result).toBe(false);
    expect(ex.reason).toBe("unknown_account");
    expect(ex.min_plan).toBeNull();
    expect(ex.effective_plan).toBeNull();
    expect(ex.flag_enabled).toBeNull();
    expect(ex.result).toBe(boolResult);
  });
});

// ── Authorisation matrix ──────────────────────────────────────────────────────

describe("EXP authorisation matrix: account_explain_effective_feature root guard", () => {
  beforeAll(async () => {
    if (!isIntegrationHarnessConfigured()) return;
    await ensureIsolationHarnessSeed();
  });

  it("EXP-08: ownerA calling explain for own account (accountA) → permission denied", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const { client } = await signInAsFixtureUser("ownerA");
    const { data, error } = await explainFeature(client, accountAId, FEATURE_EVD);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/permission denied/i);
  });

  it("EXP-09: ownerA calling explain for another account (accountB) → permission denied", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const { client } = await signInAsFixtureUser("ownerA");
    const { data, error } = await explainFeature(client, accountBId, FEATURE_EVD);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/permission denied/i);
  });

  it("EXP-10: rootOwner calling explain for accountA → allowed, returns valid JSONB", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const { client } = await signInAsFixtureUser("rootOwner");
    const { data, error } = await explainFeature(client, accountAId, FEATURE_EVD);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(typeof data.result).toBe("boolean");
    expect(typeof data.reason).toBe("string");
    expect(data.feature_key).toBe(FEATURE_EVD);
    expect(["plan_grant", "not_granted", "explicit_grant", "explicit_deny"]).toContain(data.reason);
  });

  it("EXP-11: rootOwner calling explain for accountB → allowed, returns valid JSONB", async () => {
    if (!isIntegrationHarnessConfigured()) return;
    const { client } = await signInAsFixtureUser("rootOwner");
    const { data, error } = await explainFeature(client, accountBId, FEATURE_EVD);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(typeof data.result).toBe("boolean");
    expect(typeof data.reason).toBe("string");
    expect(data.feature_key).toBe(FEATURE_EVD);
    expect(["plan_grant", "not_granted", "explicit_grant", "explicit_deny"]).toContain(data.reason);
  });
});
